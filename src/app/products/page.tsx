import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComplianceRiskBadge } from "@/components/verdict-badge";
import { formatDateTime, formatEur } from "@/lib/format";
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
      <PageHeader title="Products" description={`${products.length} products in MoneyScouter's memory`} />
      <div className="p-6">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Buy price</TableHead>
                <TableHead className="text-right">Last seen</TableHead>
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
                    <Badge variant="outline">{p.status.replace(/_/g, " ")}</Badge>
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
          {products.length === 0 && (
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No products discovered yet.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
