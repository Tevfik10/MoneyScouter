import { AgentType, ModelTier, TaskType } from "@prisma/client";

export interface ModelCallInput {
  taskType: TaskType;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  // Mock-only convenience: lets MockModelProvider fabricate believable,
  // deterministic structured output per agent without the provider
  // interface pretending to understand business schemas. A real provider
  // ignores this field entirely.
  mock?: { agentType: AgentType; seed: string };
}

export interface ModelCallOutput {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface ModelProvider {
  id: string;
  run(input: ModelCallInput): Promise<ModelCallOutput>;
}

export interface AiCallRecord {
  researchRunId?: string;
  productId?: string;
  agentType?: AgentType;
  provider: string;
  model: string;
  tier: ModelTier;
  taskType: TaskType;
  inputTokens: number;
  outputTokens: number;
  estimatedCostEur: number;
  promptVersionId?: string;
}

export interface CostStore {
  getSpentTodayEur(): Promise<number>;
  recordCall(entry: AiCallRecord): Promise<void>;
}
