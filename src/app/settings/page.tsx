import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getAllSettings } from "@/server/settings";
import {
  updateBudgetAction,
  updateFilterThresholdsAction,
  updateScoringWeightsAction,
  updateShortlistAction,
} from "@/server/actions/settings";

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

  return (
    <div>
      <PageHeader title="Settings" description="Every threshold and weight the pipeline uses is configurable here." />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>AI budget</CardTitle>
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
            <CardTitle>Judge scoring weights</CardTitle>
            <CardDescription>
              How much each rubric dimension counts toward the Money Score, and the verdict cutoffs.
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
