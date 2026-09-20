import { describe, expect, it } from "vitest";
import { normalizeGoogleShoppingListing } from "@/server/providers/apify/googleShopping/normalize";

describe("normalizeGoogleShoppingListing", () => {
  it("normalizes a well-formed listing", () => {
    const raw = {
      productTitle: "Foldable Travel Backpack 40L",
      priceValue: 39.95,
      currencyCode: "EUR",
      merchant: "Bol.com",
      merchantDomain: "bol.com",
      rating: 4.4,
      reviewCount: 210,
      deliveryText: "Free delivery",
      deliveryCost: 0,
      landingPage: "https://bol.com/item/123",
      position: 1,
    };
    const result = normalizeGoogleShoppingListing(raw);
    expect(result).toEqual({
      title: "Foldable Travel Backpack 40L",
      priceValue: 39.95,
      currency: "EUR",
      merchant: "Bol.com",
      merchantDomain: "bol.com",
      rating: 4.4,
      reviewCount: 210,
      deliveryText: "Free delivery",
      deliveryCost: 0,
      url: "https://bol.com/item/123",
      position: 1,
    });
  });

  it("returns null for a listing without a title", () => {
    expect(normalizeGoogleShoppingListing({ priceValue: 10 })).toBeNull();
  });

  it("parses a price string with currency symbol", () => {
    const result = normalizeGoogleShoppingListing({ productTitle: "Item", price: "€24,99" });
    expect(result?.priceValue).toBeCloseTo(24.99, 2);
  });

  it("does not throw on malformed input", () => {
    expect(() => normalizeGoogleShoppingListing("garbage")).not.toThrow();
    expect(normalizeGoogleShoppingListing(null)).toBeNull();
  });
});
