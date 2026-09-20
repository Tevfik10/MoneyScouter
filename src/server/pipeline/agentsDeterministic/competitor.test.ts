import { describe, expect, it } from "vitest";
import { computeCompetitorFindings, titleMatchConfidence } from "@/server/pipeline/agentsDeterministic/competitor";
import { GoogleShoppingListing } from "@/server/providers/apify/googleShopping/types";

function listing(overrides: Partial<GoogleShoppingListing> = {}): GoogleShoppingListing {
  return {
    title: "Foldable Travel Backpack 40L",
    priceValue: 39.95,
    currency: "EUR",
    merchant: "Bol.com",
    merchantDomain: "bol.com",
    rating: 4.4,
    reviewCount: 200,
    deliveryText: null,
    deliveryCost: null,
    url: "https://bol.com/x",
    position: 1,
    ...overrides,
  };
}

describe("titleMatchConfidence", () => {
  it("gives a high score for near-identical titles", () => {
    const score = titleMatchConfidence("Foldable Travel Backpack 40L", "Foldable Travel Backpack 40 Liter");
    expect(score).toBeGreaterThan(0.4);
  });

  it("gives a low score for unrelated titles", () => {
    const score = titleMatchConfidence("Foldable Travel Backpack 40L", "Silicone Kitchen Herb Chopper");
    expect(score).toBeLessThan(0.15);
  });

  it("is symmetric", () => {
    const a = titleMatchConfidence("Wireless Ring Light", "Rechargeable Wireless Ring Light Stand");
    const b = titleMatchConfidence("Rechargeable Wireless Ring Light Stand", "Wireless Ring Light");
    expect(a).toBeCloseTo(b, 6);
  });

  it("never exceeds 1 or drops below 0", () => {
    expect(titleMatchConfidence("Same Title", "Same Title")).toBeLessThanOrEqual(1);
    expect(titleMatchConfidence("", "")).toBeGreaterThanOrEqual(0);
  });
});

describe("computeCompetitorFindings", () => {
  it("only counts listings above the minimum match confidence", () => {
    const findings = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Foldable Travel Backpack 40L Carry-On" }),
      listing({ title: "Completely Unrelated Kitchen Gadget" }),
    ]);
    expect(findings.competitorCount).toBe(1);
  });

  it("computes median/lowest/highest/spread over matched listings", () => {
    const findings = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Foldable Travel Backpack 40L", priceValue: 30 }),
      listing({ title: "Foldable Travel Backpack 40L Pro", priceValue: 50 }),
      listing({ title: "Foldable Travel Backpack 40L Mini", priceValue: 40 }),
    ]);
    expect(findings.competitorCount).toBe(3);
    expect(findings.medianMarketPriceEur).toBe(40);
    expect(findings.lowestMarketPriceEur).toBe(30);
    expect(findings.highestMarketPriceEur).toBe(50);
    expect(findings.priceSpreadEur).toBe(20);
  });

  it("reports zero competitors and a null median with no matches, never a fabricated number", () => {
    const findings = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Completely Unrelated Kitchen Gadget" }),
    ]);
    expect(findings.competitorCount).toBe(0);
    expect(findings.medianMarketPriceEur).toBeNull();
  });

  it("scores higher saturation for more matches with a tight price spread", () => {
    const tight = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Foldable Travel Backpack 40L A", priceValue: 40 }),
      listing({ title: "Foldable Travel Backpack 40L B", priceValue: 41 }),
      listing({ title: "Foldable Travel Backpack 40L C", priceValue: 39 }),
      listing({ title: "Foldable Travel Backpack 40L D", priceValue: 40 }),
    ]);
    const sparse = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Foldable Travel Backpack 40L A", priceValue: 20 }),
    ]);
    expect(tight.marketSaturationScore).toBeGreaterThan(sparse.marketSaturationScore);
  });

  it("carries match confidence on every match, never claiming certainty", () => {
    const findings = computeCompetitorFindings("Foldable Travel Backpack 40L", [
      listing({ title: "Foldable Travel Backpack 40L Carry-On" }),
    ]);
    expect(findings.matches[0].matchConfidence).toBeGreaterThan(0);
    expect(findings.matches[0].matchConfidence).toBeLessThanOrEqual(1);
  });
});
