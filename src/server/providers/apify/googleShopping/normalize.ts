import { z } from "zod";
import { GoogleShoppingListing } from "@/server/providers/apify/googleShopping/types";

// chris_coussons/google-shopping-scraper's record shape, defensively
// parsed — see docs/ARCHITECTURE_V1_1.md section 7.
const rawListingSchema = z
  .object({
    productTitle: z.string().min(1),
    price: z.union([z.string(), z.number()]).optional(),
    priceValue: z.number().optional(),
    currency: z.string().optional(),
    currencyCode: z.string().optional(),
    merchant: z.string().optional(),
    merchantDomain: z.string().optional(),
    landingPage: z.string().optional(),
    rating: z.number().optional(),
    reviewCount: z.number().optional(),
    storeRating: z.number().optional(),
    storeReviewCount: z.number().optional(),
    deliveryText: z.string().optional(),
    deliveryCost: z.union([z.string(), z.number()]).optional(),
    position: z.number().optional(),
  })
  .passthrough();

function toNumber(value: string | number | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function normalizeGoogleShoppingListing(raw: unknown): GoogleShoppingListing | null {
  const parsed = rawListingSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  return {
    title: item.productTitle,
    priceValue: item.priceValue ?? toNumber(item.price),
    currency: item.currencyCode ?? item.currency ?? null,
    merchant: item.merchant ?? null,
    merchantDomain: item.merchantDomain ?? null,
    rating: item.rating ?? item.storeRating ?? null,
    reviewCount: item.reviewCount ?? item.storeReviewCount ?? null,
    deliveryText: item.deliveryText ?? null,
    deliveryCost: toNumber(item.deliveryCost),
    url: item.landingPage ?? null,
    position: item.position ?? null,
  };
}
