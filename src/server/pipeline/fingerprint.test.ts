import { describe, expect, it } from "vitest";
import {
  computeFingerprint,
  isMeaningfulPriceChange,
  normalizeTitle,
  priceChangePercent,
} from "@/server/pipeline/fingerprint";

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation and collapses whitespace", () => {
    expect(normalizeTitle("  Foldable  Travel-Backpack, 40L!! ")).toBe("foldable travel backpack 40l");
  });
});

describe("computeFingerprint", () => {
  it("is stable for the same supplier + supplier product id", () => {
    const a = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP123456" });
    const b = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP123456" });
    expect(a).toBe(b);
  });

  it("is case-insensitive on platform and product id", () => {
    const a = computeFingerprint({ supplierPlatform: "AliExpress", supplierProductId: "sp123456" });
    const b = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP123456" });
    expect(a).toBe(b);
  });

  it("differs for a different supplier product id", () => {
    const a = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP123456" });
    const b = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP999999" });
    expect(a).not.toBe(b);
  });

  it("differs for a different supplier platform, same product id", () => {
    const a = computeFingerprint({ supplierPlatform: "aliexpress", supplierProductId: "SP123456" });
    const b = computeFingerprint({ supplierPlatform: "cjdropshipping", supplierProductId: "SP123456" });
    expect(a).not.toBe(b);
  });
});

describe("priceChangePercent / isMeaningfulPriceChange", () => {
  it("treats <5% moves as not meaningful", () => {
    expect(priceChangePercent(10, 10.3)).toBeCloseTo(3, 1);
    expect(isMeaningfulPriceChange(10, 10.3)).toBe(false);
  });

  it("treats >=5% moves as meaningful", () => {
    expect(isMeaningfulPriceChange(10, 9.4)).toBe(true);
    expect(isMeaningfulPriceChange(10, 12)).toBe(true);
  });

  it("handles a zero old price without dividing by zero", () => {
    expect(priceChangePercent(0, 0)).toBe(0);
    expect(priceChangePercent(0, 5)).toBe(100);
  });
});
