import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { marketFindingsSchema, MarketFindings } from "@/server/pipeline/agents/schemas";

export async function runMarketAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
): Promise<AgentOutput<MarketFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.MARKET,
    taskType: TaskType.CLASSIFICATION,
    productId: bundle.id,
    systemPrompt:
      "You are the Market Agent for MoneyScouter, an e-commerce opportunity research tool. " +
      "Assess demand and trend for the product below, for a Dutch/European D2C audience. " +
      "Respond with strict JSON matching the requested schema, no prose outside the JSON.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}). Assess demand level, trend direction, seasonality and likely target segments.`,
    mockContext: { title: bundle.title, category: bundle.category, highRiskCategory: false },
    schema: marketFindingsSchema,
  });
  return { summary: findings.summary, findings, modelTier, costEur };
}
