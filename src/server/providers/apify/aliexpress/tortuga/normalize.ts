import crypto from "node:crypto";
import { z } from "zod";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

// tortuga/aliexpress-scraper's product-record shape, defensively parsed —
// confirmed against the Actor's documented sample output. Every field
// beyond productId/title is optional because actor output schemas can
// drift, and a malformed item should be skipped, never crash the whole
// batch. Unlike crawlerbros, price is a flat number (not nested under
// salePrice.amount) and each item carries the `searchTerm` that produced
// it, which is what makes batching multiple keywords into one run usable —
// see normalizeTortugaItem below.
const rawItemSchema = z
  .object({
    productId: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    url: z.string().optional(),
    imageUrl: z.string().optional(),
    price: z.number().optional(),
    originalPrice: z.number().optional(),
    currency: z.string().optional(),
    rating: z.number().optional(),
    ordersCount: z.number().optional(),
    reviewCount: z.number().optional(),
    searchTerm: z.string().optional(),
    store: z.object({ name: z.string().optional(), rating: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();

export type TortugaRawItem = z.infer<typeof rawItemSchema>;

function extractDiscountPercent(item: TortugaRawItem): number | undefined {
  if (typeof item.price !== "number" || typeof item.originalPrice !== "number") return undefined;
  if (item.originalPrice <= item.price) return undefined;
  return Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100);
}

// Same documented limitation as the crawlerbros adapter: no stable
// seller/store id is exposed, only an optional display name. A hash of the
// normalized name is a best-effort stable id — merges repeat sightings of
// the same displayed store name, but can't guarantee true seller identity.
function stableSupplierId(name: string): string {
  return crypto.createHash("sha1").update(name.toLowerCase().trim()).digest("hex").slice(0, 16);
}

/**
 * `category` is resolved per-item from `searchTerm` (present on every item
 * in a batched multi-keyword run) via `keywordToCategory`, falling back to
 * `fallbackCategory` if the item's search term is missing or unrecognized —
 * this only happens for a malformed/unexpected item, not in normal
 * operation.
 */
export function normalizeTortugaItem(
  raw: unknown,
  keywordToCategory: Map<string, string>,
  fallbackCategory: string,
): DiscoveredProduct | null {
  const parsed = rawItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  if (typeof item.price !== "number") return null; // unusable without a price

  const category = (item.searchTerm && keywordToCategory.get(item.searchTerm)) ?? fallbackCategory;
  const supplierName = item.store?.name ?? "AliExpress seller (unknown store)";

  return {
    title: item.title,
    category,
    imageUrl: item.imageUrl,
    source: {
      supplierPlatform: "aliexpress",
      supplierName,
      supplierExternalId: stableSupplierId(supplierName),
      supplierProductId: String(item.productId),
      url: item.url,
      price: item.price,
      currency: item.currency ?? "USD",
      oldPrice: item.originalPrice,
      discountPercent: extractDiscountPercent(item),
      reviewCount: item.reviewCount,
      orderCount: item.ordersCount,
      rating: item.rating ?? item.store?.rating,
      raw: item,
    },
  };
}
