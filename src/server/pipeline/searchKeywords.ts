import { prisma } from "@/server/db";

// Configurable search-theme system (Alibaba sourcing migration). Editable
// from Settings; these are the seeded starting point. Deliberately
// problem/use-case phrased rather than generic category names ("gadgets",
// "electronics") — MoneyScouter is looking for scalable/private-label-
// suitable products with real consumer benefit, not cheap random
// electronics, and explicitly avoids regulated/high-risk categories.
const DEFAULT_TOPICS: { name: string; keywords: string[] }[] = [
  {
    name: "home-organization",
    keywords: ["collapsible storage organizer", "under bed storage box", "kitchen drawer organizer set"],
  },
  {
    name: "travel",
    keywords: ["travel packing cubes set", "luggage organizer accessories", "compression travel bag"],
  },
  {
    name: "fitness-recovery",
    keywords: ["resistance bands set", "muscle recovery foam roller", "yoga mat non slip"],
  },
  {
    name: "pets",
    keywords: ["dog travel carrier bag", "pet grooming brush set", "pet food storage container"],
  },
  {
    name: "car",
    keywords: ["car trunk organizer", "car seat back organizer", "car interior cleaning kit"],
  },
  {
    name: "work-productivity",
    keywords: ["desk cable management organizer", "ergonomic laptop stand", "home office storage organizer"],
  },
  {
    name: "parents-family",
    keywords: ["kids travel organizer bag", "baby travel storage bag", "family closet organizer set"],
  },
  {
    name: "outdoor",
    keywords: ["camping storage organizer", "portable outdoor gear organizer", "outdoor travel backpack"],
  },
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
