import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { estimateSellingPriceEur } from "@/server/pipeline/filter";
import { ProductBundle, ProductSourceSummary } from "@/server/pipeline/agents/types";
import { getSetting, SETTINGS } from "@/server/settings";

type SourceWithSupplier = Prisma.ProductSourceGetPayload<{ include: { supplier: true } }>;

/** Shapes one ProductSource + its Supplier row into the shared summary DTO
 * — the Alibaba fields are left undefined (never fabricated) whenever the
 * underlying row doesn't have them, e.g. mock/legacy AliExpress data. */
function toSourceSummary(s: SourceWithSupplier): ProductSourceSummary {
  return {
    supplierName: s.supplier.name,
    priceEur: Number(s.price),
    rating: s.rating ?? 4,
    shippingDays: s.shippingDays ?? 14,
    moq: s.moq ?? 1,
    moqUnit: s.moqUnit ?? undefined,
    priceMin: s.priceMin ? Number(s.priceMin) : undefined,
    priceMax: s.priceMax ? Number(s.priceMax) : undefined,
    priceTiers: (s.priceTiers as ProductSourceSummary["priceTiers"]) ?? undefined,
    certifications: (s.certifications as string[] | undefined) ?? undefined,
    supplierCountry: s.supplier.country ?? undefined,
    supplierYearsOnPlatform: s.supplier.yearsOnPlatform ?? undefined,
    supplierVerified: s.supplier.verified ?? undefined,
    supplierGold: s.supplier.goldSupplier ?? undefined,
    supplierAssessed: s.supplier.assessedSupplier ?? undefined,
    supplierTradeAssurance: s.supplier.tradeAssurance ?? undefined,
    supplierResponseRatePercent: s.supplier.responseRatePercent ?? undefined,
    conceptMatchConfidence: s.conceptMatchConfidence ?? undefined,
  };
}

/**
 * Loads a Product + its sources from the DB and shapes them into the
 * ProductBundle every agent reads — the "same structured research bundle"
 * every specialist agent gets, per docs/ARCHITECTURE.md section C.
 */
export async function buildProductBundle(productId: string): Promise<ProductBundle> {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: { sources: { include: { supplier: true } } },
  });
  const thresholds = await getSetting(SETTINGS.filterThresholds);

  const best = product.sources.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
  const estimatedSellingPriceEur = estimateSellingPriceEur(Number(best.price), thresholds);

  return {
    id: product.id,
    title: product.title,
    category: product.category,
    description: product.description,
    estimatedSellingPriceEur,
    bestSource: {
      ...toSourceSummary(best),
      shippingCostEur: Number(best.shippingCost ?? 0),
      reviewCount: best.reviewCount ?? 0,
      orderCount: best.orderCount ?? 0,
      weightGrams: best.weightGrams ?? 500,
    },
    sources: product.sources.map(toSourceSummary),
  };
}

/** The ProductSource.id behind ProductBundle.bestSource — needed for
 * queries keyed by source (e.g. price history) that the bundle DTO itself
 * doesn't carry an id for. */
export async function getBestProductSourceId(productId: string): Promise<string> {
  const sources = await prisma.productSource.findMany({ where: { productId }, orderBy: { price: "asc" }, take: 1 });
  if (sources.length === 0) throw new Error(`Product ${productId} has no sources`);
  return sources[0].id;
}
