import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatEur, formatEurPrecise, formatUsd, formatUsdPrecise, formatDateTime, formatNumber } from "@/lib/format";
import { getApifyCostOverview, getCostOverview } from "@/server/queries/costs";
import { getBudgetSnapshot, getMonthSpend } from "@/server/queries/dashboard";
import { getApifyBudgetSnapshot } from "@/server/queries/apify";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const [overview, budget, monthSpend, apifyOverview, apifyBudget] = await Promise.all([
    getCostOverview(),
    getBudgetSnapshot(),
    getMonthSpend(),
    getApifyCostOverview(),
    getApifyBudgetSnapshot(),
  ]);

  return (
    <div>
      <PageHeader title="Costs" description="Every dollar/euro spent, traced back to run, agent, actor and model tier." />
      <div className="space-y-6 p-6">
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Apify (real discovery/enrichment)</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Today" value={`${formatUsd(apifyBudget.spentTodayUsd)} / ${formatUsd(apifyBudget.dailyTargetUsd)}`} sub={`Hard limit ${formatUsd(apifyBudget.hardLimitUsd)}`} />
            <StatCard label="All-time Apify spend" value={formatUsd(apifyOverview.totalSpendUsd)} />
            <StatCard label="Apify calls made" value={formatNumber(apifyOverview.totalCalls)} />
            <StatCard label="Spend by purpose" value={apifyOverview.byPurpose.map((p) => `${p.purpose}: ${formatUsd(Number(p._sum.actualCostUsd ?? 0))}`).join(" · ") || "—"} />
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">AI (mock/demo pipeline)</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Today" value={`${formatEur(budget.spentTodayEur)} / ${formatEur(budget.dailyTargetEur)}`} sub={`Hard limit ${formatEur(budget.hardLimitEur)}`} />
            <StatCard label="This month" value={formatEur(monthSpend)} />
            <StatCard label="Cost per deep-researched product" value={formatEur(overview.costPerShortlisted)} />
            <StatCard label="Cost per high-potential opportunity" value={formatEur(overview.costPerHighPotential)} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Spend by model tier</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.byTier.map((t) => (
                    <TableRow key={t.tier}>
                      <TableCell>
                        <Badge variant="outline">{t.tier}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(t._count._all)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEurPrecise(Number(t._sum.estimatedCostEur ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Spend by agent</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.byAgent.map((a) => (
                    <TableRow key={a.agentType}>
                      <TableCell>{a.agentType}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(a._count._all)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatEurPrecise(Number(a._sum.estimatedCostEur ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Deep researched</TableHead>
                  <TableHead className="text-right">High potential</TableHead>
                  <TableHead className="text-right">AI spend</TableHead>
                  <TableHead className="text-right">Apify spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byRun.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href="/research-runs" className="hover:underline">
                        {formatDateTime(r.startedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.mode === "APIFY_DETERMINISTIC" ? "Apify" : "Mock"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.deepResearchedCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.highPotentialCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatEurPrecise(r.spendEur)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsdPrecise(r.apifySpendUsd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
