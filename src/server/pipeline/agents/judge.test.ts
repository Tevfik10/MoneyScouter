import { describe, expect, it } from "vitest";
import { Verdict } from "@prisma/client";
import {
  buildRubricHighlights,
  computeMoneyScore,
  computeRubricScores,
  JudgeInputs,
  verdictForScore,
} from "@/server/pipeline/agents/judge";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { SETTINGS } from "@/server/settings";

const weights = SETTINGS.scoringWeights.fallback;

function bundle(overrides: Partial<ProductBundle["bestSource"]> = {}): ProductBundle {
  return {
    id: "prod_1",
    title: "Foldable Travel Backpack",
    category: "travel-bags",
    estimatedSellingPriceEur: 49.95,
    bestSource: {
      supplierName: "Shenzhen HomeGoods Co.",
      priceEur: 14,
      shippingCostEur: 2,
      shippingDays: 12,
      rating: 4.6,
      reviewCount: 800,
      orderCount: 5000,
      moq: 1,
      weightGrams: 700,
      ...overrides,
    },
    sources: [
      { supplierName: "Shenzhen HomeGoods Co.", priceEur: 14, rating: 4.6, shippingDays: 12, moq: 1 },
    ],
  };
}

function strongInputs(): JudgeInputs {
  return {
    market: {
      demandLevel: "high",
      trendDirection: "rising",
      searchInterestScore: 85,
      seasonality: "steady",
      targetSegments: ["weekend travellers"],
      summary: "strong",
    },
    competitor: {
      competitorCount: 4,
      priceRangeMinEur: 30,
      priceRangeMaxEur: 60,
      dominantChannel: "marketplace",
      competitorQuality: "low",
      positioningNotes: "generic",
      competitors: [{ name: "X", priceEur: 40, positioning: "generic" }],
      summary: "weak competition",
    },
    supplier: {
      supplierCount: 3,
      bestSupplier: { name: "S", priceEur: 14, rating: 4.6, shippingDays: 8, moq: 1 },
      priceSpreadEur: 5,
      leadTimeDaysMin: 8,
      leadTimeDaysMax: 8,
      supplierQualityScore: 9,
      summary: "good",
    },
    margin: {
      buyPriceEur: 14,
      shippingCostEur: 2,
      sellingPriceEur: 49.95,
      vatRatePercent: 21,
      transactionFeePercent: 2.9,
      fulfillmentCostEur: 2.5,
      returnRatePercent: 5,
      scenarios: {
        bad: { contributionMarginEur: 10, marginPercent: 20 },
        base: { contributionMarginEur: 25, marginPercent: 55 },
        good: { contributionMarginEur: 35, marginPercent: 65 },
      },
      summary: "strong margin",
    },
    brand: {
      brandabilityScore: 82,
      idealCustomer: "weekend travellers",
      problemSolved: "no checked luggage",
      emotionalHook: "freedom",
      functionalHook: "fits carry-on",
      canBundle: true,
      canAddPackagingValue: true,
      repeatPurchasePotential: "medium",
      upsellIdeas: ["strap"],
      summary: "strong brand",
    },
    angle: {
      angles: [1, 2, 3, 4].map((i) => ({
        name: `angle-${i}`,
        targetAudience: "travellers",
        problem: "p",
        promise: "p",
        positioning: "p",
        whyBuy: "p",
        pricePosition: "premium",
        brandFeel: "clean",
        adHook: "hook",
        landingPageHook: "hook",
      })),
      summary: "4 angles",
    },
    risk: {
      complianceRisk: "low",
      flags: [],
      ipRisk: "low",
      returnRiskEstimatePercent: 8,
      summary: "low risk",
    },
    skeptic: {
      verdictLean: "proceed",
      strongestObjection: "commodity risk",
      objections: ["commodity risk"],
      commoditizationRisk: "low",
      counterEvidence: [],
      summary: "mild concerns",
    },
  };
}

function weakInputs(): JudgeInputs {
  const strong = strongInputs();
  return {
    ...strong,
    market: { ...strong.market, demandLevel: "low", trendDirection: "declining", searchInterestScore: 15 },
    competitor: { ...strong.competitor, competitorQuality: "high", competitorCount: 20 },
    margin: {
      ...strong.margin,
      scenarios: {
        bad: { contributionMarginEur: -5, marginPercent: -10 },
        base: { contributionMarginEur: 2, marginPercent: 4 },
        good: { contributionMarginEur: 5, marginPercent: 10 },
      },
    },
    brand: { ...strong.brand, brandabilityScore: 15 },
    angle: null,
    risk: { ...strong.risk, complianceRisk: "high", ipRisk: "high", returnRiskEstimatePercent: 30 },
  };
}

