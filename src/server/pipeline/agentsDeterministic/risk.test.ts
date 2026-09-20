import { describe, expect, it } from "vitest";
import { computeDeterministicRisk } from "@/server/pipeline/agentsDeterministic/risk";
import { SETTINGS } from "@/server/settings";

const thresholds = SETTINGS.filterThresholds.fallback;

describe("computeDeterministicRisk", () => {
  it("reuses the deterministic compliance classification from filter.ts", () => {
    const excluded = computeDeterministicRisk("supplements", 4.5, 20, thresholds);
    expect(excluded.complianceRisk).toBe("HIGH");
    const ordinary = computeDeterministicRisk("travel-bags", 4.5, 20, thresholds);
    expect(ordinary.complianceRisk).toBe("LOW");
  });

  it("flags elevated IP risk for configured high-risk categories", () => {
    const result = computeDeterministicRisk("toys-games", 4.5, 20, thresholds);
    expect(result.ipRisk).toBe("MEDIUM");
  });

  it("increases estimated return risk for low ratings", () => {
    const lowRating = computeDeterministicRisk("travel-bags", 3.2, 20, thresholds);
    const highRating = computeDeterministicRisk("travel-bags", 4.8, 20, thresholds);
    expect(lowRating.returnRiskEstimatePercent).toBeGreaterThan(highRating.returnRiskEstimatePercent);
  });

  it("increases estimated return risk for very cheap items", () => {
    const cheap = computeDeterministicRisk("travel-bags", 4.5, 2, thresholds);
    const normal = computeDeterministicRisk("travel-bags", 4.5, 20, thresholds);
    expect(cheap.returnRiskEstimatePercent).toBeGreaterThan(normal.returnRiskEstimatePercent);
  });

  it("keeps return risk within 0-60%", () => {
    const result = computeDeterministicRisk("supplements", 1.0, 0.5, thresholds);
    expect(result.returnRiskEstimatePercent).toBeLessThanOrEqual(60);
    expect(result.returnRiskEstimatePercent).toBeGreaterThanOrEqual(0);
  });
});
