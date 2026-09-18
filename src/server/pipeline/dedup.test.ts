import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { upsertDiscoveredProduct } from "@/server/pipeline/dedup";
import { DiscoveredProduct } from "@/server/providers/discovery/types";

// Integration test against the real (local dev) Postgres database — proves
// the fingerprint lookup + write path end-to-end, not just the pure hash
// function. Uses a supplier platform unique to this test file so it never
// collides with the mock discovery catalog's "mock" platform, and cleans
// up everything it creates.

const TEST_PLATFORM = "vitest-dedup";

function item(overrides: Partial<DiscoveredProduct["source"]> = {}): DiscoveredProduct {
  return {
    title: "Test Foldable Backpack",
    category: "travel-bags",
    source: {
      supplierPlatform: TEST_PLATFORM,
      supplierName: "Vitest Supplier Co.",
      supplierExternalId: "vitest-supplier-1",
      supplierProductId: "VITEST-SP-001",
      price: 14,
      currency: "EUR",
      shippingCost: 2,
      shippingDays: 12,
      rating: 4.5,
      reviewCount: 500,
      orderCount: 2000,
      weightGrams: 800,
      moq: 1,
      ...overrides,
    },
  };
}

async function cleanup() {
  await prisma.product.deleteMany({ where: { sources: { some: { supplier: { platform: TEST_PLATFORM } } } } });
  await prisma.supplier.deleteMany({ where: { platform: TEST_PLATFORM } });
}

describe("upsertDiscoveredProduct (integration)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("creates a new Product + ProductSource + fingerprint for an unseen item", async () => {
    const result = await upsertDiscoveredProduct(item());
    expect(result.outcome).toBe("NEW");

    const product = await prisma.product.findUnique({
      where: { id: result.productId },
      include: { fingerprints: true, sources: true },
    });
    expect(product).not.toBeNull();
    expect(product!.fingerprints).toHaveLength(1);
    expect(product!.sources).toHaveLength(1);
    expect(Number(product!.sources[0].price)).toBe(14);
  });

  it("classifies the exact same item as SEEN_BEFORE on a second pass", async () => {
    const first = await upsertDiscoveredProduct(item());
    const second = await upsertDiscoveredProduct(item());
    expect(second.outcome).toBe("SEEN_BEFORE");
    expect(second.productId).toBe(first.productId);

    const productCount = await prisma.product.count({
      where: { sources: { some: { supplierProductId: "VITEST-SP-001" } } },
    });
    expect(productCount).toBe(1); // never creates a duplicate Product
  });

  it("classifies a >=5% price change as UPDATED and records price history", async () => {
    const first = await upsertDiscoveredProduct(item({ price: 20 }));
    const second = await upsertDiscoveredProduct(item({ price: 25 })); // +25%
    expect(second.outcome).toBe("UPDATED");
    expect(second.productId).toBe(first.productId);

    const history = await prisma.priceHistory.findMany({
      where: { productSource: { productId: first.productId } },
      orderBy: { observedAt: "asc" },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(Number(history[history.length - 1].price)).toBe(25);
  });

  it("classifies a <5% price change as SEEN_BEFORE without touching price", async () => {
    const first = await upsertDiscoveredProduct(item({ price: 20 }));
    const second = await upsertDiscoveredProduct(item({ price: 20.5 })); // +2.5%
    expect(second.outcome).toBe("SEEN_BEFORE");
    expect(second.priceEur).toBe(20);

    void first;
  });

  it("treats a different supplierProductId as a distinct NEW product", async () => {
    const a = await upsertDiscoveredProduct(item({ supplierProductId: "VITEST-SP-A" }));
    const b = await upsertDiscoveredProduct(item({ supplierProductId: "VITEST-SP-B" }));
    expect(a.outcome).toBe("NEW");
    expect(b.outcome).toBe("NEW");
    expect(a.productId).not.toBe(b.productId);
  });
});
