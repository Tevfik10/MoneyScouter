import { prisma } from "@/server/db";

// Configurable search-term system — master spec V1.1 section 4. Editable
// from Settings; these are just the seeded starting point covering the
// spec's example categories, explicitly avoiding regulated/high-risk
// product categories.
const DEFAULT_TOPICS: { name: string; keywords: string[] }[] = [
  { name: "home", keywords: ["smart home organizer", "led motion sensor light", "foldable storage box"] },
  { name: "kitchen", keywords: ["silicone kitchen gadget set", "vegetable chopper", "reusable food storage bags"] },
  { name: "travel", keywords: ["travel packing cubes", "foldable travel backpack", "portable luggage scale"] },
  { name: "fitness", keywords: ["resistance bands set", "adjustable dumbbell", "yoga mat non slip"] },
  { name: "pets", keywords: ["dog harness no pull", "automatic pet feeder", "pet grooming glove"] },
  { name: "car accessories", keywords: ["car trunk organizer", "car phone holder magnetic", "car seat gap filler"] },
  { name: "organization", keywords: ["drawer organizer set", "cable management box", "closet organizer"] },
  { name: "outdoor", keywords: ["camping hammock", "solar led string lights", "portable camping chair"] },
  { name: "office", keywords: ["laptop stand adjustable", "desk cable organizer", "ergonomic wrist rest"] },
  { name: "parenting", keywords: ["baby food storage containers", "kids travel organizer", "baby proofing kit"] },
  { name: "beauty tools", keywords: ["facial roller jade", "led makeup mirror", "hair straightener brush"] },
  { name: "hobby", keywords: ["diamond painting kit", "model building tool set", "sketch drawing kit"] },
  { name: "gadgets", keywords: ["mini projector portable", "wireless charging station", "bluetooth tracker tag"] },
];

export async function ensureDefaultSearchTopics(): Promise<void> {
  const existing = await prisma.searchTopic.count();
  if (existing > 0) return;
  for (const topic of DEFAULT_TOPICS) {
    const created = await prisma.searchTopic.create({ data: { name: topic.name } });
    await prisma.searchKeyword.createMany({
      data: topic.keywords.map((keyword) => ({ topicId: created.id, keyword })),
    });
  }
}

export interface SelectedKeyword {
  id: string;
  keyword: string;
  topicId: string;
  topicName: string;
}

/**
 * Picks up to `limit` enabled keywords from enabled topics, least-recently
 * (or never) used first, so a run cycles through the whole configured
 * keyword pool over time instead of hammering the same few terms.
 */
export async function selectSearchKeywords(limit: number): Promise<SelectedKeyword[]> {
  const rows = await prisma.searchKeyword.findMany({
    where: { enabled: true, topic: { enabled: true } },
    include: { topic: true },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { timesUsed: "asc" }],
    take: limit,
  });
  return rows.map((k) => ({ id: k.id, keyword: k.keyword, topicId: k.topicId, topicName: k.topic.name }));
}

export async function markKeywordUsed(keywordId: string): Promise<void> {
  await prisma.searchKeyword.update({
    where: { id: keywordId },
    data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
  });
}
