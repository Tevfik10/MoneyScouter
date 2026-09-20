import {
  AliExpressDiscoveryProvider,
  AliExpressKeywordUsage,
  AliExpressSearchContext,
  AliExpressSearchParams,
  AliExpressSearchResult,
} from "@/server/providers/apify/aliexpress/types";
import { normalizeAliExpressItem } from "@/server/providers/apify/aliexpress/crawlerbros/normalize";
import { ApifyBudgetExceededError } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";

export const CRAWLERBROS_ACTOR_ID = "crawlerbros/aliexpress-scraper";

function buildActorInput(keyword: string, maxItems: number, params: AliExpressSearchParams): Record<string, unknown> {
  return {
    searchQuery: keyword,
    region: params.region ?? "nl",
    shipTo: params.shipTo ?? "NL",
    currency: "EUR",
    maxItems,
    maxPages: Math.max(1, Math.ceil(maxItems / 60)),
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    ratingMin: params.ratingMin,
    sortBy: "orders_desc",
  };
}

/**
 * `crawlerbros/aliexpress-scraper`'s `searchQuery` input is a single
 * string — confirmed on the Actor's own schema page, it cannot search
 * multiple keywords in one run. `supportsBatching: false` reflects that;
 * this adapter loops internally, one full Actor run per keyword, and
 * aggregates the results so callers never have to know the difference
 * between this and a batching provider. Kept as a fallback/alternative to
 * the default Tortuga provider — same actor id, same $3.00/1,000 pricing
 * as before.
 */
export class CrawlerbrosAliExpressProvider implements AliExpressDiscoveryProvider {
  id = "aliexpress-crawlerbros";
  actorId = CRAWLERBROS_ACTOR_ID;
  supportsBatching = false;

  async search(params: AliExpressSearchParams, ctx: AliExpressSearchContext): Promise<AliExpressSearchResult> {
    const perKeywordCap = Math.max(1, Math.floor(params.maxItemsTotal / params.keywords.length));
    const items: AliExpressSearchResult["items"] = [];
    const runs: ApifyRunInfo[] = [];
    const keywordUsage: AliExpressKeywordUsage[] = [];
    let costUsd = 0;
    let skippedCount = 0;
    let rawItemCount = 0;
    let budgetStopped = false;
    let stopReason: string | undefined;

    for (const kw of params.keywords) {
      // Budget already known exhausted, or we've already hit the total item
      // cap — every remaining keyword goes unattempted, never a wasted call.
      if (budgetStopped || items.length >= params.maxItemsTotal) {
        keywordUsage.push({ keyword: kw.keyword, itemsReturned: 0 });
        continue;
      }
      const cap = Math.min(perKeywordCap, params.maxItemsTotal - items.length);
      const input = buildActorInput(kw.keyword, cap, params);
      try {
        const { items: rawItems, run, costUsd: callCostUsd } = await ctx.costController.runActorAndGetItems<unknown>({
          actorId: this.actorId,
          provider: this.id,
          purpose: "discovery",
          keyword: kw.keyword,
          input,
          maxItems: cap,
          researchRunId: ctx.researchRunId,
          opts: { timeoutSecs: 180, maxWaitMs: 120_000 },
        });

        runs.push(run);
        costUsd += callCostUsd;
        rawItemCount += rawItems.length;

        let keywordItems = 0;
        for (const raw of rawItems) {
          const normalized = normalizeAliExpressItem(raw, kw.category);
          if (normalized) {
            items.push(normalized);
            keywordItems++;
          } else {
            skippedCount++;
          }
        }
        keywordUsage.push({ keyword: kw.keyword, itemsReturned: keywordItems });
      } catch (err) {
        if (err instanceof ApifyBudgetExceededError) {
          // Stop here, but keep everything gathered from earlier keywords —
          // it was already paid for and must never be thrown away.
          budgetStopped = true;
          stopReason = err.message;
        } else {
          console.error(`[CrawlerbrosAliExpressProvider] search failed for keyword "${kw.keyword}":`, err);
        }
        keywordUsage.push({ keyword: kw.keyword, itemsReturned: 0 });
      }
    }

    return { items, runs, costUsd, skippedCount, rawItemCount, keywordUsage, budgetStopped, stopReason };
  }
}

export const crawlerbrosAliExpressProvider = new CrawlerbrosAliExpressProvider();
