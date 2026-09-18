import { z } from "zod";

// Structured output contracts for every agent. The mock model provider
// fabricates data conforming to these; a real provider's output would be
// validated against the same schemas before being trusted — "extraction"
// is never taken on faith, mock or real.

export const marketFindingsSchema = z.object({
  demandLevel: z.enum(["low", "medium", "high"]),
  trendDirection: z.enum(["rising", "stable", "declining"]),
  searchInterestScore: z.number().min(0).max(100),
  seasonality: z.string(),
  targetSegments: z.array(z.string()).min(1),
  summary: z.string(),
});
export type MarketFindings = z.infer<typeof marketFindingsSchema>;

export const competitorFindingsSchema = z.object({
  competitorCount: z.number().int().min(0),
  priceRangeMinEur: z.number().min(0),
  priceRangeMaxEur: z.number().min(0),
  dominantChannel: z.enum(["marketplace", "branded-stores", "mixed"]),
  competitorQuality: z.enum(["low", "medium", "high"]),
  positioningNotes: z.string(),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        priceEur: z.number().min(0),
        positioning: z.string(),
      }),
    )
    .min(1),
  summary: z.string(),
});
export type CompetitorFindings = z.infer<typeof competitorFindingsSchema>;

export const brandFindingsSchema = z.object({
  brandabilityScore: z.number().min(0).max(100),
  idealCustomer: z.string(),
  problemSolved: z.string(),
  emotionalHook: z.string(),
  functionalHook: z.string(),
  canBundle: z.boolean(),
  canAddPackagingValue: z.boolean(),
  repeatPurchasePotential: z.enum(["low", "medium", "high"]),
  upsellIdeas: z.array(z.string()),
  summary: z.string(),
});
export type BrandFindings = z.infer<typeof brandFindingsSchema>;

export const angleSchema = z.object({
  name: z.string(),
  targetAudience: z.string(),
  problem: z.string(),
  promise: z.string(),
  positioning: z.string(),
  whyBuy: z.string(),
  pricePosition: z.string(),
  brandFeel: z.string(),
  adHook: z.string(),
  landingPageHook: z.string(),
});
export type Angle = z.infer<typeof angleSchema>;

export const angleFindingsSchema = z.object({
  angles: z.array(angleSchema).min(3).max(5),
  summary: z.string(),
});
export type AngleFindings = z.infer<typeof angleFindingsSchema>;

export const riskFindingsSchema = z.object({
  complianceRisk: z.enum(["low", "medium", "high"]),
  flags: z.array(z.string()),
  ipRisk: z.enum(["low", "medium", "high"]),
  returnRiskEstimatePercent: z.number().min(0).max(100),
  summary: z.string(),
});
export type RiskFindings = z.infer<typeof riskFindingsSchema>;

export const skepticFindingsSchema = z.object({
  verdictLean: z.enum(["kill", "caution", "proceed"]),
  strongestObjection: z.string(),
  objections: z.array(z.string()).min(1),
  commoditizationRisk: z.enum(["low", "medium", "high"]),
  counterEvidence: z.array(z.string()),
  summary: z.string(),
});
export type SkepticFindings = z.infer<typeof skepticFindingsSchema>;

export const judgeNarrativeSchema = z.object({
  why: z.array(z.string()).min(1),
  concerns: z.array(z.string()),
  nextStep: z.string(),
});
export type JudgeNarrative = z.infer<typeof judgeNarrativeSchema>;

// Margin and Supplier are deterministic code, not LLM output — see
// docs/ARCHITECTURE.md section C — but still get typed "findings" shapes
// so they render on the Opportunity page like every other agent.
export const marginFindingsSchema = z.object({
  buyPriceEur: z.number(),
  shippingCostEur: z.number(),
  sellingPriceEur: z.number(),
  vatRatePercent: z.number(),
  transactionFeePercent: z.number(),
  fulfillmentCostEur: z.number(),
  returnRatePercent: z.number(),
  scenarios: z.object({
    bad: z.object({ contributionMarginEur: z.number(), marginPercent: z.number() }),
    base: z.object({ contributionMarginEur: z.number(), marginPercent: z.number() }),
    good: z.object({ contributionMarginEur: z.number(), marginPercent: z.number() }),
  }),
  summary: z.string(),
});
export type MarginFindings = z.infer<typeof marginFindingsSchema>;

export const supplierFindingsSchema = z.object({
  supplierCount: z.number().int().min(0),
  bestSupplier: z.object({
    name: z.string(),
    priceEur: z.number(),
    rating: z.number(),
    shippingDays: z.number(),
    moq: z.number(),
  }),
  priceSpreadEur: z.number(),
  leadTimeDaysMin: z.number(),
  leadTimeDaysMax: z.number(),
  supplierQualityScore: z.number().min(0).max(10),
  summary: z.string(),
});
export type SupplierFindings = z.infer<typeof supplierFindingsSchema>;
