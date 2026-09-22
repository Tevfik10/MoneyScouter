import { describe, expect, it } from "vitest";
import { normalizeAlibabaItem } from "@/server/providers/apify/alibaba/normalize";

describe("normalizeAlibabaItem", () => {
  it("normalizes a well-formed item with price tiers, MOQ and supplier verification fields", () => {
    const raw = {
      productId: "1600123456789",
      title: "Vacuum Compression Travel Backpack OEM Custom Logo",
      productUrl: "https://www.alibaba.com/product-detail/1600123456789.html",
      imageUrl: "https://img.example/1.jpg",
      minimumPrice: 12,
      maximumPrice: 16,
      currency: "USD",
      priceTiers: [
        { minimumQuantity: 100, maximumQuantity: 499, price: 14 },
        { minimumQuantity: 500, maximumQuantity: null, price: 12 },
      ],
      minimumOrder: 100,
      minimumOrderUnit: "pieces",
      supplierName: "Shenzhen Demo Trading Co.",
      supplierId: 555,
      supplierCountry: "China",
      supplierYears: 7,
      verifiedSupplier: true,
      goldSupplier: true,
      tradeAssurance: true,
      supplierResponseRate: "93%",
      rating: 4.7,
      reviewCount: 40,
      soldCount: 1200,
      certificates: ["BSCI", "ISO9001"],
    };

    const result = normalizeAlibabaItem(raw, "travel");
    expect(result).not.toBeNull();
    expect(result!.title).toBe(raw.title);
    expect(result!.category).toBe("travel");
    expect(result!.source.supplierPlatform).toBe("alibaba");
    expect(result!.source.price).toBe(12); // minimumPrice used as the representative price
    expect(result!.source.priceMin).toBe(12);
    expect(result!.source.priceMax).toBe(16);
    expect(result!.source.moq).toBe(100);
    expect(result!.source.moqUnit).toBe("pieces");
    expect(result!.source.priceTiers).toEqual([
      { minQuantity: 100, maxQuantity: 499, price: 14, unit: undefined },
      { minQuantity: 500, maxQuantity: null, price: 12, unit: undefined },
    ]);
    expect(result!.source.supplierName).toBe("Shenzhen Demo Trading Co.");
    expect(result!.source.supplierExternalId).toBe("555");
    expect(result!.source.supplierCountry).toBe("China");
    expect(result!.source.supplierYearsOnPlatform).toBe(7);
    expect(result!.source.supplierVerified).toBe(true);
    expect(result!.source.supplierGold).toBe(true);
    expect(result!.source.supplierTradeAssurance).toBe(true);
    expect(result!.source.supplierResponseRatePercent).toBe(93);
    expect(result!.source.certifications).toEqual(["BSCI", "ISO9001"]);
    expect(result!.source.orderCount).toBe(1200);
  });

  it("falls back to a flat price when no minimum/maximum price is present", () => {
    const raw = { productId: 1, title: "Item", price: 9.5 };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result?.source.price).toBe(9.5);
    expect(result?.source.priceMin).toBe(9.5);
    expect(result?.source.priceMax).toBeUndefined();
  });

  it("returns null when no usable price is present", () => {
    const raw = { productId: 1, title: "Item" };
    expect(normalizeAlibabaItem(raw, "gadgets")).toBeNull();
  });

  it("returns null for malformed input rather than throwing", () => {
    expect(() => normalizeAlibabaItem("not an object", "gadgets")).not.toThrow();
    expect(normalizeAlibabaItem(null, "gadgets")).toBeNull();
    expect(normalizeAlibabaItem(undefined, "gadgets")).toBeNull();
  });

  it("falls back to an 'unknown supplier' label and a stable hashed id when supplier fields are missing", () => {
    const raw = { productId: 1, title: "Item", price: 5 };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result?.source.supplierName).toContain("Onbekende leverancier");
    expect(result?.source.supplierExternalId).toHaveLength(16);
  });

  it("never fabricates missing verification/certification fields — they stay undefined, not defaulted", () => {
    const raw = { productId: 1, title: "Item", price: 5 };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result?.source.supplierVerified).toBeUndefined();
    expect(result?.source.supplierTradeAssurance).toBeUndefined();
    expect(result?.source.certifications).toBeUndefined();
    expect(result?.source.moq).toBeUndefined();
  });

  it("skips a price tier missing its minimum quantity or price rather than fabricating one", () => {
    const raw = {
      productId: 1,
      title: "Item",
      price: 5,
      priceTiers: [
        { minimumQuantity: 100, price: 5 },
        { price: 4 }, // missing minimumQuantity — skipped
        { minimumQuantity: 500 }, // missing price — skipped
      ],
    };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result?.source.priceTiers).toHaveLength(1);
    expect(result?.source.priceTiers?.[0]).toEqual({ minQuantity: 100, maxQuantity: null, price: 5, unit: undefined });
  });

  it("resolves alternate field name spellings (moq vs minOrderQuantity, isVerifiedSupplier, etc.)", () => {
    const raw = {
      productId: 1,
      title: "Item",
      price: 5,
      minOrderQuantity: 50,
      isVerifiedSupplier: true,
      isGoldSupplier: true,
      isTradeAssurance: true,
      companyName: "Alt Name Co.",
      country: "Vietnam",
    };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result?.source.moq).toBe(50);
    expect(result?.source.supplierVerified).toBe(true);
    expect(result?.source.supplierGold).toBe(true);
    expect(result?.source.supplierTradeAssurance).toBe(true);
    expect(result?.source.supplierName).toBe("Alt Name Co.");
    expect(result?.source.supplierCountry).toBe("Vietnam");
  });
});

