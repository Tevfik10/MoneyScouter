import { AgentType, ModelTier } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApifyBudgetExceededError, ApifyCostController } from "@/server/apify/costController";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { runMarginAgent } from "@/server/pipeline/agents/margin";
import { runSupplierAgent } from "@/server/pipeline/agents/supplier";
import { computeTrendScore } from "@/server/pipeline/agentsDeterministic/trend";
import { computeCompetitorFindings } from "@/server/pipeline/agentsDeterministic/competitor";
import { computeDeterministicRisk } from "@/server/pipeline/agentsDeterministic/risk";
import { DeterministicJudgeResult, runDeterministicJudge } from "@/server/pipeline/agentsDeterministic/judge";
import { googleShoppingApifyProvider } from "@/server/providers/apify/googleShopping/provider";
import { ComplianceRiskLevel } from "@/server/pipeline/filter";
import { DeterministicScoringWeights, FilterThresholds } from "@/server/settings";

export interface DeterministicResearchResult {
  judge: DeterministicJudgeResult;
  /** True if Google Shopping enrichment was skipped/failed because the
   * Apify budget was exhausted — lets the caller stop even attempting it
   * for the remaining shortlist instead of retrying a call guaranteed to
   * be blocked again (the budget check is a same-day total, not per-run). */
  marketEnrichmentSkippedForBudget: boolean;
}

async function persistAgentResult(
  researchRunId: string,
  productId: string,
  agentType: AgentType,
  output: { summary: string; findings: unknown },
) {
  // modelTier is a nominal CHEAP placeholder here — these agents spend no
  // AI tokens at all (Competitor's real cost is an Apify call, tracked
  // separately via ApifyCall, not this field).
  await prisma.agentResult.upsert({
    where: { researchRunId_productId_agentType: { researchRunId, productId, agentType } },
    create: {
      researchRunId,
      productId,
      agentType,
      summary: output.summary,
      findings: output.findings as object,
      modelTier: ModelTier.CHEAP,
      finishedAt: new Date(),
    },
    update: {
      summary: output.summary,
      findings: output.findings as object,
      modelTier: ModelTier.CHEAP,
      finishedAt: new Date(),
    },
  });
}

async function persistCompetitorSightings(
  researchRunId: string,
  productId: string,
  matches: ReturnType<typeof computeCompetitorFindings>["matches"],
) {
  for (const m of matches) {
    if (!m.listing.merchant) continue;
    const existing = await prisma.competitor.findFirst({ where: { name: m.listing.merchant, domain: m.listing.merchantDomain ?? null } });
    const competitor =
      existing ?? (await prisma.competitor.create({ data: { name: m.listing.merchant, domain: m.listing.merchantDomain } }));
    await prisma.competitorSighting.create({
      data: {
        competitorId: competitor.id,
        productId,
        researchRunId,
        price: m.listing.priceValue,
        positioning: m.listing.deliveryText ?? undefined,
        url: m.listing.url,
        matchConfidence: m.matchConfidence,
      },
    });
  }
}

const GOOGLE_SHOPPING_RESULTS_PER_PRODUCT = 10;

/**
 * Deterministic equivalent of research.ts for the Apify pipeline: runs
 * Supplier/Margin (already zero-AI, reused as-is) + Google-Shopping-backed
 * Competitor + real-signal Trend + rule-based Risk + rule-based Judge for
 * one shortlisted product. No LLM call anywhere in this function.
 */
