import { AgentResultStatus, AgentType } from "@prisma/client";
import { prisma } from "@/server/db";

/**
 * Records real status/timing/cost for a batch-level "code agent" (Scout,
 * Dedup, Filter — operate on the whole run, not one product). See
 * docs/ARCHITECTURE_V1_1.md section 12: "Do NOT fake agent activity."
 */
export async function recordPipelineStage(params: {
  researchRunId: string;
  stage: AgentType;
  startedAt: Date;
  itemsProcessed: number;
  itemsRejected?: number;
  dataSource?: string;
  costUsd?: number;
  errorMessage?: string;
}): Promise<void> {
  const status: AgentResultStatus = params.errorMessage ? AgentResultStatus.FAILED : AgentResultStatus.COMPLETED;
  await prisma.pipelineStageRun.upsert({
    where: { researchRunId_stage: { researchRunId: params.researchRunId, stage: params.stage } },
    create: {
      researchRunId: params.researchRunId,
      stage: params.stage,
      status,
      dataSource: params.dataSource,
      itemsProcessed: params.itemsProcessed,
      itemsRejected: params.itemsRejected ?? 0,
      costUsd: params.costUsd,
      errorMessage: params.errorMessage,
      startedAt: params.startedAt,
      finishedAt: new Date(),
    },
    update: {
      status,
      dataSource: params.dataSource,
      itemsProcessed: params.itemsProcessed,
      itemsRejected: params.itemsRejected ?? 0,
      costUsd: params.costUsd,
      errorMessage: params.errorMessage,
      finishedAt: new Date(),
    },
  });
}
