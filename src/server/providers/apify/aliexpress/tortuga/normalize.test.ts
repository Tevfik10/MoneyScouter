import { describe, expect, it } from "vitest";
import { normalizeTortugaItem } from "@/server/providers/apify/aliexpress/tortuga/normalize";

describe("normalizeTortugaItem", () => {
  const keywordToCategory = new Map([
    ["bluetooth speaker", "gadgets"],
    ["yoga mat", "fitness"],
  ]);

  it("normalizes a well-formed item and resolves category from its searchTerm", () => {
    const raw = {
      productId: "1005012918250674",
      title: "Ortizan Bluetooth Speakers 40W TWS Portable",
      url: "https://www.aliexpress.com/item/1005012918250674.html",
      price: 23.47,
      originalPrice: 79.86,
      currency: "USD",
      rating: 4.9,
      ordersCount: 16539,
      imageUrl: "https://img.example/1.jpg",
      store: { name: "Ortizan EU Store", rating: 4.9 },
      searchTerm: "bluetooth speaker",
    };

    const result = normalizeTortugaItem(raw, keywordToCategory, "fallback");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("gadgets");
    expect(result!.title).toBe(raw.title);
    expect(result!.source.price).toBe(23.47);
    expect(result!.source.oldPrice).toBe(79.86);
    expect(result!.source.discountPercent).toBe(71); // (79.86-23.47)/79.86
    expect(result!.source.supplierName).toBe("Ortizan EU Store");
    expect(result!.source.orderCount).toBe(16539);
  });

  it("falls back to the fallback category when searchTerm is missing or unrecognized", () => {
    const raw = { productId: 1, title: "Item", price: 5 };
    const result = normalizeTortugaItem(raw, keywordToCategory, "fallback-category");
    expect(result?.category).toBe("fallback-category");
  });

  it("returns null when price is missing", () => {
    const raw = { productId: 1, title: "Item" };
    expect(normalizeTortugaItem(raw, keywordToCategory, "fallback")).toBeNull();
  });

  it("returns null for malformed input rather than throwing", () => {
    expect(() => normalizeTortugaItem("not an object", keywordToCategory, "fallback")).not.toThrow();
    expect(normalizeTortugaItem(null, keywordToCategory, "fallback")).toBeNull();
  });

  it("falls back to a generic seller label when no store name is present", () => {
    const raw = { productId: 1, title: "Item", price: 5 };
    const result = normalizeTortugaItem(raw, keywordToCategory, "fallback");
    expect(result?.source.supplierName).toContain("unknown store");
  });
});
