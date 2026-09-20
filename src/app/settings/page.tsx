import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { getAllSettings } from "@/server/settings";
import { prisma } from "@/server/db";
import { ALIEXPRESS_PROVIDERS } from "@/server/providers/apify/aliexpress";
import {
  updateApifyBudgetAction,
  updateBudgetAction,
  updateDeterministicScoringWeightsAction,
  updateFilterThresholdsAction,
  updateScoringWeightsAction,
  updateScoutConfigAction,
  updateShortlistAction,
} from "@/server/actions/settings";
import {
  addKeywordAction,
  addTopicAction,
  deleteKeywordAction,
  ensureDefaultTopicsAction,
  toggleKeywordEnabledAction,
  toggleTopicEnabledAction,
} from "@/server/actions/keywords";

export const dynamic = "force-dynamic";

function Field({ label, name, defaultValue, step = "any" }: { label: string; name: string; defaultValue: number; step?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={name} name={name} type="number" step={step} defaultValue={defaultValue} />
    </div>
  );
}

export default async function SettingsPage() {
  const settings = await getAllSettings();
  const topics = await prisma.searchTopic.findMany({
    orderBy: { name: "asc" },
    include: { keywords: { orderBy: { keyword: "asc" } } },
  });

  return (
    <div>
      <PageHeader title="Settings" description="Every threshold and weight the pipeline uses is configurable here." />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Apify budget</CardTitle>
            <CardDescription>Separate from the AI budget — real discovery/enrichment spend.</CardDescription>
          </CardHeader>
          <form action={updateApifyBudgetAction}>
            <CardContent className="grid grid-cols-2 gap-4 sm:max-w-md">
              <Field label="Daily target ($)" name="dailyTargetUsd" defaultValue={settings.apifyBudget.dailyTargetUsd} />
              <Field label="Hard limit ($)" name="hardLimitUsd" defaultValue={settings.apifyBudget.hardLimitUsd} />
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save Apify budget
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scout run sizing</CardTitle>
            <CardDescription>
              TEST_SCOUT is on by default — small volume, tight Apify cap — until you turn it off here.
            </CardDescription>
          </CardHeader>
          <form action={updateScoutConfigAction}>
            <CardContent className="flex items-center gap-3">
              <Switch id="testMode" name="testMode" defaultChecked={settings.scoutConfig.testMode} />
              <Label htmlFor="testMode" className="text-sm">
                Test mode (caps keywords/items/spend to a small proving run)
              </Label>
            </CardContent>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Max keywords / run" name="maxKeywordsPerRun" defaultValue={settings.scoutConfig.maxKeywordsPerRun} step="1" />
              <Field label="Max discovery items" name="maxDiscoveryItemsTotal" defaultValue={settings.scoutConfig.maxDiscoveryItemsTotal} step="1" />
              <Field label="Max market-enriched items" name="maxMarketEnrichmentItems" defaultValue={settings.scoutConfig.maxMarketEnrichmentItems} step="1" />
              <Field label="Test-mode Apify cap ($)" name="testModeApifyBudgetCapUsd" defaultValue={settings.scoutConfig.testModeApifyBudgetCapUsd} />
            </CardContent>
            <CardContent className="max-w-xs space-y-1">
              <Label htmlFor="aliexpressProviderId" className="text-xs text-muted-foreground">
                AliExpress discovery Actor
              </Label>
              <select
                id="aliexpressProviderId"
                name="aliexpressProviderId"
                defaultValue={settings.scoutConfig.aliexpressProviderId}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
              >
                {Object.values(ALIEXPRESS_PROVIDERS).map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.actorId} {provider.supportsBatching ? "(batches keywords)" : "(one run/keyword)"}
                  </option>
                ))}
              </select>
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save scout config
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rule-based Judge weights</CardTitle>
            <CardDescription>
              Used by the real (Apify, zero-AI) pipeline’s Judge — separate from the LLM-mode weights below.
            </CardDescription>
          </CardHeader>
          <form action={updateDeterministicScoringWeightsAction}>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Margin" name="margin" defaultValue={settings.deterministicScoringWeights.margin} />
              <Field label="Demand" name="demand" defaultValue={settings.deterministicScoringWeights.demand} />
              <Field label="Competition" name="competition" defaultValue={settings.deterministicScoringWeights.competition} />
              <Field label="Supplier quality" name="supplierQuality" defaultValue={settings.deterministicScoringWeights.supplierQuality} />
              <Field label="Shipping" name="shipping" defaultValue={settings.deterministicScoringWeights.shipping} />
              <Field label="Market price opportunity" name="marketPriceOpportunity" defaultValue={settings.deterministicScoringWeights.marketPriceOpportunity} />
              <Field label="Trend / momentum" name="trend" defaultValue={settings.deterministicScoringWeights.trend} />
              <Field label="Operational risk" name="operationalRisk" defaultValue={settings.deterministicScoringWeights.operationalRisk} />
            </CardContent>
            <CardContent className="grid grid-cols-3 gap-4 sm:max-w-md">
              <Field label="High Potential ≥" name="highPotentialMin" defaultValue={settings.deterministicScoringWeights.highPotentialMin} step="1" />
              <Field label="Interesting ≥" name="interestingMin" defaultValue={settings.deterministicScoringWeights.interestingMin} step="1" />
              <Field label="Watch ≥" name="watchMin" defaultValue={settings.deterministicScoringWeights.watchMin} step="1" />
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save Judge weights
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Search topics &amp; keywords</CardTitle>
            <CardDescription>What the real Scout searches on AliExpress. Disable a topic or keyword to exclude it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {topics.length === 0 && (
              <form action={ensureDefaultTopicsAction}>
                <Button type="submit" size="sm" variant="outline">
                  Seed default topics
                </Button>
              </form>
            )}
            {topics.map((topic) => (
              <div key={topic.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{topic.name}</span>
                    <Badge variant={topic.enabled ? "secondary" : "outline"}>
                      {topic.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </div>
                  <form action={toggleTopicEnabledAction.bind(null, topic.id, !topic.enabled)}>
                    <Button type="submit" size="sm" variant="ghost">
                      {topic.enabled ? "Disable" : "Enable"}
                    </Button>
                  </form>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topic.keywords.map((k) => (
                    <span key={k.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                      <span className={k.enabled ? "" : "text-muted-foreground line-through"}>{k.keyword}</span>
                      <span className="text-[10px] text-muted-foreground">({k.timesUsed}x)</span>
                      <form action={toggleKeywordEnabledAction.bind(null, k.id, !k.enabled)} className="inline">
                        <button type="submit" className="text-muted-foreground hover:text-foreground" aria-label="toggle keyword">
                          {k.enabled ? "–" : "+"}
                        </button>
                      </form>
                      <form action={deleteKeywordAction.bind(null, k.id)} className="inline">
                        <button type="submit" className="text-muted-foreground hover:text-destructive" aria-label="delete keyword">
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
                <form action={addKeywordAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="topicId" value={topic.id} />
                  <Input name="keyword" placeholder="add keyword…" className="h-7 max-w-xs text-xs" />
                  <Button type="submit" size="sm" variant="outline" className="h-7">
                    Add
                  </Button>
                </form>
              </div>
            ))}
            <form action={addTopicAction} className="flex gap-2 pt-2">
              <Input name="name" placeholder="new topic name…" className="max-w-xs" />
              <Button type="submit" size="sm" variant="outline">
                Add topic
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI budget (mock/demo pipeline)</CardTitle>
            <CardDescription>Hard daily limit is never exceeded, no exceptions.</CardDescription>
          </CardHeader>
          <form action={updateBudgetAction}>
            <CardContent className="grid grid-cols-2 gap-4 sm:max-w-md">
              <Field label="Daily target (€)" name="dailyTargetEur" defaultValue={settings.budget.dailyTargetEur} />
              <Field label="Hard limit (€)" name="hardLimitEur" defaultValue={settings.budget.hardLimitEur} />
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save budget
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stage 1 filter thresholds</CardTitle>
            <CardDescription>Zero-AI rules that decide what&apos;s even worth analyzing.</CardDescription>
          </CardHeader>
          <form action={updateFilterThresholdsAction}>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Min purchase price (€)" name="minPurchasePriceEur" defaultValue={settings.filterThresholds.minPurchasePriceEur} />
              <Field label="Max purchase price (€)" name="maxPurchasePriceEur" defaultValue={settings.filterThresholds.maxPurchasePriceEur} />
              <Field label="Min selling price (€)" name="minSellingPriceEur" defaultValue={settings.filterThresholds.minSellingPriceEur} />
              <Field label="Max selling price (€)" name="maxSellingPriceEur" defaultValue={settings.filterThresholds.maxSellingPriceEur} />
              <Field label="Min gross margin (€)" name="minGrossMarginEur" defaultValue={settings.filterThresholds.minGrossMarginEur} />
              <Field label="Preferred gross margin (€)" name="preferredGrossMarginEur" defaultValue={settings.filterThresholds.preferredGrossMarginEur} />
              <Field label="Preferred markup (x)" name="preferredMarkupMultiplier" defaultValue={settings.filterThresholds.preferredMarkupMultiplier} />
              <Field label="Min supplier rating" name="minSupplierRating" defaultValue={settings.filterThresholds.minSupplierRating} />
              <Field label="Min review count" name="minReviewCount" defaultValue={settings.filterThresholds.minReviewCount} step="1" />
              <Field label="Max shipping days" name="maxShippingDays" defaultValue={settings.filterThresholds.maxShippingDays} step="1" />
              <Field label="Max weight (g)" name="maxWeightGrams" defaultValue={settings.filterThresholds.maxWeightGrams} step="1" />
            </CardContent>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="excludedCategories" className="text-xs text-muted-foreground">
                  Excluded categories (comma-separated, hard block)
                </Label>
                <Input
                  id="excludedCategories"
                  name="excludedCategories"
                  defaultValue={settings.filterThresholds.excludedCategories.join(", ")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="highRiskCategories" className="text-xs text-muted-foreground">
                  High-risk categories (comma-separated, flagged not blocked)
                </Label>
                <Input
                  id="highRiskCategories"
                  name="highRiskCategories"
                  defaultValue={settings.filterThresholds.highRiskCategories.join(", ")}
                />
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save filter thresholds
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>LLM Judge scoring weights (mock/demo pipeline)</CardTitle>
            <CardDescription>
              How much each rubric dimension counts toward the Money Score in the mock-LLM demo pipeline.
            </CardDescription>
          </CardHeader>
          <form action={updateScoringWeightsAction}>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Field label="Demand" name="demand" defaultValue={settings.scoringWeights.demand} />
              <Field label="Trend" name="trend" defaultValue={settings.scoringWeights.trend} />
              <Field label="Margin" name="margin" defaultValue={settings.scoringWeights.margin} />
              <Field label="Competition" name="competition" defaultValue={settings.scoringWeights.competition} />
              <Field label="Brandability" name="brandability" defaultValue={settings.scoringWeights.brandability} />
              <Field label="Marketing angles" name="marketingAngles" defaultValue={settings.scoringWeights.marketingAngles} />
              <Field label="Supplier quality" name="supplierQuality" defaultValue={settings.scoringWeights.supplierQuality} />
              <Field label="Shipping" name="shipping" defaultValue={settings.scoringWeights.shipping} />
              <Field label="Operational ease" name="operationalEase" defaultValue={settings.scoringWeights.operationalEase} />
              <Field label="Risk" name="risk" defaultValue={settings.scoringWeights.risk} />
            </CardContent>
            <CardContent className="grid grid-cols-3 gap-4 sm:max-w-md">
              <Field label="High Potential ≥" name="highPotentialMin" defaultValue={settings.scoringWeights.highPotentialMin} step="1" />
              <Field label="Interesting ≥" name="interestingMin" defaultValue={settings.scoringWeights.interestingMin} step="1" />
              <Field label="Watch ≥" name="watchMin" defaultValue={settings.scoringWeights.watchMin} step="1" />
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save scoring weights
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shortlist / discovery</CardTitle>
            <CardDescription>Controls how many products move deeper into the funnel each run.</CardDescription>
          </CardHeader>
          <form action={updateShortlistAction}>
            <CardContent className="grid grid-cols-3 gap-4 sm:max-w-lg">
              <Field label="Shortlist pool size" name="enrichmentCutCount" defaultValue={settings.shortlist.enrichmentCutCount} step="1" />
              <Field label="Min enrichment score" name="enrichmentMinScore" defaultValue={settings.shortlist.enrichmentMinScore} step="1" />
              <Field label="Deep research cap / run" name="deepResearchCutCount" defaultValue={settings.shortlist.deepResearchCutCount} step="1" />
            </CardContent>
            <CardContent className="pt-0">
              <Button type="submit" size="sm">
                Save shortlist settings
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
