import { ModelTier } from "@prisma/client";

// EUR per 1,000,000 tokens. Deliberately modest, cheap-model-first pricing —
// tune per real provider once one is wired in. Router + Cost Controller
// never hardcode a price anywhere else.
export const MODEL_PRICING: Record<
  ModelTier,
  { inputPerMillionEur: number; outputPerMillionEur: number }
> = {
  CHEAP: { inputPerMillionEur: 0.15, outputPerMillionEur: 0.6 },
  STANDARD: { inputPerMillionEur: 1.0, outputPerMillionEur: 5.0 },
  STRONG: { inputPerMillionEur: 3.0, outputPerMillionEur: 15.0 },
};

export function estimateCostEur(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[tier];
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillionEur +
    (outputTokens / 1_000_000) * pricing.outputPerMillionEur;
  // Keep micro-euro precision internally; UI rounds for display.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// Rough token estimate from prompt text, used to check budget *before*
// spending anything. A real provider call afterwards reports actual usage.
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
