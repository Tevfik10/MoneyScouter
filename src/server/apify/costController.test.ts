import { describe, expect, it } from "vitest";
import { ApifyRunStatus } from "@prisma/client";
import { ApifyBudgetExceededError, ApifyCostController, evaluateApifyBudget } from "@/server/apify/costController";
import { ApifyCallRecord, ApifyCostStore } from "@/server/apify/costController";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyRunInfo } from "@/server/providers/apify/types";

class FakeApifyCostStore implements ApifyCostStore {
  calls: ApifyCallRecord[] = [];
  constructor(private spentTodayUsd: number) {}
  async getSpentTodayUsd() {
    return this.spentTodayUsd;
  }
  async recordCall(entry: ApifyCallRecord) {
    this.calls.push(entry);
    this.spentTodayUsd += entry.actualCostUsd;
  }
}

class FakeApifyClient implements Pick<ApifyClient, "runActorAndGetItems"> {
  calls: Array<{ actorId: string; input: Record<string, unknown> }> = [];
  constructor(private usageTotalUsd: number | null = null) {}
  async runActorAndGetItems<T>(actorId: string, input: Record<string, unknown>) {
    this.calls.push({ actorId, input });
    const run: ApifyRunInfo = {
      runId: `run_${this.calls.length}`,
      actorId,
      status: "SUCCEEDED",
      defaultDatasetId: `dataset_${this.calls.length}`,
      usageTotalUsd: this.usageTotalUsd,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    return { items: [] as T[], run };
  }
}

describe("evaluateApifyBudget (pure)", () => {
  it("allows a call within the hard limit", () => {
    const result = evaluateApifyBudget({ spentTodayUsd: 1.0, estimatedCostUsd: 0.5, hardLimitUsd: 2.0 });
    expect(result.allowed).toBe(true);
  });

  it("blocks a call that would exceed the hard limit", () => {
    const result = evaluateApifyBudget({ spentTodayUsd: 1.9, estimatedCostUsd: 0.5, hardLimitUsd: 2.0 });
    expect(result.allowed).toBe(false);
    expect(result.wouldTotalUsd).toBeCloseTo(2.4, 6);
  });
});

describe("ApifyCostController — hard daily budget enforcement ($2.00 default hard limit)", () => {
  it("blocks the run when today's spend is already at the $2.00 hard limit", async () => {
    const store = new FakeApifyCostStore(2.0);
    const client = new FakeApifyClient();
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 2.0 });

    await expect(
      controller.runActorAndGetItems({
        actorId: "crawlerbros/aliexpress-scraper",
        purpose: "discovery",
        input: {},
        maxItems: 100,
      }),
    ).rejects.toBeInstanceOf(ApifyBudgetExceededError);

    expect(client.calls).toHaveLength(0);
    expect(store.calls).toHaveLength(0);
  });

  it("blocks a run whose worst-case estimate (maxItems x price) would tip spend over the limit", async () => {
    const store = new FakeApifyCostStore(1.99);
    const client = new FakeApifyClient();
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 2.0 });

    // 300 items x $0.003/item = $0.90 estimate, way over the $0.01 headroom.
    await expect(
      controller.runActorAndGetItems({
        actorId: "crawlerbros/aliexpress-scraper",
        purpose: "discovery",
        input: {},
        maxItems: 300,
      }),
    ).rejects.toBeInstanceOf(ApifyBudgetExceededError);
    expect(client.calls).toHaveLength(0);
  });

  it("allows and records a run comfortably within budget, using the run's actual usageTotalUsd", async () => {
    const store = new FakeApifyCostStore(0);
    const client = new FakeApifyClient(0.042); // actor reports its real cost
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 2.0 });

    const result = await controller.runActorAndGetItems({
      actorId: "crawlerbros/aliexpress-scraper",
      purpose: "discovery",
      input: { searchQuery: "travel backpack" },
      maxItems: 100,
    });

    expect(client.calls).toHaveLength(1);
    expect(store.calls).toHaveLength(1);
    expect(result.costUsd).toBe(0.042);
    expect(store.calls[0].actualCostUsd).toBe(0.042);
    expect(store.calls[0].status).toBe(ApifyRunStatus.SUCCEEDED);
  });

  it("falls back to the pre-run estimate when the run doesn't report usageTotalUsd", async () => {
    const store = new FakeApifyCostStore(0);
    const client = new FakeApifyClient(null); // no usage reported
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 2.0 });

    const result = await controller.runActorAndGetItems({
      actorId: "crawlerbros/aliexpress-scraper",
      purpose: "discovery",
      input: {},
      maxItems: 100,
    });

    expect(result.costUsd).toBeCloseTo(0.3, 6); // 100 items * $0.003
  });

  it("never lets cumulative recorded spend exceed the $2.00 hard limit across many calls", async () => {
    const store = new FakeApifyCostStore(0);
    const client = new FakeApifyClient(0.05);
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 2.0 });

    let blocked = 0;
    for (let i = 0; i < 100; i++) {
      try {
        await controller.runActorAndGetItems({
          actorId: "crawlerbros/aliexpress-scraper",
          purpose: "discovery",
          input: {},
          maxItems: 100,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApifyBudgetExceededError);
        blocked++;
      }
    }

    const totalSpent = store.calls.reduce((sum, c) => sum + c.actualCostUsd, 0);
    expect(totalSpent).toBeLessThanOrEqual(2.0 + 1e-9);
    expect(blocked).toBeGreaterThan(0);
  });

  it("respects the tighter TEST_SCOUT cap ($0.50) independent of the account-wide hard limit", async () => {
    const store = new FakeApifyCostStore(0.48);
    const client = new FakeApifyClient(0.05);
    // The orchestrator uses the smaller of the two limits for test-mode runs.
    const controller = new ApifyCostController(store, client, { hardLimitUsd: 0.5 });

    await expect(
      controller.runActorAndGetItems({
        actorId: "crawlerbros/aliexpress-scraper",
        purpose: "discovery",
        input: {},
        maxItems: 100, // $0.30 estimate
      }),
    ).rejects.toBeInstanceOf(ApifyBudgetExceededError);
  });
});
