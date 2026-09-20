import Link from "next/link";
import Image from "next/image";
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { VerdictBadge, ComplianceRiskBadge } from "@/components/verdict-badge";
import { MoneyScoreGauge } from "@/components/money-score-gauge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEur } from "@/lib/format";
import { listOpportunities } from "@/server/queries/opportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const products = await listOpportunities();

  return (
    <div>
      <PageHeader
        title="Kansen"
        description={`${products.length} product${products.length === 1 ? "" : "en"} beoordeeld`}
      />
      <div className="p-6">
        {products.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Nog geen kansen gevonden"
            description="Start een zoekronde. MoneyScouter zoekt vervolgens naar producten die aan jouw voorwaarden voldoen."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const bestSource = product.sources[0];
              return (
                <Link key={product.id} href={`/opportunities/${product.id}`} className="group">
                  <Card className="card-elevated h-full overflow-hidden transition-colors group-hover:border-primary/40">
                    <div className="relative flex aspect-[4/3] items-center justify-center bg-muted/40">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 25vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <PackageSearch className="size-8 text-muted-foreground/40" />
                      )}
                      {product.currentScore != null && (
                        <div className="absolute right-2 top-2 rounded-full bg-background/90 p-0.5 card-elevated">
                          <MoneyScoreGauge score={product.currentScore} size="sm" />
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm leading-snug line-clamp-2">{product.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {product.currentVerdict && <VerdictBadge verdict={product.currentVerdict} />}
                        <ComplianceRiskBadge risk={product.complianceRisk} />
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">Inkoopprijs</span>
                        <span className="font-medium tabular-nums">{bestSource ? formatEur(bestSource.price) : "—"}</span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-muted-foreground">Categorie</span>
                        <span className="truncate pl-2 text-right font-medium">{product.category}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
