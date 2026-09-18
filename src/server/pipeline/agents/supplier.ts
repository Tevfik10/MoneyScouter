import { SupplierFindings } from "@/server/pipeline/agents/schemas";
import { ProductBundle } from "@/server/pipeline/agents/types";

// Deterministic where possible: the raw data (price, rating, shipping days,
// MOQ) is numeric, not language, so comparing suppliers is a sort, not a
// reasoning task. No LLM call.
export function runSupplierAgent(bundle: ProductBundle): { summary: string; findings: SupplierFindings } {
  const sources = bundle.sources.length > 0 ? bundle.sources : [bundle.bestSource];
  const prices = sources.map((s) => s.priceEur);
  const best = sources.reduce((a, b) => (a.priceEur <= b.priceEur ? a : b));
  const priceSpreadEur = Math.round((Math.max(...prices) - Math.min(...prices)) * 100) / 100;
  const leadTimeDaysMin = Math.min(...sources.map((s) => s.shippingDays));
  const leadTimeDaysMax = Math.max(...sources.map((s) => s.shippingDays));
  const avgRating = sources.reduce((sum, s) => sum + s.rating, 0) / sources.length;
  const supplierQualityScore = Math.round(Math.min(5, avgRating) * 2 * 10) / 10; // rating /5 -> score /10

  const findings: SupplierFindings = {
    supplierCount: sources.length,
    bestSupplier: {
      name: best.supplierName,
      priceEur: best.priceEur,
      rating: best.rating,
      shippingDays: best.shippingDays,
      moq: best.moq,
    },
    priceSpreadEur,
    leadTimeDaysMin,
    leadTimeDaysMax,
    supplierQualityScore,
    summary: `${sources.length} known supplier(s). Best price €${best.priceEur} from ${best.supplierName}, ${best.shippingDays}d shipping, MOQ ${best.moq}.`,
  };
  return { summary: findings.summary, findings };
}
