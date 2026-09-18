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
        spendEur: true,
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
