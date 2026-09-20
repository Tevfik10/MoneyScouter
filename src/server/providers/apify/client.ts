import {
  ApifyError,
  ApifyRunActorOptions,
  ApifyRunAndFetchResult,
  ApifyRunInfo,
  APIFY_TERMINAL_STATUSES,
  ApifyTimeoutError,
} from "@/server/providers/apify/types";

const DEFAULT_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_HTTP_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "owner/actor-name" (readable, used in our config) -> "owner~actor-name" (Apify's URL form). */
function encodeActorId(actorId: string): string {
  return actorId.includes("/") ? actorId.replace("/", "~") : actorId;
}

function toRunInfo(actorId: string, data: Record<string, unknown>): ApifyRunInfo {
  return {
    runId: String(data.id),
    actorId,
    status: String(data.status),
    defaultDatasetId: (data.defaultDatasetId as string | undefined) ?? null,
    usageTotalUsd: typeof data.usageTotalUsd === "number" ? data.usageTotalUsd : null,
    startedAt: String(data.startedAt ?? new Date().toISOString()),
    finishedAt: (data.finishedAt as string | undefined) ?? null,
  };
}

/**
 * Thin, generic wrapper over the Apify REST API. Works with any Actor —
 * the actor-specific adapters (AliExpress, Google Shopping, ...) build on
 * top of this, never call `fetch` directly. Server-only: the token is read
 * from an env var the client is constructed with, never sent to the
 * browser, never logged.
 */
export class ApifyClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {
    if (!token) {
      throw new ApifyError("Apify token is empty — refusing to construct a client.");
    }
  }

  private async request(
    path: string,
    init: RequestInit & { retries?: number } = {},
  ): Promise<Response> {
    const { retries = DEFAULT_MAX_RETRIES, ...fetchInit } = init;
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_HTTP_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          ...fetchInit,
          headers: { Authorization: `Bearer ${this.token}`, ...fetchInit.headers },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.status >= 500 && attempt < retries) {
          lastError = new ApifyError(`Apify API ${res.status} on ${path}`, res.status);
          await sleep(2 ** attempt * 500);
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Never include the token in an error message — headers aren't
          // included in `body`, but be explicit that we never will be.
          throw new ApifyError(`Apify API ${res.status} on ${path}: ${body.slice(0, 500)}`, res.status);
        }
        return res;
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof ApifyError) throw err;
        lastError = err;
        if (attempt < retries) {
          await sleep(2 ** attempt * 500);
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new ApifyError(`Apify request to ${path} failed`);
  }

  async startRun(
    actorId: string,
    input: Record<string, unknown>,
    opts: Pick<ApifyRunActorOptions, "timeoutSecs" | "memoryMbytes"> = {},
  ): Promise<ApifyRunInfo> {
    const params = new URLSearchParams();
    if (opts.timeoutSecs) params.set("timeout", String(opts.timeoutSecs));
    if (opts.memoryMbytes) params.set("memory", String(opts.memoryMbytes));
    const query = params.toString() ? `?${params.toString()}` : "";

    const res = await this.request(`/actors/${encodeActorId(actorId)}/runs${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { data: Record<string, unknown> };
    return toRunInfo(actorId, json.data);
  }

  async getRun(runId: string, actorId = ""): Promise<ApifyRunInfo> {
    const res = await this.request(`/actor-runs/${runId}`);
    const json = (await res.json()) as { data: Record<string, unknown> };
    return toRunInfo(actorId, json.data);
  }

  async waitForRun(
    runId: string,
    opts: Pick<ApifyRunActorOptions, "pollIntervalMs" | "maxWaitMs"> = {},
  ): Promise<ApifyRunInfo> {
    const pollIntervalMs = opts.pollIntervalMs ?? 3000;
    const maxWaitMs = opts.maxWaitMs ?? 120_000;
    const deadline = Date.now() + maxWaitMs;

    for (;;) {
      const info = await this.getRun(runId);
      if (APIFY_TERMINAL_STATUSES.has(info.status)) return info;
      if (Date.now() > deadline) throw new ApifyTimeoutError(runId);
      await sleep(pollIntervalMs);
    }
  }

  async getDatasetItems<T>(datasetId: string, maxItems?: number): Promise<T[]> {
    const pageSize = 500;
    const items: T[] = [];
    let offset = 0;

    for (;;) {
      const limit = maxItems ? Math.min(pageSize, maxItems - items.length) : pageSize;
      if (limit <= 0) break;
      const res = await this.request(`/datasets/${datasetId}/items?offset=${offset}&limit=${limit}&clean=true`);
      const page = (await res.json()) as T[];
      items.push(...page);
      if (page.length < limit) break; // last page
      offset += page.length;
      if (maxItems && items.length >= maxItems) break;
    }
    return items;
  }

  /** Start a run, poll it to completion, and fetch its dataset items — the
   * shape most adapters actually want. */
  async runActorAndGetItems<T>(
    actorId: string,
    input: Record<string, unknown>,
    opts: ApifyRunActorOptions = {},
  ): Promise<ApifyRunAndFetchResult<T>> {
    const started = await this.startRun(actorId, input, opts);
    const finished = await this.waitForRun(started.runId, opts).catch((err) => {
      if (err instanceof ApifyTimeoutError) {
        // Return what we know so far rather than throwing — the caller can
        // decide whether a still-running/unknown-status run is usable.
        return { ...started, status: "TIMED-OUT" } satisfies ApifyRunInfo;
      }
      throw err;
    });
    const finishedWithActor = { ...finished, actorId };

    if (finished.status !== "SUCCEEDED" || !finished.defaultDatasetId) {
      return { items: [], run: finishedWithActor };
    }

    const items = await this.getDatasetItems<T>(finished.defaultDatasetId, opts.maxItems);
    return { items, run: finishedWithActor };
  }
}

let cachedClient: ApifyClient | null = null;

/** Lazily constructs a singleton client from APIFY_API_TOKEN. Throws with a
 * clear message if the token isn't configured, rather than silently no-op'ing. */
export function getApifyClient(): ApifyClient {
  if (cachedClient) return cachedClient;
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new ApifyError(
      "APIFY_API_TOKEN is not set. Real discovery/enrichment requires it — configure it as a server-side environment variable.",
    );
  }
  cachedClient = new ApifyClient(token);
  return cachedClient;
}
