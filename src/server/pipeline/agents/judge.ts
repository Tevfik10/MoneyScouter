import { AgentType, TaskType, Verdict } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, ProductBundle } from "@/server/pipeline/agents/types";
import {
  AngleFindings,
  BrandFindings,
  CompetitorFindings,
  MarginFindings,
  MarketFindings,
  RiskFindings,
  SkepticFindings,
  SupplierFindings,
  judgeNarrativeSchema,
} from "@/server/pipeline/agents/schemas";
import { ScoringWeights } from "@/server/settings";

export interface JudgeInputs {
  market: MarketFindings;
  competitor: CompetitorFindings;
  supplier: SupplierFindings;
  margin: MarginFindings;
  brand: BrandFindings;
  angle: AngleFindings | null;
  risk: RiskFindings;
  skeptic: SkepticFindings;
}

export interface RubricScores {
  demand: number;
  trend: number;
  margin: number;
  competition: number;
  brandability: number;
  marketingAngles: number;
  supplierQuality: number;
  shipping: number;
  operationalEase: number;
  risk: number;
}

const RUBRIC_DIMENSIONS = [
  "demand",
  "trend",
  "margin",
  "competition",
  "brandability",
  "marketingAngles",
  "supplierQuality",
  "shipping",
  "operationalEase",
  "risk",
] as const satisfies readonly (keyof RubricScores)[];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Every number here is a transparent, auditable formula over the other
 * agents' structured findings — never a black-box score asked from an LLM.
 * "Geen black box score" (master spec section 11).
 */
export function computeRubricScores(bundle: ProductBundle, inputs: JudgeInputs): RubricScores {
  const demand = clamp(Math.round((inputs.market.searchInterestScore / 100) * 10), 0, 10);

  const trend =
    inputs.market.trendDirection === "rising" ? 9 : inputs.market.trendDirection === "stable" ? 5 : 2;

  const marginPercent = inputs.margin.scenarios.base.marginPercent;
  const margin = clamp(Math.round((marginPercent / 50) * 10), 0, 10);

  const competitionBase =
    inputs.competitor.competitorQuality === "low" ? 8 : inputs.competitor.competitorQuality === "medium" ? 5 : 2;
  const competitionCountPenalty = inputs.competitor.competitorCount > 12 ? 1 : 0;
  const competition = clamp(competitionBase - competitionCountPenalty, 0, 10);

  const brandability = clamp(Math.round(inputs.brand.brandabilityScore / 10), 0, 10);

  const marketingAngles = inputs.angle
    ? clamp(Math.round((inputs.angle.angles.length / 5) * 10), 0, 10)
    : 2;

  const supplierQuality = clamp(Math.round(inputs.supplier.supplierQualityScore), 0, 10);

  const shipping =
    inputs.supplier.leadTimeDaysMax <= 10
      ? 9
      : inputs.supplier.leadTimeDaysMax <= 20
        ? 6
        : inputs.supplier.leadTimeDaysMax <= 35
          ? 4
          : 2;

  let operationalEase = 8;
  if (bundle.bestSource.weightGrams > 4000) operationalEase -= 4;
  else if (bundle.bestSource.weightGrams > 2000) operationalEase -= 2;
  if (bundle.bestSource.moq > 5) operationalEase -= 1;
  if (inputs.margin.returnRatePercent > 15) operationalEase -= 2;
  operationalEase = clamp(operationalEase, 0, 10);

  let risk =
    inputs.risk.complianceRisk === "low" ? 9 : inputs.risk.complianceRisk === "medium" ? 5 : 2;
  if (inputs.risk.ipRisk === "high") risk -= 2;
  if (inputs.risk.returnRiskEstimatePercent > 20) risk -= 1;
  risk = clamp(risk, 0, 10);

  return {
    demand,
    trend,
    margin,
    competition,
    brandability,
    marketingAngles,
    supplierQuality,
    shipping,
    operationalEase,
    risk,
  };
}

