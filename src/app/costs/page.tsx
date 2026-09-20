import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MetricCard } from "@/components/metric-card";
import { CostDisplay } from "@/components/cost-display";
import { RunStatusBadge } from "@/components/verdict-badge";
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
      <PageHeader title="Kosten" description="Elke euro en dollar herleidbaar naar zoekronde, agent en databron." />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Apify vandaag (werkelijk)"
            value={formatUsd(apifyBudget.spentTodayUsd)}
            sub={`van max. ${formatUsd(apifyBudget.hardLimitUsd)}`}
            tone="success"
          />
          <MetricCard
            label="AI vandaag (geschat)"
            value={formatEur(budget.spentTodayEur)}
            sub={`van max. ${formatEur(budget.hardLimitEur)}`}
            tone="default"
          />
          <MetricCard label="AI deze maand (geschat)" value={formatEur(monthSpend)} tone="default" />
          <MetricCard label="Apify-aanroepen totaal" value={formatNumber(apifyOverview.totalCalls)} tone="info" />
        </div>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Apify (echte productdata)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Onderstaande bedragen zijn altijd <strong>werkelijke</strong> Apify-kosten (het door de databron
              gerapporteerde bedrag) — nooit de schatting vooraf. Die schatting wordt alleen gebruikt om een
              zoekactie vóóraf tegen het budget te toetsen.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Vandaag</div>
                <CostDisplay value={`${formatUsd(apifyBudget.spentTodayUsd)} / ${formatUsd(apifyBudget.dailyTargetUsd)}`} kind="actual" size="lg" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Totaal (alle tijd)</div>
                <CostDisplay value={formatUsd(apifyOverview.totalSpendUsd)} kind="actual" size="lg" />
              </div>
            </div>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              Per doel: {apifyOverview.byPurpose.map((p) => `${p.purpose}: ${formatUsd(Number(p._sum.actualCostUsd ?? 0))}`).join(" · ") || "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">AI (demo-pipeline)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Kosten per uitgebreid onderzocht product</div>
              <CostDisplay value={formatEur(overview.costPerShortlisted)} kind="estimated" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Kosten per kans met hoge potentie</div>
              <CostDisplay value={formatEur(overview.costPerHighPotential)} kind="estimated" />
            </div>
          </CardContent>
        </Card>

        <Accordion multiple>
          <AccordionItem value="technical">
            <AccordionTrigger className="text-sm font-medium text-muted-foreground">Technische details</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-6 pt-2">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium text-muted-foreground">Kosten per modelniveau (AI)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Niveau</TableHead>
                            <TableHead className="text-right">Aanroepen</TableHead>
                            <TableHead className="text-right">Kosten (geschat)</TableHead>
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
                      <CardTitle className="text-sm font-medium text-muted-foreground">Kosten per agent (AI)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agent</TableHead>
                            <TableHead className="text-right">Aanroepen</TableHead>
                            <TableHead className="text-right">Kosten (geschat)</TableHead>
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
                    <CardTitle className="text-sm font-medium text-muted-foreground">Recente Apify-aanroepen</CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Eén regel per databron-aanroep — het volledige detail achter elk bedrag hierboven.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gestart</TableHead>
                          <TableHead>Bron</TableHead>
                          <TableHead>Doel</TableHead>
                          <TableHead>Zoekterm</TableHead>
                          <TableHead className="text-right">Gevraagd</TableHead>
                          <TableHead className="text-right">Ontvangen</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Duur</TableHead>
                          <TableHead className="text-right">Geschat</TableHead>
                          <TableHead className="text-right">Werkelijk</TableHead>
                          <TableHead>Run / dataset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {apifyOverview.recentCalls.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                              Nog geen Apify-aanroepen.
                            </TableCell>
                          </TableRow>
                        )}
                        {apifyOverview.recentCalls.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="whitespace-nowrap">{formatDateTime(c.startedAt)}</TableCell>
                            <TableCell className="whitespace-nowrap">{c.provider ?? c.actorId}</TableCell>
                            <TableCell>{c.purpose}</TableCell>
                            <TableCell className="max-w-[220px] truncate" title={c.keyword ?? undefined}>
                              {c.keyword ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{c.requestedLimit ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(c.itemCount)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.durationMs != null ? `${(c.durationMs / 1000).toFixed(1)}s` : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatUsdPrecise(Number(c.estimatedCostUsd))}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {c.actualCostUsd != null ? formatUsdPrecise(Number(c.actualCostUsd)) : "—"}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate text-[11px] text-muted-foreground" title={`${c.apifyRunId} / ${c.datasetId ?? "—"}`}>
                              {c.apifyRunId}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Recente zoekrondes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Gestart</TableHead>
                          <TableHead>Modus</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Uitgebreid onderzocht</TableHead>
                          <TableHead className="text-right">Hoge potentie</TableHead>
                          <TableHead className="text-right">AI (geschat)</TableHead>
                          <TableHead className="text-right">Apify (werkelijk)</TableHead>
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
                              <Badge variant="secondary">{r.mode === "APIFY_DETERMINISTIC" ? "Apify" : "Demo"}</Badge>
                            </TableCell>
                            <TableCell>
                              <RunStatusBadge status={r.status} />
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
