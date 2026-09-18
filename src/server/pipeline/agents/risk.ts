import { AgentType, TaskType } from "@prisma/client";
import { callAgentModel } from "@/server/pipeline/agents/shared";
import { AgentContext, AgentOutput, ProductBundle } from "@/server/pipeline/agents/types";
import { riskFindingsSchema, RiskFindings } from "@/server/pipeline/agents/schemas";
import { ComplianceRiskLevel } from "@/server/pipeline/filter";

// Compliance risk itself is decided deterministically by
// classifyComplianceRisk() (see filter.ts) from the excluded/high-risk
// category lists — that classification is never overridden by the model.
// The LLM call here only fills in the residual judgement calls a rule
// table can't: IP risk, return-risk estimate, and free-text flags.
export async function runRiskAgent(
  bundle: ProductBundle,
  ctx: AgentContext,
  deterministicComplianceRisk: ComplianceRiskLevel,
): Promise<AgentOutput<RiskFindings>> {
  const { findings, modelTier, costEur } = await callAgentModel({
    ctx,
    agentType: AgentType.RISK,
    taskType: TaskType.CLASSIFICATION,
    productId: bundle.id,
    systemPrompt:
      "You are the Risk Agent for MoneyScouter, covering EU/Dutch e-commerce compliance (CE, " +
      "GPSR, product safety, consumer/return rights, IP infringement) and operational return risk. " +
      "Respond with strict JSON only.",
    userPromptSummary: `Product: "${bundle.title}" (category: ${bundle.category}). Deterministic compliance pre-check: ${deterministicComplianceRisk}.`,
    mockContext: {
      title: bundle.title,
      category: bundle.category,
      highRiskCategory: deterministicComplianceRisk === "HIGH",
    },
    schema: riskFindingsSchema,
  });

  // Deterministic rule wins over the model's own compliance guess — an LLM
  // should never be able to silently soften a hard policy flag.
  const merged: RiskFindings = {
    ...findings,
    complianceRisk: deterministicComplianceRisk.toLowerCase() as RiskFindings["complianceRisk"],
  };
  return { summary: merged.summary, findings: merged, modelTier, costEur };
}
