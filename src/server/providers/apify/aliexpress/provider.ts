import {
  AliExpressDiscoveryProvider,
  AliExpressSearchContext,
  AliExpressSearchParams,
  AliExpressSearchResult,
} from "@/server/providers/apify/aliexpress/types";
import { normalizeAliExpressItem } from "@/server/providers/apify/aliexpress/normalize";

export const ALIEXPRESS_ACTOR_ID = "crawlerbros/aliexpress-scraper";

function buildActorInput(params: AliExpressSearchParams): Record<string, unknown> {
  return {
    searchQuery: params.keyword,
    region: params.region ?? "nl",
    shipTo: params.shipTo ?? "NL",
    currency: "EUR",
    maxItems: params.maxItems,
    maxPages: Math.max(1, Math.ceil(params.maxItems / 60)),
    priceMin: params.priceMin,
    priceMax: params.priceMax,
    ratingMin: params.ratingMin,
    sortBy: "orders_desc",
  };
}

export class AliExpressApifyProvider implements AliExpressDiscoveryProvider {
  id = "aliexpress-apify";

  async search(params: AliExpressSearchParams, ctx: AliExpressSearchContext): Promise<AliExpressSearchResult> {
    const input = buildActorInput(params);
    const { items: rawItems, run, costUsd } = await ctx.costController.runActorAndGetItems<unknown>({
      actorId: ALIEXPRESS_ACTOR_ID,
      purpose: "discovery",
      input,
      maxItems: params.maxItems,
      researchRunId: ctx.researchRunId,
      opts: { timeoutSecs: 180, maxWaitMs: 240_000 },
    });

    const items = [];
    let skippedCount = 0;
    for (const raw of rawItems) {
      const normalized = normalizeAliExpressItem(raw, params.category);
      if (normalized) items.push(normalized);
      else skippedCount++;
    }

    return { items, run, costUsd, skippedCount, rawItemCount: rawItems.length };
  }
}

export const aliExpressApifyProvider = new AliExpressApifyProvider();
