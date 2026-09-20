import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { VerdictBadge, moneyScoreColorClass } from "@/components/verdict-badge";
import { formatEur, formatNumber, formatRelativeToNow } from "@/lib/format";
import {
  getAngleHook,
  getBudgetSnapshot,
  getLatestRun,
  getMarginSnapshot,
  getMonthSpend,
  getTopOpportunities,
} from "@/server/queries/dashboard";
import { getApifyBudgetSnapshot } from "@/server/queries/apify";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";
// See src/app/research-runs/page.tsx for why this is set.
export const maxDuration = 300;

const FUNNEL_STAGES: Array<{ key: string; label: string }> = [
  { key: "discoveredCount", label: "discovered" },
  { key: "rejectedCount", label: "auto-rejected" },
  { key: "passedFilterCount", label: "passed filters" },
  { key: "enrichedCount", label: "analyzed" },
  { key: "shortlistedCount", label: "shortlisted" },
  { key: "deepResearchedCount", label: "deeply researched" },
  { key: "marketEnrichedCount", label: "market-enriched" },
  { key: "highPotentialCount", label: "high-potential" },
];

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "in progress…";
  const ms = finishedAt.getTime() - startedAt.getTime();
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function DashboardPage() {
  const run = await getLatestRun();
  const budget = await getBudgetSnapshot();
  const monthSpend = await getMonthSpend();
  const apifyBudget = await getApifyBudgetSnapshot();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          run
            ? `Last run (${run.mode === "APIFY_DETERMINISTIC" ? "Apify" : "mock"}) ${formatRelativeToNow(run.startedAt)} — ${run.status.replace("_", " ").toLowerCase()}${run.finishedAt ? `, took ${formatDuration(run.startedAt, run.finishedAt)}` : ""}`
            : "No run yet. Start your first Scout run below."
        }
        actions={<RunScoutButton />}
      />

      <div className="space-y-6 p-6">
        {!run ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Last run funnel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-stretch gap-2">
                    {FUNNEL_STAGES.map((stage, i) => (
                      <div key={stage.key} className="flex items-center gap-2">
                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 min-w-[92px]">
                          <div className="text-lg font-semibold tabular-nums">
                            {formatNumber((run as unknown as Record<string, number>)[stage.key] ?? 0)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{stage.label}</div>
                        </div>
                        {i < FUNNEL_STAGES.length - 1 && (
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" />
                        )}
                      </div>
                    ))}
                  </div>
                  {run.stopReason && (
                    <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
                      Stopped early: {run.stopReason}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Cost</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>Today</span>
                      <span className="tabular-nums font-medium">
                        {formatEur(budget.spentTodayEur)} / {formatEur(budget.dailyTargetEur)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, (budget.spentTodayEur / budget.hardLimitEur) * 100)}
                      className="mt-1.5 h-1.5"
                    />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Hard limit {formatEur(budget.hardLimitEur)}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between text-sm border-t border-border pt-3">
                    <span>This month</span>
                    <span className="tabular-nums font-medium">{formatEur(monthSpend)}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>This run (AI)</span>
                    <span className="tabular-nums font-medium">{formatEur(run.spendEur)}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm border-t border-border pt-3">
                    <span>Apify today (actual)</span>
                    <span className="tabular-nums font-medium">
                      {formatUsd(apifyBudget.spentTodayUsd)} / {formatUsd(apifyBudget.dailyTargetUsd)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>This run (Apify, actual)</span>
                    <span className="tabular-nums font-medium">{formatUsd(run.apifySpendUsd)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <TopOpportunities runId={run.id} />
          </>
        )}
      </div>
    </div>
  );
}

async function TopOpportunities({ runId }: { runId: string }) {
  const scores = await getTopOpportunities(runId, 5);

  if (scores.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No INTERESTING or HIGH_POTENTIAL opportunities in the last run. Check{" "}
          <Link href="/products" className="underline underline-offset-2">
            Products
          </Link>{" "}
          for everything that was evaluated.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Top opportunities</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {await Promise.all(
          scores.map(async (score) => {
            const [angleHook, margin] = await Promise.all([
              getAngleHook(runId, score.productId),
              getMarginSnapshot(runId, score.productId),
            ]);
            const bestSource = score.product.sources[0];
            return (
              <Link key={score.id} href={`/opportunities/${score.productId}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/40">
                  <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-snug">{score.product.title}</CardTitle>
                      <Badge variant="secondary" className="mt-1.5 font-normal">
                        {score.product.category}
                      </Badge>
                    </div>
                    <div className={`shrink-0 text-2xl font-bold tabular-nums ${moneyScoreColorClass(score.moneyScore)}`}>
                      {score.moneyScore}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <VerdictBadge verdict={score.verdict} />
                    {bestSource && margin && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Buy price</div>
                          <div className="font-medium tabular-nums">{formatEur(bestSource.price)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Est. retail</div>
                          <div className="font-medium tabular-nums">{formatEur(margin.sellingPriceEur)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Margin</div>
                          <div className="font-medium tabular-nums">{margin.marginPercent}%</div>
                        </div>
                      </div>
                    )}
                    {angleHook && (
                      <p className="flex items-start gap-1.5 text-xs italic text-muted-foreground">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                        {angleHook}
                      </p>
                    )}
                    {score.why[0] && (
                      <p className="text-xs">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Why: </span>
                        {score.why[0]}
                      </p>
                    )}
                    {score.concerns[0] && (
                      <p className="text-xs">
                        <span className="font-medium text-amber-600 dark:text-amber-400">Risk: </span>
                        {score.concerns[0]}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          }),
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Sparkles className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">MoneyScouter hasn&apos;t run yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Click &ldquo;Run Scout&rdquo; to discover, filter and research products end-to-end, staying
            within your configured AI budget.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
