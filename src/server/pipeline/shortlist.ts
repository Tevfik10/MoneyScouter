import { ShortlistSettings } from "@/server/settings";

export interface ShortlistCandidate {
  productId: string;
  enrichmentScore: number;
}

export interface ShortlistOutcome<T extends ShortlistCandidate> {
  shortlisted: T[];
  watched: T[];
  droppedAtEnrichment: T[];
}

/**
 * Stage 3 -> shortlist cut. Pure ranking/cut logic, no I/O: takes
 * enrichment-scored candidates and the configured cutoffs, returns who
 * moves on to deep research (capped at deepResearchCutCount) and who
 * merely clears the minimum score but doesn't make the cut (watched).
 */
export function selectShortlist<T extends ShortlistCandidate>(
  candidates: T[],
  settings: ShortlistSettings,
): ShortlistOutcome<T> {
  const sorted = [...candidates].sort((a, b) => b.enrichmentScore - a.enrichmentScore);
  const aboveMin = sorted.filter((c) => c.enrichmentScore >= settings.enrichmentMinScore);
  const droppedAtEnrichment = sorted.filter((c) => c.enrichmentScore < settings.enrichmentMinScore);

  const cutForShortlist = aboveMin.slice(0, settings.enrichmentCutCount);
  const shortlisted = cutForShortlist.slice(0, settings.deepResearchCutCount);
  const watched = cutForShortlist.slice(settings.deepResearchCutCount);

  return { shortlisted, watched, droppedAtEnrichment };
}
