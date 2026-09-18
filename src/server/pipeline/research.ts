import { AgentType, ModelTier } from "@prisma/client";
import { prisma } from "@/server/db";
import { CostController } from "@/server/ai/costController";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { ComplianceRiskLevel } from "@/server/pipeline/filter";
import { ScoringWeights } from "@/server/settings";
import { runMarketAgent } from "@/server/pipeline/agents/market";
import { runCompetitorAgent } from "@/server/pipeline/agents/competitor";
import { runBrandAgent } from "@/server/pipeline/agents/brand";
import { runRiskAgent } from "@/server/pipeline/agents/risk";
import { runAngleAgent, ANGLE_MIN_BRANDABILITY_SCORE } from "@/server/pipeline/agents/angle";
import { runSkepticAgent } from "@/server/pipeline/agents/skeptic";
import { runMarginAgent } from "@/server/pipeline/agents/margin";
import { runSupplierAgent } from "@/server/pipeline/agents/supplier";
import { JudgeInputs, JudgeResult, runJudgeAgent } from "@/server/pipeline/agents/judge";

export interface DeepResearchResult {
  judge: JudgeResult;
}

async function persistAgentResult(
  researchRunId: string,
  productId: string,
  agentType: AgentType,
  output: { summary: string; findings: unknown; modelTier: ModelTier },
) {
  await prisma.agentResult.upsert({
    where: { researchRunId_productId_agentType: { researchRunId, productId, agentType } },
    create: {
      researchRunId,
      productId,
      agentType,
      summary: output.summary,
      findings: output.findings as object,
      modelTier: output.modelTier,
      finishedAt: new Date(),
    },
    update: {
      summary: output.summary,
      findings: output.findings as object,
      modelTier: output.modelTier,
      finishedAt: new Date(),
    },
  });
}

/**
 * Persists the Competitor Agent's findings into the Competitor /
 * CompetitorSighting tables so the Competitors screen shows real,
 * queryable data instead of staying permanently empty in V1.
 */
async function persistCompetitorSightings(
  researchRunId: string,
  productId: string,
  competitors: { name: string; priceEur: number; positioning: string }[],
) {
  for (const c of competitors) {
    const existing = await prisma.competitor.findFirst({ where: { name: c.name, domain: null } });
    const competitor = existing ?? (await prisma.competitor.create({ data: { name: c.name } }));
    await prisma.competitorSighting.create({
      data: {
        competitorId: competitor.id,
        productId,
        researchRunId,
        price: c.priceEur,
        positioning: c.positioning,
      },
    });
  }
}

/**
 * Runs the full specialist-agent suite + Skeptic + Judge for one
 * shortlisted product and persists every AgentResult + the final Score.
 * Every agent call goes through the shared CostController, so a
 * BudgetExceededError thrown mid-way propagates straight up to the
 * orchestrator, which stops taking on new products for this run.
 */
export async function runDeepResearch(
  bundle: ProductBundle,
  researchRunId: string,
  costController: CostController,
  complianceRisk: ComplianceRiskLevel,
  scoringWeights: ScoringWeights,
): Promise<DeepResearchResult> {
  const ctx = { researchRunId, costController };

  // Deterministic agents first — free, and Margin's selling-price/margin
  // numbers feed the Judge rubric regardless of what else happens.
  const marginRes = runMarginAgent(bundle);
  const supplierRes = runSupplierAgent(bundle);
  await persistAgentResult(researchRunId, bundle.id, AgentType.MARGIN, { ...marginRes, modelTier: ModelTier.CHEAP });
  await persistAgentResult(researchRunId, bundle.id, AgentType.SUPPLIER, { ...supplierRes, modelTier: ModelTier.CHEAP });

  const [marketRes, competitorRes, brandRes, riskRes] = await Promise.all([
    runMarketAgent(bundle, ctx),
    runCompetitorAgent(bundle, ctx),
    runBrandAgent(bundle, ctx),
    runRiskAgent(bundle, ctx, complianceRisk),
  ]);
  await persistAgentResult(researchRunId, bundle.id, AgentType.MARKET, marketRes);
  await persistAgentResult(researchRunId, bundle.id, AgentType.COMPETITOR, competitorRes);
  await persistAgentResult(researchRunId, bundle.id, AgentType.BRAND, brandRes);
  await persistAgentResult(researchRunId, bundle.id, AgentType.RISK, riskRes);
  await persistCompetitorSightings(researchRunId, bundle.id, competitorRes.findings.competitors);

  const angleRes =
    brandRes.findings.brandabilityScore >= ANGLE_MIN_BRANDABILITY_SCORE
      ? await runAngleAgent(bundle, ctx, marketRes.findings.targetSegments)
      : null;
  if (angleRes) {
    await persistAgentResult(researchRunId, bundle.id, AgentType.ANGLE, angleRes);
  }

  const bullCaseSummary = [marketRes.summary, competitorRes.summary, brandRes.summary, angleRes?.summary]
    .filter(Boolean)
    .join(" ");
  const skepticRes = await runSkepticAgent(bundle, ctx, bullCaseSummary);
  await persistAgentResult(researchRunId, bundle.id, AgentType.SKEPTIC, skepticRes);

  const judgeInputs: JudgeInputs = {
    market: marketRes.findings,
    competitor: competitorRes.findings,
    supplier: supplierRes.findings,
    margin: marginRes.findings,
    brand: brandRes.findings,
    angle: angleRes?.findings ?? null,
    risk: riskRes.findings,
    skeptic: skepticRes.findings,
  };
  const judge = await runJudgeAgent(bundle, ctx, judgeInputs, scoringWeights);
  await persistAgentResult(researchRunId, bundle.id, AgentType.JUDGE, {
    summary: judge.why.join(" "),
    findings: { why: judge.why, concerns: judge.concerns, nextStep: judge.nextStep },
    modelTier: judge.modelTier,
  });

  await prisma.score.upsert({
    where: { researchRunId_productId: { researchRunId, productId: bundle.id } },
    create: {
      researchRunId,
      productId: bundle.id,
      ...judge.scores,
      moneyScore: judge.moneyScore,
      verdict: judge.verdict,
      why: judge.why,
      concerns: judge.concerns,
      nextStep: judge.nextStep,
      weightsUsed: judge.weightsUsed as object,
    },
    update: {
      ...judge.scores,
      moneyScore: judge.moneyScore,
      verdict: judge.verdict,
      why: judge.why,
      concerns: judge.concerns,
      nextStep: judge.nextStep,
      weightsUsed: judge.weightsUsed as object,
    },
  });

  await prisma.decision.create({
    data: {
      researchRunId,
      productId: bundle.id,
      stage: "JUDGE",
      verdict: judge.verdict,
      reasons: judge.why,
      agentType: AgentType.JUDGE,
      modelTier: judge.modelTier,
    },
  });

  return { judge };
}
