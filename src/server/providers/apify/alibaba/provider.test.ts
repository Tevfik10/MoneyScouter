import { describe, expect, it } from "vitest";
import { ApifyBudgetExceededError, ApifyCostController, ApifyCostStore, ApifyCallRecord } from "@/server/apify/costController";
import { ApifyClient } from "@/server/providers/apify/client";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { AlibabaApifyProvider } from "@/server/providers/apify/alibaba/provider";

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
      usageTotalUsd: 0.02,
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

describe("AlibabaApifyProvider", () => {
  it("batches all keywords into a single Actor run via queries, tagging discoveryTheme/discoveryKeyword", async () => {
    const rawItems = [
      { productId: 1, title: "Compression Backpack", price: 12, query: "compression travel bag" },
      { productId: 2, title: "Storage Organizer", price: 8, query: "collapsible storage organizer" },
    ];
    const client = new RecordingClient(rawItems);
    const controller = new ApifyCostController(new FakeStore(), client, { hardLimitUsd: 2 });
    const provider = new AlibabaApifyProvider();

    const result = await provider.search(
      {
        keywords: [
          { keyword: "compression travel bag", theme: "travel", category: "travel" },
          { keyword: "collapsible storage organizer", theme: "home-organization", category: "home-organization" },
        ],
        maxItemsTotal: 100,
      },
      { costController: controller },
    );

    expect(client.inputs).toHaveLength(1); // exactly one Actor run
    expect(client.inputs[0].queries).toEqual(["compression travel bag", "collapsible storage organizer"]);
    expect(result.items).toHaveLength(2);
    expect(result.budgetStopped).toBe(false);

    const backpack = result.items.find((i) => i.title === "Compression Backpack");
    expect(backpack?.category).toBe("travel");
    expect(backpack?.discoveryTheme).toBe("travel");
    expect(backpack?.discoveryKeyword).toBe("compression travel bag");

    const organizer = result.items.find((i) => i.title === "Storage Organizer");
    expect(organizer?.discoveryTheme).toBe("home-organization");

    expect(result.keywordUsage).toEqual(
      expect.arrayContaining([
        { keyword: "compression travel bag", itemsReturned: 1 },
        { keyword: "collapsible storage organizer", itemsReturned: 1 },
      ]),
    );
  });

  it("returns budgetStopped instead of throwing, with no items to discard", async () => {
    const controller = new ApifyCostController(new FakeStore(), new BudgetBlockingClient(), { hardLimitUsd: 0.01 });
    const provider = new AlibabaApifyProvider();

    const result = await provider.search(
      { keywords: [{ keyword: "backpack", theme: "travel", category: "travel" }], maxItemsTotal: 100 },
      { costController: controller },
    );

    expect(result.budgetStopped).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.stopReason).toBeDefined();
  });

  it("skips unnormalizable raw items instead of throwing", async () => {
    const rawItems = [
      { productId: 1, title: "Valid Item", price: 5, query: "compression travel bag" },
      { title: "Missing productId and price" },
    ];
    const client = new RecordingClient(rawItems);
    const controller = new ApifyCostController(new FakeStore(), client, { hardLimitUsd: 2 });
    const provider = new AlibabaApifyProvider();

    const result = await provider.search(
      { keywords: [{ keyword: "compression travel bag", theme: "travel", category: "travel" }], maxItemsTotal: 100 },
      { costController: controller },
    );

    expect(result.items).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
    expect(result.rawItemCount).toBe(2);
  });
});
