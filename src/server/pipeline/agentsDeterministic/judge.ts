import { Verdict } from "@prisma/client";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { AlibabaMarginFindings } from "@/server/pipeline/agentsDeterministic/alibabaMargin";
import { AlibabaSupplierFindings } from "@/server/pipeline/agentsDeterministic/alibabaSupplier";
import { TrendFindings } from "@/server/pipeline/agentsDeterministic/trend";
import { CompetitorFindings } from "@/server/pipeline/agentsDeterministic/competitor";
import { RiskFindings } from "@/server/pipeline/agentsDeterministic/risk";
import { DeterministicScoringWeights } from "@/server/settings";
import { clamp, round } from "@/server/pipeline/agentsDeterministic/shared";

// Rule-based Judge — MoneyScore V2 (zero AI). Every number is a plain
// formula over the other agents' real, measured findings. Nine weighted
// dimensions (Unit economics, Market opportunity, Demand signals,
// Competition, Supplier strength, MOQ/capital efficiency, Shipping/
// logistics, Private-label potential, Risk) measure how INTERESTING a
// product is for further investigation — never a guaranteed-sales or
// guaranteed-profit claim. "No narrative AI output needed": the WHY/
// CONCERNS lines below are assembled from the same rule evaluations that
// produced the score, in the spec's own "+22/25 margin" format — never
// generated text.

export interface DeterministicRubricScores {
  margin: number; // 0-10 — Unit economics
  marketPriceOpportunity: number; // Market opportunity
  demand: number; // Demand signals
  competition: number;
  supplierQuality: number; // Supplier strength
  operationalEase: number; // MOQ / capital efficiency
  shipping: number; // Shipping / logistics
  brandability: number; // Private-label potential
  risk: number;
}

const RUBRIC_DIMENSIONS = [
  "margin",
  "marketPriceOpportunity",
  "demand",
  "competition",
  "supplierQuality",
  "operationalEase",
  "shipping",
  "brandability",
  "risk",
] as const satisfies readonly (keyof DeterministicRubricScores)[];

const DIMENSION_LABELS: Record<keyof DeterministicRubricScores, string> = {
  margin: "unit economics",
  marketPriceOpportunity: "market opportunity",
  demand: "demand signals",
  competition: "competition",
  supplierQuality: "supplier strength",
  operationalEase: "MOQ/capital efficiency",
  shipping: "shipping/logistics",
  brandability: "private-label potential",
  risk: "risk",
};

export function computeDemandScore(orderCount: number | null, reviewCount: number | null, trendScore: number): number {
  const o = orderCount ?? 0;
  let score: number;
  if (o >= 10000) score = 10;
  else if (o >= 5000) score = 9;
  else if (o >= 2000) score = 8;
  else if (o >= 1000) score = 7;
  else if (o >= 500) score = 6;
  else if (o >= 200) score = 5;
  else if (o >= 50) score = 3;
  else score = 1;

  if ((reviewCount ?? 0) >= 500) score = Math.min(10, score + 1);
  // Trend momentum (re-discovery cadence, price movement, order growth)
  // conceptually belongs to "demand signals" rather than its own weighted
  // dimension — blended in, not discarded. Score.trend is still persisted
  // separately (see researchDeterministic.ts) so the raw signal stays
  // visible on its own.
  score = (score + trendScore) / 2;
  return clamp(Math.round(score), 0, 10);
}

export function computeShippingScore(leadTimeDaysMax: number): number {
  if (leadTimeDaysMax <= 10) return 9;
  if (leadTimeDaysMax <= 20) return 6;
  if (leadTimeDaysMax <= 35) return 4;
  return 2;
}

export function computeMarginScore(marginPercent: number): number {
  return clamp(Math.round((marginPercent / 50) * 10), 0, 10);
}

export function computeMarketPriceOpportunityScore(landedCostEur: number, medianMarketPriceEur: number | null): number {
  if (medianMarketPriceEur == null || medianMarketPriceEur <= 0 || landedCostEur <= 0) return 5; // unknown -> neutral
  const markupPotential = (medianMarketPriceEur - landedCostEur) / landedCostEur;
  if (markupPotential >= 3) return 10;
  if (markupPotential >= 2) return 8;
  if (markupPotential >= 1.5) return 6;
  if (markupPotential >= 1) return 4;
  if (markupPotential >= 0.5) return 2;
  return 0;
}

/** score/100 -> score/10, the common conversion for the two sub-agent
 * scores (Supplier Score, Capital Efficiency Score) that are already
 * explainable 0-100 rubrics in their own right. */
function scoreOutOf10(score100: number): number {
  return clamp(Math.round(score100 / 10), 0, 10);
}

export function computeBrandabilityScore(privateLabelSignal: boolean, customizationSignal: boolean, supplierCount: number): number {
  let score = 5; // neutral — no signal found either way, not a negative
  if (privateLabelSignal) score += 3;
  if (customizationSignal) score += 2;
  if ((privateLabelSignal || customizationSignal) && supplierCount >= 3) score += 1; // more suppliers to negotiate private-label terms with
  return clamp(score, 0, 10);
}

export function computeRiskDimensionScore(risk: RiskFindings): number {
  let score = 9; // low measured risk -> high score
  if (risk.complianceRisk === "HIGH") score -= 5;
  else if (risk.complianceRisk === "MEDIUM") score -= 2;
  if (risk.ipRisk === "HIGH") score -= 4;
  else if (risk.ipRisk === "MEDIUM") score -= 2;
  if (risk.requiresHumanReview) score -= 2;
  if (risk.flags.length > 4) score -= 1;
  if (risk.returnRiskEstimatePercent > 20) score -= 1;
  return clamp(round(score, 1), 0, 10);
}

