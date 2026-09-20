import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RunStatusBadge } from "@/components/verdict-badge";
import { CostDisplay } from "@/components/cost-display";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatEurPrecise, formatNumber, formatUsdPrecise } from "@/lib/format";
import { explainStopReason } from "@/lib/labels";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";
// Best-effort headroom for the "Start zoekronde" server action invoked from
// this page — actual ceiling still depends on the hosting plan's function
// duration limit. The pipeline has its own internal time-budget guard (see
// runScoutReal) that self-terminates well before this, so a run finalizes
// itself instead of being killed mid-flight and left stuck RUNNING.
export const maxDuration = 300;

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "bezig…";
  const ms = finishedAt.getTime() - startedAt.getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function ResearchRunsPage() {
  const runs = await prisma.researchRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { searchRuns: { include: { keyword: true } } },
  });

  return (
    <div>
      <PageHeader title="Zoekrondes" description="Elke keer dat MoneyScouter heeft gezocht, volledig herleidbaar." actions={<RunScoutButton />} />
      <div className="p-6">
        {runs.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nog geen zoekrondes"
            description="Klik op “Start zoekronde” om producten te ontdekken, te selecteren en te beoordelen."
          />
        ) : (
          <>
            {/* Desktop/tablet: full table */}
            <Card className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gestart</TableHead>
                    <TableHead>Zoekterm</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Producten gevonden</TableHead>
                    <TableHead className="text-right">Door selectie</TableHead>
                    <TableHead className="text-right">Uitgebreid onderzocht</TableHead>
                    <TableHead className="text-right">Kansen gevonden</TableHead>
                    <TableHead className="text-right">Kosten</TableHead>
                    <TableHead className="text-right">Duur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => {
                    const keywords = r.searchRuns.map((sr) => sr.keyword.keyword).join(", ");
                    const stopExplained = explainStopReason(r.stopReason);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(r.startedAt)}
                          <div className="mt-0.5 flex gap-1">
                            <Badge variant="secondary" className="font-normal">
                              {r.mode === "APIFY_DETERMINISTIC" ? "Apify" : "Demo"}
                            </Badge>
                            {r.testMode && (
                              <Badge variant="outline" className="font-normal">
                                test
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground" title={keywords}>
                          {keywords || "—"}
                        </TableCell>
                        <TableCell>
                          <RunStatusBadge status={r.status} />
                          {r.stopReason && (
                            <div className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">
                              {stopExplained ?? r.stopReason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.discoveredCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.passedFilterCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.deepResearchedCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.highPotentialCount)}</TableCell>
                        <TableCell className="text-right">
                          {r.mode === "APIFY_DETERMINISTIC" ? (
                            <CostDisplay value={formatUsdPrecise(r.apifySpendUsd)} kind="actual" size="sm" />
                          ) : (
                            <span className="tabular-nums text-sm">{formatEurPrecise(r.spendEur)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {formatDuration(r.startedAt, r.finishedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: card list */}
            <div className="space-y-2 sm:hidden">
              {runs.map((r) => {
                const keywords = r.searchRuns.map((sr) => sr.keyword.keyword).join(", ");
                const stopExplained = explainStopReason(r.stopReason);
                return (
                  <Card key={r.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm">{formatDateTime(r.startedAt)}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="secondary" className="font-normal">
                              {r.mode === "APIFY_DETERMINISTIC" ? "Apify" : "Demo"}
                            </Badge>
                            {r.testMode && (
                              <Badge variant="outline" className="font-normal">
                                test
                              </Badge>
                            )}
                          </div>
                        </div>
                        <RunStatusBadge status={r.status} className="shrink-0" />
                      </div>
                      {keywords && <div className="mt-2 truncate text-xs text-muted-foreground">{keywords}</div>}
                      {r.stopReason && (
                        <div className="mt-1 text-[11px] text-muted-foreground">{stopExplained ?? r.stopReason}</div>
                      )}
                      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-2 text-center text-xs">
                        <div>
                          <div className="font-medium tabular-nums">{formatNumber(r.discoveredCount)}</div>
                          <div className="text-muted-foreground">gevonden</div>
                        </div>
                        <div>
                          <div className="font-medium tabular-nums">{formatNumber(r.passedFilterCount)}</div>
                          <div className="text-muted-foreground">selectie</div>
                        </div>
                        <div>
                          <div className="font-medium tabular-nums">{formatNumber(r.deepResearchedCount)}</div>
                          <div className="text-muted-foreground">onderzocht</div>
                        </div>
                        <div>
                          <div className="font-medium tabular-nums">{formatNumber(r.highPotentialCount)}</div>
                          <div className="text-muted-foreground">kansen</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        {r.mode === "APIFY_DETERMINISTIC" ? (
                          <CostDisplay value={formatUsdPrecise(r.apifySpendUsd)} kind="actual" size="sm" />
                        ) : (
                          <span className="tabular-nums font-medium">{formatEurPrecise(r.spendEur)}</span>
                        )}
                        <span className="text-muted-foreground">{formatDuration(r.startedAt, r.finishedAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
