import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatEurPrecise, formatNumber, formatUsdPrecise } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const REAL_AGENT_INFO: Record<string, { role: string; batch: boolean }> = {
  SCOUT: { role: "Runs AliExpress discovery via Apify for the run's selected keywords.", batch: true },
  DEDUP: { role: "Fingerprint lookup — never re-analyzes an unchanged, previously-seen product.", batch: true },
  FILTER: { role: "Zero-AI rule engine: price/margin/rating/review/shipping thresholds.", batch: true },
  SUPPLIER: { role: "Compares suppliers on price, rating, shipping and MOQ. Pure calculation.", batch: false },
  COMPETITOR: { role: "Fuzzy-matches shortlisted products against real Google Shopping listings.", batch: false },
  MARGIN: { role: "Calculates bad/base/good unit-economics scenarios. Pure calculation.", batch: false },
  TREND: { role: "Score from measured signals only: repeat sightings, price history, order count.", batch: false },
  RISK: { role: "Rule-based compliance/IP/return-risk classification.", batch: false },
  JUDGE: { role: "Weighted rubric -> Money Score, with plain \"+X/Y dimension\" reasoning. No LLM.", batch: false },
};

const MOCK_AGENT_INFO: Record<string, { role: string; tier: string; ai: boolean }> = {
  MARKET: { role: "Reads demand and trend signals for the target market.", tier: "cheap", ai: true },
  COMPETITOR: { role: "Maps the competitive landscape: sellers, pricing, positioning.", tier: "cheap", ai: true },
  SUPPLIER: { role: "Compares suppliers on price, rating, shipping and MOQ.", tier: "— deterministic", ai: false },
  MARGIN: { role: "Calculates bad/base/good unit-economics scenarios.", tier: "— deterministic", ai: false },
  BRAND: { role: "Asks whether this can be a believable branded concept, not just a markup.", tier: "cheap", ai: true },
  ANGLE: { role: "Generates 3-5 marketing angles, only for products Brand already likes.", tier: "standard", ai: true },
  RISK: { role: "Compliance/IP/return risk. Category classification is rule-based; residual judgement is AI.", tier: "cheap", ai: true },
  SKEPTIC: { role: "Argues the bear case: why this product is a bad idea.", tier: "standard", ai: true },
  JUDGE: { role: "Computes the transparent Money Score rubric and writes the final why/concerns/next step.", tier: "strong", ai: true },
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
  for (const s of pipelineStages) if (!stageByType.has(s.stage)) stageByType.set(s.stage, s); // most recent first
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
      <PageHeader title="Agents" description="What each agent does, and what it has actually run/cost so far." />
      <div className="space-y-8 p-6">
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Real pipeline (Apify discovery + rule-based agents, zero LLM calls)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(REAL_AGENT_INFO).map(([type, info]) => {
              const stage = stageByType.get(type);
              const totals = stageTotals.get(type);
              return (
                <Card key={`real-${type}`}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{type}</CardTitle>
                    {info.batch ? (
                      stage ? (
                        <Badge variant={stage.status === "FAILED" ? "destructive" : "outline"}>{stage.status}</Badge>
                      ) : (
                        <Badge variant="outline">not run yet</Badge>
                      )
                    ) : (
                      <Badge variant="outline">
                        {type === "COMPETITOR" ? "apify" : "deterministic"}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{info.role}</p>
                    {info.batch ? (
                      stage ? (
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              processed (all-time, {totals?.runs ?? 0} run(s))
                            </span>
                            <span className="font-medium tabular-nums">{formatNumber(totals?.processed ?? 0)}</span>
                          </div>
                          {totals && totals.rejected > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">rejected</span>
                              <span className="font-medium tabular-nums">{formatNumber(totals.rejected)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">last run</span>
                            <span>{formatDateTime(stage.startedAt)}</span>
                          </div>
                          {stage.dataSource && <div className="text-[11px] text-muted-foreground">{stage.dataSource}</div>}
                          {stage.errorMessage && <div className="text-[11px] text-destructive">{stage.errorMessage}</div>}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No runs recorded yet.</div>
                      )
                    ) : (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{formatNumber(realAgentCountByType[type] ?? 0)} product(s) analyzed</span>
                        {type === "COMPETITOR" ? (
                          <span className="font-medium tabular-nums">
                            {formatUsdPrecise(Number(marketEnrichmentSpend?._sum.actualCostUsd ?? 0))} (Apify)
                          </span>
                        ) : (
                          <span className="font-medium tabular-nums text-muted-foreground">$0.00</span>
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
              Scout (AliExpress discovery) Apify spend: {formatUsdPrecise(Number(discoverySpend._sum.actualCostUsd ?? 0))}
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Mock/demo pipeline (LLM)</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(MOCK_AGENT_INFO).map(([type, info]) => {
              const s = mockStatsByAgent[type];
              return (
                <Card key={`mock-${type}`}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">{type}</CardTitle>
                    <Badge variant="outline">{info.tier}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{info.role}</p>
                    {info.ai ? (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{formatNumber(s?._count._all ?? 0)} calls</span>
                        <span className="font-medium tabular-nums">
                          {formatEurPrecise(Number(s?._sum.estimatedCostEur ?? 0))} total
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No AI calls — pure calculation.</div>
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
