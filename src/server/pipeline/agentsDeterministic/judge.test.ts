import { describe, expect, it } from "vitest";
import { Verdict } from "@prisma/client";
import {
  buildDeterministicRubricLines,
  computeBrandabilityScore,
  computeDemandScore,
  computeMarketPriceOpportunityScore,
  computeMoneyScore,
  computeRiskDimensionScore,
  computeShippingScore,
  DeterministicJudgeInputs,
  DeterministicRubricScores,
  runDeterministicJudge,
  verdictForScore,
} from "@/server/pipeline/agentsDeterministic/judge";
import { AlibabaMarginFindings } from "@/server/pipeline/agentsDeterministic/alibabaMargin";
import { AlibabaSupplierFindings } from "@/server/pipeline/agentsDeterministic/alibabaSupplier";
import { RiskFindings } from "@/server/pipeline/agentsDeterministic/risk";
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
      supplierName: "Alibaba Seller",
      priceEur: 14,
      shippingCostEur: 2,
      shippingDays: 10,
      rating: 4.6,
      reviewCount: 800,
      orderCount: 8000,
      moq: 50,
      weightGrams: 700,
      ...overrides,
    },
    sources: [{ supplierName: "Alibaba Seller", priceEur: 14, rating: 4.6, shippingDays: 10, moq: 50 }],
  };
}

function marginFindings(overrides: Partial<AlibabaMarginFindings["scenarios"]["expected"]> = {}): AlibabaMarginFindings {
  const landedCost = {
    unitPriceEur: 14,
    shippingPerUnitEur: 2,
    importDutyPercent: 4,
    importDutyEur: 0.64,
    packagingEur: 1,
    fulfillmentEur: 2.5,
    totalLandedCostEur: 20.14,
    assumptions: ["shipping per unit estimated from weight"],
  };
  return {
    bestUnitPriceEur: 14,
    moq: 50,
    landedCost,
    initialInventoryCommitmentEur: 1007,
    inventoryCommitmentBand: "preferred",
    capitalEfficiencyScore: 85,
    capitalEfficiencyReasons: ["good economics"],
    scenarios: {
      conservative: { label: "conservative", unitPriceEur: 14, landedCostEur: 20.14, sellingPriceEur: 42.5, contributionMarginEur: 10, marginPercent: 20, breakEvenCacEur: 10 },
      expected: { label: "expected", unitPriceEur: 14, landedCostEur: 20.14, sellingPriceEur: 49.95, contributionMarginEur: 25, marginPercent: 55, breakEvenCacEur: 25, ...overrides },
      optimistic: { label: "optimistic", unitPriceEur: 14, landedCostEur: 20.14, sellingPriceEur: 57.4, contributionMarginEur: 35, marginPercent: 65, breakEvenCacEur: 35 },
    },
    summary: "strong",
  };
}

function supplierFindings(overrides: Partial<AlibabaSupplierFindings> = {}): AlibabaSupplierFindings {
  return {
    supplierCount: 3,
    bestUnitPriceEur: 14,
    lowestMoq: 50,
    verifiedSupplierCount: 2,
    tradeAssuranceCount: 2,
    goldSupplierCount: 1,
    avgYearsOnPlatform: 6,
    avgResponseRatePercent: 92,
    supplierDiversity: "few",
    supplierConcentrationRisk: "medium",
    privateLabelSignal: true,
    customizationSignal: true,
    supplierScore: 90,
    scoreBreakdown: [],
    summary: "good",
    ...overrides,
  };
}

function riskFindings(overrides: Partial<RiskFindings> = {}): RiskFindings {
  return {
    complianceRisk: "LOW",
    ipRisk: "LOW",
    returnRiskEstimatePercent: 8,
    flags: [],
    requiresHumanReview: false,
    summary: "low risk",
    ...overrides,
  };
}

