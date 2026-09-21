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
import { alibabaApifyProvider } from "@/server/providers/apify/alibaba/provider";
import { GOOGLE_SHOPPING_ACTOR_ID } from "@/server/providers/apify/googleShopping/provider";

export const dynamic = "force-dynamic";
// See src/app/research-runs/page.tsx for why this is set.
export const maxDuration = 300;

const EXAMPLE_QUERIES = [
  "Zoek producten tussen €30 en €80 verkoopprijs met minimaal €20 geschatte marge.",
  "Onderzoek vanavond alleen fitnessproducten.",
  "Waarom is product 847 afgewezen?",
  "Zoek producten met weinig Nederlandse concurrentie en aantoonbare vraag.",
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
        title="Ontdekken"
        description="Providers scannen naar nieuwe commerciële kansen, voordat er iets gefilterd of geanalyseerd wordt."
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Zoekbalk (preview)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input disabled placeholder="Vraag iets aan MoneyScouter… (binnenkort beschikbaar)" />
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Echte databronnen (Apify)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">
                  {alibabaApifyProvider.actorId}
                  <Badge variant="secondary" className="ml-2 font-normal">
                    actief
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Zoeken naar leveranciers — echte Alibaba-zoekresultaten (B2B), omgezet naar productconcepten met
                  leveranciersaanbiedingen en ontdubbeld.{" "}
                  {alibabaApifyProvider.supportsBatching
                    ? "Doorzoekt alle ingestelde zoektermen in één keer."
                    : "Eén zoekactie per zoekterm (kan niet combineren)."}
                </div>
              </div>
              <Badge variant={hasApifyToken ? "default" : "outline"}>
                {hasApifyToken ? "gekoppeld" : "Apify-koppeling ontbreekt"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              AliExpress is niet meer actief in de zoekpijplijn — Alibaba (B2B, met leveranciersgegevens en MOQ) is
              de enige actieve bron voor productontdekking.
            </p>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">{GOOGLE_SHOPPING_ACTOR_ID}</div>
                <div className="text-xs text-muted-foreground">
                  Marktverrijking — echte concurrerende aanbiedingen, herkend op gelijkenis. Alleen gebruikt voor
                  producten op de shortlist.
                </div>
              </div>
              <Badge variant={hasApifyToken ? "default" : "outline"}>
                {hasApifyToken ? "gekoppeld" : "Apify-koppeling ontbreekt"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="font-medium">demo</div>
                <div className="text-xs text-muted-foreground">
                  Nagebootste catalogus, geen netwerkverkeer — alleen gebruikt door &ldquo;Demo uitvoeren&rdquo;.
                </div>
              </div>
              <Badge variant="secondary">alleen lokaal / demo</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Apify-budget vandaag: {formatUsd(apifyBudget.spentTodayUsd)} / {formatUsd(apifyBudget.dailyTargetUsd)}{" "}
              (maximaal {formatUsd(apifyBudget.hardLimitUsd)}). Testmodus staat{" "}
              {settings.scoutConfig.testMode ? "aan" : "uit"} — in te stellen bij Instellingen.
            </p>
            {run && (
              <p className="text-xs text-muted-foreground">
                Laatste zoekronde ({run.mode === "APIFY_DETERMINISTIC" ? "Apify" : "demo"}) vond{" "}
                {formatNumber(run.discoveredCount)} producten.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Zoekonderwerpen ({topics.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {topics.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nog geen zoekonderwerpen ingesteld — deze worden automatisch aangemaakt bij de volgende zoekronde, of
                stel ze nu al in bij Instellingen.
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
