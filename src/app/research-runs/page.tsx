import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatEurPrecise, formatNumber, formatUsdPrecise } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ResearchRunsPage() {
  const runs = await prisma.researchRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 });

  return (
    <div>
      <PageHeader title="Research Runs" description="Every pipeline execution, resumable and fully audited." actions={<RunScoutButton />} />
      <div className="p-6">
        {runs.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">No runs yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Discovered</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Passed filter</TableHead>
                  <TableHead className="text-right">Shortlisted</TableHead>
                  <TableHead className="text-right">Market-enriched</TableHead>
                  <TableHead className="text-right">High potential</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDateTime(r.startedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.mode === "APIFY_DETERMINISTIC" ? "Apify" : "Mock"}</Badge>
                      {r.testMode && (
                        <Badge variant="outline" className="ml-1">
                          test
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                      {r.stopReason && <span className="ml-2 text-[11px] text-muted-foreground">{r.stopReason}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.discoveredCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.rejectedCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.passedFilterCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.shortlistedCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.marketEnrichedCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.highPotentialCount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.mode === "APIFY_DETERMINISTIC" ? formatUsdPrecise(r.apifySpendUsd) : formatEurPrecise(r.spendEur)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