describe("computeRubricScores", () => {
  it("scores a strong product highly across dimensions", () => {
    const scores = computeRubricScores(bundle(), strongInputs());
    expect(scores.demand).toBeGreaterThanOrEqual(7);
    expect(scores.trend).toBeGreaterThanOrEqual(7);
    expect(scores.margin).toBeGreaterThanOrEqual(7);
    expect(scores.brandability).toBeGreaterThanOrEqual(7);
  });

  it("scores a weak product low across dimensions", () => {
    const scores = computeRubricScores(bundle(), weakInputs());
    expect(scores.demand).toBeLessThanOrEqual(4);
    expect(scores.brandability).toBeLessThanOrEqual(4);
    expect(scores.marketingAngles).toBeLessThanOrEqual(4); // angle skipped -> low score
    expect(scores.risk).toBeLessThanOrEqual(4);
  });

  it("penalizes operational ease for heavy, high-MOQ products", () => {
    const light = computeRubricScores(bundle({ weightGrams: 500, moq: 1 }), strongInputs());
    const heavy = computeRubricScores(bundle({ weightGrams: 6000, moq: 20 }), strongInputs());
    expect(heavy.operationalEase).toBeLessThan(light.operationalEase);
  });

  it("keeps every dimension within 0-10", () => {
    for (const scores of [computeRubricScores(bundle(), strongInputs()), computeRubricScores(bundle(), weakInputs())]) {
      for (const v of Object.values(scores)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe("computeMoneyScore + verdictForScore", () => {
  it("gives a strong product a high money score and HIGH_POTENTIAL or INTERESTING verdict", () => {
    const scores = computeRubricScores(bundle(), strongInputs());
    const moneyScore = computeMoneyScore(scores, weights);
    expect(moneyScore).toBeGreaterThanOrEqual(60);
    const verdict = verdictForScore(moneyScore, weights);
    expect([Verdict.HIGH_POTENTIAL, Verdict.INTERESTING]).toContain(verdict);
  });

  it("gives a weak product a low money score and REJECT or WATCH verdict", () => {
    const scores = computeRubricScores(bundle(), weakInputs());
    const moneyScore = computeMoneyScore(scores, weights);
    expect(moneyScore).toBeLessThan(50);
    const verdict = verdictForScore(moneyScore, weights);
    expect([Verdict.REJECT, Verdict.WATCH]).toContain(verdict);
  });

  it("keeps money score within 0-100", () => {
    const allTens = { demand: 10, trend: 10, margin: 10, competition: 10, brandability: 10, marketingAngles: 10, supplierQuality: 10, shipping: 10, operationalEase: 10, risk: 10 };
    const allZeros = { demand: 0, trend: 0, margin: 0, competition: 0, brandability: 0, marketingAngles: 0, supplierQuality: 0, shipping: 0, operationalEase: 0, risk: 0 };
    expect(computeMoneyScore(allTens, weights)).toBe(100);
    expect(computeMoneyScore(allZeros, weights)).toBe(0);
  });

  it("verdict thresholds are monotonic with the configured weights", () => {
    expect(verdictForScore(weights.highPotentialMin, weights)).toBe(Verdict.HIGH_POTENTIAL);
    expect(verdictForScore(weights.interestingMin, weights)).toBe(Verdict.INTERESTING);
    expect(verdictForScore(weights.watchMin, weights)).toBe(Verdict.WATCH);
    expect(verdictForScore(weights.watchMin - 1, weights)).toBe(Verdict.REJECT);
  });
});

describe("buildRubricHighlights", () => {
  it("surfaces strong dimensions as why-reasons and weak ones as concerns", () => {
    const { strong, weak } = buildRubricHighlights(computeRubricScores(bundle(), strongInputs()));
    expect(strong.length).toBeGreaterThan(0);
    expect(weak.length).toBe(0);
  });

  it("surfaces weak dimensions as concerns for a weak product", () => {
    const { weak } = buildRubricHighlights(computeRubricScores(bundle(), weakInputs()));
    expect(weak.length).toBeGreaterThan(0);
  });
});
