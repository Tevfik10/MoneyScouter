import { ApifyCostController } from "@/server/apify/costController";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

export interface AlibabaKeywordInput {
  keyword: string;
  /** Search theme name (e.g. "home-organization") — the "why we searched
   * this" label, stored onto discovered products for later theme-quality
   * analysis. See pipeline/searchKeywords.ts. */
  theme: string;
  /** Category label attached to every discovered product from this keyword. */
  category: string;
}

export interface AlibabaSearchParams {
  keywords: AlibabaKeywordInput[];
  /** Hard cap on total items returned across all keywords in this call. */
  maxItemsTotal: number;
  minMoq?: number;
  maxMoq?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface AlibabaSearchContext {
  researchRunId?: string;
  costController: ApifyCostController;
}

export interface AlibabaKeywordUsage {
  keyword: string;
  itemsReturned: number;
}

export interface AlibabaSearchResult {
  items: DiscoveredProduct[];
  runs: ApifyRunInfo[];
  costUsd: number;
  skippedCount: number;
  rawItemCount: number;
  keywordUsage: AlibabaKeywordUsage[];
  /** True if the Apify budget was exhausted partway through (or before)
   * this search. Never thrown as an error — whatever was already
   * discovered and paid for is always returned in `items`. */
  budgetStopped: boolean;
  stopReason?: string;
}

/**
 * Adapter interface for Alibaba discovery — the sole active product
 * discovery source for MoneyScouter's sourcing pipeline (AliExpress is
 * legacy/inactive, see providers/apify/aliexpress/LEGACY.md).
 */
export interface AlibabaDiscoveryProvider {
  id: string;
  actorId: string;
  supportsBatching: boolean;
  search(params: AlibabaSearchParams, ctx: AlibabaSearchContext): Promise<AlibabaSearchResult>;
}
