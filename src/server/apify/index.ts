import { ApifyCostController } from "@/server/apify/costController";
import { PrismaApifyCostStore } from "@/server/apify/prismaApifyCostStore";
import { getApifyClient } from "@/server/providers/apify/client";
import { getSetting, SETTINGS } from "@/server/settings";

/** Default, DB-wired Apify Cost Controller. Tests use their own instance
 * with a fake store/client instead of this singleton. */
export async function getApifyCostController(): Promise<ApifyCostController> {
  const budget = await getSetting(SETTINGS.apifyBudget);
  return new ApifyCostController(new PrismaApifyCostStore(), getApifyClient(), {
    hardLimitUsd: budget.hardLimitUsd,
  });
}

export { ApifyBudgetExceededError, evaluateApifyBudget } from "@/server/apify/costController";
