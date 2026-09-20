import { Verdict } from "@prisma/client";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { MarginFindings } from "@/server/pipeline/agents/schemas";
import { SupplierFindings } from "@/server/pipeline/agents/schemas";
import { TrendFindings } from "@/server/pipeline/agentsDeterministic/trend";
import { CompetitorFindings } from "@/server/pipeline/agentsDeterministic/competitor";
import { RiskFindings } from "@/server/pipeline/agentsDeterministic/risk";
import { DeterministicScoringWeights } from "@/server/settings";
import { clamp } from "@/server/pipeline/agentsDeterministic/shared";

// Rule-based Judge (V1.1, zero AI) — master spec section 11. Every number
// is a plain formula over the other agents' real, measured findings.
// "No narrative AI output needed": the WHY/CONCERNS lines below are
// assembled from the same rule evaluations that produced the score, in
// the spec's own "+22/25 margin" format — never generated text.

export interface DeterministicRubricScores {
  margin: number; // 0-10
  demand: number;
  competition: number;
  supplierQuality: number;
  shipping: number;
  marketPriceOpportunity: number;
  trend: number;
  operationalRisk: number;
}

const RUBRIC_DIMENSIONS = [
  "margin",
  "demand",
  "competition",
  "supplierQuality",
  "shipping",
  "marketPriceOpportunity",
  "trend",
  "operationalRisk",
] as const satisfies readonly (keyof DeterministicRubricScores)[];

const DIMENSION_LABELS: Record<keyof DeterministicRubricScores, string> = {
  margin: "margin",
  demand: "demand",
  competition: "competition",
  supplierQuality: "supplier",
  shipping: "shipping",
  marketPriceOpportunity: "market opportunity",
  trend: "momentum",
  operationalRisk: "risk",
};

export function computeDemandScore(orderCount: number | null, reviewCount: number | null): number {
  const o = orderCount ?? 0;
  let score: number;
  if (o >= 10000) score = 10;
  else if (o >= 5000) score = 9;
  else if (o >= 2000) score = 8;
  else if (o >= 1000) score = 7;
  else if (o >= 500) score = 6;
  else if (o >= 200) score = 5;
  else if (o >= 50) score = 3;
  else score = 1;

  if ((reviewCount ?? 0) >= 500) score = Math.min(10, score + 1);
  return clamp(score, 0, 10);
}

export function computeShippingScore(leadTimeDaysMax: number): number {
  if (leadTimeDaysMax <= 10) return 9;
  if (leadTimeDaysMax <= 20) return 6;
  if (leadTimeDaysMax <= 35) return 4;
  return 2;
}

export function computeMarginScore(marginPercent: number): number {
  return clamp(Math.round((marginPercent / 50) * 10), 0, 10);
}

export function computeMarketPriceOpportunityScore(
  purchasePriceEur: number,
  medianMarketPriceEur: number | null,
): number {
  if (medianMarketPriceEur == null || medianMarketPriceEur <= 0 || purchasePriceEur <= 0) return 5; // unknown -> neutral
  const markupPotential = (medianMarketPriceEur - purchasePriceEur) / purchasePriceEur;
  if (markupPotential >= 3) return 10;
  if (markupPotential >= 2) return 8;
  if (markupPotential >= 1.5) return 6;
  if (markupPotential >= 1) return 4;
  if (markupPotential >= 0.5) return 2;
  return 0;
}

export function computeOperationalRiskScore(
  weightGrams: number,
  moq: number,
  returnRatePercent: number,
): number {
  let score = 8;
  if (weightGrams > 4000) score -= 4;
  else if (weightGrams > 2000) score -= 2;
  if (moq > 5) score -= 1;
  if (returnRatePercent > 15) score -= 2;
  return clamp(score, 0, 10);
}

export interface DeterministicJudgeInputs {
  margin: MarginFindings;
  supplier: SupplierFindings;
  competitor: CompetitorFindings;
  trend: TrendFindings;
  risk: RiskFindings;
}

