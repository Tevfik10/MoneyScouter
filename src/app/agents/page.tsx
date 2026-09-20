import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatEurPrecise, formatNumber, formatUsdPrecise } from "@/lib/format";
import { AGENT_INFO_NL } from "@/lib/labels";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const AGENT_RESULT_STATUS_LABEL_NL: Record<string, string> = {
  COMPLETED: "voltooid",
  FAILED: "mislukt",
  SKIPPED: "overgeslagen",
};

const REAL_AGENT_ORDER = ["SCOUT", "DEDUP", "FILTER", "SUPPLIER", "COMPETITOR", "MARGIN", "TREND", "RISK", "JUDGE"] as const;
const REAL_AGENT_META: Record<string, { batch: boolean }> = {
  SCOUT: { batch: true },
  DEDUP: { batch: true },
  FILTER: { batch: true },
  SUPPLIER: { batch: false },
  COMPETITOR: { batch: false },
  MARGIN: { batch: false },
  TREND: { batch: false },
  RISK: { batch: false },
  JUDGE: { batch: false },
};

const MOCK_AGENT_ORDER = ["MARKET", "COMPETITOR", "SUPPLIER", "MARGIN", "BRAND", "ANGLE", "RISK", "SKEPTIC", "JUDGE"] as const;
const MOCK_AGENT_META: Record<string, { tier: string; ai: boolean }> = {
  MARKET: { tier: "goedkoop", ai: true },
  COMPETITOR: { tier: "goedkoop", ai: true },
  SUPPLIER: { tier: "— berekening", ai: false },
  MARGIN: { tier: "— berekening", ai: false },
  BRAND: { tier: "goedkoop", ai: true },
  ANGLE: { tier: "standaard", ai: true },
  RISK: { tier: "goedkoop", ai: true },
  SKEPTIC: { tier: "standaard", ai: true },
  JUDGE: { tier: "sterk", ai: true },
};

export default async function AgentsPage() {
  const [pipelineStages, realAgentCounts, apifyByPurpose, mockAiStats] = await Promise.all([
    prisma.pipelineStageRun.findMany({
      where: { stage: { in: ["SCOUT", "DEDUP", "FILTER"] } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.agentResult.groupBy({
      by: ["agentType"],
      where: { researchRun: { mode: "APIFY_DETERMINISTIC" } },
      _count: { _all: true },
    }),
    prisma.apifyCall.groupBy({ by: ["purpose"], _sum: { actualCostUsd: true }, _count: { _all: true } }),
    prisma.aiCall.groupBy({
      by: ["agentType"],
      where: { agentType: { not: null } },
      _count: { _all: true },
      _sum: { estimatedCostEur: true },
    }),
  ]);

  const stageByType = new Map<string, (typeof pipelineStages)[number]>();
  for (const s of pipelineStages) if (!stageByType.has(s.stage)) stageByType.set(s.stage, s); // meest recente eerst
  const stageTotals = new Map<string, { processed: number; rejected: number; runs: number }>();
  for (const s of pipelineStages) {
    const t = stageTotals.get(s.stage) ?? { processed: 0, rejected: 0, runs: 0 };
    t.processed += s.itemsProcessed;
    t.rejected += s.itemsRejected;
    t.runs += 1;
    stageTotals.set(s.stage, t);
  }
  const realAgentCountByType = Object.fromEntries(realAgentCounts.map((s) => [s.agentType, s._count._all]));
  const marketEnrichmentSpend = apifyByPurpose.find((p) => p.purpose === "market_enrichment");
  const discoverySpend = apifyByPurpose.find((p) => p.purpose === "discovery");
  const mockStatsByAgent = Object.fromEntries(mockAiStats.map((s) => [s.agentType, s]));

  return (
    <div>
      <PageHeader title="Agents" description="Wat elke agent doet, en wat er tot nu toe echt is uitgevoerd en gekost." />
      <div className="space-y-8 p-6">
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Echte pipeline (Apify-zoekopdrachten + regelgebaseerde agents, geen AI)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {REAL_AGENT_ORDER.map((type) => {
              const info = AGENT_INFO_NL[type as keyof typeof AGENT_INFO_NL];
              const meta = REAL_AGENT_META[type];
              const stage = stageByType.get(type);
              const totals = stageTotals.get(type);
              return (
                <Card key={`real-${type}`} className="card-elevated">
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{info.name}</CardTitle>
                    {meta.batch ? (
                      stage ? (
                        <Badge variant={stage.status === "FAILED" ? "destructive" : "outline"}>
                          {AGENT_RESULT_STATUS_LABEL_NL[stage.status] ?? stage.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline">nog niet uitgevoerd</Badge>
                      )
                    ) : (
                      <Badge variant="outline">{type === "COMPETITOR" ? "apify" : "berekening"}</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    {meta.batch ? (
                      stage ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              verwerkt (totaal, {totals?.runs ?? 0}x uitgevoerd)
                            </span>
                            <span className="font-medium tabular-nums">{formatNumber(totals?.processed ?? 0)}</span>
                          </div>
                          {totals && totals.rejected > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">afgewezen</span>
                              <span className="font-medium tabular-nums">{formatNumber(totals.rejected)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">laatste keer</span>
                            <span>{formatDateTime(stage.startedAt)}</span>
                          </div>
                          {stage.dataSource && <div className="text-[11px] text-muted-foreground">{stage.dataSource}</div>}
                          {stage.errorMessage && <div className="text-[11px] text-destructive">{stage.errorMessage}</div>}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Nog geen uitvoeringen vastgelegd.</div>
                      )
                    ) : (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{formatNumber(realAgentCountByType[type] ?? 0)} product(en) geanalyseerd</span>
                        {type === "COMPETITOR" ? (
                          <span className="font-medium tabular-nums">
                            {formatUsdPrecise(Number(marketEnrichmentSpend?._sum.actualCostUsd ?? 0))} (Apify)
                          </span>
                        ) : (
                          <span className="font-medium tabular-nums text-muted-foreground">$0,00</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {discoverySpend && (
            <p className="mt-2 text-xs text-muted-foreground">
              Apify-kosten Scout (AliExpress-zoekopdrachten): {formatUsdPrecise(Number(discoverySpend._sum.actualCostUsd ?? 0))}
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Demo-pipeline (AI, alleen lokaal testen)</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {MOCK_AGENT_ORDER.map((type) => {
              const info = AGENT_INFO_NL[type as keyof typeof AGENT_INFO_NL];
              const meta = MOCK_AGENT_META[type];
              const s = mockStatsByAgent[type];
              return (
                <Card key={`mock-${type}`} className="card-elevated">
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{info.name}</CardTitle>
                    <Badge variant="outline">{meta.tier}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    {meta.ai ? (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{formatNumber(s?._count._all ?? 0)} aanroepen</span>
                        <span className="font-medium tabular-nums">
                          {formatEurPrecise(Number(s?._sum.estimatedCostEur ?? 0))} totaal
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Geen AI-aanroepen — pure berekening.</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
