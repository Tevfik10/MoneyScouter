import { describe, expect, it } from "vitest";
import { ApifyBudgetExceededError, ApifyCostController, ApifyCostStore, ApifyCallRecord } from "@/server/apify/costController";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { CrawlerbrosAliExpressProvider } from "@/server/providers/apify/aliexpress/crawlerbros/provider";

class FakeStore implements ApifyCostStore {
  calls: ApifyCallRecord[] = [];
  constructor(private spentTodayUsd = 0) {}
  async getSpentTodayUsd() {
    return this.spentTodayUsd;
  }
  async recordCall(entry: ApifyCallRecord) {
    this.calls.push(entry);
    this.spentTodayUsd += entry.actualCostUsd;
  }
}

/** Every call after `failAfter` successful ones throws budget-exceeded —
 * simulates a same-day cumulative budget running out mid-loop. */
class BudgetExhaustingClient implements Pick<ApifyClient, "runActorAndGetItems"> {
  calls = 0;
  constructor(
    private failAfter: number,
    private itemsPerCall: unknown[] = [{ productId: 1, title: "Item", salePrice: { amount: 5 } }],
  ) {}
  async runActorAndGetItems<T>(actorId: string) {
    this.calls++;
    if (this.calls > this.failAfter) {
      throw new ApifyBudgetExceededError(999, 0.5);
    }
    const run: ApifyRunInfo = {
      runId: `run_${this.calls}`,
      actorId,
      status: "SUCCEEDED",
      defaultDatasetId: `ds_${this.calls}`,
      usageTotalUsd: 0.05,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    return { items: this.itemsPerCall as T[], run };
  }
}

describe("CrawlerbrosAliExpressProvider", () => {
  it("makes one Actor run per keyword (no batching)", async () => {
    const client = new BudgetExhaustingClient(10);
    const controller = new ApifyCostController(new FakeStore(), client, { hardLimitUsd: 2 });
    const provider = new CrawlerbrosAliExpressProvider();

    const result = await provider.search(
      {
        keywords: [
          { keyword: "backpack", category: "travel" },
          { keyword: "yoga mat", category: "fitness" },
        ],
        maxItemsTotal: 20,
      },
      { costController: controller },
    );

    expect(client.calls).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.budgetStopped).toBe(false);
  });

  it("never discards items already fetched when the budget runs out mid-loop", async () => {
    // First keyword succeeds, second throws budget-exceeded.
    const client = new BudgetExhaustingClient(1);
    const controller = new ApifyCostController(new FakeStore(), client, { hardLimitUsd: 2 });
    const provider = new CrawlerbrosAliExpressProvider();

    const result = await provider.search(
      {
        keywords: [
          { keyword: "backpack", category: "travel" },
          { keyword: "yoga mat", category: "fitness" },
          { keyword: "phone case", category: "gadgets" },
        ],
        maxItemsTotal: 30,
      },
      { costController: controller },
    );

    // search() must never throw for a budget stop — the caller (and every
    // item already paid for) must get a normal result back.
    expect(result.budgetStopped).toBe(true);
    expect(result.stopReason).toBeDefined();
    expect(result.items).toHaveLength(1); // from the one successful keyword
    expect(result.keywordUsage.find((k) => k.keyword === "backpack")?.itemsReturned).toBe(1);
  });
});
