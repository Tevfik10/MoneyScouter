import crypto from "node:crypto";
import { z } from "zod";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

// crawlerbros/aliexpress-scraper's product-record shape, defensively
// parsed: every field beyond productId/title is optional because actor
// output schemas can drift, and a malformed item should be skipped, never
// crash the whole batch. See docs/ARCHITECTURE_V1_1.md section 3 for the
// documented data-completeness gaps this works around (no stable
// seller/store id or shipping cost/weight in search-result records).
const rawItemSchema = z
  .object({
    productId: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    productUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    salePrice: z
      .object({
        amount: z.number().optional(),
        currencyCode: z.string().optional(),
        formatted: z.string().optional(),
        discountPercent: z.number().optional(),
      })
      .optional(),
    originalPrice: z.union([z.number(), z.object({ amount: z.number().optional() }).passthrough()]).optional(),
    rating: z.number().optional(),
    ordersCount: z.number().optional(),
    reviewCount: z.number().optional(),
    shipFromCountry: z.string().optional(),
    // Not documented as guaranteed present on search-result records, but
    // checked defensively in case a given run/region includes them.
    storeName: z.string().optional(),
    sellerName: z.string().optional(),
    shopName: z.string().optional(),
    storeRating: z.number().optional(),
  })
  .passthrough();

export type AliExpressRawItem = z.infer<typeof rawItemSchema>;

function extractPrice(item: AliExpressRawItem): number | null {
  if (typeof item.salePrice?.amount === "number") return item.salePrice.amount;
  const fromFormatted = item.salePrice?.formatted?.match(/[\d.,]+/)?.[0];
  if (fromFormatted) {
    const n = Number(fromFormatted.replace(/,/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function extractOldPrice(item: AliExpressRawItem): number | undefined {
  if (typeof item.originalPrice === "number") return item.originalPrice;
  if (item.originalPrice && typeof item.originalPrice.amount === "number") return item.originalPrice.amount;
  return undefined;
}

/**
 * The actor's search-result records don't expose a stable seller/store id
 * (only an optional display name, if present at all) — see the research
 * notes in docs/ARCHITECTURE_V1_1.md. A hash of the normalized display
 * name is used as a best-effort stable id: it correctly merges repeat
 * sightings of the SAME displayed seller name, but cannot guarantee true
 * seller identity (a renamed store would appear as a new Supplier row).
 * This is a documented, honest limitation, not a guess dressed up as fact.
 */
function stableSupplierId(name: string): string {
  return crypto.createHash("sha1").update(name.toLowerCase().trim()).digest("hex").slice(0, 16);
}

export function normalizeAliExpressItem(raw: unknown, category: string): DiscoveredProduct | null {
  const parsed = rawItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  const price = extractPrice(item);
  if (price === null) return null; // unusable without a price

  const supplierName =
    item.storeName ?? item.sellerName ?? item.shopName ?? `AliExpress seller (${item.shipFromCountry ?? "unknown origin"})`;

  return {
    title: item.title,
    category,
    imageUrl: item.imageUrl,
    source: {
      supplierPlatform: "aliexpress",
      supplierName,
      supplierExternalId: stableSupplierId(supplierName),
      supplierProductId: String(item.productId),
      url: item.productUrl,
      price,
      currency: item.salePrice?.currencyCode ?? "USD",
      oldPrice: extractOldPrice(item),
      discountPercent: item.salePrice?.discountPercent,
      reviewCount: item.reviewCount,
      orderCount: item.ordersCount,
      rating: item.rating ?? item.storeRating,
      raw: item,
    },
  };
}