// Regression coverage for the "0 production results" incident: the first
// real TEST_SCOUT against automation-lab/alibaba-products-scraper
// returned 0 MoneyScouter products. The actor's own documented output
// schema (apify.com/automation-lab/alibaba-products-scraper) explicitly
// marks rating, reviewCount, soldCount and supplierResponseRate as
// nullable — but the raw item schema declared them with a bare
// `.optional()`, which zod only satisfies for `undefined`, not `null`.
// Since the schema isn't `.strict()` per-field, ANY one field being
// `null` failed the whole item's safeParse, silently skipping every real
// item while every hand-written mock fixture (which never set a field to
// literal null) kept passing. Fixed via the `opt()` helper; these tests
// pin that fix against the actor's documented real shape.
describe("normalizeAlibabaItem — real production output shape (nullable fields)", () => {
  it("normalizes an item where rating, reviewCount, soldCount and supplierResponseRate are null (the documented Alibaba actor shape)", () => {
    const raw = {
      productId: "1601234567890",
      title: "Collapsible Storage Organizer Box",
      productUrl: "https://www.alibaba.com/product-detail/1601234567890.html",
      imageUrl: "https://img.example/2.jpg",
      query: "collapsible storage organizer",
      page: 1,
      position: 3,
      category: null,
      price: "US $3.20 - $5.80",
      minimumPrice: 3.2,
      maximumPrice: 5.8,
      currency: "USD",
      priceTiers: [{ minimumQuantity: 50, maximumQuantity: null, price: 3.2, currency: "USD", unit: "pieces" }],
      minimumOrder: 50,
      minimumOrderText: "50 pieces",
      unit: "pieces",
      supplierName: "Yiwu New Supplier Co., Ltd.",
      supplierUrl: null,
      supplierCountry: "China",
      supplierYears: 2,
      supplierResponseRate: null,
      verifiedSupplier: false,
      assessedSupplier: false,
      goldSupplier: false,
      tradeAssurance: true,
      badges: [],
      rating: null,
      reviewCount: null,
      soldCount: null,
      soldText: null,
      certificates: [],
      scrapedAt: "2026-09-22T08:00:00.000Z",
    };

    const result = normalizeAlibabaItem(raw, "home-organization");
    expect(result).not.toBeNull();
    expect(result!.title).toBe(raw.title);
    // category was null on the raw item -> falls back to the caller's category, never crashes.
    expect(result!.category).toBe("home-organization");
    expect(result!.source.price).toBe(3.2);
    expect(result!.source.moq).toBe(50);
    expect(result!.source.supplierTradeAssurance).toBe(true);
    // Null fields degrade to undefined — never fabricated, never NaN, never thrown.
    expect(result!.source.rating).toBeUndefined();
    expect(result!.source.reviewCount).toBeUndefined();
    expect(result!.source.orderCount).toBeUndefined();
    expect(result!.source.supplierResponseRatePercent).toBeUndefined();
  });

  it("skips only the bad tier, not the whole item, when one price tier has a null minimumQuantity", () => {
    const raw = {
      productId: 1,
      title: "Item",
      price: 5,
      priceTiers: [
        { minimumQuantity: null, price: 6 }, // malformed tier — must not kill the whole item
        { minimumQuantity: 100, price: 5, maximumQuantity: null },
      ],
    };
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result).not.toBeNull();
    expect(result!.source.priceTiers).toHaveLength(1);
    expect(result!.source.priceTiers?.[0].minQuantity).toBe(100);
  });

  it("survives every nullable-prone field being null at once (kitchen sink)", () => {
    const raw = {
      productId: "2",
      title: "Item With Every Optional Field Null",
      productUrl: null,
      imageUrl: null,
      category: null,
      price: 5,
      minimumPrice: null,
      maximumPrice: null,
      currency: null,
      priceTiers: null,
      minimumOrder: null,
      unit: null,
      supplierName: null,
      supplierId: null,
      supplierCountry: null,
      supplierYears: null,
      verifiedSupplier: null,
      goldSupplier: null,
      assessedSupplier: null,
      tradeAssurance: null,
      supplierResponseRate: null,
      rating: null,
      reviewCount: null,
      soldCount: null,
      certificates: null,
    };
    expect(() => normalizeAlibabaItem(raw, "gadgets")).not.toThrow();
    const result = normalizeAlibabaItem(raw, "gadgets");
    expect(result).not.toBeNull();
    expect(result!.source.price).toBe(5);
    expect(result!.source.supplierName).toContain("Onbekende leverancier");
  });
});
