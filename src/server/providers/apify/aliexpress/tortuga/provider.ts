import {
  AliExpressDiscoveryProvider,
  AliExpressKeywordUsage,
  AliExpressSearchContext,
  AliExpressSearchParams,
  AliExpressSearchResult,
} from "@/server/providers/apify/aliexpress/types";
import { normalizeTortugaItem } from "@/server/providers/apify/aliexpress/tortuga/normalize";
import { ApifyBudgetExceededError } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";

export const TORTUGA_ACTOR_ID = "tortuga/aliexpress-scraper";

function buildActorInput(params: AliExpressSearchParams): Record<string, unknown> {
  return {
    searchTerms: params.keywords.map((k) => k.keyword),
    maxItems: params.maxItemsTotal,
    currency: "EUR",
    shipTo: params.shipTo ?? "NL",
    sortBy: "orders",
  };
}

/**
 * `tortuga/aliexpress-scraper` accepts `searchTerms` as an array and tags
 * every result with the `searchTerm` that produced it — confirmed on the
 * Actor's own schema/output docs. That means N keywords can be searched in
 * ONE Actor run instead of N, paying the run's startup/platform overhead
 * once instead of N times, at a lower $2.00/1,000 rate than crawlerbros'
 * $3.00/1,000. This is the default AliExpress discovery provider; see
 * ../crawlerbros for the single-keyword fallback/alternative.
 */
export class TortugaAliExpressProvider implements AliExpressDiscoveryProvider {
  id = "aliexpress-tortuga";
  actorId = TORTUGA_ACTOR_ID;
  supportsBatching = true;

  async search(params: AliExpressSearchParams, ctx: AliExpressSearchContext): Promise<AliExpressSearchResult> {
    const input = buildActorInput(params);
    const keywordToCategory = new Map(params.keywords.map((k) => [k.keyword, k.category]));
    const fallbackCategory = params.keywords[0]?.category ?? "uncategorized";

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

    const items: AliExpressSearchResult["items"] = [];
    const itemsPerKeyword = new Map<string, number>(params.keywords.map((k) => [k.keyword, 0]));
    let skippedCount = 0;

    for (const raw of rawItems) {
      const normalized = normalizeTortugaItem(raw, keywordToCategory, fallbackCategory);
      if (!normalized) {
        skippedCount++;
        continue;
      }
      items.push(normalized);
      const searchTerm = typeof raw === "object" && raw && "searchTerm" in raw ? String((raw as { searchTerm?: unknown }).searchTerm) : undefined;
      if (searchTerm && itemsPerKeyword.has(searchTerm)) {
        itemsPerKeyword.set(searchTerm, (itemsPerKeyword.get(searchTerm) ?? 0) + 1);
      }
    }

    const keywordUsage: AliExpressKeywordUsage[] = params.keywords.map((k) => ({
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

export const tortugaAliExpressProvider = new TortugaAliExpressProvider();
