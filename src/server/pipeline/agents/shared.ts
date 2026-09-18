import { AgentType, ModelTier, TaskType } from "@prisma/client";
import { z } from "zod";
import { AgentContext } from "@/server/pipeline/agents/types";

/**
 * Every LLM-backed agent goes through this helper: it builds the prompt,
 * spends through the Cost Controller (which enforces the daily budget),
 * and validates the response against the agent's own zod schema before
 * anything downstream trusts it — true for the mock provider today and
 * for a real provider's output tomorrow.
 */
export async function callAgentModel<T>(params: {
  ctx: AgentContext;
  agentType: AgentType;
  taskType: TaskType;
  productId: string;
  systemPrompt: string;
  userPromptSummary: string;
  mockContext: Record<string, unknown>;
  schema: z.ZodType<T>;
}): Promise<{ findings: T; modelTier: ModelTier; costEur: number }> {
  const seed = `${params.ctx.researchRunId}:${params.productId}`;
  const userPrompt = `${params.userPromptSummary}\n---CONTEXT---\n${JSON.stringify(params.mockContext)}`;

  const { output, costEur, tier } = await params.ctx.costController.spend({
    taskType: params.taskType,
    systemPrompt: params.systemPrompt,
    userPrompt,
    researchRunId: params.ctx.researchRunId,
    productId: params.productId,
    agentType: params.agentType,
    mock: { agentType: params.agentType, seed },
  });

  const parsed = params.schema.parse(JSON.parse(output.content));
  return { findings: parsed, modelTier: tier, costEur };
}
