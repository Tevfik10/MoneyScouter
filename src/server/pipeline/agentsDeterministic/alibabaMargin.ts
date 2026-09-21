import { ProductBundle } from "@/server/pipeline/agents/types";
import { InvestmentProfile } from "@/server/settings";
import { clamp, round } from "@/server/pipeline/agentsDeterministic/shared";

// Margin Agent V2 (zero AI) — Alibaba unit price alone isn't enough to judge
// an opportunity, so this builds an ESTIMATED LANDED COST model on top of it
// (unit price, per-unit shipping, import duty, packaging, fulfilment), then
// an INITIAL INVENTORY COMMITMENT (MOQ x landed cost) and a CAPITAL
// EFFICIENCY SCORE against the configurable InvestmentProfile. Every
// component that isn't a real measured input (shipping quote, duty rate) is
// a labelled assumption in `landedCost.assumptions` — never presented as a
// confirmed figure. No LLM call anywhere in this file.

const VAT_RATE_PERCENT = 21; // NL standard rate, same assumption as agents/margin.ts
const TRANSACTION_FEE_PERCENT = 2.9; // typical payment-processor assumption
const FULFILLMENT_COST_EUR = 2.5; // packaging/handling assumption, matches agents/margin.ts
const RETURN_RATE_PERCENT = 8; // category-agnostic baseline, matches risk.ts's assumption
const PACKAGING_COST_EUR = 1.0; // private-label / branded packaging assumption
const IMPORT_DUTY_ASSUMED_PERCENT = 4; // general-merchandise EU import duty rule-of-thumb
const ASSUMED_FREIGHT_EUR_PER_KG = 6; // international parcel/air-freight rule-of-thumb when no shipping quote exists
const MIN_ASSUMED_SHIPPING_EUR = 1.5;
const DEFAULT_WEIGHT_GRAMS = 500; // matches productBundle.ts's own DB fallback

export interface LandedCostBreakdown {
  unitPriceEur: number;
  shippingPerUnitEur: number;
  importDutyPercent: number;
  importDutyEur: number;
  packagingEur: number;
  fulfillmentEur: number;
  totalLandedCostEur: number;
  /** Every input here that wasn't a directly-observed supplier/shipping
   * figure — read this before trusting totalLandedCostEur as exact. */
  assumptions: string[];
}

export interface MarginScenario {
  label: "conservative" | "expected" | "optimistic";
  unitPriceEur: number;
  landedCostEur: number;
  sellingPriceEur: number;
  contributionMarginEur: number;
  marginPercent: number;
  /** Contribution margin before any marketing spend — the most CAC can be
   * and still break even on this unit. */
  breakEvenCacEur: number;
}

export type InventoryCommitmentBand = "preferred" | "acceptable" | "excessive";

export interface AlibabaMarginFindings {
  bestUnitPriceEur: number;
  moq: number;
  moqUnit?: string;
  landedCost: LandedCostBreakdown;
  initialInventoryCommitmentEur: number;
  inventoryCommitmentBand: InventoryCommitmentBand;
  capitalEfficiencyScore: number; // 0-100
  capitalEfficiencyReasons: string[];
  scenarios: { conservative: MarginScenario; expected: MarginScenario; optimistic: MarginScenario };
  summary: string;
}

function estimateShippingPerUnitEur(bundle: ProductBundle, assumptions: string[]): number {
  if (bundle.bestSource.shippingCostEur > 0) return round(bundle.bestSource.shippingCostEur, 2);
  const weightGrams = bundle.bestSource.weightGrams || DEFAULT_WEIGHT_GRAMS;
  const estimate = Math.max(MIN_ASSUMED_SHIPPING_EUR, (weightGrams / 1000) * ASSUMED_FREIGHT_EUR_PER_KG);
  assumptions.push(
    `shipping per unit estimated from weight (${weightGrams}g x €${ASSUMED_FREIGHT_EUR_PER_KG}/kg) — no supplier shipping quote available`,
  );
  return round(estimate, 2);
}

