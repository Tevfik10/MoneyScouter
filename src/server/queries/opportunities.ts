import { prisma } from "@/server/db";

/**
 * One row per product: its most recent Score (if any), read across all
 * runs — not just the latest one — so a product researched a few nights
 * ago still shows up here instead of disappearing after one run.
 */
export async function listOpportunities() {
  const products = await prisma.product.findMany({
    where: { currentScore: { not: null } },
    orderBy: { currentScore: "desc" },
    include: {
      sources: { include: { supplier: true }, orderBy: { price: "asc" }, take: 1 },
    },
  });
  return products;
}
