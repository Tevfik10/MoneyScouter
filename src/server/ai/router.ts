import { ModelTier, TaskType } from "@prisma/client";

// Model Router: maps a *task type* to a model *tier*, and a tier to a
// concrete provider/model id. This is the only place that knows which
// provider/model backs a tier — swapping providers later means editing
// this file (or, eventually, a Settings row), never touching agent code.

const TASK_TIER: Record<TaskType, ModelTier> = {
  CLASSIFICATION: ModelTier.CHEAP,
  EXTRACTION: ModelTier.CHEAP,
  SUMMARIZATION: ModelTier.CHEAP,
  REASONING: ModelTier.STANDARD,
  JUDGE: ModelTier.STRONG,
};

const TIER_PROVIDER: Record<ModelTier, { provider: string; model: string }> = {
  CHEAP: { provider: "mock", model: "mock-cheap-v1" },
  STANDARD: { provider: "mock", model: "mock-standard-v1" },
  STRONG: { provider: "mock", model: "mock-strong-v1" },
};

export function tierForTask(taskType: TaskType): ModelTier {
  return TASK_TIER[taskType];
}

export function providerForTier(tier: ModelTier): { provider: string; model: string } {
  return TIER_PROVIDER[tier];
}
