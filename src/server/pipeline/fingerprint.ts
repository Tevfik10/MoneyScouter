import crypto from "node:crypto";
import { DiscoveredProductSource } from "@/server/providers/discovery/types";

// Pure, DB-free fingerprinting logic — see dedup.ts for the DB-touching
// "never pay twice" lookup that uses this.

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The fingerprint key is (supplier platform, supplier product id): the
 * strongest available signal in V1 that two discovered listings are the
 * exact same product. Near-duplicate detection across different suppliers
 * (image hash, EAN/GTIN, brand+model matching) is documented as a future
 * enhancement in docs/ARCHITECTURE.md rather than approximated here, since
 * a wrong merge (two different products treated as one) is worse than an
 * occasional missed merge (the same product re-discovered from a second
 * supplier, which just becomes a second ProductSource on the same
 * fingerprint-matched Product once that supplier repeats).
 */
export function computeFingerprint(source: Pick<DiscoveredProductSource, "supplierPlatform" | "supplierProductId">): string {
  const key = `${source.supplierPlatform.toLowerCase()}::${source.supplierProductId.toLowerCase()}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

const CONCEPT_MATCH_MIN_TOKEN_LENGTH = 3;

function tokenize(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter((t) => t.length >= CONCEPT_MATCH_MIN_TOKEN_LENGTH));
}

/**
 * Jaccard token-overlap between two normalized titles, 0-1 — the same
 * technique used to fuzzy-match Google Shopping listings against a
 * product (agentsDeterministic/competitor.ts), reused here for a much
 * higher-stakes decision: whether two DIFFERENT suppliers' listings are
 * the same PRODUCT CONCEPT and should share one Product row (see
 * dedup.ts). Never claim certainty — the caller applies a stricter
 * threshold than the market-listing use case precisely because a wrong
 * merge here is worse than a missed one.
 */
export function titleConceptMatchConfidence(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 1000) / 1000;
}

export const CONCEPT_MATCH_MIN_CONFIDENCE = 0.5;

export const PRICE_CHANGE_THRESHOLD_PERCENT = 5;

export function priceChangePercent(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return newPrice === 0 ? 0 : 100;
  return Math.abs((newPrice - oldPrice) / oldPrice) * 100;
}

export function isMeaningfulPriceChange(oldPrice: number, newPrice: number): boolean {
  return priceChangePercent(oldPrice, newPrice) >= PRICE_CHANGE_THRESHOLD_PERCENT;
}
