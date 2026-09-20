import { describe, expect, it } from "vitest";
import { Verdict } from "@prisma/client";
import {
  buildDeterministicRubricLines,
  computeDemandScore,
  computeMarketPriceOpportunityScore,
  computeMoneyScore,
  computeOperationalRiskScore,
  computeShippingScore,
  DeterministicJudgeInputs,
  runDeterministicJudge,
  verdictForScore,
} from "@/server/pipeline/agentsDeterministic/judge";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { SETTINGS } from "@/server/settings";

const weights = SETTINGS.deterministicScoringWeights.fallback;

function bundle(overrides: Partial<ProductBundle["bestSource"]> = {}): ProductBundle {
  return {
    id: "prod_1",
    title: "Foldable Travel Backpack",
    category: "travel-bags",
    estimatedSellingPriceEur: 49.95,
    bestSource: {
      supplierName: "AliExpress Seller",
      priceEur: 14,
      shippingCostEur: 2,
      shippingDays: 10,
      rating: 4.6,
      reviewCount: 800,
      orderCount: 8000,
      moq: 1,
      weightGrams: 700,
      ...overrides,
    },
    sources: [{ supplierName: "AliExpress Seller", priceEur: 14, rating: 4.6, shippingDays: 10, moq: 1 }],
  };
}

