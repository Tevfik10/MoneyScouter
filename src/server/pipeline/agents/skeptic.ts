import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { skepticFindingsSchema, SkepticFindings } from "@/server/pipeline/agents/schemas";

// "Assume this product is a bad idea. Find the strongest evidence why." —
// master spec section 10. Runs last among the bull-case specialists and
// reads their structured findings, not raw sources, per
// docs/ARCHITECTURE.md section C.
export async function runSkepticAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
  bullCaseSummary: string,
): Promise<AgentOutput<SkepticFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.SKEPTIC,
    taskType: TaskType.REASONING,
    productId: bundle.id,
    systemPrompt:
      "You are the Skeptic Agent for MoneyScouter. Assume this product is a bad idea and find the " +
      "strongest evidence why: commoditization, cheaper local alternatives, poor reviews, high " +
      "return risk, lack of differentiation, fad risk, supplier risk, shipping problems, weak unit " +
      "economics, legal/compliance issues, strong incumbents. Be genuinely adversarial, not " +
      "balanced. Respond with strict JSON only.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}). Bull case so far: ${bullCaseSummary}`,
    mockContext: { title: bundle.title, category: bundle.category, highRiskCategory: false },
    schema: skepticFindingsSchema,
  });
  return { summary: findings.summary, findings, modelTier, costEur };
}
