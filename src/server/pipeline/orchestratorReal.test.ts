import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentType } from "@prisma/client";
import { prisma } from "@/server/db";
import { DiscoveredProduct } from "@/server/providers/discovery/types";
import { ApifyRunInfo } from "@/server/providers/apify/types";
import { AlibabaSearchResult } from "@/server/providers/apify/alibaba/types";
import { GoogleShoppingListing } from "@/server/providers/apify/googleShopping/types";

// Full mocked end-to-end pipeline test — master spec requirement: trace
// Alibaba products -> Product Concepts -> Supplier Offers -> Dedup ->
// Filter -> Shortlist -> Google Shopping -> Supplier/Competitor/Margin/
// Trend/Risk agents -> Judge -> MoneyScore -> Opportunity -> database,
// and prove every agent actually produces output. NEVER calls a real
// Apify Actor: both discovery (Alibaba) and market enrichment (Google
// Shopping) providers are mocked at the module boundary, and no LLM
// dependency exists on this code path at all (see staticAudit.test.ts).

const fakeRun = (actorId: string): ApifyRunInfo => ({
  runId: "e2e-run",
  actorId,
  status: "SUCCEEDED",
  defaultDatasetId: "e2e-dataset",
  usageTotalUsd: 0,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
});

const CONCEPT_A_PRODUCT_ID = "E2E-DEMO-A";
const CONCEPT_A_SUPPLIER_OFFER_ID = "E2E-DEMO-B";
const CONCEPT_B_PRODUCT_ID = "E2E-DEMO-C";

const DEFAULT_SOURCE: DiscoveredProduct["source"] = {
  supplierPlatform: "alibaba",
  supplierName: "E2E Supplier",
  supplierExternalId: "e2e-supplier",
  supplierProductId: "E2E-DEMO",
  price: 14,
  currency: "USD",
  moq: 100,
  moqUnit: "pieces",
  priceMin: 12,
  priceMax: 16,
  certifications: ["BSCI"],
  reviewCount: 300,
  orderCount: 1200,
  rating: 4.8,
  weightGrams: 900,
  shippingCost: 2,
  shippingDays: 15,
  supplierCountry: "China",
  supplierYearsOnPlatform: 6,
  supplierVerified: true,
  supplierTradeAssurance: true,
};

const DEFAULT_ITEM: Omit<DiscoveredProduct, "source"> = {
  title: "E2E Vacuum Compression Travel Backpack",
  category: "travel",
  discoveryTheme: "travel",
  discoveryKeyword: "compression travel bag",
};

type ItemOverrides = Omit<Partial<DiscoveredProduct>, "source"> & { source: Partial<DiscoveredProduct["source"]> };

function discoveredItem(overrides: ItemOverrides): DiscoveredProduct {
  return {
    ...DEFAULT_ITEM,
    ...overrides,
    source: { ...DEFAULT_SOURCE, ...overrides.source },
  };
}

const mockAlibabaSearch = vi.fn();
const mockGoogleShoppingSearch = vi.fn();

vi.mock("@/server/providers/apify/alibaba/provider", () => ({
  alibabaApifyProvider: {
    id: "alibaba-automation-lab",
    actorId: "automation-lab/alibaba-products-scraper",
    supportsBatching: true,
    search: mockAlibabaSearch,
  },
}));

vi.mock("@/server/providers/apify/googleShopping/provider", () => ({
  GOOGLE_SHOPPING_ACTOR_ID: "chris_coussons/google-shopping-scraper",
  googleShoppingApifyProvider: {
    id: "google-shopping-chris-coussons",
    search: mockGoogleShoppingSearch,
  },
}));

