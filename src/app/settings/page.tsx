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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export default async function SettingsPage() {
  const settings = await getAllSettings();
  const topics = await prisma.searchTopic.findMany({
    orderBy: { name: "asc" },
    include: { keywords: { orderBy: { keyword: "asc" } } },
  });

  return (
    <div>
      <PageHeader title="Instellingen" description="Elke drempelwaarde en weging die de pipeline gebruikt, stel je hier in." />
      <div className="space-y-6 p-6">
        {/* ZOEKINSTELLINGEN */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zoekinstellingen</h2>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Zoekronde-instellingen</CardTitle>
              <CardDescription>
                Testmodus staat standaard aan — kleine, goedkope zoekrondes — tot je hem hier uitzet.
              </CardDescription>
            </CardHeader>
            <form action={updateScoutConfigAction}>
              <CardContent className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <Switch id="testMode" name="testMode" defaultChecked={settings.scoutConfig.testMode} />
                  <Label htmlFor="testMode" className="text-sm">
                    Testmodus
                  </Label>
                </div>
                <Hint>Gebruik kleinere zoekrondes om MoneyScouter goedkoop en veilig te testen.</Hint>
              </CardContent>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Max. zoektermen / ronde" name="maxKeywordsPerRun" defaultValue={settings.scoutConfig.maxKeywordsPerRun} step="1" />
                <Field label="Max. gevonden producten" name="maxDiscoveryItemsTotal" defaultValue={settings.scoutConfig.maxDiscoveryItemsTotal} step="1" />
                <Field label="Max. producten voor marktcheck" name="maxMarketEnrichmentItems" defaultValue={settings.scoutConfig.maxMarketEnrichmentItems} step="1" />
                <Field label="Apify-limiet testmodus ($)" name="testModeApifyBudgetCapUsd" defaultValue={settings.scoutConfig.testModeApifyBudgetCapUsd} />
              </CardContent>
              <CardContent className="max-w-sm space-y-1">
                <Label htmlFor="aliexpressProviderId" className="text-xs text-muted-foreground">
                  AliExpress-databron
                </Label>
                <select
                  id="aliexpressProviderId"
                  name="aliexpressProviderId"
                  defaultValue={settings.scoutConfig.aliexpressProviderId}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {Object.values(ALIEXPRESS_PROVIDERS).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.actorId} {provider.supportsBatching ? "(combineert zoektermen)" : "(één per zoekterm)"}
                    </option>
                  ))}
                </select>
                <Hint>Welke databron MoneyScouter gebruikt om AliExpress te doorzoeken.</Hint>
              </CardContent>
              <CardContent className="pt-0">
                <Button type="submit" size="sm">
                  Zoekinstellingen opslaan
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>

        {/* BUDGET & KOSTEN */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget &amp; kosten</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Apify-budget</CardTitle>
                <CardDescription>Los van het AI-budget — voor het echt ophalen van productdata.</CardDescription>
              </CardHeader>
              <form action={updateApifyBudgetAction}>
                <CardContent className="grid grid-cols-2 gap-4">
                  <Field label="Dagelijks streefbedrag ($)" name="dailyTargetUsd" defaultValue={settings.apifyBudget.dailyTargetUsd} />
                  <Field label="Maximaal dagbudget ($)" name="hardLimitUsd" defaultValue={settings.apifyBudget.hardLimitUsd} />
                </CardContent>
                <CardContent className="pt-0">
                  <Hint>Het maximale bedrag dat MoneyScouter per dag via Apify mag uitgeven. MoneyScouter stopt automatisch zodra deze limiet is bereikt.</Hint>
                </CardContent>
                <CardContent className="pt-2">
                  <Button type="submit" size="sm">
                    Apify-budget opslaan
                  </Button>
                </CardContent>
              </form>
            </Card>

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>AI-budget (demo-pipeline)</CardTitle>
                <CardDescription>Het dagelijkse maximum wordt nooit overschreden, zonder uitzondering.</CardDescription>
              </CardHeader>
              <form action={updateBudgetAction}>
                <CardContent className="grid grid-cols-2 gap-4">
                  <Field label="Dagelijks streefbedrag (€)" name="dailyTargetEur" defaultValue={settings.budget.dailyTargetEur} />
                  <Field label="Maximaal dagbudget (€)" name="hardLimitEur" defaultValue={settings.budget.hardLimitEur} />
                </CardContent>
                <CardContent className="pt-0">
                  <Button type="submit" size="sm">
                    AI-budget opslaan
                  </Button>
                </CardContent>
              </form>
            </Card>
          </div>
        </div>

        {/* SELECTIEREGELS */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selectieregels</h2>
          <div className="space-y-4">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Eerste-selectieregels</CardTitle>
                <CardDescription>Regels zonder AI die bepalen wat de moeite van analyseren waard is.</CardDescription>
              </CardHeader>
              <form action={updateFilterThresholdsAction}>
                <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Min. inkoopprijs (€)" name="minPurchasePriceEur" defaultValue={settings.filterThresholds.minPurchasePriceEur} />
                  <Field label="Max. inkoopprijs (€)" name="maxPurchasePriceEur" defaultValue={settings.filterThresholds.maxPurchasePriceEur} />
                  <Field label="Min. verkoopprijs (€)" name="minSellingPriceEur" defaultValue={settings.filterThresholds.minSellingPriceEur} />
                  <Field label="Max. verkoopprijs (€)" name="maxSellingPriceEur" defaultValue={settings.filterThresholds.maxSellingPriceEur} />
                  <Field label="Min. brutomarge (€)" name="minGrossMarginEur" defaultValue={settings.filterThresholds.minGrossMarginEur} />
                  <Field label="Gewenste brutomarge (€)" name="preferredGrossMarginEur" defaultValue={settings.filterThresholds.preferredGrossMarginEur} />
                  <Field label="Gewenste opslagfactor (x)" name="preferredMarkupMultiplier" defaultValue={settings.filterThresholds.preferredMarkupMultiplier} />
                  <Field label="Min. beoordeling leverancier" name="minSupplierRating" defaultValue={settings.filterThresholds.minSupplierRating} />
                  <Field label="Min. aantal reviews" name="minReviewCount" defaultValue={settings.filterThresholds.minReviewCount} step="1" />
                  <Field label="Max. levertijd (dagen)" name="maxShippingDays" defaultValue={settings.filterThresholds.maxShippingDays} step="1" />
                  <Field label="Max. gewicht (g)" name="maxWeightGrams" defaultValue={settings.filterThresholds.maxWeightGrams} step="1" />
                </CardContent>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="excludedCategories" className="text-xs text-muted-foreground">
                      Uitgesloten categorieën (kommagescheiden, altijd geblokkeerd)
                    </Label>
                    <Input
                      id="excludedCategories"
                      name="excludedCategories"
                      defaultValue={settings.filterThresholds.excludedCategories.join(", ")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="highRiskCategories" className="text-xs text-muted-foreground">
                      Risicovolle categorieën (kommagescheiden, gemarkeerd maar niet geblokkeerd)
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
                    Selectieregels opslaan
                  </Button>
                </CardContent>
              </form>
            </Card>

            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Shortlist &amp; verkenning</CardTitle>
                <CardDescription>Hoeveel producten er per zoekronde dieper de trechter in gaan.</CardDescription>
              </CardHeader>
              <form action={updateShortlistAction}>
                <CardContent className="grid grid-cols-3 gap-4 sm:max-w-lg">
                  <Field label="Grootte shortlist" name="enrichmentCutCount" defaultValue={settings.shortlist.enrichmentCutCount} step="1" />
                  <Field label="Min. score voor shortlist" name="enrichmentMinScore" defaultValue={settings.shortlist.enrichmentMinScore} step="1" />
                  <Field label="Max. uitgebreid onderzocht / ronde" name="deepResearchCutCount" defaultValue={settings.shortlist.deepResearchCutCount} step="1" />
                </CardContent>
                <CardContent className="pt-0">
                  <Button type="submit" size="sm">
                    Shortlist-instellingen opslaan
                  </Button>
                </CardContent>
              </form>
            </Card>
          </div>
        </div>

        {/* MONEYSCORE */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">MoneyScore</h2>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Wegingen MoneyScore</CardTitle>
              <CardDescription>
                Bepaalt hoe zwaar elk onderdeel meetelt in de MoneyScore van de echte (Apify, zonder AI) pipeline.
              </CardDescription>
            </CardHeader>
            <form action={updateDeterministicScoringWeightsAction}>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Marge" name="margin" defaultValue={settings.deterministicScoringWeights.margin} />
                <Field label="Vraag" name="demand" defaultValue={settings.deterministicScoringWeights.demand} />
                <Field label="Concurrentie" name="competition" defaultValue={settings.deterministicScoringWeights.competition} />
                <Field label="Leverancierskwaliteit" name="supplierQuality" defaultValue={settings.deterministicScoringWeights.supplierQuality} />
                <Field label="Verzending" name="shipping" defaultValue={settings.deterministicScoringWeights.shipping} />
                <Field label="Marktkans" name="marketPriceOpportunity" defaultValue={settings.deterministicScoringWeights.marketPriceOpportunity} />
                <Field label="Trend / momentum" name="trend" defaultValue={settings.deterministicScoringWeights.trend} />
                <Field label="Operationeel risico" name="operationalRisk" defaultValue={settings.deterministicScoringWeights.operationalRisk} />
              </CardContent>
              <CardContent className="grid grid-cols-3 gap-4 sm:max-w-md">
                <Field label="Hoge potentie ≥" name="highPotentialMin" defaultValue={settings.deterministicScoringWeights.highPotentialMin} step="1" />
                <Field label="Interessant ≥" name="interestingMin" defaultValue={settings.deterministicScoringWeights.interestingMin} step="1" />
                <Field label="In de gaten houden ≥" name="watchMin" defaultValue={settings.deterministicScoringWeights.watchMin} step="1" />
              </CardContent>
              <CardContent className="pt-0">
                <Button type="submit" size="sm">
                  MoneyScore-wegingen opslaan
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>

        {/* ZOEKONDERWERPEN */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zoekonderwerpen</h2>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Onderwerpen &amp; zoektermen</CardTitle>
              <CardDescription>Waar de echte Scout op zoekt bij AliExpress. Zet een onderwerp of term uit om hem over te slaan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {topics.length === 0 && (
                <form action={ensureDefaultTopicsAction}>
                  <Button type="submit" size="sm" variant="outline">
                    Standaardonderwerpen aanmaken
                  </Button>
                </form>
              )}
              {topics.map((topic) => (
                <div key={topic.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{topic.name}</span>
                      <Badge variant={topic.enabled ? "secondary" : "outline"}>
                        {topic.enabled ? "actief" : "uit"}
                      </Badge>
                    </div>
                    <form action={toggleTopicEnabledAction.bind(null, topic.id, !topic.enabled)}>
                      <Button type="submit" size="sm" variant="ghost">
                        {topic.enabled ? "Uitschakelen" : "Inschakelen"}
                      </Button>
                    </form>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topic.keywords.map((k) => (
                      <span key={k.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                        <span className={k.enabled ? "" : "text-muted-foreground line-through"}>{k.keyword}</span>
                        <span className="text-[10px] text-muted-foreground">({k.timesUsed}x)</span>
                        <form action={toggleKeywordEnabledAction.bind(null, k.id, !k.enabled)} className="inline">
                          <button type="submit" className="text-muted-foreground hover:text-foreground" aria-label="zoekterm aan/uit">
                            {k.enabled ? "–" : "+"}
                          </button>
                        </form>
                        <form action={deleteKeywordAction.bind(null, k.id)} className="inline">
                          <button type="submit" className="text-muted-foreground hover:text-destructive" aria-label="zoekterm verwijderen">
                            ×
                          </button>
                        </form>
                      </span>
                    ))}
                  </div>
                  <form action={addKeywordAction} className="mt-2 flex gap-2">
                    <input type="hidden" name="topicId" value={topic.id} />
                    <Input name="keyword" placeholder="zoekterm toevoegen…" className="h-7 max-w-xs text-xs" />
                    <Button type="submit" size="sm" variant="outline" className="h-7">
                      Toevoegen
                    </Button>
                  </form>
                </div>
              ))}
              <form action={addTopicAction} className="flex gap-2 pt-2">
                <Input name="name" placeholder="naam nieuw onderwerp…" className="max-w-xs" />
                <Button type="submit" size="sm" variant="outline">
                  Onderwerp toevoegen
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* GEAVANCEERDE INSTELLINGEN */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Geavanceerde instellingen</h2>
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>MoneyScore-wegingen demo-pipeline (AI)</CardTitle>
              <CardDescription>
                Hoe zwaar elk onderdeel meetelt in de MoneyScore van de nagebootste demo-pipeline. Wordt niet gebruikt
                door de echte zoekronde.
              </CardDescription>
            </CardHeader>
            <form action={updateScoringWeightsAction}>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Field label="Vraag" name="demand" defaultValue={settings.scoringWeights.demand} />
                <Field label="Trend" name="trend" defaultValue={settings.scoringWeights.trend} />
                <Field label="Marge" name="margin" defaultValue={settings.scoringWeights.margin} />
                <Field label="Concurrentie" name="competition" defaultValue={settings.scoringWeights.competition} />
                <Field label="Merkpotentie" name="brandability" defaultValue={settings.scoringWeights.brandability} />
                <Field label="Marketing invalshoeken" name="marketingAngles" defaultValue={settings.scoringWeights.marketingAngles} />
                <Field label="Leverancierskwaliteit" name="supplierQuality" defaultValue={settings.scoringWeights.supplierQuality} />
                <Field label="Verzending" name="shipping" defaultValue={settings.scoringWeights.shipping} />
                <Field label="Operationele inspanning" name="operationalEase" defaultValue={settings.scoringWeights.operationalEase} />
                <Field label="Risico" name="risk" defaultValue={settings.scoringWeights.risk} />
              </CardContent>
              <CardContent className="grid grid-cols-3 gap-4 sm:max-w-md">
                <Field label="Hoge potentie ≥" name="highPotentialMin" defaultValue={settings.scoringWeights.highPotentialMin} step="1" />
                <Field label="Interessant ≥" name="interestingMin" defaultValue={settings.scoringWeights.interestingMin} step="1" />
                <Field label="In de gaten houden ≥" name="watchMin" defaultValue={settings.scoringWeights.watchMin} step="1" />
              </CardContent>
              <CardContent className="pt-0">
                <Button type="submit" size="sm">
                  Wegingen opslaan
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
