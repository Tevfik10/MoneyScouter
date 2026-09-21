import { ProductBundle, ProductSourceSummary } from "@/server/pipeline/agents/types";
import { clamp, round } from "@/server/pipeline/agentsDeterministic/shared";

// Supplier Agent V2 (zero AI) — the same physical PRODUCT CONCEPT is
// routinely offered by several different Alibaba suppliers (see dedup.ts's
// concept matching); this agent looks across ALL of them, not just the
// cheapest, to judge how sourceable and de-risked the concept is: how many
// suppliers, how many are verified/trade-assured, and whether relying on
// one supplier is a concentration risk. The 0-100 SUPPLIER SCORE is a
// transparent additive rubric (see scoreBreakdown) — never an opaque
// number. No LLM call anywhere in this file.

const PRIVATE_LABEL_KEYWORDS = ["oem", "odm", "private label", "custom logo", "customized logo", "customization", "white label"];

export type SupplierDiversity = "single" | "few" | "diverse";
export type SupplierConcentrationRisk = "high" | "medium" | "low";

export interface AlibabaSupplierFindings {
  supplierCount: number;
  bestUnitPriceEur: number;
  lowestMoq: number;
  verifiedSupplierCount: number;
  tradeAssuranceCount: number;
  goldSupplierCount: number;
  avgYearsOnPlatform: number | null;
  avgResponseRatePercent: number | null;
  supplierDiversity: SupplierDiversity;
  supplierConcentrationRisk: SupplierConcentrationRisk;
  /** Keyword-based inference from the listing title/description only — not
   * a confirmed supplier capability. Always verify directly with the
   * supplier before relying on it. */
  privateLabelSignal: boolean;
  customizationSignal: boolean;
  supplierScore: number; // 0-100
  scoreBreakdown: { label: string; points: number }[];
  summary: string;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((a, b) => a + b, 0) / values.length, 1);
}

function detectKeywordSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return PRIVATE_LABEL_KEYWORDS.some((kw) => lower.includes(kw));
}

function diversityAndRisk(supplierCount: number): { diversity: SupplierDiversity; risk: SupplierConcentrationRisk } {
  if (supplierCount <= 1) return { diversity: "single", risk: "high" };
  if (supplierCount <= 3) return { diversity: "few", risk: "medium" };
  return { diversity: "diverse", risk: "low" };
}

export function computeAlibabaSupplier(bundle: ProductBundle): AlibabaSupplierFindings {
  const sources: ProductSourceSummary[] = bundle.sources.length > 0 ? bundle.sources : [bundle.bestSource];
  const supplierCount = sources.length;
  const best = sources.reduce((a, b) => (a.priceEur <= b.priceEur ? a : b));
  const lowestMoq = Math.min(...sources.map((s) => s.moq));
  const verifiedSupplierCount = sources.filter((s) => s.supplierVerified).length;
  const tradeAssuranceCount = sources.filter((s) => s.supplierTradeAssurance).length;
  const goldSupplierCount = sources.filter((s) => s.supplierGold).length;
  const avgYearsOnPlatform = average(sources.map((s) => s.supplierYearsOnPlatform).filter((v): v is number => v != null));
  const avgResponseRatePercent = average(
    sources.map((s) => s.supplierResponseRatePercent).filter((v): v is number => v != null),
  );

  const { diversity: supplierDiversity, risk: supplierConcentrationRisk } = diversityAndRisk(supplierCount);

  const signalText = `${bundle.title} ${bundle.description ?? ""}`;
  const privateLabelSignal = detectKeywordSignal(signalText);
  const customizationSignal = privateLabelSignal; // same keyword set, same inference

  const scoreBreakdown: { label: string; points: number }[] = [{ label: "baseline", points: 50 }];

  if (supplierCount >= 5) scoreBreakdown.push({ label: `${supplierCount} known supplier offers for this concept`, points: 15 });
  else if (supplierCount >= 3) scoreBreakdown.push({ label: `${supplierCount} known supplier offers for this concept`, points: 10 });
  else if (supplierCount >= 2) scoreBreakdown.push({ label: `${supplierCount} known supplier offers for this concept`, points: 5 });
  else scoreBreakdown.push({ label: "single known supplier — concentration risk", points: -10 });

  const verifiedRatio = verifiedSupplierCount / supplierCount;
  if (verifiedRatio >= 0.5) scoreBreakdown.push({ label: `${verifiedSupplierCount}/${supplierCount} suppliers verified`, points: 15 });
  else if (verifiedSupplierCount >= 1) scoreBreakdown.push({ label: `${verifiedSupplierCount}/${supplierCount} suppliers verified`, points: 8 });
  else scoreBreakdown.push({ label: "no verified suppliers among known offers", points: -10 });

  if (tradeAssuranceCount >= 1) scoreBreakdown.push({ label: `${tradeAssuranceCount} supplier(s) offer Trade Assurance`, points: 10 });
  else scoreBreakdown.push({ label: "no Trade Assurance coverage found", points: -5 });

  if (goldSupplierCount >= 1) scoreBreakdown.push({ label: `${goldSupplierCount} Gold Supplier(s)`, points: 5 });

  if (avgYearsOnPlatform != null) {
    if (avgYearsOnPlatform >= 5) scoreBreakdown.push({ label: `avg ${avgYearsOnPlatform}y on platform`, points: 10 });
    else if (avgYearsOnPlatform >= 2) scoreBreakdown.push({ label: `avg ${avgYearsOnPlatform}y on platform`, points: 5 });
    else scoreBreakdown.push({ label: `avg ${avgYearsOnPlatform}y on platform — young supplier base`, points: -5 });
  }

  if (avgResponseRatePercent != null && avgResponseRatePercent >= 90) {
    scoreBreakdown.push({ label: `avg supplier response rate ${avgResponseRatePercent}%`, points: 5 });
  }

  if (privateLabelSignal) {
    scoreBreakdown.push({ label: "listing text suggests OEM/ODM/private-label availability (keyword match, verify with supplier)", points: 5 });
  }

  const supplierScore = clamp(
    round(
      scoreBreakdown.reduce((sum, l) => sum + l.points, 0),
      0,
    ),
    0,
    100,
  );

  return {
    supplierCount,
    bestUnitPriceEur: best.priceEur,
    lowestMoq,
    verifiedSupplierCount,
    tradeAssuranceCount,
    goldSupplierCount,
    avgYearsOnPlatform,
    avgResponseRatePercent,
    supplierDiversity,
    supplierConcentrationRisk,
    privateLabelSignal,
    customizationSignal,
    supplierScore,
    scoreBreakdown,
    summary: `${supplierCount} known supplier(s), ${verifiedSupplierCount} verified, ${tradeAssuranceCount} with Trade Assurance. Supplier score ${supplierScore}/100, concentration risk ${supplierConcentrationRisk}.`,
  };
}
