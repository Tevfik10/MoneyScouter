import { ApifyCostController } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

export interface AliExpressKeywordInput {
  keyword: string;
  /** Category label attached to every discovered product from this keyword. */
  category: string;
}

export interface AliExpressSearchParams {
  /** One or more search terms. Providers that support batching search all
   * of them in a single Actor run; providers that don't loop internally,
   * one run per keyword — either way this is the whole request. */
  keywords: AliExpressKeywordInput[];
  /** Hard cap on total items returned across all keywords in this call. */
  maxItemsTotal: number;
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

export interface AliExpressKeywordUsage {
  keyword: string;
  itemsReturned: number;
}

export interface AliExpressSearchResult {
  items: DiscoveredProduct[];
  /** One entry per Actor run actually started — a batching provider makes
   * one call for the whole request; a non-batching one makes one per
   * keyword. */
  runs: ApifyRunInfo[];
  costUsd: number;
  /** Raw items returned by the actor(s) that couldn't be normalized. */
  skippedCount: number;
  rawItemCount: number;
  /** Per-keyword breakdown of normalized items, for SearchRun bookkeeping —
   * every requested keyword appears here, even with 0 items. */
  keywordUsage: AliExpressKeywordUsage[];
  /** True if the Apify budget was exhausted partway through (or before)
   * this search. Never thrown as an error — whatever was already
   * discovered and paid for is always returned in `items`, since a budget
   * stop must never discard results we already paid to retrieve. */
  budgetStopped: boolean;
  stopReason?: string;
}

/**
 * Adapter interface for AliExpress discovery — deliberately not the whole
 * system hardcoded around one Actor. Multiple Actors implement this same
 * interface (crawlerbros/tortuga today) and are selected via the registry
 * in ./index.ts, so swapping the default provider never touches the
 * orchestrator. See docs/ARCHITECTURE_V1_1.md section 3.
 */
export interface AliExpressDiscoveryProvider {
  id: string;
  actorId: string;
  /** True if this provider can search multiple keywords in a single Actor
   * run (one paid run instead of one per keyword). */
  supportsBatching: boolean;
  search(params: AliExpressSearchParams, ctx: AliExpressSearchContext): Promise<AliExpressSearchResult>;
}
