import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEur } from "@/lib/format";
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
      <PageHeader title="Suppliers" description={`${suppliers.length} known suppliers`} />
      <div className="p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Listings</TableHead>
                <TableHead className="text-right">Avg price</TableHead>
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
          {suppliers.length === 0 && (
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No suppliers discovered yet.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
