import { prisma } from "@/server/db";
import { DiscoveredProduct } from "@/server/providers/discovery/types";
import {
  CONCEPT_MATCH_MIN_CONFIDENCE,
  computeFingerprint,
  isMeaningfulPriceChange,
  normalizeTitle,
  titleConceptMatchConfidence,
} from "@/server/pipeline/fingerprint";

export type DedupOutcome = "NEW" | "SEEN_BEFORE" | "UPDATED" | "NEW_OFFER";

export interface DedupResult {
  productId: string;
  productSourceId: string;
  outcome: DedupOutcome;
  priceEur: number;
}

/** How many recent same-category products to check for a concept match
 * before giving up and creating a new Product — bounds query cost. */
const CONCEPT_MATCH_CANDIDATE_POOL = 100;

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
    const normalizedTitle = normalizeTitle(discovered.title);
    const supplier = await upsertSupplier(discovered.source);
    const sourceData = {
      supplierId: supplier.id,
      supplierProductId: discovered.source.supplierProductId,
      url: discovered.source.url,
      price: discovered.source.price,
      currency: discovered.source.currency,
      oldPrice: discovered.source.oldPrice,
      discountPercent: discovered.source.discountPercent,
      shippingCost: discovered.source.shippingCost,
      shippingDays: discovered.source.shippingDays,
      moq: discovered.source.moq,
      moqUnit: discovered.source.moqUnit,
      priceMin: discovered.source.priceMin,
      priceMax: discovered.source.priceMax,
      priceTiers: discovered.source.priceTiers as object | undefined,
      certifications: discovered.source.certifications as object | undefined,
      reviewCount: discovered.source.reviewCount,
      orderCount: discovered.source.orderCount,
      rating: discovered.source.rating,
      weightGrams: discovered.source.weightGrams,
      raw: discovered.source.raw as object | undefined,
    };

    // PRODUCT CONCEPT matching: the same physical product is routinely
    // listed by many different Alibaba suppliers, each with their own
    // productId (so the fingerprint above is always "new" for them). Before
    // creating a brand new Product, check whether a recent product in the
    // same category has a confidently-similar title — if so, this is a
    // competing SUPPLIER OFFER on an existing concept, not a new concept.
    // A low-confidence or no match always falls through to creating a new
    // Product — never merged on a guess.
    const candidates = await prisma.product.findMany({
      where: { category: discovered.category },
      orderBy: { lastSeenAt: "desc" },
      take: CONCEPT_MATCH_CANDIDATE_POOL,
      select: { id: true, normalizedTitle: true },
    });
    let bestMatch: { id: string; confidence: number } | null = null;
    for (const candidate of candidates) {
      const confidence = titleConceptMatchConfidence(normalizedTitle, candidate.normalizedTitle);
      if (confidence >= CONCEPT_MATCH_MIN_CONFIDENCE && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = { id: candidate.id, confidence };
      }
    }

    if (bestMatch) {
      const createdSource = await prisma.productSource.create({
        data: { ...sourceData, productId: bestMatch.id, conceptMatchConfidence: bestMatch.confidence },
      });
      await prisma.product.update({
        where: { id: bestMatch.id },
        data: { lastSeenAt: new Date(), timesSeen: { increment: 1 }, fingerprints: { create: { hash } } },
      });
      await prisma.priceHistory.create({
        data: { productSourceId: createdSource.id, price: discovered.source.price },
      });
      return {
        productId: bestMatch.id,
        productSourceId: createdSource.id,
        outcome: "NEW_OFFER",
        priceEur: discovered.source.price,
      };
    }

    const product = await prisma.product.create({
      data: {
        title: discovered.title,
        normalizedTitle,
        category: discovered.category,
        description: discovered.description,
        imageUrl: discovered.imageUrl,
        status: "DISCOVERED",
        discoveryTheme: discovered.discoveryTheme,
        discoveryKeyword: discovered.discoveryKeyword,
        fingerprints: { create: { hash } },
        sources: { create: sourceData },
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
  await prisma.product.update({
    where: { id: product.id },
    data: { lastSeenAt: new Date(), timesSeen: { increment: 1 } },
  });

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
        oldPrice: discovered.source.oldPrice,
        discountPercent: discovered.source.discountPercent,
        shippingCost: discovered.source.shippingCost,
        shippingDays: discovered.source.shippingDays,
        moq: discovered.source.moq,
        moqUnit: discovered.source.moqUnit,
        priceMin: discovered.source.priceMin,
        priceMax: discovered.source.priceMax,
        priceTiers: discovered.source.priceTiers as object | undefined,
        certifications: discovered.source.certifications as object | undefined,
        reviewCount: discovered.source.reviewCount,
        orderCount: discovered.source.orderCount,
        rating: discovered.source.rating,
        weightGrams: discovered.source.weightGrams,
        raw: discovered.source.raw as object | undefined,
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
        oldPrice: discovered.source.oldPrice,
        discountPercent: discovered.source.discountPercent,
        rating: discovered.source.rating,
        reviewCount: discovered.source.reviewCount,
        orderCount: discovered.source.orderCount,
        raw: discovered.source.raw as object | undefined,
      },
    });
    await prisma.priceHistory.create({ data: { productSourceId: existingSource.id, price: newPrice } });
    return { productId: product.id, productSourceId: existingSource.id, outcome: "UPDATED", priceEur: newPrice };
  }

  return { productId: product.id, productSourceId: existingSource.id, outcome: "SEEN_BEFORE", priceEur: oldPrice };
}
