import { describe, expect, it } from "vitest";
import { selectShortlist } from "@/server/pipeline/shortlist";

const settings = { enrichmentCutCount: 3, enrichmentMinScore: 50, deepResearchCutCount: 2 };

function candidates(scores: number[]) {
  return scores.map((s, i) => ({ productId: `p${i}`, enrichmentScore: s }));
}

describe("selectShortlist", () => {
  it("drops candidates below the minimum enrichment score", () => {
    const { droppedAtEnrichment, shortlisted, watched } = selectShortlist(candidates([80, 40, 20]), settings);
    expect(droppedAtEnrichment.map((c) => c.productId)).toEqual(["p1", "p2"]);
    expect([...shortlisted, ...watched].map((c) => c.productId)).toEqual(["p0"]);
  });

  it("caps the shortlist pool at enrichmentCutCount", () => {
    const { shortlisted, watched, droppedAtEnrichment } = selectShortlist(
      candidates([90, 85, 80, 75, 70]),
      settings,
    );
    expect(shortlisted.length + watched.length).toBe(settings.enrichmentCutCount);
    expect(droppedAtEnrichment.length).toBe(2);
  });

  it("caps deep research at deepResearchCutCount, the rest become watched", () => {
    const { shortlisted, watched } = selectShortlist(candidates([90, 85, 80, 75]), settings);
    expect(shortlisted.length).toBe(settings.deepResearchCutCount);
    expect(watched.length).toBe(settings.enrichmentCutCount - settings.deepResearchCutCount);
  });

  it("ranks by enrichment score descending regardless of input order", () => {
    const { shortlisted } = selectShortlist(candidates([60, 95, 70]), settings);
    expect(shortlisted[0].productId).toBe("p1"); // score 95
  });

  it("handles fewer candidates than the caps gracefully", () => {
    const { shortlisted, watched, droppedAtEnrichment } = selectShortlist(candidates([90]), settings);
    expect(shortlisted).toHaveLength(1);
    expect(watched).toHaveLength(0);
    expect(droppedAtEnrichment).toHaveLength(0);
  });

  it("handles an empty candidate list", () => {
    const result = selectShortlist(candidates([]), settings);
    expect(result.shortlisted).toHaveLength(0);
    expect(result.watched).toHaveLength(0);
    expect(result.droppedAtEnrichment).toHaveLength(0);
  });
});
