import {
  GoogleShoppingSearchContext,
  GoogleShoppingSearchParams,
  GoogleShoppingSearchResult,
  MarketEnrichmentProvider,
} from "@/server/providers/apify/googleShopping/types";
import { normalizeGoogleShoppingListing } from "@/server/providers/apify/googleShopping/normalize";

export const GOOGLE_SHOPPING_ACTOR_ID = "chris_coussons/google-shopping-scraper";

function buildActorInput(params: GoogleShoppingSearchParams): Record<string, unknown> {
  return {
    searchQueries: [params.query],
    countryCode: params.countryCode ?? "nl",
    languageCode: params.languageCode ?? "nl",
    device: "desktop",
    maxTotalAds: params.maxResults,
    maxAdsPerQuery: params.maxResults,
  };
}

export class GoogleShoppingApifyProvider implements MarketEnrichmentProvider {
  id = "google-shopping-apify";

  async search(
    params: GoogleShoppingSearchParams,
    ctx: GoogleShoppingSearchContext,
  ): Promise<GoogleShoppingSearchResult> {
    const input = buildActorInput(params);
    const { items: rawListings, run, costUsd } = await ctx.costController.runActorAndGetItems<unknown>({
      actorId: GOOGLE_SHOPPING_ACTOR_ID,
      purpose: "market_enrichment",
      input,
      maxItems: params.maxResults,
      researchRunId: ctx.researchRunId,
      opts: { timeoutSecs: 90, maxWaitMs: 120_000 },
    });

    const listings = rawListings
      .map((raw) => normalizeGoogleShoppingListing(raw))
      .filter((l): l is NonNullable<typeof l> => l !== null);

    return { listings, run, costUsd };
  }
}

export const googleShoppingApifyProvider = new GoogleShoppingApifyProvider();
