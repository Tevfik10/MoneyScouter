import { CostController } from "@/server/ai/costController";
import { PrismaCostStore } from "@/server/ai/prismaCostStore";
import { mockModelProvider } from "@/server/ai/providers/mockModelProvider";
import { getSetting, SETTINGS } from "@/server/settings";

// Default, DB-wired Cost Controller used by the pipeline. Tests use their
// own CostController instance with an in-memory CostStore instead of this
// singleton — see costController.test.ts.
export async function getCostController(): Promise<CostController> {
  const budget = await getSetting(SETTINGS.budget);
  return new CostController(new PrismaCostStore(), mockModelProvider, {
    hardLimitEur: budget.hardLimitEur,
  });
}

export { BudgetExceededError, evaluateBudget } from "@/server/ai/costController";
