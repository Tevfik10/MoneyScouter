import { prisma } from "@/server/db";

export async function getCostOverview() {
  const [byTier, byAgent, byRun] = await Promise.all([
    prisma.aiCall.groupBy({ by: ["tier"], _sum: { estimatedCostEur: true }, _count: { _all: true } }),
    prisma.aiCall.groupBy({
      by: ["agentType"],
      _sum: { estimatedCostEur: true },
      _count: { _all: true },
      where: { agentType: { not: null } },
    }),
    prisma.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        startedAt: true,
        status: true,
        mode: true,
        spendEur: true,
        apifySpendUsd: true,
        deepResearchedCount: true,
        highPotentialCount: true,
      },
    }),
  ]);

  const totalSpend = byTier.reduce((sum, t) => sum + Number(t._sum.estimatedCostEur ?? 0), 0);
  const totalCalls = byTier.reduce((sum, t) => sum + t._count._all, 0);

  const totalShortlisted = byRun.reduce((sum, r) => sum + r.deepResearchedCount, 0);
  const totalHighPotential = byRun.reduce((sum, r) => sum + r.highPotentialCount, 0);
  const totalRunSpend = byRun.reduce((sum, r) => sum + Number(r.spendEur), 0);

  return {
    byTier,
    byAgent,
    byRun,
    totalSpend,
    totalCalls,
    costPerShortlisted: totalShortlisted > 0 ? totalRunSpend / totalShortlisted : 0,
    costPerHighPotential: totalHighPotential > 0 ? totalRunSpend / totalHighPotential : 0,
  };
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getApifyCostOverview() {
  const [byPurpose, spentToday, byActor] = await Promise.all([
    prisma.apifyCall.groupBy({ by: ["purpose"], _sum: { actualCostUsd: true }, _count: { _all: true } }),
    prisma.apifyCall.aggregate({
      where: { startedAt: { gte: startOfTodayUtc() } },
      _sum: { actualCostUsd: true },
    }),
    prisma.apifyCall.groupBy({ by: ["actorId"], _sum: { actualCostUsd: true }, _count: { _all: true } }),
  ]);

  const totalSpendUsd = byPurpose.reduce((sum, p) => sum + Number(p._sum.actualCostUsd ?? 0), 0);
  const totalCalls = byPurpose.reduce((sum, p) => sum + p._count._all, 0);

  return {
    byPurpose,
    byActor,
    spentTodayUsd: Number(spentToday._sum.actualCostUsd ?? 0),
    totalSpendUsd,
    totalCalls,
  };
}
