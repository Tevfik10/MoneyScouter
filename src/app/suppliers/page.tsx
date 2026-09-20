import { Truck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatEur, formatNumber } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { sources: true } },
      sources: { select: { price: true } },
    },
  });

  return (
    <div>
      <PageHeader title="Leveranciers" description={`${formatNumber(suppliers.length)} bekende leveranciers`} />
      <div className="p-6">
        {suppliers.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Nog geen leveranciers gevonden"
            description="Leveranciers verschijnen hier zodra MoneyScouter producten bij hen heeft gevonden."
          />
        ) : (
          <>
            <Card className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leverancier</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Beoordeling</TableHead>
                    <TableHead className="text-right">Aanbiedingen</TableHead>
                    <TableHead className="text-right">Gem. prijs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => {
                    const avgPrice =
                      s.sources.length > 0
                        ? s.sources.reduce((sum, src) => sum + Number(src.price), 0) / s.sources.length
                        : 0;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.platform}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.rating ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{s._count.sources}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatEur(avgPrice)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <div className="space-y-2 sm:hidden">
              {suppliers.map((s) => {
                const avgPrice =
                  s.sources.length > 0
                    ? s.sources.reduce((sum, src) => sum + Number(src.price), 0) / s.sources.length
                    : 0;
                return (
                  <Card key={s.id}>
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium leading-snug">{s.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{s.platform}</div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          {s.rating != null ? `${s.rating}★` : "—"}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{s._count.sources} aanbieding(en)</span>
                        <span className="font-medium tabular-nums">{formatEur(avgPrice)}</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
