"use server";

import { revalidatePath } from "next/cache";
import { SETTINGS, setSetting } from "@/server/settings";

function num(formData: FormData, key: string): number {
  const v = Number(formData.get(key));
  if (Number.isNaN(v)) throw new Error(`Invalid number for ${key}`);
  return v;
}

function csv(formData: FormData, key: string): string[] {
  return String(formData.get(key) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateBudgetAction(formData: FormData) {
  await setSetting(SETTINGS.budget, {
    dailyTargetEur: num(formData, "dailyTargetEur"),
    hardLimitEur: num(formData, "hardLimitEur"),
  });
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/costs");
}

export async function updateFilterThresholdsAction(formData: FormData) {
  await setSetting(SETTINGS.filterThresholds, {
    minPurchasePriceEur: num(formData, "minPurchasePriceEur"),
    maxPurchasePriceEur: num(formData, "maxPurchasePriceEur"),
    minSellingPriceEur: num(formData, "minSellingPriceEur"),
    maxSellingPriceEur: num(formData, "maxSellingPriceEur"),
    minGrossMarginEur: num(formData, "minGrossMarginEur"),
    preferredGrossMarginEur: num(formData, "preferredGrossMarginEur"),
    preferredMarkupMultiplier: num(formData, "preferredMarkupMultiplier"),
    minSupplierRating: num(formData, "minSupplierRating"),
    minReviewCount: num(formData, "minReviewCount"),
    maxShippingDays: num(formData, "maxShippingDays"),
    maxWeightGrams: num(formData, "maxWeightGrams"),
    excludedCategories: csv(formData, "excludedCategories"),
    highRiskCategories: csv(formData, "highRiskCategories"),
  });
  revalidatePath("/settings");
}

export async function updateScoringWeightsAction(formData: FormData) {
  await setSetting(SETTINGS.scoringWeights, {
    demand: num(formData, "demand"),
    trend: num(formData, "trend"),
    margin: num(formData, "margin"),
    competition: num(formData, "competition"),
    brandability: num(formData, "brandability"),
    marketingAngles: num(formData, "marketingAngles"),
    supplierQuality: num(formData, "supplierQuality"),
    shipping: num(formData, "shipping"),
    operationalEase: num(formData, "operationalEase"),
    risk: num(formData, "risk"),
    highPotentialMin: num(formData, "highPotentialMin"),
    interestingMin: num(formData, "interestingMin"),
    watchMin: num(formData, "watchMin"),
  });
  revalidatePath("/settings");
}

export async function updateShortlistAction(formData: FormData) {
  await setSetting(SETTINGS.shortlist, {
    enrichmentCutCount: num(formData, "enrichmentCutCount"),
    enrichmentMinScore: num(formData, "enrichmentMinScore"),
    deepResearchCutCount: num(formData, "deepResearchCutCount"),
  });
  revalidatePath("/settings");
}

export async function updateApifyBudgetAction(formData: FormData) {
  await setSetting(SETTINGS.apifyBudget, {
    dailyTargetUsd: num(formData, "dailyTargetUsd"),
    hardLimitUsd: num(formData, "hardLimitUsd"),
  });
  revalidatePath("/settings");
  revalidatePath("/costs");
  revalidatePath("/");
}

export async function updateScoutConfigAction(formData: FormData) {
  await setSetting(SETTINGS.scoutConfig, {
    testMode: formData.get("testMode") === "on",
    maxKeywordsPerRun: num(formData, "maxKeywordsPerRun"),
    maxDiscoveryItemsTotal: num(formData, "maxDiscoveryItemsTotal"),
    maxMarketEnrichmentItems: num(formData, "maxMarketEnrichmentItems"),
    testModeApifyBudgetCapUsd: num(formData, "testModeApifyBudgetCapUsd"),
  });
  revalidatePath("/settings");
  revalidatePath("/discover");
}

export async function updateDeterministicScoringWeightsAction(formData: FormData) {
  await setSetting(SETTINGS.deterministicScoringWeights, {
    margin: num(formData, "margin"),
    demand: num(formData, "demand"),
    competition: num(formData, "competition"),
    supplierQuality: num(formData, "supplierQuality"),
    shipping: num(formData, "shipping"),
    marketPriceOpportunity: num(formData, "marketPriceOpportunity"),
    operationalEase: num(formData, "operationalEase"),
    brandability: num(formData, "brandability"),
    risk: num(formData, "risk"),
    highPotentialMin: num(formData, "highPotentialMin"),
    interestingMin: num(formData, "interestingMin"),
    watchMin: num(formData, "watchMin"),
  });
  revalidatePath("/settings");
}

export async function updateInvestmentProfileAction(formData: FormData) {
  await setSetting(SETTINGS.investmentProfile, {
    targetSellingPriceMinEur: num(formData, "targetSellingPriceMinEur"),
    targetSellingPriceMaxEur: num(formData, "targetSellingPriceMaxEur"),
    targetSupplierCostMaxPercent: num(formData, "targetSupplierCostMaxPercent"),
    targetMinGrossMarginEur: num(formData, "targetMinGrossMarginEur"),
    preferredMoqMax: num(formData, "preferredMoqMax"),
    moqPenaltyCeiling: num(formData, "moqPenaltyCeiling"),
    moqHardPenaltyAbove: num(formData, "moqHardPenaltyAbove"),
    preferredInventoryCommitmentEur: num(formData, "preferredInventoryCommitmentEur"),
    acceptableInventoryCommitmentMaxEur: num(formData, "acceptableInventoryCommitmentMaxEur"),
    maxInventoryCommitmentEur: num(formData, "maxInventoryCommitmentEur"),
  });
  revalidatePath("/settings");
}
