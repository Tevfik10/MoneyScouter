import Link from "next/link";
import { ArrowRight, Euro, Gauge, PackageSearch, Search, Sparkles, Target } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { PipelineProgress } from "@/components/pipeline-progress";
import { MetricCard } from "@/components/metric-card";
import { MoneyScoreGauge } from "@/components/money-score-gauge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VerdictBadge } from "@/components/verdict-badge";
import { formatEur, formatNumber, formatRelativeToNow } from "@/lib/format";
import { explainStopReason } from "@/lib/labels";
import {
  getAngleHook,
  getAverageMoneyScore,
  getBudgetSnapshot,
  getLatestRun,
  getMarginSnapshot,
  getMonthSpend,
  getTopOpportunities,
} from "@/server/queries/dashboard";
import { getApifyBudgetSnapshot } from "@/server/queries/apify";
import { formatUsd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FUNNEL_STAGES: Array<{ key: string; label: string }> = [
  { key: "discoveredCount", label: "gevonden" },
  { key: "rejectedCount", label: "afgevallen" },
  { key: "passedFilterCount", label: "door selectie" },
  { key: "enrichedCount", label: "geanalyseerd" },
  { key: "shortlistedCount", label: "op shortlist" },
  { key: "deepResearchedCount", label: "uitgebreid onderzocht" },
  { key: "marketEnrichedCount", label: "markt gecontroleerd" },
  { key: "highPotentialCount", label: "hoge potentie" },
];

function getGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hour12: false, timeZone: "Europe/Amsterdam" }).format(new Date()),
  );
  if (hour < 6) return "Goedenacht";
  if (hour < 12) return "Goedemorgen";
  if (hour < 18) return "Goedemiddag";
  return "Goedenavond";
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return "bezig…";
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
  const avgScore = run ? await getAverageMoneyScore(run.id) : null;

  return (
    <div>
      <PageHeader title="Overzicht" actions={<RunScoutButton />} />

      <div className="surface-gradient border-b border-border px-6 py-6">
        <p className="text-2xl font-semibold tracking-tight">{getGreeting()}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {run
            ? `Dit is wat MoneyScouter ${formatRelativeToNow(run.startedAt)} heeft gevonden.`
            : "Dit is wat MoneyScouter vandaag heeft gevonden."}
        </p>
        {run && run.status === "RUNNING" && (
          <div className="mt-4 max-w-md">
            <PipelineProgress runId={run.id} initialStatus={run.status} />
          </div>
        )}
      </div>

      <div className="space-y-6 p-6">
        {!run ? (
          <EmptyState
            icon={Sparkles}
            title="MoneyScouter heeft nog niet gezocht"
            description="Klik op “Start zoekronde” om producten te ontdekken, te selecteren en te beoordelen — binnen je ingestelde budget."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Nieuwe producten" value={formatNumber(run.discoveredCount)} icon={PackageSearch} tone="info" />
              <MetricCard label="Kansrijke producten" value={formatNumber(run.highPotentialCount)} icon={Target} tone="success" />
              <MetricCard
                label="Gemiddelde MoneyScore"
                value={avgScore != null ? Math.round(avgScore) : "—"}
                icon={Gauge}
                tone="intelligence"
              />
              <MetricCard label="Producten onderzocht" value={formatNumber(run.deepResearchedCount)} icon={Search} tone="default" />
              <MetricCard label="Apify-kosten vandaag" value={formatUsd(apifyBudget.spentTodayUsd)} icon={Euro} tone="warning" />
              <MetricCard
                label="Laatste zoekronde"
                value={formatRelativeToNow(run.startedAt)}
                sub={run.finishedAt ? `duurde ${formatDuration(run.startedAt, run.finishedAt)}` : "bezig…"}
                icon={Sparkles}
                tone="default"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Dagoverzicht</CardTitle>
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
                    Vroegtijdig gestopt: {explainStopReason(run.stopReason) ?? run.stopReason}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Budget</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">AI-budget vandaag</div>
                  <div className="mt-1 text-sm font-medium tabular-nums">
                    {formatEur(budget.spentTodayEur)} / {formatEur(budget.dailyTargetEur)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Deze maand (AI)</div>
                  <div className="mt-1 text-sm font-medium tabular-nums">{formatEur(monthSpend)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Apify-budget vandaag</div>
                  <div className="mt-1 text-sm font-medium tabular-nums">
                    {formatUsd(apifyBudget.spentTodayUsd)} / {formatUsd(apifyBudget.dailyTargetUsd)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Deze zoekronde (Apify)</div>
                  <div className="mt-1 text-sm font-medium tabular-nums">{formatUsd(run.apifySpendUsd)}</div>
                </div>
              </CardContent>
            </Card>

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
      <EmptyState
        icon={Target}
        title="Nog geen kansen in deze zoekronde"
        description={
          <>
            Bekijk{" "}
            <Link href="/products" className="underline underline-offset-2">
              Producten
            </Link>{" "}
            voor alles wat is beoordeeld.
          </>
        }
      />
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Sterkste kansen</h2>
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
                <Card className="card-elevated h-full transition-colors group-hover:border-primary/40">
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-snug">{score.product.title}</CardTitle>
                      <Badge variant="secondary" className="mt-1.5 font-normal">
                        {score.product.category}
                      </Badge>
                    </div>
                    <MoneyScoreGauge score={score.moneyScore} size="sm" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <VerdictBadge verdict={score.verdict} />
                    {bestSource && margin && (
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Inkoopprijs</div>
                          <div className="font-medium tabular-nums">{formatEur(bestSource.price)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Verkoopprijs</div>
                          <div className="font-medium tabular-nums">{formatEur(margin.sellingPriceEur)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Marge</div>
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
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Sterk punt: </span>
                        {score.why[0]}
                      </p>
                    )}
                    {score.concerns[0] && (
                      <p className="text-xs">
                        <span className="font-medium text-amber-600 dark:text-amber-400">Let op: </span>
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
