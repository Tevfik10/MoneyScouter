import { describe, expect, it } from "vitest";
import { normalizeAliExpressItem } from "@/server/providers/apify/aliexpress/crawlerbros/normalize";

describe("normalizeAliExpressItem", () => {
  it("normalizes a well-formed item", () => {
    const raw = {
      productId: 12345,
      title: "Foldable Travel Backpack 40L",
      productUrl: "https://aliexpress.com/item/12345.html",
      imageUrl: "https://img.example/12345.jpg",
      salePrice: { amount: 14.99, currencyCode: "EUR", discountPercent: 20 },
      originalPrice: { amount: 18.99 },
      rating: 4.6,
      ordersCount: 3200,
      reviewCount: 890,
      shipFromCountry: "CN",
      storeName: "Global Travel Store",
    };

    const result = normalizeAliExpressItem(raw, "travel-bags");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Foldable Travel Backpack 40L");
    expect(result!.category).toBe("travel-bags");
    expect(result!.source.supplierPlatform).toBe("aliexpress");
    expect(result!.source.supplierName).toBe("Global Travel Store");
    expect(result!.source.supplierProductId).toBe("12345");
    expect(result!.source.price).toBe(14.99);
    expect(result!.source.oldPrice).toBe(18.99);
    expect(result!.source.discountPercent).toBe(20);
    expect(result!.source.rating).toBe(4.6);
    expect(result!.source.orderCount).toBe(3200);
    expect(result!.source.reviewCount).toBe(890);
  });

  it("returns null for an item with no usable price", () => {
    const raw = { productId: 1, title: "No price item" };
    expect(normalizeAliExpressItem(raw, "home")).toBeNull();
  });

  it("returns null for an item missing a title", () => {
    const raw = { productId: 1, salePrice: { amount: 10 } };
    expect(normalizeAliExpressItem(raw, "home")).toBeNull();
  });

  it("returns null for a completely malformed item rather than throwing", () => {
    expect(() => normalizeAliExpressItem("not an object", "home")).not.toThrow();
    expect(normalizeAliExpressItem("not an object", "home")).toBeNull();
    expect(normalizeAliExpressItem(null, "home")).toBeNull();
    expect(normalizeAliExpressItem(undefined, "home")).toBeNull();
  });

  it("falls back to parsing a price from the formatted string when amount is absent", () => {
    const raw = { productId: 2, title: "Item", salePrice: { formatted: "$12.50" } };
    const result = normalizeAliExpressItem(raw, "home");
    expect(result?.source.price).toBe(12.5);
  });

  it("falls back to a generic seller label when no store/seller name is present", () => {
    const raw = { productId: 3, title: "Item", salePrice: { amount: 5 }, shipFromCountry: "CN" };
    const result = normalizeAliExpressItem(raw, "home");
    expect(result?.source.supplierName).toContain("CN");
  });

  it("produces a stable supplierExternalId for the same seller name across calls", () => {
    const raw1 = { productId: 1, title: "A", salePrice: { amount: 5 }, storeName: "Acme Co" };
    const raw2 = { productId: 2, title: "B", salePrice: { amount: 7 }, storeName: "Acme Co" };
    const a = normalizeAliExpressItem(raw1, "home");
    const b = normalizeAliExpressItem(raw2, "home");
    expect(a?.source.supplierExternalId).toBe(b?.source.supplierExternalId);
  });

  it("keeps the raw item for downstream storage", () => {
    const raw = { productId: 1, title: "Item", salePrice: { amount: 5 }, sellingPoints: ["fast shipping"] };
    const result = normalizeAliExpressItem(raw, "home");
    expect(result?.source.raw).toMatchObject({ productId: 1 });
  });
});
