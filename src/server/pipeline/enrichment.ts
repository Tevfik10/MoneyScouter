import { FilterOutcome, ComplianceRiskLevel } from "@/server/pipeline/filter";
import { FilterThresholds } from "@/server/settings";
import { DiscoveredProductSource } from "@/server/providers/discovery/types";

// Stage 2 — cheap enrichment. In V1 this is a deterministic heuristic
// standing in for a cheap-model pass (see docs/ARCHITECTURE.md section B
// step 4): it ranks filter-survivors so the shortlist cut can pick the
// most promising N without spending anything on the rest. A real cheap
// LLM classification pass can replace this function later without
// touching the orchestrator's control flow.
export function computeEnrichmentScore(params: {
  filterOutcome: FilterOutcome;
  source: DiscoveredProductSource;
  complianceRisk: ComplianceRiskLevel;
  thresholds: FilterThresholds;
}): number {
  const { filterOutcome, source, complianceRisk, thresholds } = params;

  const marginRatio = clamp(filterOutcome.estimatedMarginEur / Math.max(1, thresholds.preferredGrossMarginEur), 0, 2);
  const ratingScore = clamp((source.rating ?? 0) / 5, 0, 1);
  const reviewScore = clamp(Math.log10((source.reviewCount ?? 0) + 1) / 4, 0, 1);

  let raw = (marginRatio / 2) * 40 + ratingScore * 25 + reviewScore * 35;

  if ((source.shippingDays ?? 0) > thresholds.maxShippingDays * 0.7) raw *= 0.9;
  if (complianceRisk === "HIGH") raw *= 0.85;

  return Math.round(clamp(raw, 0, 100));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