export interface DeterministicJudgeInputs {
  margin: AlibabaMarginFindings;
  supplier: AlibabaSupplierFindings;
  competitor: CompetitorFindings;
  trend: TrendFindings;
  risk: RiskFindings;
}

export function computeDeterministicRubricScores(
  bundle: ProductBundle,
  inputs: DeterministicJudgeInputs,
): DeterministicRubricScores {
  const leadTimeDaysMax =
    bundle.sources.length > 0 ? Math.max(...bundle.sources.map((s) => s.shippingDays)) : bundle.bestSource.shippingDays;

  return {
    margin: computeMarginScore(inputs.margin.scenarios.expected.marginPercent),
    marketPriceOpportunity: computeMarketPriceOpportunityScore(
      inputs.margin.landedCost.totalLandedCostEur,
      inputs.competitor.medianMarketPriceEur,
    ),
    demand: computeDemandScore(bundle.bestSource.orderCount, bundle.bestSource.reviewCount, inputs.trend.trendScore),
    competition: clamp(10 - inputs.competitor.marketSaturationScore, 0, 10),
    supplierQuality: scoreOutOf10(inputs.supplier.supplierScore),
    operationalEase: scoreOutOf10(inputs.margin.capitalEfficiencyScore),
    shipping: computeShippingScore(leadTimeDaysMax),
    brandability: computeBrandabilityScore(
      inputs.supplier.privateLabelSignal,
      inputs.supplier.customizationSignal,
      inputs.supplier.supplierCount,
    ),
    risk: computeRiskDimensionScore(inputs.risk),
  };
}

export function computeMoneyScore(scores: DeterministicRubricScores, weights: DeterministicScoringWeights): number {
  let weightedSum = 0;
  let maxPossible = 0;
  for (const dim of RUBRIC_DIMENSIONS) {
    const w = weights[dim];
    weightedSum += scores[dim] * w;
    maxPossible += 10 * w;
  }
  if (maxPossible === 0) return 0;
  return clamp(Math.round((weightedSum / maxPossible) * 100), 0, 100);
}

export function verdictForScore(moneyScore: number, weights: DeterministicScoringWeights): Verdict {
  if (moneyScore >= weights.highPotentialMin) return Verdict.HIGH_POTENTIAL;
  if (moneyScore >= weights.interestingMin) return Verdict.INTERESTING;
  if (moneyScore >= weights.watchMin) return Verdict.WATCH;
  return Verdict.REJECT;
}

/**
 * "+22/25 margin" style lines — the sub-score for a dimension expressed
 * out of its configured weight (not out of 10), exactly the display the
 * spec's example shows. Every dimension gets a line so nothing is hidden;
 * `why` covers dimensions that carried their weight, `concerns` covers
 * ones that lost more than half of it, plus any Risk/Competitor flags
 * collected along the way.
 */
export function buildDeterministicRubricLines(
  scores: DeterministicRubricScores,
  weights: DeterministicScoringWeights,
): { why: string[]; concerns: string[] } {
  const why: string[] = [];
  const concerns: string[] = [];
  for (const dim of RUBRIC_DIMENSIONS) {
    const weight = weights[dim];
    const points = Math.round((scores[dim] / 10) * weight);
    const line = `${points}/${weight} ${DIMENSION_LABELS[dim]}`;
    if (scores[dim] >= 6) why.push(line);
    else if (scores[dim] <= 4) concerns.push(line);
  }
  return { why, concerns };
}

export interface DeterministicJudgeResult {
  scores: DeterministicRubricScores;
  moneyScore: number;
  verdict: Verdict;
  why: string[];
  concerns: string[];
  nextStep: string;
  weightsUsed: DeterministicScoringWeights;
}

export function runDeterministicJudge(
  bundle: ProductBundle,
  inputs: DeterministicJudgeInputs,
  weights: DeterministicScoringWeights,
): DeterministicJudgeResult {
  const scores = computeDeterministicRubricScores(bundle, inputs);
  const moneyScore = computeMoneyScore(scores, weights);
  const verdict = verdictForScore(moneyScore, weights);
  const { why, concerns } = buildDeterministicRubricLines(scores, weights);

  // Fold in the concrete rule flags from Risk/Competitor, not just the
  // rubric-line summary, so a HIGH compliance risk or zero-competitor-match
  // situation is visible even if its dimension still scored midrange.
  for (const flag of inputs.risk.flags) concerns.push(flag);
  if (inputs.competitor.competitorCount === 0) {
    concerns.push("no confidently-matched market listings found — price opportunity unverified");
  }
  if (inputs.risk.requiresHumanReview) {
    concerns.push("flagged for human review — at least one risk signal needs a person's judgement before proceeding");
  }

  const nextStep =
    verdict === Verdict.HIGH_POTENTIAL
      ? "Move to Validation Lab: prepare a landing page test."
      : verdict === Verdict.INTERESTING
        ? "Watch for 1-2 more cycles; revisit if supplier price drops or more market data comes in."
        : verdict === Verdict.WATCH
          ? "Keep on the watchlist; re-score if price or competition changes."
          : "No further spend justified right now.";

  return { scores, moneyScore, verdict, why, concerns, nextStep, weightsUsed: weights };
}
