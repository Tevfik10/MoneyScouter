import { notFound } from "next/navigation";
import { AgentType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { VerdictBadge, ComplianceRiskBadge } from "@/components/verdict-badge";
import { MoneyScoreGauge } from "@/components/money-score-gauge";
import { SectionCard } from "@/components/section-card";
import { CostDisplay } from "@/components/cost-display";
import { formatEur, formatDateTime, formatNumber, formatUsdPrecise } from "@/lib/format";
import { PRODUCT_STATUS_LABEL_NL } from "@/lib/labels";
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
import { DeterministicScoringWeights } from "@/server/settings";

export const dynamic = "force-dynamic";

function findAgent<T>(
  agentResults: { agentType: AgentType; summary: string; findings: unknown }[],
  type: AgentType,
): { summary: string; findings: T } | null {
  const r = agentResults.find((a) => a.agentType === type);
  if (!r) return null;
  return { summary: r.summary, findings: r.findings as T };
}

const DETERMINISTIC_DIMENSION_LABELS_NL: Record<keyof DeterministicScoringWeights, string> = {
  margin: "Marge",
  demand: "Vraag",
  competition: "Concurrentie",
  supplierQuality: "Leverancier",
  shipping: "Verzending",
  marketPriceOpportunity: "Marktkans",
  trend: "Momentum",
  operationalRisk: "Risico",
  highPotentialMin: "highPotentialMin",
  interestingMin: "interestingMin",
  watchMin: "watchMin",
};
const DETERMINISTIC_DIMENSIONS = [
  "margin",
  "demand",
  "competition",
  "supplierQuality",
  "shipping",
  "marketPriceOpportunity",
  "trend",
  "operationalRisk",
] as const;

const MOCK_DIMENSION_LABELS_NL: Record<string, string> = {
  demand: "Vraag",
  trend: "Trend",
  margin: "Marge",
  competition: "Concurrentie",
  brandability: "Merkpotentie",
  marketingAngles: "Marketing invalshoeken",
  supplierQuality: "Leverancierskwaliteit",
  shipping: "Verzending",
  operationalEase: "Operationele inspanning",
  risk: "Risico",
  marketPriceOpportunity: "Marktkans",
};

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

  // "Nederlandse markt" figures — the deterministic (real) Competitor Agent
  // stores median/low/high market price directly; the mock-mode one only
  // stores a min/max range. Both are shown, never invented for the other.
  const detCompetitor =
    competitorRaw && "medianMarketPriceEur" in competitorRaw.findings
      ? (competitorRaw.findings as DeterministicCompetitorFindings)
      : null;
  const mockCompetitor =
    competitorRaw && "priceRangeMinEur" in competitorRaw.findings ? (competitorRaw.findings as CompetitorFindings) : null;

  const weights = latestScore?.weightsUsed as Partial<DeterministicScoringWeights> | null;
  const isDeterministicRubric = !!weights && "operationalRisk" in weights;

  return (
    <div>
      <PageHeader
        title={product.title}
        description={`${product.category} · voor het eerst gezien ${formatDateTime(product.firstSeenAt)} · laatst gezien ${formatDateTime(product.lastSeenAt)} · ${product.timesSeen}x gezien`}
        actions={
          latestScore && (
            <Badge variant="secondary">Bron: {isRealMode ? "Apify (echt)" : "Demo (nagebootst)"}</Badge>
          )
        }
      />

      <div className="space-y-6 p-6">
        {/* OVERZICHT */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Overzicht</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-6">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title}
                className="size-20 shrink-0 rounded-lg border border-border object-cover"
              />
            )}
            <MoneyScoreGauge score={latestScore?.moneyScore ?? 0} size="lg" />
            <div className="flex flex-col items-start gap-2">
              {latestScore && <VerdictBadge verdict={latestScore.verdict} className="text-sm px-3 py-1" />}
              <Badge variant="outline">Status: {PRODUCT_STATUS_LABEL_NL[product.status]}</Badge>
              <ComplianceRiskBadge risk={product.complianceRisk} />
            </div>
            <div className="ml-auto text-right text-xs text-muted-foreground">
              <div>Onderzoekskosten voor deze analyse</div>
              <div className="mt-1 font-medium text-foreground">
                {isRealMode ? (
                  <CostDisplay value={formatUsdPrecise(totalApifyCostUsd)} kind="actual" size="sm" />
                ) : (
                  formatEur(totalAiCostEur, 4)
                )}
              </div>
            </div>
          </CardContent>
          {margin && (
            <CardContent className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <Metric label="Inkoopprijs" value={formatEur(margin.findings.buyPriceEur)} />
              <Metric label="Potentiële verkoopprijs" value={formatEur(margin.findings.sellingPriceEur)} />
              <Metric
                label="Verwachte marge"
                value={`${formatEur(margin.findings.scenarios.base.contributionMarginEur)} (${margin.findings.scenarios.base.marginPercent}%)`}
              />
              {competitorSightings.length > 0 && (
                <Metric label="Concurrenten gevonden" value={String(competitorSightings.length)} />
              )}
            </CardContent>
          )}
        </Card>

        {/* INKOOP & LEVERANCIER */}
        {(margin || supplier || product.sources.length > 0) && (
          <SectionCard title="Inkoop & leverancier">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {margin && <Metric label="Inkoopprijs" value={formatEur(margin.findings.buyPriceEur)} />}
              {margin && <Metric label="Verzendkosten" value={formatEur(margin.findings.shippingCostEur)} />}
              {supplier && (
                <Metric
                  label="Levertijd"
                  value={`${supplier.findings.leadTimeDaysMin}-${supplier.findings.leadTimeDaysMax} dagen`}
                />
              )}
              {supplier && <Metric label="Beoordeling leverancier" value={`${supplier.findings.bestSupplier.rating}/5`} />}
            </div>
            {product.sources.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
                {product.sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">{s.supplier.name}</span>
                    <span className="tabular-nums font-medium">{formatEur(s.price)}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline">
                        bekijk bron
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {/* NEDERLANDSE MARKT */}
        {(detCompetitor || mockCompetitor) && (
          <SectionCard title="Nederlandse markt" description={competitorSummary}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {detCompetitor && (
                <>
                  <Metric
                    label="Gemiddelde verkoopprijs"
                    value={detCompetitor.medianMarketPriceEur != null ? formatEur(detCompetitor.medianMarketPriceEur) : "—"}
                  />
                  <Metric
                    label="Laagste prijs"
                    value={detCompetitor.lowestMarketPriceEur != null ? formatEur(detCompetitor.lowestMarketPriceEur) : "—"}
                  />
                  <Metric
                    label="Hoogste prijs"
                    value={detCompetitor.highestMarketPriceEur != null ? formatEur(detCompetitor.highestMarketPriceEur) : "—"}
                  />
                  <Metric label="Aantal gevonden aanbieders" value={String(detCompetitor.competitorCount)} />
                  <Metric label="Concurrentieniveau" value={`${detCompetitor.marketSaturationScore}/10`} />
                </>
              )}
              {mockCompetitor && (
                <>
                  <Metric label="Laagste prijs" value={formatEur(mockCompetitor.priceRangeMinEur)} />
                  <Metric label="Hoogste prijs" value={formatEur(mockCompetitor.priceRangeMaxEur)} />
                  <Metric label="Aantal gevonden aanbieders" value={String(mockCompetitor.competitorCount)} />
                  <Metric label="Concurrentieniveau" value={mockCompetitor.competitorQuality} />
                </>
              )}
            </div>
            <div className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
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
                      {Math.round(s.matchConfidence * 100)}% overeenkomst
                    </span>
                  )}
                  {s.positioning && <span className="shrink-0 text-muted-foreground">{s.positioning}</span>}
                  {s.price != null && <span className="shrink-0 tabular-nums font-medium">{formatEur(s.price)}</span>}
                </a>
              ))}
              {competitorSightings.length === 0 && (
                <p className="text-sm text-muted-foreground">Geen aanbieders met voldoende zekerheid gevonden.</p>
              )}
            </div>
          </SectionCard>
        )}

        {/* MARGE */}
        {margin && (
          <SectionCard title="Marge">
            <div className="grid gap-3 sm:grid-cols-3">
              <ScenarioCard label="Conservatief" tone="danger" data={margin.findings.scenarios.bad} />
              <ScenarioCard label="Verwacht" tone="info" data={margin.findings.scenarios.base} />
              <ScenarioCard label="Optimistisch" tone="success" data={margin.findings.scenarios.good} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              BTW {margin.findings.vatRatePercent}% &middot; transactiekosten {margin.findings.transactionFeePercent}%
              &middot; fulfilment {formatEur(margin.findings.fulfillmentCostEur)} &middot; verwacht retourpercentage{" "}
              {margin.findings.returnRatePercent}%
            </p>
          </SectionCard>
        )}

        {/* WAAROM DEZE SCORE? */}
        {latestScore && (
          <SectionCard title="Waarom deze score?">
            {isDeterministicRubric && weights ? (
              <div className="space-y-2">
                {DETERMINISTIC_DIMENSIONS.map((dim) => {
                  const raw = (latestScore as unknown as Record<string, number | null>)[
                    dim === "operationalRisk" ? "operationalEase" : dim
                  ];
                  const rawScore = raw ?? 0;
                  const weight = weights[dim] ?? 0;
                  const points = Math.round((rawScore / 10) * weight);
                  const fraction = weight > 0 ? points / weight : 0;
                  return (
                    <div key={dim}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{DETERMINISTIC_DIMENSION_LABELS_NL[dim]}</span>
                        <span className="tabular-nums font-medium">
                          {points} / {weight}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${fraction >= 0.6 ? "bg-emerald-500" : fraction >= 0.4 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${Math.min(100, fraction * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(
                  [
                    ["demand", latestScore.demand],
                    ["trend", latestScore.trend],
                    ["margin", latestScore.margin],
                    ["competition", latestScore.competition],
                    ["brandability", latestScore.brandability],
                    ["marketingAngles", latestScore.marketingAngles],
                    ["supplierQuality", latestScore.supplierQuality],
                    ["shipping", latestScore.shipping],
                    ["operationalEase", latestScore.operationalEase],
                    ["risk", latestScore.risk],
                    ["marketPriceOpportunity", latestScore.marketPriceOpportunity],
                  ] as const
                )
                  .filter(([, value]) => value !== null)
                  .map(([key, value]) => (
                    <div key={key} className="rounded-md border border-border p-2 text-center">
                      <div className="text-lg font-semibold tabular-nums">{value}/10</div>
                      <div className="text-[11px] text-muted-foreground">{MOCK_DIMENSION_LABELS_NL[key]}</div>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">STERKE PUNTEN</div>
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
                <div className="mb-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">AANDACHTSPUNTEN</div>
                <ul className="space-y-1 text-sm">
                  {latestScore.concerns.length === 0 && (
                    <li className="text-muted-foreground">Geen belangrijke aandachtspunten gevonden.</li>
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
                  <span className="text-xs font-medium text-muted-foreground">VOLGENDE STAP: </span>
                  <span className="text-sm">{latestScore.nextStep}</span>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* MARKT (mock/LLM mode) */}
        {market && (
          <SectionCard title="Markt">
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
              <Metric label="Trendscore" value={`${trend.findings.trendScore}/10`} />
              <Metric
                label="Prijsbeweging"
                value={trend.findings.priceMovementPercent != null ? `${trend.findings.priceMovementPercent}%` : "—"}
              />
              <Metric label="Keer gezien" value={String(trend.findings.appearanceCount)} />
              <Metric label="Bestellingen bij bron" value={trend.findings.orderCount != null ? formatNumber(trend.findings.orderCount) : "—"} />
            </div>
          </SectionCard>
        )}

        {/* LEVERANCIERS (detail) */}
        {supplier && (
          <SectionCard title="Leveranciers">
            <p className="text-sm">{supplier.findings.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Metric label="Bekende leveranciers" value={String(supplier.findings.supplierCount)} />
              <Metric label="Prijsverschil" value={formatEur(supplier.findings.priceSpreadEur)} />
              <Metric
                label="Levertijd"
                value={`${supplier.findings.leadTimeDaysMin}-${supplier.findings.leadTimeDaysMax}d`}
              />
              <Metric label="Kwaliteitsscore" value={`${supplier.findings.supplierQualityScore}/10`} />
            </div>
          </SectionCard>
        )}

        {/* MERKPOTENTIE */}
        {brand && (
          <SectionCard title="Merkpotentie">
            <p className="text-sm">{brand.findings.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Metric label="Ideale klant" value={brand.findings.idealCustomer} />
              <Metric label="Opgelost probleem" value={brand.findings.problemSolved} />
              <Metric label="Emotionele haak" value={brand.findings.emotionalHook} />
              <Metric label="Functionele haak" value={brand.findings.functionalHook} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brand.findings.canBundle && <Badge variant="secondary">bundelpotentie</Badge>}
              {brand.findings.canAddPackagingValue && <Badge variant="secondary">verpakkingswaarde</Badge>}
              <Badge variant="secondary">herhaalaankoop: {brand.findings.repeatPurchasePotential}</Badge>
            </div>
          </SectionCard>
        )}

        {/* MARKETING INVALSHOEKEN */}
        {angle && (
          <SectionCard title="Marketing invalshoeken">
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

        {/* KRITISCHE BLIK */}
        {skeptic && (
          <SectionCard title="Kritische blik">
            <Badge variant="outline" className="mb-2">
              neiging: {skeptic.findings.verdictLean}
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

        {/* RISICO'S */}
        {risk && (
          <SectionCard title="Risico's">
            <div className="flex flex-wrap gap-2">
              <ComplianceRiskBadge risk={product.complianceRisk} />
              <Badge variant="outline">IP-risico: {risk.findings.ipRisk}</Badge>
              <Badge variant="outline">Retourrisico: {risk.findings.returnRiskEstimatePercent}%</Badge>
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

        {/* AGENT-RAPPORTEN — technisch, secundair */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Agent-rapporten (technisch)</CardTitle>
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

        {/* BESLISSINGSGESCHIEDENIS — technisch, secundair */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Beslissingsgeschiedenis (technisch)</CardTitle>
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
            {decisions.length === 0 && <p className="text-sm text-muted-foreground">Nog geen beslissingen vastgelegd.</p>}
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

function ScenarioCard({
  label,
  tone,
  data,
}: {
  label: string;
  tone: "danger" | "info" | "success";
  data: { contributionMarginEur: number; marginPercent: number };
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "danger"
        ? "border-red-500/25 bg-red-500/5"
        : "border-cyan-500/25 bg-cyan-500/5";
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{formatEur(data.contributionMarginEur)}</div>
      <div className="text-xs text-muted-foreground">{data.marginPercent}% marge</div>
    </div>
  );
}
