import { describe, expect, it } from "vitest";
import { computeTrendScore } from "@/server/pipeline/agentsDeterministic/trend";

describe("computeTrendScore", () => {
  it("gives a neutral score with no signal history", () => {
    const result = computeTrendScore({ timesSeen: 1, priceHistory: [], orderCount: null, distinctEnrichmentRuns: 0 });
    expect(result.trendScore).toBe(5);
    expect(result.reasons).toHaveLength(0);
  });

  it("scores higher for high order count and repeat sightings", () => {
    const result = computeTrendScore({
      timesSeen: 6,
      priceHistory: [{ price: 10 }, { price: 9 }],
      orderCount: 12000,
      distinctEnrichmentRuns: 2,
    });
    expect(result.trendScore).toBeGreaterThan(7);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("penalizes a rising price and very low order count", () => {
    const result = computeTrendScore({
      timesSeen: 1,
      priceHistory: [{ price: 10 }, { price: 12 }],
      orderCount: 10,
      distinctEnrichmentRuns: 0,
    });
    expect(result.trendScore).toBeLessThan(5);
  });

  it("computes price movement percent correctly", () => {
    const result = computeTrendScore({
      timesSeen: 1,
      priceHistory: [{ price: 20 }, { price: 15 }],
      orderCount: null,
      distinctEnrichmentRuns: 0,
    });
    expect(result.priceMovementPercent).toBeCloseTo(-25, 1);
  });

  it("never fabricates a score outside 0-10", () => {
    const veryStrong = computeTrendScore({
      timesSeen: 100,
      priceHistory: [{ price: 100 }, { price: 1 }],
      orderCount: 999999,
      distinctEnrichmentRuns: 10,
    });
    expect(veryStrong.trendScore).toBeLessThanOrEqual(10);
    const veryWeak = computeTrendScore({
      timesSeen: 0,
      priceHistory: [{ price: 1 }, { price: 100 }],
      orderCount: 0,
      distinctEnrichmentRuns: 0,
    });
    expect(veryWeak.trendScore).toBeGreaterThanOrEqual(0);
  });
});
