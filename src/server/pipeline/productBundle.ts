import { prisma } from "@/server/db";
import { estimateSellingPriceEur } from "@/server/pipeline/filter";
import { ProductBundle } from "@/server/pipeline/agents/types";
import { getSetting, SETTINGS } from "@/server/settings";

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
      supplierName: best.supplier.name,
      priceEur: Number(best.price),
      shippingCostEur: Number(best.shippingCost ?? 0),
      shippingDays: best.shippingDays ?? 14,
      rating: best.rating ?? 4,
      reviewCount: best.reviewCount ?? 0,
      orderCount: best.orderCount ?? 0,
      moq: best.moq ?? 1,
      weightGrams: best.weightGrams ?? 500,
    },
    sources: product.sources.map((s) => ({
      supplierName: s.supplier.name,
      priceEur: Number(s.price),
      rating: s.rating ?? 4,
      shippingDays: s.shippingDays ?? 14,
      moq: s.moq ?? 1,
    })),
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
