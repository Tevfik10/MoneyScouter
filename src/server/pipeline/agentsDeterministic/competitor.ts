import { normalizeTitle } from "@/server/pipeline/fingerprint";
import { GoogleShoppingListing } from "@/server/providers/apify/googleShopping/types";
import { clamp, median, round } from "@/server/pipeline/agentsDeterministic/shared";

// Competitor Agent (V1.1, zero AI) — master spec section 8: "Use fuzzy
// title matching where necessary. Do not pretend matching is certain.
// Store match confidence." Confidence is Jaccard token overlap between
// normalized titles — simple, deterministic, and every match ships with
// its confidence rather than a false "this is definitely the same
// product" claim.

const MIN_MATCH_CONFIDENCE = 0.25;
const MIN_TOKEN_LENGTH = 3;

function tokenize(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((t) => t.length >= MIN_TOKEN_LENGTH));
}

export function titleMatchConfidence(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : round(intersection / union, 3);
}

export interface CompetitorMatch {
  listing: GoogleShoppingListing;
  matchConfidence: number;
}

export interface CompetitorFindings {
  competitorCount: number;
  medianMarketPriceEur: number | null;
  lowestMarketPriceEur: number | null;
  highestMarketPriceEur: number | null;
  merchantDiversity: number;
  reviewStrength: number;
  priceSpreadEur: number | null;
  marketSaturationScore: number; // 0-10, higher = more saturated/commoditized
  matches: CompetitorMatch[];
  summary: string;
}

export function computeCompetitorFindings(productTitle: string, listings: GoogleShoppingListing[]): CompetitorFindings {
  const matches: CompetitorMatch[] = listings
    .map((listing) => ({ listing, matchConfidence: titleMatchConfidence(productTitle, listing.title) }))
    .filter((m) => m.matchConfidence >= MIN_MATCH_CONFIDENCE)
    .sort((a, b) => b.matchConfidence - a.matchConfidence);

  const prices = matches
    .map((m) => m.listing.priceValue)
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  const merchants = new Set(matches.map((m) => m.listing.merchant).filter((m): m is string => !!m));
  const reviewCounts = matches.map((m) => m.listing.reviewCount).filter((r): r is number => r != null);

  const medianMarketPriceEur = prices.length > 0 ? round(median(prices), 2) : null;
  const lowestMarketPriceEur = prices.length > 0 ? prices[0] : null;
  const highestMarketPriceEur = prices.length > 0 ? prices[prices.length - 1] : null;
  const priceSpreadEur =
    lowestMarketPriceEur != null && highestMarketPriceEur != null
      ? round(highestMarketPriceEur - lowestMarketPriceEur, 2)
      : null;
  const reviewStrength =
    reviewCounts.length > 0 ? Math.round(reviewCounts.reduce((a, b) => a + b, 0) / reviewCounts.length) : 0;

  // Saturation: more matched competitors, clustered tightly around the
  // median price, reads as a commoditized market.
  let saturation = clamp(Math.round(matches.length / 2), 0, 6);
  if (medianMarketPriceEur && priceSpreadEur != null && medianMarketPriceEur > 0) {
    const spreadRatio = priceSpreadEur / medianMarketPriceEur;
    if (spreadRatio < 0.3) saturation += 3;
    else if (spreadRatio < 0.6) saturation += 1;
  }
  saturation = clamp(saturation, 0, 10);

  return {
    competitorCount: matches.length,
    medianMarketPriceEur,
    lowestMarketPriceEur,
    highestMarketPriceEur,
    merchantDiversity: merchants.size,
    reviewStrength,
    priceSpreadEur,
    marketSaturationScore: saturation,
    matches,
    summary:
      matches.length === 0
        ? `No Google Shopping listing matched with confidence >= ${MIN_MATCH_CONFIDENCE}.`
        : `${matches.length} matched listing(s) (confidence >= ${MIN_MATCH_CONFIDENCE}), median price €${medianMarketPriceEur}, ${merchants.size} distinct merchant(s).`,
  };
}
