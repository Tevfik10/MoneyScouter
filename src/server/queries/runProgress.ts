import { prisma } from "@/server/db";

export interface RunProgress {
  status: string;
  scoutDone: boolean;
  dedupDone: boolean;
  filterDone: boolean;
  /** How many products were selected for deep research — only known once
   * the shortlist stage has actually run (real Decision rows), never
   * guessed ahead of time. */
  shortlistTarget: number;
  /** How many of those have a finished Judge verdict so far — a live,
   * DB-truthful count, not a simulated animation. */
  researchedCount: number;
}

/** Read-only progress snapshot for a single run, built entirely from rows
 * the pipeline has already written (PipelineStageRun/Decision/AgentResult).
 * Never infers or fakes a stage as complete. */
export async function getRunProgress(runId: string): Promise<RunProgress | null> {
  const run = await prisma.researchRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!run) return null;

  const [stages, shortlistTarget, researchedCount] = await Promise.all([
    prisma.pipelineStageRun.findMany({ where: { researchRunId: runId }, select: { stage: true } }),
    prisma.decision.count({ where: { researchRunId: runId, stage: "SHORTLIST", verdict: "PASS" } }),
    prisma.agentResult.count({ where: { researchRunId: runId, agentType: "JUDGE" } }),
  ]);
  const stageSet = new Set(stages.map((s) => s.stage));

  return {
    status: run.status,
    scoutDone: stageSet.has("SCOUT"),
    dedupDone: stageSet.has("DEDUP"),
    filterDone: stageSet.has("FILTER"),
    shortlistTarget,
    researchedCount,
  };
}