async function cleanup() {
  const products = await prisma.product.findMany({
    where: { sources: { some: { supplierProductId: { in: [CONCEPT_A_PRODUCT_ID, CONCEPT_A_SUPPLIER_OFFER_ID, CONCEPT_B_PRODUCT_ID] } } } },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);
  if (productIds.length > 0) {
    await prisma.decision.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.agentResult.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.score.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.competitorSighting.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.watchlist.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.priceHistory.deleteMany({ where: { productSource: { productId: { in: productIds } } } });
    await prisma.productFingerprint.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.productSource.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  await prisma.supplier.deleteMany({ where: { externalId: { in: ["e2e-supplier", "e2e-supplier-2"] } } });
}

describe("runScoutReal (mocked end-to-end)", () => {
  let originalToken: string | undefined;

  beforeAll(async () => {
    await cleanup();
    // ApifyCostController's client construction requires this to be set,
    // even though both providers below are fully mocked and never touch
    // the network — it is never read by anything that actually runs.
    originalToken = process.env.APIFY_API_TOKEN;
    process.env.APIFY_API_TOKEN = "test-token-never-used";
  });

  afterAll(async () => {
    await cleanup();
    if (originalToken === undefined) delete process.env.APIFY_API_TOKEN;
    else process.env.APIFY_API_TOKEN = originalToken;
  });

  it("traces Alibaba discovery through dedup, filter, shortlist, every deep-research agent, Judge and MoneyScore", async () => {
    const items: DiscoveredProduct[] = [
      // Concept A, supplier offer 1
      discoveredItem({
        title: "E2E Vacuum Compression Travel Backpack",
        category: "travel",
        source: { supplierProductId: CONCEPT_A_PRODUCT_ID, supplierName: "E2E Supplier Alpha", supplierExternalId: "e2e-supplier", price: 14, reviewCount: 300, rating: 4.8 },
      }),
      // Concept A, supplier offer 2 (different supplier + productId, matching title -> same concept)
      discoveredItem({
        title: "E2E Vacuum Compression Travel Backpack Pro",
        category: "travel",
        source: { supplierProductId: CONCEPT_A_SUPPLIER_OFFER_ID, supplierName: "E2E Supplier Beta", supplierExternalId: "e2e-supplier-2", price: 15, reviewCount: 250, rating: 4.6, shippingDays: 18 },
      }),
      // Concept B — unrelated product, distinct concept
      discoveredItem({
        title: "E2E Collapsible Kitchen Drawer Organizer Set",
        category: "home-organization",
        discoveryTheme: "home-organization",
        discoveryKeyword: "kitchen drawer organizer set",
        source: { supplierProductId: CONCEPT_B_PRODUCT_ID, supplierName: "E2E Supplier Gamma", supplierExternalId: "e2e-supplier", price: 12, reviewCount: 200, rating: 4.7, shippingCost: 1.5, shippingDays: 12, weightGrams: 400, moq: 200 },
      }),
    ];

    mockAlibabaSearch.mockImplementation(async (params: { keywords: { keyword: string }[] }): Promise<AlibabaSearchResult> => ({
      items,
      runs: [fakeRun("automation-lab/alibaba-products-scraper")],
      costUsd: 0,
      skippedCount: 0,
      rawItemCount: items.length,
      keywordUsage: params.keywords.map((k) => ({ keyword: k.keyword, itemsReturned: items.length })),
      budgetStopped: false,
    }));

    const listings: GoogleShoppingListing[] = [
      {
        title: "Vacuum Compression Travel Backpack",
        priceValue: 55,
        currency: "EUR",
        merchant: "E2E Merchant BV",
        merchantDomain: "e2e-merchant.nl",
        rating: 4.5,
        reviewCount: 120,
        deliveryText: "2-3 dagen",
        deliveryCost: 0,
        url: "https://example.com/listing",
        position: 1,
      },
    ];
    mockGoogleShoppingSearch.mockImplementation(async () => ({
      listings,
      run: fakeRun("chris_coussons/google-shopping-scraper"),
      costUsd: 0,
    }));

    const { runScoutReal } = await import("@/server/pipeline/orchestratorReal");
    const result = await runScoutReal({ trigger: "manual", testModeOverride: true });

    expect(["COMPLETED", "BUDGET_STOPPED"]).toContain(result.status);
    expect(mockAlibabaSearch).toHaveBeenCalledTimes(1); // one batched Actor run, not one per keyword

    const run = await prisma.researchRun.findUniqueOrThrow({ where: { id: result.runId } });
    expect(run.mode).toBe("APIFY_DETERMINISTIC");
    expect(run.discoveredCount).toBe(3);

    // --- Product Concept + Supplier Offer: two Alibaba listings with a
    // confidently-matching title merge into ONE Product with TWO sources,
    // never silently deleted as duplicates. ---------------------------
    const conceptAOfferA = await prisma.productSource.findFirstOrThrow({
      where: { supplierProductId: CONCEPT_A_PRODUCT_ID },
      include: { product: { include: { sources: true } } },
    });
    expect(conceptAOfferA.product.sources).toHaveLength(2);
    expect(conceptAOfferA.product.sources.map((s) => s.supplierProductId).sort()).toEqual(
      [CONCEPT_A_PRODUCT_ID, CONCEPT_A_SUPPLIER_OFFER_ID].sort(),
    );

    const conceptBOffer = await prisma.productSource.findFirstOrThrow({
      where: { supplierProductId: CONCEPT_B_PRODUCT_ID },
      include: { product: true },
    });
    expect(conceptBOffer.productId).not.toBe(conceptAOfferA.productId);

    // --- Every deep-research agent actually produced output for the
    // shortlisted concept, plus Judge/MoneyScore. ----------------------
    const agentResults = await prisma.agentResult.findMany({
      where: { productId: conceptAOfferA.productId, researchRunId: result.runId },
    });
    const agentTypesPresent = new Set(agentResults.map((a) => a.agentType));
    for (const expected of [AgentType.MARGIN, AgentType.SUPPLIER, AgentType.COMPETITOR, AgentType.TREND, AgentType.RISK, AgentType.JUDGE]) {
      expect(agentTypesPresent.has(expected), `missing AgentResult for ${expected}`).toBe(true);
    }

    const marginResult = agentResults.find((a) => a.agentType === AgentType.MARGIN)!;
    const marginFindings = marginResult.findings as { landedCost?: { totalLandedCostEur: number } };
    expect(marginFindings.landedCost?.totalLandedCostEur).toBeGreaterThan(0);

    const supplierResult = agentResults.find((a) => a.agentType === AgentType.SUPPLIER)!;
    const supplierFindings = supplierResult.findings as { supplierCount?: number; supplierScore?: number };
    expect(supplierFindings.supplierCount).toBe(2); // both offers counted, not just the cheapest
    expect(supplierFindings.supplierScore).toBeGreaterThanOrEqual(0);

    const competitorResult = agentResults.find((a) => a.agentType === AgentType.COMPETITOR)!;
    const competitorFindings = competitorResult.findings as { competitorCount?: number };
    expect(competitorFindings.competitorCount).toBeGreaterThanOrEqual(0);

    const score = await prisma.score.findUniqueOrThrow({
      where: { researchRunId_productId: { researchRunId: result.runId, productId: conceptAOfferA.productId } },
    });
    expect(score.moneyScore).toBeGreaterThanOrEqual(0);
    expect(score.moneyScore).toBeLessThanOrEqual(100);
    expect(score.verdict).toBeDefined();
    expect(score.why.length).toBeGreaterThan(0);

    // --- Never any AliExpress or LLM involvement on this path. --------
    expect(mockGoogleShoppingSearch).toHaveBeenCalled();
    const apifyCalls = await prisma.apifyCall.findMany({ where: { researchRunId: result.runId } });
    for (const call of apifyCalls) {
      expect((call.provider ?? "").toLowerCase()).not.toContain("aliexpress");
      expect(call.actorId.toLowerCase()).not.toContain("aliexpress");
    }
  }, 30_000);
});
