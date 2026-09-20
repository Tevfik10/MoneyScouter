import { ApifyCostController } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

export interface AliExpressSearchParams {
  keyword: string;
  /** Category label attached to every discovered product from this search. */
  category: string;
  maxItems: number;
  region?: string; // AliExpress regional storefront, e.g. "nl"
  shipTo?: string; // destination country code, e.g. "NL"
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
}

export interface AliExpressSearchContext {
  researchRunId?: string;
  costController: ApifyCostController;
}

export interface AliExpressSearchResult {
  items: DiscoveredProduct[];
  run: ApifyRunInfo;
  costUsd: number;
  /** Raw items returned by the actor that couldn't be normalized (missing title/price/id). */
  skippedCount: number;
  rawItemCount: number;
}

/**
 * Adapter interface for AliExpress discovery — deliberately not the whole
 * system hardcoded around one Actor. A different AliExpress-scraping Actor
 * (or a different supplier entirely) implements the same interface and
 * swaps in without touching the orchestrator. See
 * docs/ARCHITECTURE_V1_1.md section 3.
 */
export interface AliExpressDiscoveryProvider {
  id: string;
  search(params: AliExpressSearchParams, ctx: AliExpressSearchContext): Promise<AliExpressSearchResult>;
}
