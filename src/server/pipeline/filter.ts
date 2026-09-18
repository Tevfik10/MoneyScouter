import { FilterThresholds } from "@/server/settings";

// Stage 1 — deterministic mass filter. Zero AI. Every threshold here is a
// Setting (see src/server/settings.ts), never hardcoded — see
// docs/ARCHITECTURE.md section G item 5.

export interface FilterInput {
  category: string;
  purchasePriceEur: number;
  shippingCostEur: number;
  shippingDays: number;
  supplierRating: number;
  reviewCount: number;
  weightGrams: number;
}

export type FilterVerdict = "PASS" | "REJECT";

export interface FilterOutcome {
  verdict: FilterVerdict;
  reasons: string[];
  estimatedSellingPriceEur: number;
  estimatedMarginEur: number;
}

/**
 * Naive retail-price heuristic used only to decide whether a product is
 * worth spending AI on at all. It is deliberately crude (purchase price x
 * preferred markup) — real competitive pricing comes later from the
 * Competitor Agent. Rejecting here is cheap and reversible in principle;
 * the point is to avoid paying for research on anything that couldn't
 * possibly clear the margin bar even under a generous markup assumption.
 */
export function estimateSellingPriceEur(purchasePriceEur: number, thresholds: FilterThresholds): number {
  return Math.round(purchasePriceEur * thresholds.preferredMarkupMultiplier * 100) / 100;
}

export function runDeterministicFilter(input: FilterInput, thresholds: FilterThresholds): FilterOutcome {
  const reasons: string[] = [];

  if (thresholds.excludedCategories.includes(input.category)) {
    reasons.push(`category "${input.category}" is on the excluded list (policy/compliance)`);
  }

  if (input.purchasePriceEur < thresholds.minPurchasePriceEur || input.purchasePriceEur > thresholds.maxPurchasePriceEur) {
    reasons.push(
      `purchase price €${input.purchasePriceEur.toFixed(2)} outside allowed range €${thresholds.minPurchasePriceEur}-€${thresholds.maxPurchasePriceEur}`,
    );
  }

  const estimatedSellingPriceEur = estimateSellingPriceEur(input.purchasePriceEur, thresholds);
  if (
    estimatedSellingPriceEur < thresholds.minSellingPriceEur ||
    estimatedSellingPriceEur > thresholds.maxSellingPriceEur
  ) {
    reasons.push(
      `estimated selling price €${estimatedSellingPriceEur.toFixed(2)} outside allowed range €${thresholds.minSellingPriceEur}-€${thresholds.maxSellingPriceEur}`,
    );
  }

  const estimatedMarginEur =
    Math.round((estimatedSellingPriceEur - input.purchasePriceEur - input.shippingCostEur) * 100) / 100;
  if (estimatedMarginEur < thresholds.minGrossMarginEur) {
    reasons.push(
      `estimated gross margin €${estimatedMarginEur.toFixed(2)} below minimum €${thresholds.minGrossMarginEur}`,
    );
  }

  if (input.supplierRating < thresholds.minSupplierRating) {
    reasons.push(`supplier rating ${input.supplierRating} below minimum ${thresholds.minSupplierRating}`);
  }

  if (input.reviewCount < thresholds.minReviewCount) {
    reasons.push(`review count ${input.reviewCount} below minimum ${thresholds.minReviewCount}`);
  }

  if (input.shippingDays > thresholds.maxShippingDays) {
    reasons.push(`shipping time ${input.shippingDays} days exceeds maximum ${thresholds.maxShippingDays}`);
  }

  if (input.weightGrams > thresholds.maxWeightGrams) {
    reasons.push(`weight ${input.weightGrams}g exceeds maximum ${thresholds.maxWeightGrams}g`);
  }

  const verdict: FilterVerdict = reasons.length === 0 ? "PASS" : "REJECT";
  if (verdict === "PASS") reasons.push("passes all deterministic thresholds");

  return { verdict, reasons, estimatedSellingPriceEur, estimatedMarginEur };
}

export type ComplianceRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * A product can be commercially interesting AND high compliance risk at
 * the same time — this is deliberately independent of the PASS/REJECT
 * filter verdict above. See docs/ARCHITECTURE.md section G item 5 and the
 * master spec section 5.
 */
export function classifyComplianceRisk(category: string, thresholds: FilterThresholds): ComplianceRiskLevel {
  if (thresholds.excludedCategories.includes(category)) return "HIGH";
  if (thresholds.highRiskCategories.includes(category)) return "HIGH";
  return "LOW";
}
