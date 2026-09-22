import crypto from "node:crypto";
import { z } from "zod";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

// automation-lab/alibaba-products-scraper's product-record shape,
// defensively parsed against the Actor's documented output schema
// (https://apify.com/automation-lab/alibaba-products-scraper) — a
// malformed/unexpected item should be skipped, never crash the whole
// batch, and an unverified field name should degrade to "unknown" rather
// than silently reading the wrong value.
//
// IMPORTANT: the documented schema explicitly marks several fields
// nullable (rating, reviewCount, soldCount, supplierResponseRate) — real
// Alibaba listings commonly have no reviews/orders/response-rate data yet
// and the Actor reports that as `null`, not a missing key. A bare
// `.optional()` zod field only accepts `undefined`, so a single `null`
// value anywhere in the object fails the ENTIRE item's safeParse (this
// object isn't .strict(), but every DECLARED field is still type-checked)
// — silently dropping every real item into skippedCount while a mocked
// test fixture (which never sets a field to literal null) sails through.
// `opt()` accepts both null and undefined and collapses either to
// undefined, so every field downstream keeps working with the same
// `T | undefined` shape it already assumed.
function opt<T extends z.ZodTypeAny>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((v) => v ?? undefined);
}

const priceTierSchema = z
  .object({
    minimumQuantity: opt(z.number()),
    minQuantity: opt(z.number()),
    // Unlike the fields above, a null upper bound is meaningful here
    // ("no maximum quantity for this tier") and is preserved as null all
    // the way through to the stored ProductSource.priceTiers, not
    // collapsed to undefined.
    maximumQuantity: z.number().nullable().optional(),
    maxQuantity: z.number().nullable().optional(),
    price: opt(z.union([z.number(), z.string()])),
    unit: opt(z.string()),
    currency: opt(z.string()),
  })
  .passthrough();

const rawItemSchema = z
  .object({
    productId: z.union([z.string(), z.number()]),
    title: z.string().min(1),
    productUrl: opt(z.string()),
    url: opt(z.string()),
    imageUrl: opt(z.string()),
    mainImage: opt(z.string()),
    category: opt(z.string()),

    price: opt(z.union([z.number(), z.string()])),
    minimumPrice: opt(z.union([z.number(), z.string()])),
    priceMin: opt(z.union([z.number(), z.string()])),
    maximumPrice: opt(z.union([z.number(), z.string()])),
    priceMax: opt(z.union([z.number(), z.string()])),
    currency: opt(z.string()),
    priceTiers: opt(z.array(priceTierSchema)),
    quantityPrices: opt(z.array(priceTierSchema)),

    minimumOrder: opt(z.union([z.number(), z.string()])),
    minOrderQuantity: opt(z.union([z.number(), z.string()])),
    moq: opt(z.union([z.number(), z.string()])),
    unit: opt(z.string()),
    minimumOrderUnit: opt(z.string()),
    moqUnit: opt(z.string()),

    supplierName: opt(z.string()),
    companyName: opt(z.string()),
    supplierId: opt(z.union([z.string(), z.number()])),
    supplierUrl: opt(z.string()),
    supplierCountry: opt(z.string()),
    country: opt(z.string()),
    supplierYears: opt(z.number()),
    supplierYearsOnAlibaba: opt(z.number()),

    verifiedSupplier: opt(z.boolean()),
    isVerifiedSupplier: opt(z.boolean()),
    goldSupplier: opt(z.boolean()),
    isGoldSupplier: opt(z.boolean()),
    assessedSupplier: opt(z.boolean()),
    tradeAssurance: opt(z.boolean()),
    isTradeAssurance: opt(z.boolean()),
    supplierResponseRate: opt(z.union([z.number(), z.string()])),
    responseRatePercent: opt(z.union([z.number(), z.string()])),

    rating: opt(z.union([z.number(), z.string()])),
    reviewScore: opt(z.union([z.number(), z.string()])),
    reviewCount: opt(z.number()),
    soldCount: opt(z.number()),

    certificates: opt(z.array(z.string())),
    certifications: opt(z.array(z.string())),
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

// The Actor's own input schema documents its price filters as "USD price"
// — unlike the legacy AliExpress adapter (which could request `region:
// "nl"` and get back NL/EUR-localized prices), this Actor has no
// currency/region input at all and always quotes in USD. Every downstream
// consumer (filter thresholds, the landed-cost model, MoneyScore) already
// assumes ProductSource.price is EUR-denominated — that assumption was
// never actually true for Alibaba data, so every price silently ran ~8%
// hot compared to what the EUR thresholds intended. A fixed approximate
// rate, applied once here at the ingestion boundary, is a labelled
// assumption (like the landed-cost model's own duty-rate assumption) —
// not a scoring-strategy or threshold change; the thresholds themselves
// are untouched.
const USD_TO_EUR_RATE = 0.92;

function toEur(amount: number): number {
  return Math.round(amount * USD_TO_EUR_RATE * 100) / 100;
}

function extractPrice(item: AlibabaRawItem): number | null {
  const min = toNumber(item.minimumPrice ?? item.priceMin);
  if (min != null) return toEur(min);
  const flat = toNumber(item.price);
  if (flat != null) return toEur(flat);
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
    tiers.push({ minQuantity, maxQuantity: t.maximumQuantity ?? t.maxQuantity ?? null, price: toEur(price), unit: t.unit });
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
  const priceMaxRaw = toNumber(item.maximumPrice ?? item.priceMax);
  const priceMax = priceMaxRaw != null ? toEur(priceMaxRaw) : undefined;
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
      // price/priceMin/priceMax/priceTiers are already converted to EUR
      // above (see toEur) — the Actor has no EUR-quoting option, so the
      // stored currency reflects what the numbers actually are now, not
      // the Actor's raw USD quote.
      currency: "EUR",
      moq: extractMoq(item),
      moqUnit: item.moqUnit ?? item.minimumOrderUnit ?? item.unit,
      priceMin: price,
      priceMax,
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
