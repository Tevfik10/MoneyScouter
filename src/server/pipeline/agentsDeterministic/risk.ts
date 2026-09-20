import { ComplianceRiskLevel, classifyComplianceRisk } from "@/server/pipeline/filter";
import { FilterThresholds } from "@/server/settings";
import { clamp } from "@/server/pipeline/agentsDeterministic/shared";

// Risk Agent (V1.1, zero AI). classifyComplianceRisk() (filter.ts) already
// carries the compliance classification and is reused as-is — it was
// always rule-based, never an LLM call, even in V1. IP risk and return
// risk are rule-of-thumb estimates over real inputs (category, rating,
// price tier), explicitly labeled as estimates, never presented as a
// measured fact.

export interface RiskFindings {
  complianceRisk: ComplianceRiskLevel;
  ipRisk: ComplianceRiskLevel;
  returnRiskEstimatePercent: number;
  flags: string[];
  summary: string;
}

export function computeDeterministicRisk(
  category: string,
  rating: number | null,
  priceEur: number,
  thresholds: FilterThresholds,
): RiskFindings {
  const complianceRisk = classifyComplianceRisk(category, thresholds);
  const ipRisk: ComplianceRiskLevel = thresholds.highRiskCategories.includes(category) ? "MEDIUM" : "LOW";

  const flags: string[] = [];
  let returnRiskEstimatePercent = 8; // category-agnostic baseline, matches margin.ts's assumption

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
  }
  if (ipRisk === "MEDIUM") {
    flags.push("category has elevated trademark/IP infringement risk — verify before branding");
  }

  returnRiskEstimatePercent = clamp(returnRiskEstimatePercent, 0, 60);

  return {
    complianceRisk,
    ipRisk,
    returnRiskEstimatePercent,
    flags,
    summary: `Compliance: ${complianceRisk}, IP: ${ipRisk}, estimated return rate ${returnRiskEstimatePercent}%.`,
  };
}
