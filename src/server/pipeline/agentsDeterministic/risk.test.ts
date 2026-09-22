import { describe, expect, it } from "vitest";
import { computeDeterministicRisk } from "@/server/pipeline/agentsDeterministic/risk";
import { SETTINGS } from "@/server/settings";

const thresholds = SETTINGS.filterThresholds.fallback;
const investmentProfile = SETTINGS.investmentProfile.fallback;

describe("computeDeterministicRisk", () => {
  it("reuses the deterministic compliance classification from filter.ts", () => {
    const excluded = computeDeterministicRisk({ category: "supplements", rating: 4.5, priceEur: 20, thresholds });
    expect(excluded.complianceRisk).toBe("HIGH");
    const ordinary = computeDeterministicRisk({ category: "travel-bags", rating: 4.5, priceEur: 20, thresholds });
    expect(ordinary.complianceRisk).toBe("LOW");
  });

  it("flags elevated IP risk for configured high-risk categories", () => {
    const result = computeDeterministicRisk({ category: "toys-games", rating: 4.5, priceEur: 20, thresholds });
    expect(result.ipRisk).toBe("MEDIUM");
  });

  it("increases estimated return risk for low ratings", () => {
    const lowRating = computeDeterministicRisk({ category: "travel-bags", rating: 3.2, priceEur: 20, thresholds });
    const highRating = computeDeterministicRisk({ category: "travel-bags", rating: 4.8, priceEur: 20, thresholds });
    expect(lowRating.returnRiskEstimatePercent).toBeGreaterThan(highRating.returnRiskEstimatePercent);
  });

  it("increases estimated return risk for very cheap items", () => {
    const cheap = computeDeterministicRisk({ category: "travel-bags", rating: 4.5, priceEur: 2, thresholds });
    const normal = computeDeterministicRisk({ category: "travel-bags", rating: 4.5, priceEur: 20, thresholds });
    expect(cheap.returnRiskEstimatePercent).toBeGreaterThan(normal.returnRiskEstimatePercent);
  });

  it("keeps return risk within 0-60%", () => {
    const result = computeDeterministicRisk({ category: "supplements", rating: 1.0, priceEur: 0.5, thresholds });
    expect(result.returnRiskEstimatePercent).toBeLessThanOrEqual(60);
    expect(result.returnRiskEstimatePercent).toBeGreaterThanOrEqual(0);
  });

  it("flags a single unverified supplier and requires human review", () => {
    const result = computeDeterministicRisk({
      category: "travel-bags",
      rating: 4.5,
      priceEur: 20,
      thresholds,
      supplierCount: 1,
      verifiedSupplierCount: 0,
    });
    expect(result.flags.some((f) => f.includes("single known supplier"))).toBe(true);
    expect(result.flags.some((f) => f.includes("no verified supplier"))).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("does not require human review for multiple verified suppliers within MOQ comfort", () => {
    const result = computeDeterministicRisk({
      category: "travel-bags",
      rating: 4.5,
      priceEur: 20,
      thresholds,
      moq: 50,
      supplierCount: 4,
      verifiedSupplierCount: 2,
      landedCostKnown: true,
      certifications: ["CE"],
      leadTimeDays: 20,
      marketMatchConfidence: 0.8,
      investmentProfile,
    });
    expect(result.requiresHumanReview).toBe(false);
  });

  it("flags MOQ above the hard-penalty threshold as critical", () => {
    const result = computeDeterministicRisk({
      category: "travel-bags",
      rating: 4.5,
      priceEur: 20,
      thresholds,
      moq: 1000,
      investmentProfile,
    });
    expect(result.flags.some((f) => f.includes("MOQ 1000"))).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("flags possible battery signal from title keywords as critical", () => {
    const result = computeDeterministicRisk({
      category: "gadgets",
      title: "Portable rechargeable battery power bank",
      rating: 4.5,
      priceEur: 20,
      thresholds,
    });
    expect(result.flags.some((f) => f.includes("battery"))).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("flags extreme low price as a possible counterfeit/quality/data-error signal", () => {
    const result = computeDeterministicRisk({ category: "travel-bags", rating: 4.5, priceEur: 0.1, thresholds });
    expect(result.flags.some((f) => f.includes("extremely low"))).toBe(true);
    expect(result.requiresHumanReview).toBe(true);
  });

  it("flags low market match confidence without requiring human review by itself", () => {
    const result = computeDeterministicRisk({
      category: "travel-bags",
      rating: 4.5,
      priceEur: 20,
      thresholds,
      marketMatchConfidence: 0.1,
    });
    expect(result.flags.some((f) => f.includes("low market match confidence"))).toBe(true);
  });
});
