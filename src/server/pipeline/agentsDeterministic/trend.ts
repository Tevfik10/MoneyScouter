import { clamp, round } from "@/server/pipeline/agentsDeterministic/shared";

// Trend Agent (V1.1, zero AI) — master spec section 10: "Store a
// TrendScore based only on actual measurable signals. Do not fabricate
// trend data." Every input here is something the pipeline actually
// measured: how many times we've re-discovered this product, its price
// history, its order count, and how many separate market-enrichment
// passes it has shown up in. No demand *interpretation* is attempted —
// that requires judgement a rule table can't fake honestly.

export interface TrendInputs {
  timesSeen: number;
  /** Ascending by observedAt. */
  priceHistory: { price: number }[];
  orderCount: number | null;
  distinctEnrichmentRuns: number;
}

export interface TrendFindings {
  trendScore: number; // 0-10
  priceMovementPercent: number | null;
  appearanceCount: number;
  orderCount: number | null;
  reasons: string[];
  summary: string;
}

export function computeTrendScore(inputs: TrendInputs): TrendFindings {
  let score = 5; // neutral baseline — no signal either way
  const reasons: string[] = [];

  if (inputs.timesSeen >= 5) {
    score += 1;
    reasons.push(`re-discovered ${inputs.timesSeen} times`);
  } else if (inputs.timesSeen >= 3) {
    score += 0.5;
    reasons.push(`re-discovered ${inputs.timesSeen} times`);
  }

  let priceMovementPercent: number | null = null;
  if (inputs.priceHistory.length >= 2) {
    const first = inputs.priceHistory[0].price;
    const last = inputs.priceHistory[inputs.priceHistory.length - 1].price;
    priceMovementPercent = first === 0 ? 0 : round(((last - first) / first) * 100, 1);
    if (priceMovementPercent <= -5) {
      score += 1;
      reasons.push(`supplier price dropped ${Math.abs(priceMovementPercent)}%`);
    } else if (priceMovementPercent >= 15) {
      score -= 1;
      reasons.push(`supplier price rose ${priceMovementPercent}% since first seen`);
    }
  }

  if (inputs.orderCount != null) {
    if (inputs.orderCount >= 10000) {
      score += 2;
      reasons.push(`${inputs.orderCount.toLocaleString()} orders recorded`);
    } else if (inputs.orderCount >= 2000) {
      score += 1.5;
      reasons.push(`${inputs.orderCount.toLocaleString()} orders recorded`);
    } else if (inputs.orderCount >= 500) {
      score += 0.5;
    } else if (inputs.orderCount < 50) {
      score -= 1;
      reasons.push("very low order count at source");
    }
  }

  if (inputs.distinctEnrichmentRuns > 1) {
    score += 0.5;
    reasons.push(`appears in ${inputs.distinctEnrichmentRuns} separate market scans`);
  }

  score = clamp(Math.round(score), 0, 10);

  return {
    trendScore: score,
    priceMovementPercent,
    appearanceCount: inputs.timesSeen,
    orderCount: inputs.orderCount,
    reasons,
    summary: reasons.length > 0 ? reasons.join("; ") : "Not enough repeat-observation history yet for a trend signal.",
  };
}
