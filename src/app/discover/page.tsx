import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getPoolCategoryDefs } from "@/server/providers/discovery/mockDiscoveryProvider";
import { getLatestRun } from "@/server/queries/dashboard";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

const EXAMPLE_QUERIES = [
  "Find products between €30 and €80 retail with at least €20 estimated margin.",
  "Only investigate fitness products tonight.",
  "Why did you reject product 847?",
  "Find products where Dutch competition is weak but US demand is established.",
];

export default async function DiscoverPage() {
  const categories = getPoolCategoryDefs();
  const run = await getLatestRun();

  return (
    <div>
      <PageHeader
        title="Discover"
        description="Providers scan for new commercial opportunities before anything is filtered or analyzed."
        actions={<RunScoutButton />}
      />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Command bar (preview)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input disabled placeholder="Ask MoneyScouter… (coming soon)" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLE_QUERIES.map((q) => (
                <Badge key={q} variant="secondary" className="font-normal">
                  {q}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Discovery providers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">mock</div>
                <div className="text-xs text-muted-foreground">
                  Deterministic demo catalog — stands in for AliExpress/Alibaba/CJdropshipping/Google
                  Shopping until real adapters are wired up.
                </div>
              </div>
              <Badge>enabled</Badge>
            </div>
            {run && (
              <p className="text-xs text-muted-foreground">
                Last run discovered {formatNumber(run.discoveredCount)} items.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Catalog categories ({categories.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.category} variant={c.excluded ? "destructive" : c.highRisk ? "outline" : "secondary"}>
                {c.category}
                {c.excluded && " (excluded)"}
                {c.highRisk && " (high risk)"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
