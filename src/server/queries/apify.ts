import { PrismaApifyCostStore } from "@/server/apify/prismaApifyCostStore";
import { getSetting, SETTINGS } from "@/server/settings";

export async function getApifyBudgetSnapshot() {
  const [budget, spentTodayUsd] = await Promise.all([
    getSetting(SETTINGS.apifyBudget),
    new PrismaApifyCostStore().getSpentTodayUsd(),
  ]);
  return { ...budget, spentTodayUsd };
}
