import { prisma } from "@/server/db";
import { PrismaCostStore } from "@/server/ai/prismaCostStore";
import { getSetting, SETTINGS } from "@/server/settings";

export async function getLatestRun() {
  return prisma.researchRun.findFirst({ orderBy: { startedAt: "desc" } });
}

export async function getTopOpportunities(runId: string, limit = 5) {
  return prisma.score.findMany({
    where: { researchRunId: runId, verdict: { in: ["HIGH_POTENTIAL", "INTERESTING"] } },
    orderBy: { moneyScore: "desc" },
    take: limit,
    include: {
      product: { include: { sources: { include: { supplier: true } } } },
    },
  });
}

export async function getAngleHook(runId: string, productId: string): Promise<string | null> {
  const result = await prisma.agentResult.findUnique({
    where: { researchRunId_productId_agentType: { researchRunId: runId, productId, agentType: "ANGLE" } },
  });
  if (!result) return null;
  const findings = result.findings as { angles?: { adHook?: string }[] };
  return findings.angles?.[0]?.adHook ?? null;
}

export async function getMarginSnapshot(
  runId: string,
  productId: string,
): Promise<{ sellingPriceEur: number; marginPercent: number } | null> {
  const result = await prisma.agentResult.findUnique({
    where: { researchRunId_productId_agentType: { researchRunId: runId, productId, agentType: "MARGIN" } },
  });
  if (!result) return null;
  const findings = result.findings as {
    sellingPriceEur: number;
    scenarios: { base: { marginPercent: number } };
  };
  return { sellingPriceEur: findings.sellingPriceEur, marginPercent: findings.scenarios.base.marginPercent };
}

export async function getRunVerdictCounts(runId: string) {
  const grouped = await prisma.score.groupBy({
    by: ["verdict"],
    where: { researchRunId: runId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.verdict] = g._count._all;
  return counts;
}

export async function getBudgetSnapshot() {
  const [budget, spentTodayEur] = await Promise.all([
    getSetting(SETTINGS.budget),
    new PrismaCostStore().getSpentTodayEur(),
  ]);
  return { ...budget, spentTodayEur };
}

export async function getMonthSpend(): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const result = await prisma.aiCall.aggregate({
    where: { createdAt: { gte: startOfMonth } },
    _sum: { estimatedCostEur: true },
  });
  return Number(result._sum.estimatedCostEur ?? 0);
}
