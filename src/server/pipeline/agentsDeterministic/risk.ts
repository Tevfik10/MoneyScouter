import { ComplianceRiskLevel, classifyComplianceRisk } from "@/server/pipeline/filter";
import { FilterThresholds, InvestmentProfile } from "@/server/settings";
import { clamp } from "@/server/pipeline/agentsDeterministic/shared";

// Risk Agent (V2, zero AI) — classifyComplianceRisk() (filter.ts) still
// carries the compliance classification and is reused as-is. V2 adds the
// Alibaba-sourcing-specific signals from the master spec: MOQ, single/
// unverified supplier, unknown shipping/landed cost, long lead time,
// fragility, oversized item, electronics/battery, possible IP/certification
// signals, extreme price claims, insufficient supplier info, low market
// match confidence. Every signal here is a rule-of-thumb over real inputs,
// explicitly labeled as an estimate — never a fabricated compliance
// conclusion. When genuinely uncertain, `requiresHumanReview` is set so the
// product is flagged for a person rather than silently scored either way.

const FRAGILE_KEYWORDS = ["glass", "ceramic", "porcelain", "ceramics"];
const ELECTRONICS_KEYWORDS = ["electronic", "circuit", "wireless", "bluetooth", "rechargeable", "led", "smart"];
const BATTERY_KEYWORDS = ["battery", "batteries", "lithium", "li-ion", "power bank"];
const OVERSIZED_WEIGHT_GRAMS_THRESHOLD = 5000;
const LONG_LEAD_TIME_DAYS_THRESHOLD = 45;
const EXTREME_LOW_PRICE_EUR_THRESHOLD = 0.5;

export interface RiskInputs {
  category: string;
  title?: string;
  rating: number | null;
  priceEur: number;
  thresholds: FilterThresholds;
  moq?: number;
  supplierCount?: number;
  verifiedSupplierCount?: number;
  weightGrams?: number | null;
  /** Production + shipping estimate in days, when known. */
  leadTimeDays?: number | null;
  /** False/undefined when shipping or landed cost is still an assumption
   * (see alibabaMargin.ts's `landedCost.assumptions`) rather than a real
   * supplier quote. */
  landedCostKnown?: boolean;
  certifications?: string[];
  /** Best Google Shopping match confidence from the Competitor Agent. */
  marketMatchConfidence?: number | null;
  investmentProfile?: InvestmentProfile;
}

export interface RiskFindings {
  complianceRisk: ComplianceRiskLevel;
  ipRisk: ComplianceRiskLevel;
  returnRiskEstimatePercent: number;
  flags: string[];
  /** True whenever at least one signal here is significant enough that a
   * person should look at this product before acting on it — never
   * silently resolved either way. */
  requiresHumanReview: boolean;
  summary: string;
}

function hasKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function computeDeterministicRisk(inputs: RiskInputs): RiskFindings {
  const { category, rating, priceEur, thresholds } = inputs;
  const complianceRisk = classifyComplianceRisk(category, thresholds);
  const ipRisk: ComplianceRiskLevel = thresholds.highRiskCategories.includes(category) ? "MEDIUM" : "LOW";

  const flags: string[] = [];
  let critical = false;
  let returnRiskEstimatePercent = 8; // category-agnostic baseline, matches alibabaMargin.ts's assumption

  if (rating != null && rating < 4.0) {
    returnRiskEstimatePercent += 6;
    flags.push(`supplier rating ${rating} below 4.0`);
  }
  if (priceEur < 5) {
    returnRiskEstimatePercent += 3;
    flags.push("very low price tier (often higher damage/no-return-shipping rate)");
  }
  if (complianceRisk === "HIGH") {
    flags.push("category flagged for compliance review (CE/GPSR/consumer safety)");
    critical = true;
  }
  if (ipRisk === "MEDIUM") {
    flags.push("category has elevated trademark/IP infringement risk — verify before branding");
    critical = true;
  }

  const text = `${category} ${inputs.title ?? ""}`;
  if (hasKeyword(text, FRAGILE_KEYWORDS)) {
    flags.push("possible fragility signal (glass/ceramic keywords) — packaging and return-damage risk");
  }
  const isElectronics = hasKeyword(text, ELECTRONICS_KEYWORDS);
  if (isElectronics) {
    flags.push("possible electronics signal — CE/RoHS/WEEE compliance requirements likely apply, verify certifications");
  }
  const hasBattery = hasKeyword(text, BATTERY_KEYWORDS);
  if (hasBattery) {
    flags.push("possible battery signal — UN38.3/dangerous-goods shipping rules and extra compliance likely apply");
    critical = true;
  }
  if (inputs.weightGrams != null && inputs.weightGrams > OVERSIZED_WEIGHT_GRAMS_THRESHOLD) {
    flags.push(`weight ${inputs.weightGrams}g is oversized — higher shipping cost and fulfilment friction`);
  }

  if (inputs.moq != null && inputs.investmentProfile) {
    if (inputs.moq > inputs.investmentProfile.moqHardPenaltyAbove) {
      flags.push(`MOQ ${inputs.moq} is well above the configured comfort threshold`);
      critical = true;
    } else if (inputs.moq > inputs.investmentProfile.preferredMoqMax) {
      flags.push(`MOQ ${inputs.moq} exceeds the preferred maximum`);
    }
  }

  if (inputs.supplierCount != null) {
    if (inputs.supplierCount <= 1) {
      flags.push("single known supplier — no fallback if this one fails to deliver or raises price");
      critical = true;
    }
    if (inputs.verifiedSupplierCount != null && inputs.verifiedSupplierCount === 0) {
      flags.push("no verified supplier among known offers — unverified supplier risk");
      critical = true;
    }
  }

  if (inputs.landedCostKnown === false) {
    flags.push("shipping/landed cost is still an assumption, not a confirmed supplier quote");
  }

  if (inputs.leadTimeDays != null && inputs.leadTimeDays > LONG_LEAD_TIME_DAYS_THRESHOLD) {
    flags.push(`estimated lead time ${inputs.leadTimeDays} days is long — slower cash-to-cash cycle`);
  }

  if (inputs.certifications == null || inputs.certifications.length === 0) {
    flags.push("no certifications reported by the supplier listing — verify compliance requirements directly");
  }

  if (priceEur > 0 && priceEur < EXTREME_LOW_PRICE_EUR_THRESHOLD) {
    flags.push(`unit price €${priceEur} is extremely low — possible counterfeit, quality, or data-error risk, verify before committing`);
    critical = true;
  }

  if (inputs.marketMatchConfidence != null && inputs.marketMatchConfidence < 0.4) {
    flags.push(`low market match confidence (${inputs.marketMatchConfidence}) — NL market price/demand read is uncertain`);
  }

  returnRiskEstimatePercent = clamp(returnRiskEstimatePercent, 0, 60);

  return {
    complianceRisk,
    ipRisk,
    returnRiskEstimatePercent,
    flags,
    requiresHumanReview: critical,
    summary: `Compliance: ${complianceRisk}, IP: ${ipRisk}, estimated return rate ${returnRiskEstimatePercent}%${critical ? ", flagged for human review" : ""}.`,
  };
}
