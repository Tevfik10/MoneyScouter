import { ApifyRunStatus } from "@prisma/client";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyRunActorOptions, ApifyRunInfo } from "@/server/providers/apify/types";
import { estimateApifyCostUsd } from "@/server/apify/pricing";

// Apify budget is tracked entirely separately from the AI budget
// (src/server/ai/costController.ts) — master spec V1.1 section 13.
// Same pattern deliberately: a pure, unit-testable evaluateBudget function,
// wrapped by a DB-touching controller so every Actor run goes through one
// choke point.

export class ApifyBudgetExceededError extends Error {
  constructor(
    public readonly wouldTotalUsd: number,
    public readonly hardLimitUsd: number,
  ) {
    super(
      `Apify run blocked: spend would reach $${wouldTotalUsd.toFixed(4)}, above the $${hardLimitUsd.toFixed(2)} hard daily Apify budget.`,
    );
    this.name = "ApifyBudgetExceededError";
  }
}

export function evaluateApifyBudget(params: {
  spentTodayUsd: number;
  estimatedCostUsd: number;
  hardLimitUsd: number;
}): { allowed: boolean; wouldTotalUsd: number } {
  const wouldTotalUsd = round(params.spentTodayUsd + params.estimatedCostUsd, 6);
  return { allowed: wouldTotalUsd <= params.hardLimitUsd + 1e-9, wouldTotalUsd };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function mapApifyStatus(status: string): ApifyRunStatus {
  switch (status) {
    case "READY":
      return ApifyRunStatus.READY;
    case "RUNNING":
      return ApifyRunStatus.RUNNING;
    case "SUCCEEDED":
      return ApifyRunStatus.SUCCEEDED;
    case "TIMED-OUT":
      return ApifyRunStatus.TIMED_OUT;
    case "ABORTED":
      return ApifyRunStatus.ABORTED;
    case "FAILED":
    default:
      return ApifyRunStatus.FAILED;
  }
}

export interface ApifyCallRecord {
  researchRunId?: string;
  actorId: string;
  provider?: string;
  purpose: string;
  keyword?: string;
  requestedLimit?: number;
  apifyRunId: string;
  datasetId?: string;
  status: ApifyRunStatus;
  itemCount: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  durationMs?: number;
  errorMessage?: string;
}

export interface ApifyCostStore {
  getSpentTodayUsd(): Promise<number>;
  recordCall(entry: ApifyCallRecord): Promise<void>;
}

export interface ApifyActorCallParams {
  actorId: string;
  /** Adapter id making this call, e.g. "aliexpress-tortuga" — recorded for observability. */
  provider?: string;
  purpose: string;
  /** Search term(s) this call is for, for observability — comma-joined if batched. */
  keyword?: string;
  input: Record<string, unknown>;
  /** Hard cap on items for this call — also what the pre-run cost estimate is based on. */
  maxItems: number;
  researchRunId?: string;
  opts?: Omit<ApifyRunActorOptions, "maxItems">;
}

export interface ApifyActorCallResult<T> {
  items: T[];
  run: ApifyRunInfo;
  costUsd: number;
}

export class ApifyCostController {
  constructor(
    private readonly store: ApifyCostStore,
    private readonly client: Pick<ApifyClient, "runActorAndGetItems">,
    private readonly budget: { hardLimitUsd: number },
  ) {}

  estimate(actorId: string, maxItems: number) {
    return estimateApifyCostUsd(actorId, maxItems);
  }

  async runActorAndGetItems<T>(params: ApifyActorCallParams): Promise<ApifyActorCallResult<T>> {
    const estimatedCostUsd = this.estimate(params.actorId, params.maxItems);
    const spentTodayUsd = await this.store.getSpentTodayUsd();
    const { allowed, wouldTotalUsd } = evaluateApifyBudget({
      spentTodayUsd,
      estimatedCostUsd,
      hardLimitUsd: this.budget.hardLimitUsd,
    });

    if (!allowed) {
      throw new ApifyBudgetExceededError(wouldTotalUsd, this.budget.hardLimitUsd);
    }

    const callStartedAt = Date.now();
    const result = await this.client.runActorAndGetItems<T>(params.actorId, params.input, {
      ...params.opts,
      maxItems: params.maxItems,
    });
    const durationMs = Date.now() - callStartedAt;

    const actualCostUsd = result.run.usageTotalUsd ?? estimatedCostUsd;
    const status = mapApifyStatus(result.run.status);

    await this.store.recordCall({
      researchRunId: params.researchRunId,
      actorId: params.actorId,
      provider: params.provider,
      purpose: params.purpose,
      keyword: params.keyword,
      requestedLimit: params.maxItems,
      apifyRunId: result.run.runId,
      datasetId: result.run.defaultDatasetId ?? undefined,
      status,
      itemCount: result.items.length,
      estimatedCostUsd,
      actualCostUsd,
      durationMs,
      errorMessage:
        status !== ApifyRunStatus.SUCCEEDED ? `Run ended with status ${result.run.status}` : undefined,
    });

    return { items: result.items, run: result.run, costUsd: actualCostUsd };
  }
}
