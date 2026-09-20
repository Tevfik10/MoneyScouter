import { prisma } from "@/server/db";

export async function getProductDetail(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { sources: { include: { supplier: true }, orderBy: { price: "asc" } } },
  });
  if (!product) return null;

  const latestScore = await prisma.score.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: { researchRun: { select: { mode: true } } },
  });

  const agentResults = latestScore
    ? await prisma.agentResult.findMany({
        where: { productId, researchRunId: latestScore.researchRunId },
        orderBy: { startedAt: "asc" },
      })
    : [];

  const decisions = await prisma.decision.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const aiCalls = latestScore
    ? await prisma.aiCall.findMany({
        where: { productId, researchRunId: latestScore.researchRunId },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const apifyCalls = latestScore
    ? await prisma.apifyCall.findMany({
        where: { researchRunId: latestScore.researchRunId },
        orderBy: { startedAt: "asc" },
      })
    : [];

  const competitorSightings = latestScore
    ? await prisma.competitorSighting.findMany({
        where: { productId, researchRunId: latestScore.researchRunId },
        include: { competitor: true },
        orderBy: { matchConfidence: "desc" },
      })
    : [];

  const watchlistEntry = await prisma.watchlist.findUnique({ where: { productId } });

  return {
    product,
    latestScore,
    agentResults,
    decisions,
    aiCalls,
    apifyCalls,
    competitorSightings,
    watchlistEntry,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
