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
  const [budget, filterThresholds, scoringWeights, shortlist] = await Promise.all([
    getSetting(SETTINGS.budget),
    getSetting(SETTINGS.filterThresholds),
    getSetting(SETTINGS.scoringWeights),
    getSetting(SETTINGS.shortlist),
  ]);
  return { budget, filterThresholds, scoringWeights, shortlist };
}
