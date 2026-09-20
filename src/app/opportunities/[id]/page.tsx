import { notFound } from "next/navigation";
import { AgentType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VerdictBadge, ComplianceRiskBadge, moneyScoreColorClass } from "@/components/verdict-badge";
import { formatEur, formatDateTime, formatEurPrecise, formatNumber, formatUsdPrecise } from "@/lib/format";
import { getProductDetail } from "@/server/queries/productDetail";
import {
  AngleFindings,
  BrandFindings,
  CompetitorFindings,
  MarginFindings,
  MarketFindings,
  RiskFindings,
  SkepticFindings,
  SupplierFindings,
} from "@/server/pipeline/agents/schemas";
import { TrendFindings } from "@/server/pipeline/agentsDeterministic/trend";
import { CompetitorFindings as DeterministicCompetitorFindings } from "@/server/pipeline/agentsDeterministic/competitor";

export const dynamic = "force-dynamic";

function findAgent<T>(
  agentResults: { agentType: AgentType; summary: string; findings: unknown }[],
  type: AgentType,
): { summary: string; findings: T } | null {
  const r = agentResults.find((a) => a.agentType === type);
  if (!r) return null;
  return { summary: r.summary, findings: r.findings as T };
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProductDetail(id);
  if (!detail) notFound();

  const { product, latestScore, agentResults, decisions, aiCalls, apifyCalls, competitorSightings } = detail;

  const isRealMode = latestScore?.researchRun.mode === "APIFY_DETERMINISTIC";

  const market = findAgent<MarketFindings>(agentResults, AgentType.MARKET);
  const trend = findAgent<TrendFindings>(agentResults, AgentType.TREND);
  const competitorRaw = findAgent<CompetitorFindings | DeterministicCompetitorFindings>(agentResults, AgentType.COMPETITOR);
  const competitorSummary = competitorRaw?.findings.summary;
  const supplier = findAgent<SupplierFindings>(agentResults, AgentType.SUPPLIER);
  const margin = findAgent<MarginFindings>(agentResults, AgentType.MARGIN);
  const brand = findAgent<BrandFindings>(agentResults, AgentType.BRAND);
  const angle = findAgent<AngleFindings>(agentResults, AgentType.ANGLE);
  const risk = findAgent<RiskFindings>(agentResults, AgentType.RISK);
  const skeptic = findAgent<SkepticFindings>(agentResults, AgentType.SKEPTIC);

  const totalAiCostEur = aiCalls.reduce((sum, c) => sum + Number(c.estimatedCostEur), 0);
  const totalApifyCostUsd = apifyCalls.reduce((sum, c) => sum + Number(c.actualCostUsd ?? c.estimatedCostUsd), 0);

  return (
    <div>
      <PageHeader
        title={product.title}
        description={`${product.category} · first seen ${formatDateTime(product.firstSeenAt)} · last seen ${formatDateTime(product.lastSeenAt)} · seen ${product.timesSeen}x`}
        actions={
          latestScore && (
            <Badge variant="secondary">
              Source: {isRealMode ? "Apify (real)" : "Mock demo"}
            </Badge>
          )
        }
      />

      <div className="space-y-6 p-6">
        {/* HEADER */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 py-5">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title}
                className="size-20 shrink-0 rounded-lg border border-border object-cover"
              />
            )}
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs text-muted-foreground">Money Score</div>
                <div className={`text-4xl font-bold tabular-nums ${moneyScoreColorClass(latestScore?.moneyScore ?? 0)}`}>
                  {latestScore?.moneyScore ?? "—"}
                </div>
              </div>
              {latestScore && <VerdictBadge verdict={latestScore.verdict} className="text-sm px-3 py-1" />}
              <ComplianceRiskBadge risk={product.complianceRisk} />
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <div>Research cost for this analysis</div>
              <div className="font-medium tabular-nums text-foreground">
                {isRealMode ? formatUsdPrecise(totalApifyCostUsd) : formatEurPrecise(totalAiCostEur)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KEY METRICS */}
        {margin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Key metrics</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Buy price" value={formatEur(margin.findings.buyPriceEur)} />
              <Metric label="Shipping" value={formatEur(margin.findings.shippingCostEur)} />
              <Metric label="Potential retail" value={formatEur(margin.findings.sellingPriceEur)} />
              <Metric
                label="Base margin"
                value={`${formatEur(margin.findings.scenarios.base.contributionMarginEur)} (${margin.findings.scenarios.base.marginPercent}%)`}
              />
              {competitorSightings.length > 0 && (
                <Metric label="Competitors" value={String(competitorSightings.length)} />
              )}
              {market && <Metric label="Trend" value={market.findings.trendDirection} />}
              {trend && <Metric label="Trend score" value={`${trend.findings.trendScore}/10`} />}
              {risk && <Metric label="Return risk" value={`${risk.findings.returnRiskEstimatePercent}%`} />}
              {supplier && <Metric label="Best shipping" value={`${supplier.findings.leadTimeDaysMin}d`} />}
            </CardContent>
          </Card>
        )}

        {/* WHY THIS PRODUCT */}
        {latestScore && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Why this product</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">WHY</div>
                <ul className="space-y-1 text-sm">
                  {latestScore.why.map((w, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground">&bull;</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">CONCERNS</div>
                <ul className="space-y-1 text-sm">
                  {latestScore.concerns.length === 0 && (
                    <li className="text-muted-foreground">No major concerns flagged.</li>
                  )}
                  {latestScore.concerns.map((c, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-muted-foreground">&bull;</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              {latestScore.nextStep && (
                <div className="sm:col-span-2 border-t border-border pt-3">
                  <span className="text-xs font-medium text-muted-foreground">NEXT STEP: </span>
                  <span className="text-sm">{latestScore.nextStep}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* RUBRIC */}
        {latestScore && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">Scoring rubric</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ["Demand", latestScore.demand],
                  ["Trend", latestScore.trend],
                  ["Margin", latestScore.margin],
                  ["Competition", latestScore.competition],
                  ["Brandability", latestScore.brandability],
                  ["Marketing angles", latestScore.marketingAngles],
                  ["Supplier quality", latestScore.supplierQuality],
                  ["Shipping", latestScore.shipping],
                  ["Operational ease / risk", latestScore.operationalEase],
                  ["Risk", latestScore.risk],
                  ["Market price opportunity", latestScore.marketPriceOpportunity],
                ] as const
              )
                .filter(([, value]) => value !== null)
                .map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border p-2 text-center">
                    <div className="text-lg font-semibold tabular-nums">{value}/10</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {/* MARKET (mock/LLM mode) */}
        {market && (
          <SectionCard title="Market">
            <p className="text-sm">{market.findings.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {market.findings.targetSegments.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{market.findings.seasonality}</p>
          </SectionCard>
        )}

        {/* TREND (real/Apify mode) */}
        {trend && (
          <SectionCard title="Trend">
            <p className="text-sm">{trend.findings.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Metric label="Trend score" value={`${trend.findings.trendScore}/10`} />
              <Metric
                label="Price movement"
                value={trend.findings.priceMovementPercent != null ? `${trend.findings.priceMovementPercent}%` : "—"}
              />
              <Metric label="Times seen" value={String(trend.findings.appearanceCount)} />
              <Metric label="Orders at source" value={trend.findings.orderCount != null ? formatNumber(trend.findings.orderCount) : "—"} />
            </div>
          </SectionCard>
        )}

        {/* COMPETITORS — uses the CompetitorSighting rows, populated in both
            modes, so real URLs/prices/match confidence render regardless of
            which pipeline produced them. */}
        {(competitorSummary || competitorSightings.length > 0) && (
          <SectionCard title="Competitors">
            {competitorSummary && <p className="text-sm">{competitorSummary}</p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {competitorSightings.map((s) => (
                <a
                  key={s.id}
                  href={s.url ?? undefined}
                  target={s.url ? "_blank" : undefined}
                  rel={s.url ? "noreferrer" : undefined}
                  className={`flex items-center justify-between rounded-md border border-border p-2 text-sm ${s.url ? "hover:border-primary/40" : ""}`}
                >
                  <span className="truncate">{s.competitor.name}</span>
                  {s.matchConfidence != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {Math.round(s.matchConfidence * 100)}% match
                    </span>
                  )}
                  {s.positioning && <span className="shrink-0 text-muted-foreground">{s.positioning}</span>}
                  {s.price != null && <span className="shrink-0 tabular-nums font-medium">{formatEur(s.price)}</span>}
                </a>
              ))}
              {competitorSightings.length === 0 && (
                <p className="text-sm text-muted-foreground">No confidently-matched market listings found.</p>
              )}
            </div>
          </SectionCard>
        )}

        {/* SUPPLIERS */}
        {supplier && (
          <SectionCard title="Suppliers">
            <p className="text-sm">{supplier.findings.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Metric label="Known suppliers" value={String(supplier.findings.supplierCount)} />
              <Metric label="Price spread" value={formatEur(supplier.findings.priceSpreadEur)} />
              <Metric
                label="Lead time"
                value={`${supplier.findings.leadTimeDaysMin}-${supplier.findings.leadTimeDaysMax}d`}
              />
              <Metric label="Quality score" value={`${supplier.findings.supplierQualityScore}/10`} />
            </div>
            {product.sources.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                {product.sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{s.supplier.name}</span>
                    <span className="tabular-nums font-medium">{formatEur(s.price)}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline">
                        view source
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* UNIT ECONOMICS */}
        {margin && (
          <SectionCard title="Unit economics">
            <div className="grid gap-3 sm:grid-cols-3">
              {(["bad", "base", "good"] as const).map((key) => (
                <div key={key} className="rounded-md border border-border p-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">{key}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {formatEur(margin.findings.scenarios[key].contributionMarginEur)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {margin.findings.scenarios[key].marginPercent}% margin
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              VAT {margin.findings.vatRatePercent}% &middot; transaction fee {margin.findings.transactionFeePercent}%
              &middot; fulfillment {formatEur(margin.findings.fulfillmentCostEur)} &middot; est. return rate{" "}
              {margin.findings.returnRatePercent}%
            </p>
          </SectionCard>
        )}

        {/* BRANDABILITY */}
        {brand && (
          <SectionCard title="Brandability">
            <p className="text-sm">{brand.findings.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Metric label="Ideal customer" value={brand.findings.idealCustomer} />
              <Metric label="Problem solved" value={brand.findings.problemSolved} />
              <Metric label="Emotional hook" value={brand.findings.emotionalHook} />
              <Metric label="Functional hook" value={brand.findings.functionalHook} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brand.findings.canBundle && <Badge variant="secondary">bundle potential</Badge>}
              {brand.findings.canAddPackagingValue && <Badge variant="secondary">packaging value</Badge>}
              <Badge variant="secondary">repeat purchase: {brand.findings.repeatPurchasePotential}</Badge>
            </div>
          </SectionCard>
        )}

        {/* MARKETING ANGLES */}
        {angle && (
          <SectionCard title="Marketing angles">
            <div className="grid gap-3 sm:grid-cols-2">
              {angle.findings.angles.map((a, i) => (
                <div key={i} className="rounded-md border border-border p-3 text-sm space-y-1">
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.targetAudience}</div>
                  <div className="italic">&ldquo;{a.adHook}&rdquo;</div>
                  <div className="text-xs">{a.whyBuy}</div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {a.pricePosition}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {a.brandFeel}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* SKEPTIC */}
        {skeptic && (
          <SectionCard title="Skeptic">
            <Badge variant="outline" className="mb-2">
              lean: {skeptic.findings.verdictLean}
            </Badge>
            <p className="text-sm font-medium">{skeptic.findings.strongestObjection}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {skeptic.findings.objections.map((o, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted-foreground">&bull;</span>
                  {o}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {/* RISKS */}
        {risk && (
          <SectionCard title="Risks">
            <div className="flex flex-wrap gap-2">
              <ComplianceRiskBadge risk={product.complianceRisk} />
              <Badge variant="outline">IP risk: {risk.findings.ipRisk}</Badge>
              <Badge variant="outline">Return risk: {risk.findings.returnRiskEstimatePercent}%</Badge>
            </div>
            {risk.findings.flags.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {risk.findings.flags.map((f, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-muted-foreground">&bull;</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {/* AGENT REPORTS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Agent reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion multiple>
              {agentResults.map((r) => (
                <AccordionItem key={r.id} value={r.id}>
                  <AccordionTrigger className="text-sm">
                    {r.agentType} <span className="ml-2 text-xs text-muted-foreground">({r.modelTier})</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                      {JSON.stringify(r.findings, null, 2)}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* DECISION HISTORY */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Decision history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisions.map((d) => (
              <div key={d.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <div>
                  <Badge variant="outline" className="mr-2">
                    {d.stage}
                  </Badge>
                  <span className="text-muted-foreground">{d.reasons.join("; ")}</span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</span>
              </div>
            ))}
            {decisions.length === 0 && <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <Separator className="hidden" />
    </Card>
  );
}
