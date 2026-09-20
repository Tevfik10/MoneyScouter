import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyError, ApifyTimeoutError } from "@/server/providers/apify/types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ApifyClient", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("refuses to construct without a token", () => {
    expect(() => new ApifyClient("")).toThrow(ApifyError);
  });

  it("startRun posts to the actor's runs endpoint with the tilde-encoded actor id", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { id: "run_1", status: "READY", defaultDatasetId: "ds_1", startedAt: "2026-01-01T00:00:00Z" } }),
    );

    const client = new ApifyClient("test-token");
    const run = await client.startRun("crawlerbros/aliexpress-scraper", { searchQuery: "backpack" });

    expect(run.runId).toBe("run_1");
    expect(run.status).toBe("READY");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/actors/crawlerbros~aliexpress-scraper/runs");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("waitForRun polls until a terminal status is reached", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run_1", status: "RUNNING", startedAt: "t" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run_1", status: "RUNNING", startedAt: "t" } }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { id: "run_1", status: "SUCCEEDED", defaultDatasetId: "ds_1", startedAt: "t", finishedAt: "t2", usageTotalUsd: 0.03 } }),
      );

    const client = new ApifyClient("test-token");
    const info = await client.waitForRun("run_1", { pollIntervalMs: 1 });

    expect(info.status).toBe("SUCCEEDED");
    expect(info.usageTotalUsd).toBe(0.03);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("waitForRun throws ApifyTimeoutError if the run never reaches a terminal status in time", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async () =>
      jsonResponse({ data: { id: "run_1", status: "RUNNING", startedAt: "t" } }),
    );

    const client = new ApifyClient("test-token");
    await expect(client.waitForRun("run_1", { pollIntervalMs: 1, maxWaitMs: 5 })).rejects.toBeInstanceOf(
      ApifyTimeoutError,
    );
  });

  it("getDatasetItems paginates until a short page signals the end", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const page2 = [{ id: 500 }, { id: 501 }];
    fetchMock.mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));

    const client = new ApifyClient("test-token");
    const items = await client.getDatasetItems("ds_1");

    expect(items).toHaveLength(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("getDatasetItems stops early once maxItems is reached", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const page = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    fetchMock.mockResolvedValueOnce(jsonResponse(page));

    const client = new ApifyClient("test-token");
    const items = await client.getDatasetItems("ds_1", 50);

    expect(items).toHaveLength(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx and eventually throws ApifyError after exhausting retries", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async () => new Response("server error", { status: 500 }));

    const client = new ApifyClient("test-token");
    await expect(client.getRun("run_1")).rejects.toBeInstanceOf(ApifyError);
    // 1 initial + 3 retries = 4 calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry on a 4xx client error", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response("bad token", { status: 401 }));

    const client = new ApifyClient("test-token");
    await expect(client.getRun("run_1")).rejects.toBeInstanceOf(ApifyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("runActorAndGetItems returns empty items (not an error) when the run fails", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run_1", status: "RUNNING", startedAt: "t" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run_1", status: "FAILED", startedAt: "t", finishedAt: "t2" } }));

    const client = new ApifyClient("test-token");
    const result = await client.runActorAndGetItems("crawlerbros/aliexpress-scraper", {}, { pollIntervalMs: 1 });

    expect(result.items).toEqual([]);
    expect(result.run.status).toBe("FAILED");
  });
});