function strongInputs(): DeterministicJudgeInputs {
  return {
    margin: {
      buyPriceEur: 14,
      shippingCostEur: 2,
      sellingPriceEur: 49.95,
      vatRatePercent: 21,
      transactionFeePercent: 2.9,
      fulfillmentCostEur: 2.5,
      returnRatePercent: 6,
      scenarios: {
        bad: { contributionMarginEur: 10, marginPercent: 20 },
        base: { contributionMarginEur: 25, marginPercent: 55 },
        good: { contributionMarginEur: 35, marginPercent: 65 },
      },
      summary: "strong",
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
    competitor: {
      competitorCount: 3,
      medianMarketPriceEur: 55,
      lowestMarketPriceEur: 45,
      highestMarketPriceEur: 65,
      merchantDiversity: 3,
      reviewStrength: 100,
      priceSpreadEur: 20,
      marketSaturationScore: 2,
      matches: [],
      summary: "weak competition",
    },
    trend: {
      trendScore: 8,
      priceMovementPercent: -5,
      appearanceCount: 5,
      orderCount: 8000,
      reasons: [],
      summary: "rising",
    },
    risk: {
      complianceRisk: "LOW",
      ipRisk: "LOW",
      returnRiskEstimatePercent: 8,
      flags: [],
      summary: "low risk",
    },
  };
}

function weakInputs(): DeterministicJudgeInputs {
  const strong = strongInputs();
  return {
    ...strong,
    margin: {
      ...strong.margin,
      scenarios: {
        bad: { contributionMarginEur: -5, marginPercent: -10 },
        base: { contributionMarginEur: 2, marginPercent: 4 },
        good: { contributionMarginEur: 5, marginPercent: 10 },
      },
    },
    supplier: { ...strong.supplier, supplierQualityScore: 3, leadTimeDaysMax: 40 },
    competitor: {
      ...strong.competitor,
      competitorCount: 12,
      medianMarketPriceEur: 15,
      marketSaturationScore: 9,
    },
    trend: { ...strong.trend, trendScore: 2 },
    risk: { complianceRisk: "HIGH", ipRisk: "MEDIUM", returnRiskEstimatePercent: 30, flags: ["high compliance risk"], summary: "risky" },
  };
}

describe("computeDemandScore", () => {
  it("scales with order count and gets a bump from strong reviews", () => {
    expect(computeDemandScore(0, 0)).toBeLessThan(computeDemandScore(20000, 1000));
  });

  it("never exceeds 10", () => {
    expect(computeDemandScore(999999, 999999)).toBe(10);
  });
});

describe("computeShippingScore", () => {
  it("rewards fast shipping and penalizes slow shipping", () => {
    expect(computeShippingScore(5)).toBeGreaterThan(computeShippingScore(40));
  });
});

describe("computeMarketPriceOpportunityScore", () => {
  it("returns a neutral score when no market price is known", () => {
    expect(computeMarketPriceOpportunityScore(14, null)).toBe(5);
  });

  it("scores higher when market price is well above purchase price", () => {
    const highRoom = computeMarketPriceOpportunityScore(10, 50); // 4x
    const lowRoom = computeMarketPriceOpportunityScore(10, 11); // 1.1x
    expect(highRoom).toBeGreaterThan(lowRoom);
  });
});

describe("computeOperationalRiskScore", () => {
  it("penalizes heavy items, high MOQ and high return rate", () => {
    const easy = computeOperationalRiskScore(300, 1, 5);
    const hard = computeOperationalRiskScore(6000, 20, 25);
    expect(easy).toBeGreaterThan(hard);
  });
});

describe("computeMoneyScore / verdictForScore", () => {
  it("gives a strong product a high score", () => {
    const result = runDeterministicJudge(bundle(), strongInputs(), weights);
    expect(result.moneyScore).toBeGreaterThanOrEqual(60);
    expect([Verdict.HIGH_POTENTIAL, Verdict.INTERESTING]).toContain(result.verdict);
  });

  it("gives a weak product a low score", () => {
    const result = runDeterministicJudge(bundle(), weakInputs(), weights);
    expect(result.moneyScore).toBeLessThan(50);
    expect([Verdict.REJECT, Verdict.WATCH]).toContain(result.verdict);
  });

  it("keeps money score within 0-100", () => {
    const allTens = { margin: 10, demand: 10, competition: 10, supplierQuality: 10, shipping: 10, marketPriceOpportunity: 10, trend: 10, operationalRisk: 10 };
    const allZeros = { margin: 0, demand: 0, competition: 0, supplierQuality: 0, shipping: 0, marketPriceOpportunity: 0, trend: 0, operationalRisk: 0 };
    expect(computeMoneyScore(allTens, weights)).toBe(100);
    expect(computeMoneyScore(allZeros, weights)).toBe(0);
  });

  it("verdict thresholds are monotonic with configured weights", () => {
    expect(verdictForScore(weights.highPotentialMin, weights)).toBe(Verdict.HIGH_POTENTIAL);
    expect(verdictForScore(weights.watchMin - 1, weights)).toBe(Verdict.REJECT);
  });
});

describe("buildDeterministicRubricLines", () => {
  it("formats sub-scores as points-out-of-weight, matching the spec's example", () => {
    const { why } = buildDeterministicRubricLines(
      { margin: 8.8 as unknown as number, demand: 8, competition: 8, supplierQuality: 9, shipping: 9, marketPriceOpportunity: 8, trend: 8, operationalRisk: 8 },
      weights,
    );
    // margin weight 25, score 8.8/10 -> 22/25
    expect(why).toContain("22/25 margin");
  });

  it("puts low-scoring dimensions in concerns, not why", () => {
    const { why, concerns } = buildDeterministicRubricLines(
      { margin: 2, demand: 2, competition: 2, supplierQuality: 2, shipping: 2, marketPriceOpportunity: 2, trend: 2, operationalRisk: 2 },
      weights,
    );
    expect(why).toHaveLength(0);
    expect(concerns.length).toBeGreaterThan(0);
  });
});

describe("runDeterministicJudge", () => {
  it("includes risk flags and a no-competitor-match warning in concerns", () => {
    const noMarketData: DeterministicJudgeInputs = {
      ...strongInputs(),
      competitor: { ...strongInputs().competitor, competitorCount: 0, medianMarketPriceEur: null },
      risk: { complianceRisk: "HIGH", ipRisk: "LOW", returnRiskEstimatePercent: 10, flags: ["category flagged"], summary: "x" },
    };
    const result = runDeterministicJudge(bundle(), noMarketData, weights);
    expect(result.concerns.some((c) => c.includes("no confidently-matched"))).toBe(true);
    expect(result.concerns.some((c) => c.includes("category flagged"))).toBe(true);
  });

  it("produces a concrete next step for every verdict", () => {
    for (const inputs of [strongInputs(), weakInputs()]) {
      const result = runDeterministicJudge(bundle(), inputs, weights);
      expect(result.nextStep.length).toBeGreaterThan(0);
    }
  });
});