function buildLandedCost(unitPriceEur: number, shippingPerUnitEur: number, sharedAssumptions: string[]): LandedCostBreakdown {
  const assumptions = [...sharedAssumptions];
  const importDutyEur = round((unitPriceEur + shippingPerUnitEur) * (IMPORT_DUTY_ASSUMED_PERCENT / 100), 2);
  assumptions.push(`import duty assumed at ${IMPORT_DUTY_ASSUMED_PERCENT}% (general-merchandise rule of thumb, not an HS-code lookup)`);
  assumptions.push("import VAT assumed reclaimable for a VAT-registered EU business — not included in landed cost (see margin scenarios for output VAT on the sale)");
  const totalLandedCostEur = round(unitPriceEur + shippingPerUnitEur + importDutyEur + PACKAGING_COST_EUR + FULFILLMENT_COST_EUR, 2);
  return {
    unitPriceEur,
    shippingPerUnitEur,
    importDutyPercent: IMPORT_DUTY_ASSUMED_PERCENT,
    importDutyEur,
    packagingEur: PACKAGING_COST_EUR,
    fulfillmentEur: FULFILLMENT_COST_EUR,
    totalLandedCostEur,
    assumptions,
  };
}

function buildScenario(
  label: MarginScenario["label"],
  unitPriceEur: number,
  shippingPerUnitEur: number,
  sellingPriceEur: number,
  returnRateMultiplier: number,
  sharedAssumptions: string[],
): { scenario: MarginScenario; landedCost: LandedCostBreakdown } {
  const landedCost = buildLandedCost(unitPriceEur, shippingPerUnitEur, sharedAssumptions);
  const vatEur = sellingPriceEur - sellingPriceEur / (1 + VAT_RATE_PERCENT / 100);
  const netRevenueEur = sellingPriceEur - vatEur;
  const transactionFeeEur = sellingPriceEur * (TRANSACTION_FEE_PERCENT / 100);
  const returnsCostEur = sellingPriceEur * (RETURN_RATE_PERCENT / 100) * returnRateMultiplier;
  const contributionMarginEur = round(netRevenueEur - landedCost.totalLandedCostEur - transactionFeeEur - returnsCostEur, 2);
  const marginPercent = sellingPriceEur > 0 ? round((contributionMarginEur / sellingPriceEur) * 100, 1) : 0;
  return {
    landedCost,
    scenario: {
      label,
      unitPriceEur,
      landedCostEur: landedCost.totalLandedCostEur,
      sellingPriceEur: round(sellingPriceEur, 2),
      contributionMarginEur,
      marginPercent,
      breakEvenCacEur: Math.max(0, contributionMarginEur),
    },
  };
}

function commitmentBand(commitmentEur: number, profile: InvestmentProfile): InventoryCommitmentBand {
  if (commitmentEur <= profile.preferredInventoryCommitmentEur) return "preferred";
  if (commitmentEur <= profile.acceptableInventoryCommitmentMaxEur) return "acceptable";
  return "excessive";
}

