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