export function computeMoneyScore(scores: RubricScores, weights: ScoringWeights): number {
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

export function verdictForScore(moneyScore: number, weights: ScoringWeights): Verdict {
  if (moneyScore >= weights.highPotentialMin) return Verdict.HIGH_POTENTIAL;
  if (moneyScore >= weights.interestingMin) return Verdict.INTERESTING;
  if (moneyScore >= weights.watchMin) return Verdict.WATCH;
  return Verdict.REJECT;
}

const STRONG_LABELS: Record<keyof RubricScores, string> = {
  demand: "Growing/strong demand signal",
  trend: "Positive trend momentum",
  margin: "Strong margin",
  competition: "Weak or thin competition",
  brandability: "Strong brandability, not a generic listing",
  marketingAngles: "Multiple distinct marketing angles",
  supplierQuality: "Reliable, well-rated supplier",
  shipping: "Fast shipping",
  operationalEase: "Easy to operate (light, low MOQ, low returns)",
  risk: "Low compliance/return risk",
};

const WEAK_LABELS: Record<keyof RubricScores, string> = {
  demand: "Weak or unclear demand",
  trend: "Flat or declining trend",
  margin: "Thin margin",
  competition: "Crowded or strong competition",
  brandability: "Generic, low brandability — looks like a plain AliExpress product",
  marketingAngles: "Few differentiated marketing angles",
  supplierQuality: "Weak supplier options",
  shipping: "Slow shipping",
  operationalEase: "Operationally harder (heavy, high MOQ, or high return risk)",
  risk: "Elevated compliance or return risk",
};

export function buildRubricHighlights(scores: RubricScores): { strong: string[]; weak: string[] } {
  const strong: string[] = [];
  const weak: string[] = [];
  for (const dim of RUBRIC_DIMENSIONS) {
    if (scores[dim] >= 7) strong.push(STRONG_LABELS[dim]);
    else if (scores[dim] <= 4) weak.push(WEAK_LABELS[dim]);
  }
  return { strong, weak };
}

export interface JudgeResult {
  scores: RubricScores;
  moneyScore: number;
  verdict: Verdict;
  why: string[];
  concerns: string[];
  nextStep: string;
  weightsUsed: ScoringWeights;
  modelTier: import("@prisma/client").ModelTier;
  costEur: number;
}

export async function runJudgeAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
  inputs: JudgeInputs,
  weights: ScoringWeights,
): Promise<JudgeResult> {
  const scores = computeRubricScores(bundle, inputs);
  const moneyScore = computeMoneyScore(scores, weights);
  const verdict = verdictForScore(moneyScore, weights);
  const { strong, weak } = buildRubricHighlights(scores);
  const weakWithSkeptic = [...weak, ...inputs.skeptic.objections.slice(0, 2)];

  const { findings: narrative, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.JUDGE,
    taskType: TaskType.JUDGE,
    productId: bundle.id,
    systemPrompt:
      "You are the Judge Agent for MoneyScouter, the final synthesis step. The numeric Money Score " +
      "is already computed transparently from a weighted rubric — do not invent a different score. " +
      "Write a short WHY (bullet reasons the score is what it is), CONCERNS (bullet risks, including " +
      "the Skeptic's objections where relevant) and a concrete NEXT STEP. Respond with strict JSON only.",
    userPromptSummary: `Product "${bundle.title}". Money Score: ${moneyScore}/100 (${verdict}). Skeptic's strongest objection: "${inputs.skeptic.strongestObjection}"`,
    mockContext: {
      title: bundle.title,
      category: bundle.category,
      highRiskCategory: false,
      moneyScore,
      strongPoints: strong,
      weakPoints: weakWithSkeptic,
    },
    schema: judgeNarrativeSchema,
  });

  return {
    scores,
    moneyScore,
    verdict,
    why: narrative.why,
    concerns: narrative.concerns,
    nextStep: narrative.nextStep,
    weightsUsed: weights,
    modelTier,
    costEur,
  };
}
