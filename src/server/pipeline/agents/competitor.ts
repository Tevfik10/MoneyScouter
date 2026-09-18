import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { competitorFindingsSchema, CompetitorFindings } from "@/server/pipeline/agents/schemas";

export async function runCompetitorAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
): Promise<AgentOutput<CompetitorFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.COMPETITOR,
    taskType: TaskType.EXTRACTION,
    productId: bundle.id,
    systemPrompt:
      "You are the Competitor Agent for MoneyScouter. Extract the competitive landscape for the " +
      "product below: number of relevant sellers, price range, dominant channel (marketplace vs " +
      "branded stores) and overall competitor quality. Respond with strict JSON only.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}), our estimated retail price €${bundle.estimatedSellingPriceEur}.`,
    mockContext: { title: bundle.title, category: bundle.category, highRiskCategory: false },
    schema: competitorFindingsSchema,
  });
  return { summary: findings.summary, findings, modelTier, costEur };
}
