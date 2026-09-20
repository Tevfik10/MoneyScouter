import { PageHeader } from "@/components/page-header";
import { RunScoutButton } from "@/components/run-scout-button";
import { RunDemoScoutButton } from "@/components/run-demo-scout-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getLatestRun } from "@/server/queries/dashboard";
import { getApifyBudgetSnapshot } from "@/server/queries/apify";
import { getAllSettings } from "@/server/settings";
import { formatNumber, formatUsd } from "@/lib/format";
import { prisma } from "@/server/db";
import { ALIEXPRESS_ACTOR_ID } from "@/server/providers/apify/aliexpress/provider";
import { GOOGLE_SHOPPING_ACTOR_ID } from "@/server/providers/apify/googleShopping/provider";

export const dynamic = "force-dynamic";

const EXAMPLE_QUERIES = [
  "Find products between €30 and €80 retail with at least €20 estimated margin.",
  "Only investigate fitness products tonight.",
  "Why did you reject product 847?",
  "Find products where Dutch competition is weak but US demand is established.",
];

export default async function DiscoverPage() {
  const [run, apifyBudget, settings, topics] = await Promise.all([
    getLatestRun(),
    getApifyBudgetSnapshot(),
    getAllSettings(),
    prisma.searchTopic.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { keywords: true } } },
    }),
  ]);
  const hasApifyToken = !!process.env.APIFY_API_TOKEN;

  return (
    <div>
      <PageHeader
        title="Discover"
        description="Providers scan for new commercial opportunities before anything is filtered or analyzed."
        actions={
          <div className="flex items-center gap-2">
            <RunDemoScoutButton />
            <RunScoutButton />
          </div>
        }
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Real providers (Apify)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">{ALIEXPRESS_ACTOR_ID}</div>
                <div className="text-xs text-muted-foreground">
                  Discovery — real AliExpress search results, normalized into products, deduplicated by fingerprint.
                </div>
              </div>
              <Badge variant={hasApifyToken ? "default" : "outline"}>
                {hasApifyToken ? "configured" : "APIFY_API_TOKEN missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">{GOOGLE_SHOPPING_ACTOR_ID}</div>
                <div className="text-xs text-muted-foreground">
                  Market enrichment — real competitor listings, fuzzy-matched. Only called on shortlisted products.
                </div>
              </div>
              <Badge variant={hasApifyToken ? "default" : "outline"}>
                {hasApifyToken ? "configured" : "APIFY_API_TOKEN missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">mock</div>
                <div className="text-xs text-muted-foreground">
                  Deterministic demo catalog, no network calls — used only by &ldquo;Run Demo&rdquo;.
                </div>
              </div>
              <Badge variant="secondary">local dev / demo only</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Apify budget today: {formatUsd(apifyBudget.spentTodayUsd)} / {formatUsd(apifyBudget.dailyTargetUsd)}{" "}
              (hard limit {formatUsd(apifyBudget.hardLimitUsd)}). Test mode is{" "}
              {settings.scoutConfig.testMode ? "on" : "off"} — configurable in Settings.
            </p>
            {run && (
              <p className="text-xs text-muted-foreground">
                Last run ({run.mode === "APIFY_DETERMINISTIC" ? "Apify" : "mock"}) discovered{" "}
                {formatNumber(run.discoveredCount)} items.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Search topics ({topics.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {topics.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No search topics configured yet — they&apos;ll seed automatically on the next real run, or you can
                seed them now from Settings.
              </p>
            )}
            {topics.map((t) => (
              <Badge key={t.id} variant={t.enabled ? "secondary" : "outline"}>
                {t.name} ({t._count.keywords})
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
