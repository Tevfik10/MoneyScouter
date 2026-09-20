// Apify Actors used by MoneyScouter are pay-per-result, not fixed monthly
// subscriptions — see docs/ARCHITECTURE_V1_1.md section 3/7. Real cost is
// only known after a run finishes (via the run object's `usageTotalUsd`,
// see costController.ts); these per-item rates are only used to compute a
// conservative *pre-run* estimate to check against budget before spending
// anything, per master spec V1.1 section 13 ("if Apify cost cannot be
// known before a run: use conservative caps on results/run sizes").
export const APIFY_ACTOR_PRICE_PER_ITEM_USD: Record<string, number> = {
  "crawlerbros/aliexpress-scraper": 0.003, // $3.00 / 1,000 results — kept as the fallback/alternative provider
  "tortuga/aliexpress-scraper": 0.002, // $2.00 / 1,000 results, batches multiple search terms in one run — default provider
  "chris_coussons/google-shopping-scraper": 0.003, // $3.00 / 1,000 results
};

// Unknown actors get a deliberately pessimistic fallback rate so a
// misconfigured/new actor can't silently blow through budget.
const FALLBACK_PRICE_PER_ITEM_USD = 0.01;

export function priceForActor(actorId: string): number {
  return APIFY_ACTOR_PRICE_PER_ITEM_USD[actorId] ?? FALLBACK_PRICE_PER_ITEM_USD;
}

export function estimateApifyCostUsd(actorId: string, maxItems: number): number {
  const cost = priceForActor(actorId) * maxItems;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
