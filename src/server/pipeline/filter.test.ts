import { describe, expect, it } from "vitest";
import { classifyComplianceRisk, estimateSellingPriceEur, runDeterministicFilter } from "@/server/pipeline/filter";
import { SETTINGS } from "@/server/settings";

const thresholds = SETTINGS.filterThresholds.fallback;

function baseInput(overrides: Partial<Parameters<typeof runDeterministicFilter>[0]> = {}) {
  return {
    category: "travel-bags",
    purchasePriceEur: 14,
    shippingCostEur: 2,
    shippingDays: 12,
    supplierRating: 4.5,
    reviewCount: 500,
    weightGrams: 800,
    ...overrides,
  };
}

describe("runDeterministicFilter", () => {
  it("passes a product that clears every threshold", () => {
    const outcome = runDeterministicFilter(baseInput(), thresholds);
    expect(outcome.verdict).toBe("PASS");
  });

  it("rejects an excluded category regardless of economics", () => {
    const outcome = runDeterministicFilter(baseInput({ category: "supplements", purchasePriceEur: 10 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
    expect(outcome.reasons.some((r) => r.includes("excluded"))).toBe(true);
  });

  it("rejects a purchase price above the configured maximum", () => {
    const outcome = runDeterministicFilter(baseInput({ purchasePriceEur: 999 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
  });

  it("rejects when estimated margin is below the minimum", () => {
    const outcome = runDeterministicFilter(
      baseInput({ purchasePriceEur: 39, shippingCostEur: 0 }),
      thresholds,
    );
    // at 2.5x markup, 39 -> 97.5 selling price, margin 58.5 which is fine;
    // force a low-markup scenario via a stricter threshold set instead
    const strict = { ...thresholds, preferredMarkupMultiplier: 1.1, minGrossMarginEur: 50 };
    const strictOutcome = runDeterministicFilter(baseInput({ purchasePriceEur: 39 }), strict);
    expect(strictOutcome.verdict).toBe("REJECT");
    expect(strictOutcome.reasons.some((r) => r.includes("margin"))).toBe(true);
    expect(outcome.verdict).toBe("PASS");
  });

  it("rejects a low supplier rating", () => {
    const outcome = runDeterministicFilter(baseInput({ supplierRating: 2.1 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
    expect(outcome.reasons.some((r) => r.includes("rating"))).toBe(true);
  });

  it("rejects too few reviews", () => {
    const outcome = runDeterministicFilter(baseInput({ reviewCount: 3 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
  });

  it("rejects shipping that takes too long", () => {
    const outcome = runDeterministicFilter(baseInput({ shippingDays: 60 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
  });

  it("rejects a product that is too heavy", () => {
    const outcome = runDeterministicFilter(baseInput({ weightGrams: 20000 }), thresholds);
    expect(outcome.verdict).toBe("REJECT");
  });

  it("accumulates multiple reasons when several thresholds fail", () => {
    const outcome = runDeterministicFilter(
      baseInput({ purchasePriceEur: 999, supplierRating: 1, reviewCount: 0 }),
      thresholds,
    );
    expect(outcome.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe("estimateSellingPriceEur", () => {
  it("applies the configured preferred markup", () => {
    expect(estimateSellingPriceEur(10, thresholds)).toBeCloseTo(10 * thresholds.preferredMarkupMultiplier, 2);
  });
});

describe("classifyComplianceRisk", () => {
  it("flags excluded categories as HIGH", () => {
    expect(classifyComplianceRisk("supplements", thresholds)).toBe("HIGH");
  });

  it("flags configured high-risk categories as HIGH even though they are not excluded", () => {
    expect(thresholds.excludedCategories).not.toContain("smart-home");
    expect(classifyComplianceRisk("smart-home", thresholds)).toBe("HIGH");
  });

  it("treats an ordinary category as LOW risk", () => {
    expect(classifyComplianceRisk("travel-bags", thresholds)).toBe("LOW");
  });
});
