import { describe, expect, it } from "vitest";
import { ApifyBudgetExceededError, ApifyCostController, ApifyCostStore, ApifyCallRecord } from "@/server/apify/costController";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { TortugaAliExpressProvider } from "@/server/providers/apify/aliexpress/tortuga/provider";

class FakeStore implements ApifyCostStore {
  calls: ApifyCallRecord[] = [];
  constructor(private spentTodayUsd = 0) {}
  async getSpentTodayUsd() {
    return this.spentTodayUsd;
  }
  async recordCall(entry: ApifyCallRecord) {
    this.calls.push(entry);
  }
}

class RecordingClient implements Pick<ApifyClient, "runActorAndGetItems"> {
  inputs: Record<string, unknown>[] = [];
  constructor(private items: unknown[]) {}
  async runActorAndGetItems<T>(actorId: string, input: Record<string, unknown>) {
    this.inputs.push(input);
    const run: ApifyRunInfo = {
      runId: "run_1",
      actorId,
      status: "SUCCEEDED",
      defaultDatasetId: "ds_1",
      usageTotalUsd: 0.06,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    return { items: this.items as T[], run };
  }
}

class BudgetBlockingClient implements Pick<ApifyClient, "runActorAndGetItems"> {
  async runActorAndGetItems(): Promise<never> {
    throw new ApifyBudgetExceededError(999, 0.5);
  }
}

describe("TortugaAliExpressProvider", () => {
  it("batches all keywords into a single Actor run via searchTerms", async () => {
    const rawItems = [
      { productId: 1, title: "Speaker", price: 10, searchTerm: "bluetooth speaker" },
      { productId: 2, title: "Mat", price: 15, searchTerm: "yoga mat" },
    ];
    const client = new RecordingClient(rawItems);
    const controller = new ApifyCostController(new FakeStore(), client, { hardLimitUsd: 2 });
    const provider = new TortugaAliExpressProvider();

    const result = await provider.search(
      {
        keywords: [
          { keyword: "bluetooth speaker", category: "gadgets" },
          { keyword: "yoga mat", category: "fitness" },
        ],
        maxItemsTotal: 100,
      },
      { costController: controller },
    );

    expect(client.inputs).toHaveLength(1); // exactly one Actor run
    expect(client.inputs[0].searchTerms).toEqual(["bluetooth speaker", "yoga mat"]);
    expect(result.items).toHaveLength(2);
    expect(result.items.find((i) => i.title === "Speaker")?.category).toBe("gadgets");
    expect(result.items.find((i) => i.title === "Mat")?.category).toBe("fitness");
    expect(result.keywordUsage).toEqual(
      expect.arrayContaining([
        { keyword: "bluetooth speaker", itemsReturned: 1 },
        { keyword: "yoga mat", itemsReturned: 1 },
      ]),
    );
  });

  it("returns budgetStopped instead of throwing, with no items to discard", async () => {
    const controller = new ApifyCostController(new FakeStore(), new BudgetBlockingClient(), { hardLimitUsd: 0.01 });
    const provider = new TortugaAliExpressProvider();

    const result = await provider.search(
      { keywords: [{ keyword: "backpack", category: "travel" }], maxItemsTotal: 100 },
      { costController: controller },
    );

    expect(result.budgetStopped).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.stopReason).toBeDefined();
  });
});
