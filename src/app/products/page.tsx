import Link from "next/link";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComplianceRiskBadge } from "@/components/verdict-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatEur, formatNumber } from "@/lib/format";
import { PRODUCT_STATUS_LABEL_NL } from "@/lib/labels";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: 200,
    include: { sources: { orderBy: { price: "asc" }, take: 1 } },
  });

  return (
    <div>
      <PageHeader title="Producten" description={`${formatNumber(products.length)} producten in het geheugen van MoneyScouter`} />
      <div className="p-6">
        {products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nog geen producten gevonden"
            description="Start een zoekronde. MoneyScouter zoekt vervolgens naar producten die aan jouw voorwaarden voldoen."
          />
        ) : (
          <>
            {/* Desktop/tablet: full table */}
            <Card className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risico</TableHead>
                    <TableHead className="text-right">Inkoopprijs</TableHead>
                    <TableHead className="text-right">Laatst gezien</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link href={`/opportunities/${p.id}`} className="hover:underline">
                          {p.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.category}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PRODUCT_STATUS_LABEL_NL[p.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <ComplianceRiskBadge risk={p.complianceRisk} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.sources[0] ? formatEur(p.sources[0].price) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(p.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile: card list */}
            <div className="space-y-2 sm:hidden">
              {products.map((p) => (
                <Link key={p.id} href={`/opportunities/${p.id}`}>
                  <Card className="active:bg-muted/40">
                    <CardContent className="py-3">
                      <div className="font-medium leading-snug">{p.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{p.category}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="font-normal">
                          {PRODUCT_STATUS_LABEL_NL[p.status]}
                        </Badge>
                        <ComplianceRiskBadge risk={p.complianceRisk} />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{formatDateTime(p.lastSeenAt)}</span>
                        <span className="font-medium tabular-nums">
                          {p.sources[0] ? formatEur(p.sources[0].price) : "—"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
