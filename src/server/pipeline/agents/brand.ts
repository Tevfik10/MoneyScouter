import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { brandFindingsSchema, BrandFindings } from "@/server/pipeline/agents/schemas";

// The brandability question (master spec section 7): a product must not
// score well just because purchase price x markup looks good. This agent
// asks *why anyone would pay retail here*, not just *can we mark it up*.
export async function runBrandAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
): Promise<AgentOutput<BrandFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.BRAND,
    taskType: TaskType.SUMMARIZATION,
    productId: bundle.id,
    systemPrompt:
      "You are the Brand Agent for MoneyScouter. Do not just say 'buy low, sell high'. Assess " +
      "whether this product can become a believable branded concept: ideal customer, problem " +
      "solved, emotional + functional purchase reasons, bundling/packaging/service potential, " +
      "repeat purchase and upsell potential. Respond with strict JSON only.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}). Why would a European consumer pay retail for this instead of buying the cheapest generic listing?`,
    mockContext: { title: bundle.title, category: bundle.category, highRiskCategory: false },
    schema: brandFindingsSchema,
  });
  return { summary: findings.summary, findings, modelTier, costEur };
}
