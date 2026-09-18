import { prisma } from "@/server/db";
import { AiCallRecord, CostStore } from "@/server/ai/types";

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class PrismaCostStore implements CostStore {
  async getSpentTodayEur(): Promise<number> {
    const result = await prisma.aiCall.aggregate({
      where: { createdAt: { gte: startOfTodayUtc() } },
      _sum: { estimatedCostEur: true },
    });
    return Number(result._sum.estimatedCostEur ?? 0);
  }

  async recordCall(entry: AiCallRecord): Promise<void> {
    await prisma.aiCall.create({
      data: {
        researchRunId: entry.researchRunId,
        productId: entry.productId,
        agentType: entry.agentType,
        provider: entry.provider,
        model: entry.model,
        tier: entry.tier,
        taskType: entry.taskType,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        estimatedCostEur: entry.estimatedCostEur,
        promptVersionId: entry.promptVersionId,
      },
    });
    if (entry.researchRunId) {
      await prisma.researchRun.update({
        where: { id: entry.researchRunId },
        data: { spendEur: { increment: entry.estimatedCostEur } },
      });
    }
  }
}
