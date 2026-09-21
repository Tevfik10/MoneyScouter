import { describe, expect, it } from "vitest";
import { computeAlibabaMargin } from "@/server/pipeline/agentsDeterministic/alibabaMargin";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { SETTINGS } from "@/server/settings";

const investmentProfile = SETTINGS.investmentProfile.fallback;

function bundle(overrides: Partial<ProductBundle["bestSource"]> = {}, sources?: ProductBundle["sources"]): ProductBundle {
  const bestSource = {
    supplierName: "Alibaba Seller",
    priceEur: 14,
    shippingCostEur: 2,
    shippingDays: 18,
    rating: 4.6,
    reviewCount: 40,
    orderCount: 1200,
    moq: 100,
    weightGrams: 900,
    ...overrides,
  };
  return {
    id: "prod_1",
    title: "Foldable Travel Backpack",
    category: "travel",
    estimatedSellingPriceEur: 49.95,
    bestSource,
    sources: sources ?? [{ supplierName: "Alibaba Seller", priceEur: 14, rating: 4.6, shippingDays: 18, moq: 100 }],
  };
}

describe("computeAlibabaMargin", () => {
  it("builds a landed cost that includes unit price, shipping, duty, packaging and fulfilment", () => {
    const result = computeAlibabaMargin(bundle(), investmentProfile);
    const lc = result.landedCost;
    expect(lc.unitPriceEur).toBe(14);
    expect(lc.shippingPerUnitEur).toBe(2);
    expect(lc.importDutyEur).toBeGreaterThan(0);
    expect(lc.packagingEur).toBeGreaterThan(0);
    expect(lc.fulfillmentEur).toBeGreaterThan(0);
    expect(lc.totalLandedCostEur).toBeCloseTo(
      lc.unitPriceEur + lc.shippingPerUnitEur + lc.importDutyEur + lc.packagingEur + lc.fulfillmentEur,
      2,
    );
  });

  it("labels every non-measured input as an assumption, never presenting it as confirmed", () => {
    const result = computeAlibabaMargin(bundle({ shippingCostEur: 0 }), investmentProfile);
    expect(result.landedCost.assumptions.some((a) => a.includes("shipping per unit estimated"))).toBe(true);
    expect(result.landedCost.assumptions.some((a) => a.includes("import duty assumed"))).toBe(true);
  });

  it("does not assume shipping when a real supplier shipping cost is present", () => {
    const result = computeAlibabaMargin(bundle({ shippingCostEur: 3.5 }), investmentProfile);
    expect(result.landedCost.shippingPerUnitEur).toBe(3.5);
    expect(result.landedCost.assumptions.some((a) => a.includes("shipping per unit estimated"))).toBe(false);
  });

  it("computes initial inventory commitment as MOQ x landed cost (expected scenario)", () => {
    const result = computeAlibabaMargin(bundle({ moq: 100 }), investmentProfile);
    expect(result.initialInventoryCommitmentEur).toBeCloseTo(100 * result.landedCost.totalLandedCostEur, 1);
  });

  it("bands the inventory commitment against the investment profile", () => {
    const cheap = computeAlibabaMargin(bundle({ moq: 10, priceEur: 5, shippingCostEur: 1 }), investmentProfile);
    expect(cheap.inventoryCommitmentBand).toBe("preferred");

    const expensive = computeAlibabaMargin(bundle({ moq: 5000, priceEur: 20, shippingCostEur: 5 }), investmentProfile);
    expect(expensive.inventoryCommitmentBand).toBe("excessive");
  });

  it("produces conservative <= expected <= optimistic contribution margin ordering", () => {
    const result = computeAlibabaMargin(bundle(), investmentProfile);
    expect(result.scenarios.conservative.contributionMarginEur).toBeLessThanOrEqual(result.scenarios.expected.contributionMarginEur);
    expect(result.scenarios.expected.contributionMarginEur).toBeLessThanOrEqual(result.scenarios.optimistic.contributionMarginEur);
  });

  it("sets break-even CAC to the contribution margin, floored at zero", () => {
    const result = computeAlibabaMargin(bundle(), investmentProfile);
    expect(result.scenarios.expected.breakEvenCacEur).toBe(Math.max(0, result.scenarios.expected.contributionMarginEur));

    const lossMaking = computeAlibabaMargin(bundle({ priceEur: 100, shippingCostEur: 20 }), investmentProfile);
    expect(lossMaking.scenarios.conservative.breakEvenCacEur).toBe(0);
  });

  it("penalizes MOQ above the hard threshold in the capital efficiency score", () => {
    const lowMoq = computeAlibabaMargin(bundle({ moq: 50 }), investmentProfile);
    const highMoq = computeAlibabaMargin(bundle({ moq: 1000 }), investmentProfile);
    expect(highMoq.capitalEfficiencyScore).toBeLessThan(lowMoq.capitalEfficiencyScore);
  });

  it("rewards multiple known supplier offers in the capital efficiency score", () => {
    const single = computeAlibabaMargin(
      bundle({}, [{ supplierName: "A", priceEur: 14, rating: 4.6, shippingDays: 18, moq: 100 }]),
      investmentProfile,
    );
    const multi = computeAlibabaMargin(
      bundle({}, [
        { supplierName: "A", priceEur: 14, rating: 4.6, shippingDays: 18, moq: 100 },
        { supplierName: "B", priceEur: 15, rating: 4.3, shippingDays: 20, moq: 150 },
      ]),
      investmentProfile,
    );
    expect(multi.capitalEfficiencyScore).toBeGreaterThanOrEqual(single.capitalEfficiencyScore);
  });

  it("keeps capital efficiency score within 0-100", () => {
    const worst = computeAlibabaMargin(bundle({ moq: 100000, priceEur: 500, shippingCostEur: 100 }), investmentProfile);
    expect(worst.capitalEfficiencyScore).toBeGreaterThanOrEqual(0);
    expect(worst.capitalEfficiencyScore).toBeLessThanOrEqual(100);
  });
});
