import { z } from "zod";
import { prisma } from "@/server/db";

// Typed, defaulted accessor over the `Setting` key/value table. Every
// tunable the master spec calls out ("maak dit configureerbaar vanuit
// Settings") lives here instead of being hardcoded in pipeline logic.

const budgetSchema = z.object({
  dailyTargetEur: z.number().positive(),
  hardLimitEur: z.number().positive(),
});
export type BudgetSettings = z.infer<typeof budgetSchema>;
const DEFAULT_BUDGET: BudgetSettings = {
  dailyTargetEur: 2.5,
  hardLimitEur: 3.0,
};

const filterThresholdsSchema = z.object({
  minPurchasePriceEur: z.number().min(0),
  maxPurchasePriceEur: z.number().min(0),
  minSellingPriceEur: z.number().min(0),
  maxSellingPriceEur: z.number().min(0),
  minGrossMarginEur: z.number().min(0),
  preferredGrossMarginEur: z.number().min(0),
  preferredMarkupMultiplier: z.number().min(1),
  minSupplierRating: z.number().min(0).max(5),
  minReviewCount: z.number().min(0),
  maxShippingDays: z.number().min(0),
  maxWeightGrams: z.number().min(0),
  excludedCategories: z.array(z.string()),
  highRiskCategories: z.array(z.string()),
});
export type FilterThresholds = z.infer<typeof filterThresholdsSchema>;
const DEFAULT_FILTER_THRESHOLDS: FilterThresholds = {
  minPurchasePriceEur: 3,
  maxPurchasePriceEur: 40,
  minSellingPriceEur: 25,
  maxSellingPriceEur: 150,
  minGrossMarginEur: 15,
  preferredGrossMarginEur: 25,
  preferredMarkupMultiplier: 2.5,
  minSupplierRating: 4.0,
  minReviewCount: 50,
  maxShippingDays: 20,
  maxWeightGrams: 5000,
  excludedCategories: [
    "medicine",
    "supplements",
    "weapons",
    "counterfeit",
    "hazardous-chemicals",
  ],
  highRiskCategories: ["smart-home", "toys-games"],
};

const scoringWeightsSchema = z.object({
  demand: z.number().min(0),
  trend: z.number().min(0),
  margin: z.number().min(0),
  competition: z.number().min(0),
  brandability: z.number().min(0),
  marketingAngles: z.number().min(0),
  supplierQuality: z.number().min(0),
  shipping: z.number().min(0),
  operationalEase: z.number().min(0),
  risk: z.number().min(0),
  highPotentialMin: z.number().min(0).max(100),
  interestingMin: z.number().min(0).max(100),
  watchMin: z.number().min(0).max(100),
});
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;
const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  demand: 1.4,
  trend: 1.1,
  margin: 1.3,
  competition: 1.0,
  brandability: 1.2,
  marketingAngles: 1.0,
  supplierQuality: 0.8,
  shipping: 0.7,
  operationalEase: 0.6,
  risk: 1.4,
  highPotentialMin: 80,
  interestingMin: 60,
  watchMin: 40,
};

// V1.1 — Apify budget, separate from the AI budget above (master spec
// V1.1 section 13). Defaults match the spec exactly.
const apifyBudgetSchema = z.object({
  dailyTargetUsd: z.number().positive(),
  hardLimitUsd: z.number().positive(),
});
export type ApifyBudgetSettings = z.infer<typeof apifyBudgetSchema>;
const DEFAULT_APIFY_BUDGET: ApifyBudgetSettings = {
  dailyTargetUsd: 1.0,
  hardLimitUsd: 2.0,
};

// V1.1 — Scout run sizing. TEST_SCOUT is the safe default until manually
// changed (master spec V1.1 section 15): small keyword count, capped
// discovery volume, Google Shopping enrichment limited to the shortlist,
// and its own tighter Apify spend cap for this run.
const scoutConfigSchema = z.object({
  testMode: z.boolean(),
  maxKeywordsPerRun: z.number().int().min(1),
  maxDiscoveryItemsTotal: z.number().int().min(1),
  maxMarketEnrichmentItems: z.number().int().min(0),
  testModeApifyBudgetCapUsd: z.number().positive(),
});
export type ScoutConfig = z.infer<typeof scoutConfigSchema>;
const DEFAULT_SCOUT_CONFIG: ScoutConfig = {
  testMode: true,
  // TEST_SCOUT minimum-cost design: start with 1 search theme so real
  // cost-per-product can be established before scaling up.
  maxKeywordsPerRun: 1,
  maxDiscoveryItemsTotal: 100,
  maxMarketEnrichmentItems: 10,
  testModeApifyBudgetCapUsd: 0.5,
};

// Rule-based Judge rubric weights (MoneyScore V2 — Alibaba sourcing
// migration). Deliberately separate from `scoringWeights` (the LLM_MOCK
// mode rubric, which includes brandability/marketing-angle dimensions that
// don't apply without an LLM). Weights sum to 100 by default, but the
// Money Score formula normalizes by the actual weight sum regardless, so
// they don't have to.
const deterministicScoringWeightsSchema = z.object({
  margin: z.number().min(0), // unit economics
  demand: z.number().min(0), // demand signals
  competition: z.number().min(0),
  supplierQuality: z.number().min(0), // supplier strength
  shipping: z.number().min(0), // shipping/logistics
  marketPriceOpportunity: z.number().min(0), // market opportunity
  operationalEase: z.number().min(0), // MOQ / capital efficiency
  brandability: z.number().min(0), // private-label potential
  risk: z.number().min(0),
  highPotentialMin: z.number().min(0).max(100),
  interestingMin: z.number().min(0).max(100),
  watchMin: z.number().min(0).max(100),
});
export type DeterministicScoringWeights = z.infer<typeof deterministicScoringWeightsSchema>;
const DEFAULT_DETERMINISTIC_SCORING_WEIGHTS: DeterministicScoringWeights = {
  margin: 25,
  marketPriceOpportunity: 15,
  demand: 15,
  competition: 10,
  supplierQuality: 10,
  operationalEase: 10,
  shipping: 5,
  brandability: 5,
  risk: 5,
  highPotentialMin: 80,
  interestingMin: 60,
  watchMin: 40,
};

