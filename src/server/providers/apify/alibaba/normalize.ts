import crypto from "node:crypto";
import { z } from "zod";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

// automation-lab/alibaba-products-scraper's product-record shape,
// defensively parsed — confirmed against the Actor's documented pricing/
// input/output page, not a raw sample run (we have no Apify token in this
// environment and must not spend anything to get one). Every field beyond
// productId/title is optional and several accept more than one plausible
// spelling, because a third-party actor's output schema can drift or be
// summarized loosely in its docs — a malformed/unexpected item should be
// skipped, never crash the whole batch, and an unverified field name
// should degrade to "unknown" rather than silently reading the wrong
// value.
const priceTierSchema = z
  .object({
    minimumQuantity: z.number().optional(),
    minQuantity: z.number().optional(),
    maximumQuantity: z.number().nullable().optional(),
    maxQuantity: z.number().nullable().optional(),
    price: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional(),
    currency: z.string().optional(),
  })
  .passthrough();

const rawItemSchema = z
  .object({
    productId: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    productUrl: z.string().optional(),
    url: z.string().optional(),
    imageUrl: z.string().optional(),
    mainImage: z.string().optional(),
    category: z.string().optional(),

    price: z.union([z.number(), z.string()]).optional(),
    minimumPrice: z.union([z.number(), z.string()]).optional(),
    priceMin: z.union([z.number(), z.string()]).optional(),
    maximumPrice: z.union([z.number(), z.string()]).optional(),
    priceMax: z.union([z.number(), z.string()]).optional(),
    currency: z.string().optional(),
    priceTiers: z.array(priceTierSchema).optional(),
    quantityPrices: z.array(priceTierSchema).optional(),

    minimumOrder: z.union([z.number(), z.string()]).optional(),
    minOrderQuantity: z.union([z.number(), z.string()]).optional(),
    moq: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional(),
    minimumOrderUnit: z.string().optional(),
    moqUnit: z.string().optional(),

    supplierName: z.string().optional(),
    companyName: z.string().optional(),
    supplierId: z.union([z.string(), z.number()]).optional(),
    supplierUrl: z.string().optional(),
    supplierCountry: z.string().optional(),
    country: z.string().optional(),
    supplierYears: z.number().optional(),
    supplierYearsOnAlibaba: z.number().optional(),

    verifiedSupplier: z.boolean().optional(),
    isVerifiedSupplier: z.boolean().optional(),
    goldSupplier: z.boolean().optional(),
    isGoldSupplier: z.boolean().optional(),
    assessedSupplier: z.boolean().optional(),
    tradeAssurance: z.boolean().optional(),
    isTradeAssurance: z.boolean().optional(),
    supplierResponseRate: z.union([z.number(), z.string()]).optional(),
    responseRatePercent: z.union([z.number(), z.string()]).optional(),

    rating: z.union([z.number(), z.string()]).optional(),
    reviewScore: z.union([z.number(), z.string()]).optional(),
    reviewCount: z.number().optional(),
    soldCount: z.number().optional(),

    certificates: z.array(z.string()).optional(),
    certifications: z.array(z.string()).optional(),
  })
  .passthrough();

export type AlibabaRawItem = z.infer<typeof rawItemSchema>;

function toNumber(v: number | string | undefined): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const match = v.replace(/,/g, "").match(/[\d.]+/);
  if (!match) return undefined;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : undefined;
}

function extractPrice(item: AlibabaRawItem): number | null {
  const min = toNumber(item.minimumPrice ?? item.priceMin);
  if (min != null) return min;
  const flat = toNumber(item.price);
  if (flat != null) return flat;
  return null;
}

function extractMoq(item: AlibabaRawItem): number | undefined {
  return toNumber(item.minimumOrder ?? item.minOrderQuantity ?? item.moq);
}

function extractPriceTiers(
  item: AlibabaRawItem,
): Array<{ minQuantity: number; maxQuantity: number | null; price: number; unit?: string }> | undefined {
  const raw = item.priceTiers ?? item.quantityPrices;
  if (!raw || raw.length === 0) return undefined;
  const tiers: Array<{ minQuantity: number; maxQuantity: number | null; price: number; unit?: string }> = [];
  for (const t of raw) {
    const minQuantity = t.minimumQuantity ?? t.minQuantity;
    const price = toNumber(t.price);
    if (minQuantity == null || price == null) continue;
    tiers.push({ minQuantity, maxQuantity: t.maximumQuantity ?? t.maxQuantity ?? null, price, unit: t.unit });
  }
  return tiers.length > 0 ? tiers : undefined;
}

/**
 * No stable numeric supplier id is guaranteed present in every record
 * (`supplierId` is optional/unconfirmed) — a hash of the normalized
 * display name is used as a best-effort stable id, same documented
 * limitation as the legacy AliExpress adapter: correctly merges repeat
 * sightings of the SAME displayed supplier name, but cannot guarantee true
 * identity across a rename.
 */
function stableSupplierId(name: string): string {
  return crypto.createHash("sha1").update(name.toLowerCase().trim()).digest("hex").slice(0, 16);
}

export function normalizeAlibabaItem(raw: unknown, category: string): DiscoveredProduct | null {
  const parsed = rawItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  const price = extractPrice(item);
  if (price === null) return null; // unusable without a price

  const supplierName = item.supplierName ?? item.companyName ?? "Onbekende leverancier (Alibaba)";
  const priceMax = toNumber(item.maximumPrice ?? item.priceMax);
  const certifications = item.certificates ?? item.certifications;

  return {
    title: item.title,
    category: item.category ?? category,
    imageUrl: item.imageUrl ?? item.mainImage,
    source: {
      supplierPlatform: "alibaba",
      supplierName,
      supplierExternalId: item.supplierId != null ? String(item.supplierId) : stableSupplierId(supplierName),
      supplierProductId: String(item.productId),
      url: item.productUrl ?? item.url,
      price,
      currency: item.currency ?? "USD",
      moq: extractMoq(item),
      moqUnit: item.moqUnit ?? item.minimumOrderUnit ?? item.unit,
      priceMin: price,
      priceMax: priceMax ?? undefined,
      priceTiers: extractPriceTiers(item),
      certifications: certifications && certifications.length > 0 ? certifications : undefined,
      reviewCount: item.reviewCount,
      orderCount: item.soldCount,
      rating: toNumber(item.rating ?? item.reviewScore),
      supplierCountry: item.supplierCountry ?? item.country,
      supplierYearsOnPlatform: item.supplierYears ?? item.supplierYearsOnAlibaba,
      supplierVerified: item.verifiedSupplier ?? item.isVerifiedSupplier,
      supplierGold: item.goldSupplier ?? item.isGoldSupplier,
      supplierAssessed: item.assessedSupplier,
      supplierTradeAssurance: item.tradeAssurance ?? item.isTradeAssurance,
      supplierResponseRatePercent: toNumber(item.supplierResponseRate ?? item.responseRatePercent),
      raw: item,
    },
  };
}
