// Generic Apify data layer — see docs/ARCHITECTURE_V1_1.md section 2.
// Server-only: nothing here may ever be imported from a Client Component.

export const APIFY_TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED",
]);

export interface ApifyRunInfo {
  runId: string;
  actorId: string;
  status: string; // "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED"
  defaultDatasetId: string | null;
  usageTotalUsd: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ApifyRunActorOptions {
  timeoutSecs?: number;
  memoryMbytes?: number;
  /** Hard cap on how many dataset items we'll ever pull back for this run. */
  maxItems?: number;
  /** How long to keep polling for the run to finish before giving up. */
  maxWaitMs?: number;
  pollIntervalMs?: number;
}

export interface ApifyRunAndFetchResult<T> {
  items: T[];
  run: ApifyRunInfo;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

export class ApifyTimeoutError extends Error {
  constructor(public readonly runId: string) {
    super(`Apify run ${runId} did not reach a terminal status within the configured wait time`);
    this.name = "ApifyTimeoutError";
  }
}