function strongInputs(): DeterministicJudgeInputs {
  return {
    margin: marginFindings(),
    supplier: supplierFindings(),
    competitor: {
      competitorCount: 3,
      medianMarketPriceEur: 55,
      lowestMarketPriceEur: 45,
      highestMarketPriceEur: 65,
      merchantDiversity: 3,
      reviewStrength: 100,
      priceSpreadEur: 20,
      marketSaturationScore: 2,
      matchConfidence: 0.8,
      priceGapEur: 34.86,
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
    risk: riskFindings(),
  };
}

function weakInputs(): DeterministicJudgeInputs {
  const strong = strongInputs();
  return {
    ...strong,
    margin: marginFindings({ contributionMarginEur: 2, marginPercent: 4 }),
    supplier: supplierFindings({ supplierScore: 20, supplierCount: 1, verifiedSupplierCount: 0 }),
    competitor: {
      ...strong.competitor,
      competitorCount: 12,
      medianMarketPriceEur: 15,
      marketSaturationScore: 9,
    },
    trend: { ...strong.trend, trendScore: 2 },
    risk: riskFindings({
      complianceRisk: "HIGH",
      ipRisk: "MEDIUM",
      returnRiskEstimatePercent: 30,
      flags: ["high compliance risk"],
      requiresHumanReview: true,
    }),
  };
}

const allTens: DeterministicRubricScores = {
  margin: 10,
  demand: 10,
  competition: 10,
  supplierQuality: 10,
  shipping: 10,
  marketPriceOpportunity: 10,
  operationalEase: 10,
  brandability: 10,
  risk: 10,
};
const allZeros: DeterministicRubricScores = {
  margin: 0,
  demand: 0,
  competition: 0,
  supplierQuality: 0,
  shipping: 0,
  marketPriceOpportunity: 0,
  operationalEase: 0,
  brandability: 0,
  risk: 0,
};

describe("computeDemandScore", () => {
  it("scales with order count and gets a bump from strong reviews", () => {
    expect(computeDemandScore(0, 0, 5)).toBeLessThan(computeDemandScore(20000, 1000, 5));
  });

  it("never exceeds 10", () => {
    expect(computeDemandScore(999999, 999999, 10)).toBe(10);
  });

  it("blends in trend momentum", () => {
    expect(computeDemandScore(500, 0, 10)).toBeGreaterThan(computeDemandScore(500, 0, 0));
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

  it("scores higher when market price is well above landed cost", () => {
    const highRoom = computeMarketPriceOpportunityScore(10, 50); // 4x
    const lowRoom = computeMarketPriceOpportunityScore(10, 11); // 1.1x
    expect(highRoom).toBeGreaterThan(lowRoom);
  });
});

describe("computeBrandabilityScore", () => {
  it("is neutral when no private-label/customization signal is found", () => {
    expect(computeBrandabilityScore(false, false, 1)).toBe(5);
  });

  it("rewards private-label and customization signals, more so with multiple suppliers", () => {
    const single = computeBrandabilityScore(true, false, 1);
    const multi = computeBrandabilityScore(true, false, 4);
    expect(multi).toBeGreaterThan(single);
    expect(single).toBeGreaterThan(5);
  });
});

describe("computeRiskDimensionScore", () => {
  it("penalizes compliance risk, IP risk and human-review flags", () => {
    const low = computeRiskDimensionScore(riskFindings());
    const high = computeRiskDimensionScore(
      riskFindings({ complianceRisk: "HIGH", ipRisk: "MEDIUM", requiresHumanReview: true, returnRiskEstimatePercent: 30 }),
    );
    expect(low).toBeGreaterThan(high);
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
    const scores: DeterministicRubricScores = {
      margin: 8.8,
      demand: 8,
      competition: 8,
      supplierQuality: 9,
      shipping: 9,
      marketPriceOpportunity: 8,
      operationalEase: 8,
      brandability: 8,
      risk: 8,
    };
    const { why } = buildDeterministicRubricLines(scores, weights);
    // margin weight 25, score 8.8/10 -> 22/25
    expect(why).toContain("22/25 unit economics");
  });

  it("puts low-scoring dimensions in concerns, not why", () => {
    const { why, concerns } = buildDeterministicRubricLines(allZeros, weights);
    expect(why).toHaveLength(0);
    expect(concerns.length).toBeGreaterThan(0);
  });
});

describe("runDeterministicJudge", () => {
  it("includes risk flags and a no-competitor-match warning in concerns", () => {
    const noMarketData: DeterministicJudgeInputs = {
      ...strongInputs(),
      competitor: { ...strongInputs().competitor, competitorCount: 0, medianMarketPriceEur: null, matchConfidence: 0, priceGapEur: null },
      risk: riskFindings({ complianceRisk: "HIGH", flags: ["category flagged"] }),
    };
    const result = runDeterministicJudge(bundle(), noMarketData, weights);
    expect(result.concerns.some((c) => c.includes("no confidently-matched"))).toBe(true);
    expect(result.concerns.some((c) => c.includes("category flagged"))).toBe(true);
  });

  it("flags human-review-required products in concerns", () => {
    const result = runDeterministicJudge(bundle(), weakInputs(), weights);
    expect(result.concerns.some((c) => c.includes("flagged for human review"))).toBe(true);
  });

  it("produces a concrete next step for every verdict", () => {
    for (const inputs of [strongInputs(), weakInputs()]) {
      const result = runDeterministicJudge(bundle(), inputs, weights);
      expect(result.nextStep.length).toBeGreaterThan(0);
    }
  });
});
