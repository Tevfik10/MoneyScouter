import { ApifyCostController } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";

export interface GoogleShoppingSearchParams {
  query: string;
  countryCode?: string; // default "nl" — master spec V1.1 section 7: focus on the Netherlands
  languageCode?: string;
  maxResults: number;
}

export interface GoogleShoppingListing {
  title: string;
  priceValue: number | null;
  currency: string | null;
  merchant: string | null;
  merchantDomain: string | null;
  rating: number | null;
  reviewCount: number | null;
  deliveryText: string | null;
  deliveryCost: number | null;
  url: string | null;
  position: number | null;
}

export interface GoogleShoppingSearchContext {
  researchRunId?: string;
  costController: ApifyCostController;
}

export interface GoogleShoppingSearchResult {
  listings: GoogleShoppingListing[];
  run: ApifyRunInfo;
  costUsd: number;
}

/**
 * Market-enrichment adapter interface — used AFTER deterministic filtering,
 * only for shortlisted products (master spec V1.1 section 7: "Do NOT
 * Google-Shop every raw AliExpress product"). A different Google Shopping
 * Actor, or a different market-data source entirely, implements the same
 * interface and swaps in without touching the Competitor Agent.
 */
export interface MarketEnrichmentProvider {
  id: string;
  search(params: GoogleShoppingSearchParams, ctx: GoogleShoppingSearchContext): Promise<GoogleShoppingSearchResult>;
}
