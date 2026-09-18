import { ModelCallInput, ModelCallOutput, ModelProvider } from "@/server/ai/types";
import { estimateTokens } from "@/server/ai/pricing";
import { generateMockContent } from "@/server/ai/providers/mockGenerators";

// Deterministic, free, structured stand-in for a real LLM provider. Same
// interface a real Anthropic/OpenAI provider would implement, so callers
// (the Model Router / Cost Controller / agents) never know the difference.
export class MockModelProvider implements ModelProvider {
  id = "mock";

  async run(input: ModelCallInput): Promise<ModelCallOutput> {
    const inputTokens = estimateTokens(input.systemPrompt + input.userPrompt);

    if (!input.mock) {
      // Generic fallback for calls that don't specify an agent-shaped mock
      // context (kept for interface completeness / future direct use).
      const content = JSON.stringify({ note: "mock response", prompt: input.userPrompt.slice(0, 120) });
      return { content, inputTokens, outputTokens: estimateTokens(content), model: "mock-generic" };
    }

    const meta = JSON.parse(input.userPrompt.split("\n---CONTEXT---\n")[1] ?? "{}");
    const generated = generateMockContent(input.mock.agentType, input.mock.seed, meta);
    const content = JSON.stringify(generated);
    return {
      content,
      inputTokens,
      outputTokens: estimateTokens(content),
      model: `mock-${input.mock.agentType.toLowerCase()}`,
    };
  }
}

export const mockModelProvider = new MockModelProvider();
