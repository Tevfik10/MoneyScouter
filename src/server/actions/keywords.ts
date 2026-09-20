"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { ensureDefaultSearchTopics } from "@/server/pipeline/searchKeywords";

export async function ensureDefaultTopicsAction() {
  await ensureDefaultSearchTopics();
  revalidatePath("/settings");
}

export async function toggleTopicEnabledAction(topicId: string, enabled: boolean) {
  await prisma.searchTopic.update({ where: { id: topicId }, data: { enabled } });
  revalidatePath("/settings");
}

export async function toggleKeywordEnabledAction(keywordId: string, enabled: boolean) {
  await prisma.searchKeyword.update({ where: { id: keywordId }, data: { enabled } });
  revalidatePath("/settings");
}

export async function addKeywordAction(formData: FormData) {
  const topicId = String(formData.get("topicId") ?? "");
  const keyword = String(formData.get("keyword") ?? "").trim();
  if (!topicId || !keyword) return;
  await prisma.searchKeyword.upsert({
    where: { topicId_keyword: { topicId, keyword } },
    create: { topicId, keyword },
    update: { enabled: true },
  });
  revalidatePath("/settings");
}

export async function addTopicAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await prisma.searchTopic.upsert({ where: { name }, create: { name }, update: { enabled: true } });
  revalidatePath("/settings");
}

export async function deleteKeywordAction(keywordId: string) {
  await prisma.searchKeyword.delete({ where: { id: keywordId } });
  revalidatePath("/settings");
}
