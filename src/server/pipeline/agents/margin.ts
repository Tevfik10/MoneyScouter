import { MarginFindings } from "@/server/pipeline/agents/schemas";
import { ProductBundle } from "@/server/pipeline/agents/types";

// Pure calculation, no LLM — per docs/ARCHITECTURE.md section C: "if AI is
// not needed, don't use it." Margin economics are arithmetic, not language.

const VAT_RATE_PERCENT = 21; // NL standard rate
const TRANSACTION_FEE_PERCENT = 2.9; // typical payment-processor assumption
const FULFILLMENT_COST_EUR = 2.5; // packaging/handling assumption
const RETURN_RATE_PERCENT = 8; // category-agnostic baseline assumption

function scenario(sellPriceEur: number, buyPriceEur: number, shippingCostEur: number, returnCostMultiplier: number) {
  const vatEur = sellPriceEur - sellPriceEur / (1 + VAT_RATE_PERCENT / 100);
  const netRevenueEur = sellPriceEur - vatEur;
  const transactionFeeEur = sellPriceEur * (TRANSACTION_FEE_PERCENT / 100);
  const returnsCostEur = sellPriceEur * (RETURN_RATE_PERCENT / 100) * returnCostMultiplier;
  const totalCostsEur = buyPriceEur + shippingCostEur + FULFILLMENT_COST_EUR + transactionFeeEur + returnsCostEur;
  const contributionMarginEur = Math.round((netRevenueEur - totalCostsEur) * 100) / 100;
  const marginPercent = sellPriceEur > 0 ? Math.round((contributionMarginEur / sellPriceEur) * 1000) / 10 : 0;
  return { contributionMarginEur, marginPercent };
}

export function runMarginAgent(bundle: ProductBundle): { summary: string; findings: MarginFindings } {
  const buyPriceEur = bundle.bestSource.priceEur;
  const shippingCostEur = bundle.bestSource.shippingCostEur;
  const sellingPriceEur = bundle.estimatedSellingPriceEur;

  const bad = scenario(sellingPriceEur * 0.85, buyPriceEur, shippingCostEur, 1.6);
  const base = scenario(sellingPriceEur, buyPriceEur, shippingCostEur, 1.0);
  const good = scenario(sellingPriceEur * 1.15, buyPriceEur, shippingCostEur, 0.6);

  const findings: MarginFindings = {
    buyPriceEur,
    shippingCostEur,
    sellingPriceEur,
    vatRatePercent: VAT_RATE_PERCENT,
    transactionFeePercent: TRANSACTION_FEE_PERCENT,
    fulfillmentCostEur: FULFILLMENT_COST_EUR,
    returnRatePercent: RETURN_RATE_PERCENT,
    scenarios: { bad, base, good },
    summary: `Base case: €${base.contributionMarginEur} contribution margin (${base.marginPercent}%) at €${sellingPriceEur} retail. Range €${bad.contributionMarginEur}-€${good.contributionMarginEur} across bad/good scenarios.`,
  };
  return { summary: findings.summary, findings };
}
