import { ModelTier, TaskType } from "@prisma/client";
import { estimateCostEur, estimateTokens } from "@/server/ai/pricing";
import { providerForTier, tierForTask } from "@/server/ai/router";
import { AiCallRecord, CostStore, ModelCallInput, ModelProvider } from "@/server/ai/types";

export class BudgetExceededError extends Error {
  constructor(
    public readonly wouldTotalEur: number,
    public readonly hardLimitEur: number,
  ) {
    super(
      `AI call blocked: spend would reach €${wouldTotalEur.toFixed(4)}, above the €${hardLimitEur.toFixed(2)} hard daily limit.`,
    );
    this.name = "BudgetExceededError";
  }
}

// Pure decision function — no I/O, trivially unit-testable. This is the
// function the "hard €3.00 budget blocks the next call" test exercises
// directly, and it's also exactly what CostController.spend() calls before
// touching the database or a model provider.
export function evaluateBudget(params: {
  spentTodayEur: number;
  estimatedCostEur: number;
  hardLimitEur: number;
}): { allowed: boolean; wouldTotalEur: number } {
  const wouldTotalEur = round(params.spentTodayEur + params.estimatedCostEur, 6);
  return { allowed: wouldTotalEur <= params.hardLimitEur + 1e-9, wouldTotalEur };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export interface SpendParams {
  taskType: TaskType;
  systemPrompt: string;
  userPrompt: string;
  researchRunId?: string;
  productId?: string;
  agentType?: import("@prisma/client").AgentType;
  promptVersionId?: string;
  mock?: ModelCallInput["mock"];
  maxOutputTokens?: number;
}

export class CostController {
  constructor(
    private readonly store: CostStore,
    private readonly provider: ModelProvider,
    private readonly budget: { hardLimitEur: number },
  ) {}

  /** Estimated tier + cost for a call, without spending anything. */
  estimate(params: Pick<SpendParams, "taskType" | "systemPrompt" | "userPrompt">) {
    const tier = tierForTask(params.taskType);
    const inputTokens = estimateTokens(params.systemPrompt + params.userPrompt);
    // Conservative output estimate: assume output is roughly as large as a
    // typical structured JSON response for this tier.
    const assumedOutputTokens = tier === ModelTier.STRONG ? 400 : tier === ModelTier.STANDARD ? 300 : 200;
    const estimatedCostEur = estimateCostEur(tier, inputTokens, assumedOutputTokens);
    return { tier, inputTokens, assumedOutputTokens, estimatedCostEur };
  }

  async spend(params: SpendParams) {
    const { tier, estimatedCostEur } = this.estimate(params);
    const spentTodayEur = await this.store.getSpentTodayEur();
    const { allowed, wouldTotalEur } = evaluateBudget({
      spentTodayEur,
      estimatedCostEur,
      hardLimitEur: this.budget.hardLimitEur,
    });

    if (!allowed) {
      throw new BudgetExceededError(wouldTotalEur, this.budget.hardLimitEur);
    }

    const { provider: providerId, model } = providerForTier(tier);
    const output = await this.provider.run({
      taskType: params.taskType,
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      maxOutputTokens: params.maxOutputTokens,
      mock: params.mock,
    });

    const actualCostEur = estimateCostEur(tier, output.inputTokens, output.outputTokens);

    const record: AiCallRecord = {
      researchRunId: params.researchRunId,
      productId: params.productId,
      agentType: params.agentType,
      provider: providerId,
      model,
      tier,
      taskType: params.taskType,
      inputTokens: output.inputTokens,
      outputTokens: output.outputTokens,
      estimatedCostEur: actualCostEur,
      promptVersionId: params.promptVersionId,
    };
    await this.store.recordCall(record);

    return { output, costEur: actualCostEur, tier };
  }
}