function computeCapitalEfficiencyScore(
  moq: number,
  commitmentEur: number,
  commitmentBand: InventoryCommitmentBand,
  expectedMarginEur: number,
  supplierCount: number,
  profile: InvestmentProfile,
): { score: number; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  if (moq > profile.moqHardPenaltyAbove) {
    score -= 40;
    reasons.push(`MOQ ${moq} is above the hard-penalty threshold (${profile.moqHardPenaltyAbove}) — strong negative unless economics are exceptional`);
  } else if (moq > profile.preferredMoqMax) {
    const span = Math.max(1, profile.moqPenaltyCeiling - profile.preferredMoqMax);
    const over = clamp(moq - profile.preferredMoqMax, 0, span);
    const penalty = round((over / span) * 25, 1);
    score -= penalty;
    reasons.push(`MOQ ${moq} exceeds the preferred max (${profile.preferredMoqMax}) — penalized, not rejected`);
  }

  if (commitmentBand === "acceptable") {
    score -= 15;
    reasons.push(`initial inventory commitment €${round(commitmentEur, 0)} is above the preferred band (€${profile.preferredInventoryCommitmentEur})`);
  } else if (commitmentBand === "excessive") {
    score -= 35;
    reasons.push(`initial inventory commitment €${round(commitmentEur, 0)} exceeds the acceptable max (€${profile.acceptableInventoryCommitmentMaxEur})`);
  }

  if (expectedMarginEur >= profile.targetMinGrossMarginEur) {
    score += 10;
    reasons.push(`expected contribution margin €${round(expectedMarginEur, 2)} meets the target minimum (€${profile.targetMinGrossMarginEur})`);
  } else if (expectedMarginEur > 0) {
    const shortfall = profile.targetMinGrossMarginEur - expectedMarginEur;
    const penalty = clamp(round((shortfall / profile.targetMinGrossMarginEur) * 20, 1), 0, 20);
    score -= penalty;
    reasons.push(`expected contribution margin €${round(expectedMarginEur, 2)} is below the target minimum (€${profile.targetMinGrossMarginEur})`);
  } else {
    score -= 40;
    reasons.push("expected contribution margin is zero or negative at the estimated selling price");
  }

  if (supplierCount > 1) {
    score += 5;
    reasons.push(`${supplierCount} known supplier offers for this concept — some ability to switch or renegotiate`);
  }

  return { score: clamp(round(score, 0), 0, 100), reasons };
}

export function computeAlibabaMargin(bundle: ProductBundle, profile: InvestmentProfile): AlibabaMarginFindings {
  const bestUnitPriceEur = bundle.bestSource.priceEur;
  const moq = bundle.bestSource.moq;
  const priceMin = bundle.bestSource.priceMin ?? bestUnitPriceEur;
  const priceMax = bundle.bestSource.priceMax ?? bestUnitPriceEur;
  const sellingPriceEur = bundle.estimatedSellingPriceEur;

  const sharedAssumptions: string[] = [];
  const shippingPerUnitEur = estimateShippingPerUnitEur(bundle, sharedAssumptions);

  const conservative = buildScenario(
    "conservative",
    Math.max(bestUnitPriceEur, priceMax),
    round(shippingPerUnitEur * 1.2, 2),
    sellingPriceEur * 0.85,
    1.6,
    sharedAssumptions,
  );
  const expected = buildScenario("expected", bestUnitPriceEur, shippingPerUnitEur, sellingPriceEur, 1.0, sharedAssumptions);
  const optimistic = buildScenario(
    "optimistic",
    Math.min(bestUnitPriceEur, priceMin),
    round(shippingPerUnitEur * 0.85, 2),
    sellingPriceEur * 1.15,
    0.6,
    sharedAssumptions,
  );

  const initialInventoryCommitmentEur = round(moq * expected.landedCost.totalLandedCostEur, 2);
  const inventoryCommitmentBand = commitmentBand(initialInventoryCommitmentEur, profile);
  const { score: capitalEfficiencyScore, reasons: capitalEfficiencyReasons } = computeCapitalEfficiencyScore(
    moq,
    initialInventoryCommitmentEur,
    inventoryCommitmentBand,
    expected.scenario.contributionMarginEur,
    bundle.sources.length,
    profile,
  );

  return {
    bestUnitPriceEur,
    moq,
    moqUnit: bundle.bestSource.moqUnit,
    landedCost: expected.landedCost,
    initialInventoryCommitmentEur,
    inventoryCommitmentBand,
    capitalEfficiencyScore,
    capitalEfficiencyReasons,
    scenarios: { conservative: conservative.scenario, expected: expected.scenario, optimistic: optimistic.scenario },
    summary: `Expected: €${expected.scenario.contributionMarginEur} contribution margin (${expected.scenario.marginPercent}%) at €${round(sellingPriceEur, 2)} retail, landed cost €${expected.landedCost.totalLandedCostEur}. Initial inventory commitment €${initialInventoryCommitmentEur} (MOQ ${moq}) — ${inventoryCommitmentBand} band. Capital efficiency score ${capitalEfficiencyScore}/100.`,
  };
}