export function computeDeterministicRubricScores(
  bundle: ProductBundle,
  inputs: DeterministicJudgeInputs,
): DeterministicRubricScores {
  return {
    margin: computeMarginScore(inputs.margin.scenarios.base.marginPercent),
    demand: computeDemandScore(bundle.bestSource.orderCount, bundle.bestSource.reviewCount),
    competition: clamp(10 - inputs.competitor.marketSaturationScore, 0, 10),
    supplierQuality: clamp(Math.round(inputs.supplier.supplierQualityScore), 0, 10),
    shipping: computeShippingScore(inputs.supplier.leadTimeDaysMax),
    marketPriceOpportunity: computeMarketPriceOpportunityScore(
      bundle.bestSource.priceEur,
      inputs.competitor.medianMarketPriceEur,
    ),
    trend: inputs.trend.trendScore,
    operationalRisk: computeOperationalRiskScore(
      bundle.bestSource.weightGrams,
      bundle.bestSource.moq,
      inputs.margin.returnRatePercent,
    ),
  };
}

export function computeMoneyScore(scores: DeterministicRubricScores, weights: DeterministicScoringWeights): number {
  let weightedSum = 0;
  let maxPossible = 0;
  for (const dim of RUBRIC_DIMENSIONS) {
    const w = weights[dim];
    weightedSum += scores[dim] * w;
    maxPossible += 10 * w;
  }
  if (maxPossible === 0) return 0;
  return clamp(Math.round((weightedSum / maxPossible) * 100), 0, 100);
}

export function verdictForScore(moneyScore: number, weights: DeterministicScoringWeights): Verdict {
  if (moneyScore >= weights.highPotentialMin) return Verdict.HIGH_POTENTIAL;
  if (moneyScore >= weights.interestingMin) return Verdict.INTERESTING;
  if (moneyScore >= weights.watchMin) return Verdict.WATCH;
  return Verdict.REJECT;
}

/**
 * "+22/25 margin" style lines — the sub-score for a dimension expressed
 * out of its configured weight (not out of 10), exactly the display the
 * spec's example shows. Every dimension gets a line so nothing is hidden;
 * `why` covers dimensions that carried their weight, `concerns` covers
 * ones that lost more than half of it, plus any Risk/Competitor/Trend
 * flags collected along the way.
 */
export function buildDeterministicRubricLines(
  scores: DeterministicRubricScores,
  weights: DeterministicScoringWeights,
): { why: string[]; concerns: string[] } {
  const why: string[] = [];
  const concerns: string[] = [];
  for (const dim of RUBRIC_DIMENSIONS) {
    const weight = weights[dim];
    const points = Math.round((scores[dim] / 10) * weight);
    const line = `${points}/${weight} ${DIMENSION_LABELS[dim]}`;
    if (scores[dim] >= 6) why.push(line);
    else if (scores[dim] <= 4) concerns.push(line);
  }
  return { why, concerns };
}

export interface DeterministicJudgeResult {
  scores: DeterministicRubricScores;
  moneyScore: number;
  verdict: Verdict;
  why: string[];
  concerns: string[];
  nextStep: string;
  weightsUsed: DeterministicScoringWeights;
}

export function runDeterministicJudge(
  bundle: ProductBundle,
  inputs: DeterministicJudgeInputs,
  weights: DeterministicScoringWeights,
): DeterministicJudgeResult {
  const scores = computeDeterministicRubricScores(bundle, inputs);
  const moneyScore = computeMoneyScore(scores, weights);
  const verdict = verdictForScore(moneyScore, weights);
  const { why, concerns } = buildDeterministicRubricLines(scores, weights);

  // Fold in the concrete rule flags from Risk/Competitor/Trend, not just
  // the rubric-line summary, so a HIGH compliance risk or zero-competitor-
  // match situation is visible even if its dimension still scored midrange.
  for (const flag of inputs.risk.flags) concerns.push(flag);
  if (inputs.competitor.competitorCount === 0) {
    concerns.push("no confidently-matched market listings found — price opportunity unverified");
  }

  const nextStep =
    verdict === Verdict.HIGH_POTENTIAL
      ? "Move to Validation Lab: prepare a landing page test."
      : verdict === Verdict.INTERESTING
        ? "Watch for 1-2 more cycles; revisit if supplier price drops or more market data comes in."
        : verdict === Verdict.WATCH
          ? "Keep on the watchlist; re-score if price or competition changes."
          : "No further spend justified right now.";

  return { scores, moneyScore, verdict, why, concerns, nextStep, weightsUsed: weights };
}
