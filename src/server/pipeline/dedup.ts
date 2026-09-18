import { prisma } from "@/server/db";
import { DiscoveredProduct } from "@/server/providers/discovery/types";
import { computeFingerprint, isMeaningfulPriceChange, normalizeTitle } from "@/server/pipeline/fingerprint";

export type DedupOutcome = "NEW" | "SEEN_BEFORE" | "UPDATED";

export interface DedupResult {
  productId: string;
  productSourceId: string;
  outcome: DedupOutcome;
  priceEur: number;
}

async function upsertSupplier(source: DiscoveredProduct["source"]) {
  return prisma.supplier.upsert({
    where: { platform_externalId: { platform: source.supplierPlatform, externalId: source.supplierExternalId } },
    create: {
      platform: source.supplierPlatform,
      externalId: source.supplierExternalId,
      name: source.supplierName,
      rating: source.rating,
      url: source.url,
    },
    update: { name: source.supplierName },
  });
}

/**
 * "Never pay twice": looks the discovered item up by fingerprint first.
 * NEW items get a full Product + ProductSource created. Previously-seen
 * items only get a cheap write (price/rating touch-up) if something
 * meaningful actually changed — otherwise it's a no-op besides bumping
 * lastSeenAt. No AI is spent in this function at all.
 */
export async function upsertDiscoveredProduct(discovered: DiscoveredProduct): Promise<DedupResult> {
  const hash = computeFingerprint(discovered.source);
  const existingFingerprint = await prisma.productFingerprint.findUnique({
    where: { hash },
    include: { product: { include: { sources: { include: { supplier: true } } } } },
  });

  if (!existingFingerprint) {
    const supplier = await upsertSupplier(discovered.source);
    const product = await prisma.product.create({
      data: {
        title: discovered.title,
        normalizedTitle: normalizeTitle(discovered.title),
        category: discovered.category,
        description: discovered.description,
        imageUrl: discovered.imageUrl,
        status: "DISCOVERED",
        fingerprints: { create: { hash } },
        sources: {
          create: {
            supplierId: supplier.id,
            supplierProductId: discovered.source.supplierProductId,
            url: discovered.source.url,
            price: discovered.source.price,
            currency: discovered.source.currency,
            shippingCost: discovered.source.shippingCost,
            shippingDays: discovered.source.shippingDays,
            moq: discovered.source.moq,
            reviewCount: discovered.source.reviewCount,
            orderCount: discovered.source.orderCount,
            rating: discovered.source.rating,
            weightGrams: discovered.source.weightGrams,
          },
        },
      },
      include: { sources: true },
    });
    const createdSource = product.sources[0];
    await prisma.priceHistory.create({
      data: { productSourceId: createdSource.id, price: discovered.source.price },
    });
    return { productId: product.id, productSourceId: createdSource.id, outcome: "NEW", priceEur: discovered.source.price };
  }

  const product = existingFingerprint.product;
  await prisma.product.update({ where: { id: product.id }, data: { lastSeenAt: new Date() } });

  const existingSource = product.sources.find(
    (s) =>
      s.supplier.platform === discovered.source.supplierPlatform &&
      s.supplierProductId === discovered.source.supplierProductId,
  );

  if (!existingSource) {
    // Same fingerprint but no matching source row yet (shouldn't normally
    // happen since the fingerprint IS platform+supplierProductId, but
    // handled defensively for future fuzzy-fingerprint scenarios).
    const supplier = await upsertSupplier(discovered.source);
    const created = await prisma.productSource.create({
      data: {
        productId: product.id,
        supplierId: supplier.id,
        supplierProductId: discovered.source.supplierProductId,
        url: discovered.source.url,
        price: discovered.source.price,
        currency: discovered.source.currency,
        shippingCost: discovered.source.shippingCost,
        shippingDays: discovered.source.shippingDays,
        moq: discovered.source.moq,
        reviewCount: discovered.source.reviewCount,
        orderCount: discovered.source.orderCount,
        rating: discovered.source.rating,
        weightGrams: discovered.source.weightGrams,
      },
    });
    await prisma.priceHistory.create({ data: { productSourceId: created.id, price: discovered.source.price } });
    return { productId: product.id, productSourceId: created.id, outcome: "UPDATED", priceEur: discovered.source.price };
  }

  const oldPrice = Number(existingSource.price);
  const newPrice = discovered.source.price;

  if (isMeaningfulPriceChange(oldPrice, newPrice)) {
    await prisma.productSource.update({
      where: { id: existingSource.id },
      data: {
        price: newPrice,
        rating: discovered.source.rating,
        reviewCount: discovered.source.reviewCount,
        orderCount: discovered.source.orderCount,
      },
    });
    await prisma.priceHistory.create({ data: { productSourceId: existingSource.id, price: newPrice } });
    return { productId: product.id, productSourceId: existingSource.id, outcome: "UPDATED", priceEur: newPrice };
  }

  return { productId: product.id, productSourceId: existingSource.id, outcome: "SEEN_BEFORE", priceEur: oldPrice };
}