export async function runDeterministicResearch(
  bundle: ProductBundle,
  productSourceId: string,
  researchRunId: string,
  apifyCostController: ApifyCostController,
  complianceRisk: ComplianceRiskLevel,
  weights: DeterministicScoringWeights,
  filterThresholds: FilterThresholds,
  skipMarketEnrichment = false,
): Promise<DeterministicResearchResult> {
  const marginRes = runMarginAgent(bundle);
  const supplierRes = runSupplierAgent(bundle);
  await persistAgentResult(researchRunId, bundle.id, AgentType.MARGIN, marginRes);
  await persistAgentResult(researchRunId, bundle.id, AgentType.SUPPLIER, supplierRes);

  const [product, priceHistory, priorEnrichmentRuns] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: bundle.id }, select: { timesSeen: true } }),
    prisma.priceHistory.findMany({
      where: { productSourceId },
      orderBy: { observedAt: "asc" },
      select: { price: true },
    }),
    prisma.competitorSighting.findMany({
      where: { productId: bundle.id },
      distinct: ["researchRunId"],
      select: { researchRunId: true },
    }),
  ]);

  let googleShoppingListings: Awaited<ReturnType<typeof googleShoppingApifyProvider.search>>["listings"] = [];
  let marketEnrichmentSkippedForBudget = skipMarketEnrichment;
  if (!skipMarketEnrichment) {
    try {
      const result = await googleShoppingApifyProvider.search(
        { query: bundle.title, maxResults: GOOGLE_SHOPPING_RESULTS_PER_PRODUCT },
        { researchRunId, costController: apifyCostController },
      );
      googleShoppingListings = result.listings;
    } catch (err) {
      // Budget exhaustion or an Actor failure shouldn't take down the whole
      // product — Competitor just falls back to "no market data" honestly.
      console.error(`[runDeterministicResearch] Google Shopping enrichment failed for "${bundle.title}":`, err);
      if (err instanceof ApifyBudgetExceededError) marketEnrichmentSkippedForBudget = true;
    }
  }

  const competitorRes = computeCompetitorFindings(bundle.title, googleShoppingListings);
  await persistAgentResult(researchRunId, bundle.id, AgentType.COMPETITOR, {
    summary: competitorRes.summary,
    findings: competitorRes,
  });
  await persistCompetitorSightings(researchRunId, bundle.id, competitorRes.matches);

  const trendRes = computeTrendScore({
    timesSeen: product.timesSeen,
    priceHistory: priceHistory.map((p) => ({ price: Number(p.price) })),
    orderCount: bundle.bestSource.orderCount,
    distinctEnrichmentRuns: priorEnrichmentRuns.length,
  });
  await persistAgentResult(researchRunId, bundle.id, AgentType.TREND, { summary: trendRes.summary, findings: trendRes });

  const riskRes = computeDeterministicRisk(
    bundle.category,
    bundle.bestSource.rating,
    bundle.bestSource.priceEur,
    filterThresholds,
  );
  await persistAgentResult(researchRunId, bundle.id, AgentType.RISK, { summary: riskRes.summary, findings: riskRes });

  const judge = runDeterministicJudge(
    bundle,
    { margin: marginRes.findings, supplier: supplierRes.findings, competitor: competitorRes, trend: trendRes, risk: riskRes },
    weights,
  );
  await persistAgentResult(researchRunId, bundle.id, AgentType.JUDGE, {
    summary: judge.why.join("; "),
    findings: { why: judge.why, concerns: judge.concerns, nextStep: judge.nextStep },
  });

  await prisma.score.upsert({
    where: { researchRunId_productId: { researchRunId, productId: bundle.id } },
    create: {
      researchRunId,
      productId: bundle.id,
      demand: judge.scores.demand,
      trend: judge.scores.trend,
      margin: judge.scores.margin,
      competition: judge.scores.competition,
      brandability: null,
      marketingAngles: null,
      supplierQuality: judge.scores.supplierQuality,
      shipping: judge.scores.shipping,
      operationalEase: judge.scores.operationalRisk,
      risk: complianceRisk === "HIGH" ? 2 : complianceRisk === "MEDIUM" ? 5 : 9,
      marketPriceOpportunity: judge.scores.marketPriceOpportunity,
      moneyScore: judge.moneyScore,
      verdict: judge.verdict,
      why: judge.why,
      concerns: judge.concerns,
      nextStep: judge.nextStep,
      weightsUsed: judge.weightsUsed as object,
    },
    update: {
      demand: judge.scores.demand,
      trend: judge.scores.trend,
      margin: judge.scores.margin,
      competition: judge.scores.competition,
      supplierQuality: judge.scores.supplierQuality,
      shipping: judge.scores.shipping,
      operationalEase: judge.scores.operationalRisk,
      risk: complianceRisk === "HIGH" ? 2 : complianceRisk === "MEDIUM" ? 5 : 9,
      marketPriceOpportunity: judge.scores.marketPriceOpportunity,
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
    },
  });

  return { judge, marketEnrichmentSkippedForBudget };
}
