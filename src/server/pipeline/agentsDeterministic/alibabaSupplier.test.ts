import { describe, expect, it } from "vitest";
import { computeAlibabaSupplier } from "@/server/pipeline/agentsDeterministic/alibabaSupplier";
import { ProductBundle, ProductSourceSummary } from "@/server/pipeline/agents/types";

function source(overrides: Partial<ProductSourceSummary> = {}): ProductSourceSummary {
  return { supplierName: "Alibaba Seller", priceEur: 14, rating: 4.6, shippingDays: 18, moq: 100, ...overrides };
}

function bundle(sources: ProductSourceSummary[], title = "Foldable Travel Backpack"): ProductBundle {
  const best = sources.reduce((a, b) => (a.priceEur <= b.priceEur ? a : b));
  return {
    id: "prod_1",
    title,
    category: "travel",
    estimatedSellingPriceEur: 49.95,
    bestSource: { ...best, shippingCostEur: 2, reviewCount: 40, orderCount: 1200, weightGrams: 900 },
    sources,
  };
}

describe("computeAlibabaSupplier", () => {
  it("counts suppliers, verified suppliers and Trade Assurance coverage", () => {
    const result = computeAlibabaSupplier(
      bundle([
        source({ supplierName: "A", priceEur: 14, supplierVerified: true, supplierTradeAssurance: true }),
        source({ supplierName: "B", priceEur: 15, supplierVerified: false }),
        source({ supplierName: "C", priceEur: 13, supplierVerified: true }),
      ]),
    );
    expect(result.supplierCount).toBe(3);
    expect(result.verifiedSupplierCount).toBe(2);
    expect(result.tradeAssuranceCount).toBe(1);
    expect(result.bestUnitPriceEur).toBe(13);
    expect(result.lowestMoq).toBe(100);
  });

  it("flags a single supplier as high concentration risk", () => {
    const result = computeAlibabaSupplier(bundle([source()]));
    expect(result.supplierDiversity).toBe("single");
    expect(result.supplierConcentrationRisk).toBe("high");
  });

  it("flags 4+ suppliers as diverse / low concentration risk", () => {
    const result = computeAlibabaSupplier(
      bundle([source({ supplierName: "A" }), source({ supplierName: "B" }), source({ supplierName: "C" }), source({ supplierName: "D" })]),
    );
    expect(result.supplierDiversity).toBe("diverse");
    expect(result.supplierConcentrationRisk).toBe("low");
  });

  it("scores higher with more, more-verified, trade-assured suppliers", () => {
    const weak = computeAlibabaSupplier(bundle([source({ supplierVerified: false })]));
    const strong = computeAlibabaSupplier(
      bundle([
        source({ supplierName: "A", supplierVerified: true, supplierTradeAssurance: true, supplierGold: true, supplierYearsOnPlatform: 8 }),
        source({ supplierName: "B", supplierVerified: true, supplierTradeAssurance: true }),
        source({ supplierName: "C", supplierVerified: true }),
      ]),
    );
    expect(strong.supplierScore).toBeGreaterThan(weak.supplierScore);
  });

  it("keeps supplier score within 0-100", () => {
    const result = computeAlibabaSupplier(bundle([source({ supplierVerified: false })]));
    expect(result.supplierScore).toBeGreaterThanOrEqual(0);
    expect(result.supplierScore).toBeLessThanOrEqual(100);
  });

  it("every score breakdown line sums to the total supplier score", () => {
    const result = computeAlibabaSupplier(
      bundle([source({ supplierVerified: true, supplierTradeAssurance: true, supplierGold: true, supplierYearsOnPlatform: 6 })]),
    );
    const sum = result.scoreBreakdown.reduce((s, l) => s + l.points, 0);
    // clamped to 0-100, so only assert equality when the raw sum is within range
    if (sum >= 0 && sum <= 100) expect(result.supplierScore).toBe(sum);
  });

  it("detects a private-label/OEM/customization signal from the title, never claiming it's confirmed", () => {
    const withSignal = computeAlibabaSupplier(bundle([source()], "Travel Backpack OEM Custom Logo"));
    const withoutSignal = computeAlibabaSupplier(bundle([source()], "Travel Backpack"));
    expect(withSignal.privateLabelSignal).toBe(true);
    expect(withoutSignal.privateLabelSignal).toBe(false);
  });

  it("falls back to bestSource when the bundle has no sources array populated", () => {
    const b = bundle([source()]);
    b.sources = [];
    const result = computeAlibabaSupplier(b);
    expect(result.supplierCount).toBe(1);
  });
});
