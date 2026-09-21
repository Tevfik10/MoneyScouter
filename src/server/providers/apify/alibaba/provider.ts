import {
  AlibabaDiscoveryProvider,
  AlibabaKeywordUsage,
  AlibabaSearchContext,
  AlibabaSearchParams,
  AlibabaSearchResult,
} from "@/server/providers/apify/alibaba/types";
import { normalizeAlibabaItem } from "@/server/providers/apify/alibaba/normalize";
import { ApifyBudgetExceededError } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";

export const ALIBABA_ACTOR_ID = "automation-lab/alibaba-products-scraper";

function buildActorInput(params: AlibabaSearchParams): Record<string, unknown> {
  return {
    queries: params.keywords.map((k) => k.keyword),
    maxItems: params.maxItemsTotal,
    maxPagesPerQuery: 2,
    minMoq: undefined,
    maxMinimumOrder: params.maxMoq,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
  };
}

/**
 * `automation-lab/alibaba-products-scraper` accepts `queries` as a string
 * array (up to 20 search terms) in a single run, tagging results with the
 * `query` that produced them — same batching shape as the Tortuga
 * AliExpress adapter it replaces as the active discovery provider. This is
 * the SOLE active product-discovery source for MoneyScouter; see
 * providers/apify/aliexpress for the legacy/inactive adapter this
 * supersedes.
 */
export class AlibabaApifyProvider implements AlibabaDiscoveryProvider {
  id = "alibaba-automation-lab";
  actorId = ALIBABA_ACTOR_ID;
  supportsBatching = true;

  async search(params: AlibabaSearchParams, ctx: AlibabaSearchContext): Promise<AlibabaSearchResult> {
    const input = buildActorInput(params);
    const keywordToTheme = new Map(params.keywords.map((k) => [k.keyword, k]));
    const fallback = params.keywords[0];

    let rawItems: unknown[];
    let run: ApifyRunInfo;
    let costUsd: number;
    try {
      const result = await ctx.costController.runActorAndGetItems<unknown>({
        actorId: this.actorId,
        provider: this.id,
        purpose: "discovery",
        keyword: params.keywords.map((k) => k.keyword).join(", "),
        input,
        maxItems: params.maxItemsTotal,
        researchRunId: ctx.researchRunId,
        opts: { timeoutSecs: 180, maxWaitMs: 120_000 },
      });
      rawItems = result.items;
      run = result.run;
      costUsd = result.costUsd;
    } catch (err) {
      if (!(err instanceof ApifyBudgetExceededError)) throw err;
      // Nothing was fetched (the budget check blocks before the call
      // starts) — there's no partial data to lose, just report the stop.
      return {
        items: [],
        runs: [],
        costUsd: 0,
        skippedCount: 0,
        rawItemCount: 0,
        keywordUsage: params.keywords.map((k) => ({ keyword: k.keyword, itemsReturned: 0 })),
        budgetStopped: true,
        stopReason: err.message,
      };
    }

    const items: AlibabaSearchResult["items"] = [];
    const itemsPerKeyword = new Map<string, number>(params.keywords.map((k) => [k.keyword, 0]));
    let skippedCount = 0;

    for (const raw of rawItems) {
      const query = typeof raw === "object" && raw && "query" in raw ? String((raw as { query?: unknown }).query) : undefined;
      const searchTerm = typeof raw === "object" && raw && "searchTerm" in raw ? String((raw as { searchTerm?: unknown }).searchTerm) : undefined;
      const matchedKeyword = (query ? keywordToTheme.get(query) : undefined) ?? (searchTerm ? keywordToTheme.get(searchTerm) : undefined) ?? fallback;

      const normalized = normalizeAlibabaItem(raw, matchedKeyword?.category ?? "onbekend");
      if (!normalized) {
        skippedCount++;
        continue;
      }
      normalized.discoveryTheme = matchedKeyword?.theme;
      normalized.discoveryKeyword = matchedKeyword?.keyword;
      items.push(normalized);

      const key = matchedKeyword?.keyword;
      if (key && itemsPerKeyword.has(key)) {
        itemsPerKeyword.set(key, (itemsPerKeyword.get(key) ?? 0) + 1);
      }
    }

    const keywordUsage: AlibabaKeywordUsage[] = params.keywords.map((k) => ({
      keyword: k.keyword,
      itemsReturned: itemsPerKeyword.get(k.keyword) ?? 0,
    }));

    return {
      items,
      runs: [run],
      costUsd,
      skippedCount,
      rawItemCount: rawItems.length,
      keywordUsage,
      budgetStopped: false,
    };
  }
}

export const alibabaApifyProvider = new AlibabaApifyProvider();
