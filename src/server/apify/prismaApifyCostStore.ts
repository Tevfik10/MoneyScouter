import { prisma } from "@/server/db";
import { ApifyCallRecord, ApifyCostStore } from "@/server/apify/costController";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class PrismaApifyCostStore implements ApifyCostStore {
  async getSpentTodayUsd(): Promise<number> {
    const result = await prisma.apifyCall.aggregate({
      where: { startedAt: { gte: startOfTodayUtc() } },
      _sum: { actualCostUsd: true },
    });
    return Number(result._sum.actualCostUsd ?? 0);
  }

  async recordCall(entry: ApifyCallRecord): Promise<void> {
    await prisma.apifyCall.create({
      data: {
        researchRunId: entry.researchRunId,
        actorId: entry.actorId,
        provider: entry.provider,
        purpose: entry.purpose,
        keyword: entry.keyword,
        requestedLimit: entry.requestedLimit,
        apifyRunId: entry.apifyRunId,
        datasetId: entry.datasetId,
        status: entry.status,
        itemCount: entry.itemCount,
        estimatedCostUsd: entry.estimatedCostUsd,
        actualCostUsd: entry.actualCostUsd,
        durationMs: entry.durationMs,
        errorMessage: entry.errorMessage,
      },
    });
    if (entry.researchRunId) {
      await prisma.researchRun.update({
        where: { id: entry.researchRunId },
        data: { apifySpendUsd: { increment: entry.actualCostUsd } },
      });
    }
  }
}
