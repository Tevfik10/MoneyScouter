import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { angleFindingsSchema, AngleFindings } from "@/server/pipeline/agents/schemas";

// Only worth running once Brand has already established the product has
// real brandability — see docs/ARCHITECTURE.md section C ("only for
// products that already look promising"). The orchestrator checks this
// before calling the agent at all, so an uninteresting product never pays
// for angle generation.
export const ANGLE_MIN_BRANDABILITY_SCORE = 35;

export async function runAngleAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
  targetSegments: string[],
): Promise<AgentOutput<AngleFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.ANGLE,
    taskType: TaskType.REASONING,
    productId: bundle.id,
    systemPrompt:
      "You are the Angle Agent for MoneyScouter. Generate 3-5 distinct commercial marketing " +
      "angles for the product below. Each angle needs: name, target audience, problem, promise, " +
      "positioning, why-buy, price position, brand feel, ad hook and landing page hook. Angles " +
      "must be genuinely different from each other, not rewordings. Respond with strict JSON only.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}). Candidate segments: ${targetSegments.join(", ")}.`,
    mockContext: {
      title: bundle.title,
      category: bundle.category,
      highRiskCategory: false,
      segments: targetSegments,
    },
    schema: angleFindingsSchema,
  });
  return { summary: findings.summary, findings, modelTier, costEur };
}