// PRODUCT INVESTMENT PROFILE — what MoneyScouter is looking for when
// sourcing from Alibaba. Drives the Margin/Risk/Judge agents' scoring, not
// hardcoded there. Defaults reflect a cautious first-test posture: modest
// selling price band, low capital exposure, low MOQ preferred.
const investmentProfileSchema = z.object({
  targetSellingPriceMinEur: z.number().min(0),
  targetSellingPriceMaxEur: z.number().min(0),
  // Supplier unit cost should preferably stay under this % of the
  // estimated consumer selling price.
  targetSupplierCostMaxPercent: z.number().min(0).max(100),
  targetMinGrossMarginEur: z.number().min(0),
  // MOQ bands: <= preferredMoqMax is unpenalized, between that and
  // moqPenaltyCeiling is penalized (not rejected), above moqHardPenaltyAbove
  // is a strong negative unless economics are exceptional.
  preferredMoqMax: z.number().int().min(1),
  moqPenaltyCeiling: z.number().int().min(1),
  moqHardPenaltyAbove: z.number().int().min(1),
  // Initial inventory commitment (MOQ x landed cost) bands, in EUR.
  preferredInventoryCommitmentEur: z.number().min(0),
  acceptableInventoryCommitmentMaxEur: z.number().min(0),
  maxInventoryCommitmentEur: z.number().min(0),
});
export type InvestmentProfile = z.infer<typeof investmentProfileSchema>;
const DEFAULT_INVESTMENT_PROFILE: InvestmentProfile = {
  targetSellingPriceMinEur: 35,
  targetSellingPriceMaxEur: 120,
  targetSupplierCostMaxPercent: 30,
  targetMinGrossMarginEur: 25,
  preferredMoqMax: 100,
  moqPenaltyCeiling: 300,
  moqHardPenaltyAbove: 300,
  preferredInventoryCommitmentEur: 1500,
  acceptableInventoryCommitmentMaxEur: 3000,
  maxInventoryCommitmentEur: 3000,
};

const shortlistSchema = z.object({
  enrichmentCutCount: z.number().int().min(1),
  enrichmentMinScore: z.number().min(0).max(100),
  deepResearchCutCount: z.number().int().min(1),
});
export type ShortlistSettings = z.infer<typeof shortlistSchema>;
const DEFAULT_SHORTLIST: ShortlistSettings = {
  enrichmentCutCount: 40,
  enrichmentMinScore: 55,
  deepResearchCutCount: 12,
};

type SettingDef<T> = { key: string; schema: z.ZodType<T>; fallback: T };

export const SETTINGS = {
  budget: { key: "ai_budget", schema: budgetSchema, fallback: DEFAULT_BUDGET },
  filterThresholds: {
    key: "filter_thresholds",
    schema: filterThresholdsSchema,
    fallback: DEFAULT_FILTER_THRESHOLDS,
  },
  scoringWeights: {
    key: "scoring_weights",
    schema: scoringWeightsSchema,
    fallback: DEFAULT_SCORING_WEIGHTS,
  },
  shortlist: { key: "shortlist", schema: shortlistSchema, fallback: DEFAULT_SHORTLIST },
  apifyBudget: { key: "apify_budget", schema: apifyBudgetSchema, fallback: DEFAULT_APIFY_BUDGET },
  scoutConfig: { key: "scout_config", schema: scoutConfigSchema, fallback: DEFAULT_SCOUT_CONFIG },
  deterministicScoringWeights: {
    key: "deterministic_scoring_weights",
    schema: deterministicScoringWeightsSchema,
    fallback: DEFAULT_DETERMINISTIC_SCORING_WEIGHTS,
  },
  investmentProfile: {
    key: "investment_profile",
    schema: investmentProfileSchema,
    fallback: DEFAULT_INVESTMENT_PROFILE,
  },
} as const;

export async function getSetting<T>(def: SettingDef<T>): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key: def.key } });
  if (!row) return def.fallback;
  const parsed = def.schema.safeParse(row.value);
  return parsed.success ? parsed.data : def.fallback;
}

export async function setSetting<T>(def: SettingDef<T>, value: T): Promise<void> {
  const validated = def.schema.parse(value);
  await prisma.setting.upsert({
    where: { key: def.key },
    create: { key: def.key, value: validated as object },
    update: { value: validated as object },
  });
}

export async function getAllSettings() {
  const [
    budget,
    filterThresholds,
    scoringWeights,
    shortlist,
    apifyBudget,
    scoutConfig,
    deterministicScoringWeights,
    investmentProfile,
  ] = await Promise.all([
    getSetting(SETTINGS.budget),
    getSetting(SETTINGS.filterThresholds),
    getSetting(SETTINGS.scoringWeights),
    getSetting(SETTINGS.shortlist),
    getSetting(SETTINGS.apifyBudget),
    getSetting(SETTINGS.scoutConfig),
    getSetting(SETTINGS.deterministicScoringWeights),
    getSetting(SETTINGS.investmentProfile),
  ]);
  return {
    budget,
    filterThresholds,
    scoringWeights,
    shortlist,
    apifyBudget,
    scoutConfig,
    deterministicScoringWeights,
    investmentProfile,
  };
}
