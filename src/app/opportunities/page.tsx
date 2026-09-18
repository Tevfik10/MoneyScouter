import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { VerdictBadge, ComplianceRiskBadge, moneyScoreColorClass } from "@/components/verdict-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatEur } from "@/lib/format";
import { listOpportunities } from "@/server/queries/opportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const products = await listOpportunities();

  return (
    <div>
      <PageHeader
        title="Opportunities"
        description={`${products.length} product${products.length === 1 ? "" : "s"} scored so far`}
      />
      <div className="p-6">
        {products.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              No scored products yet. Run Scout from the Dashboard to get started.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">Buy price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/opportunities/${product.id}`} className="hover:underline">
                        {product.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{product.category}</TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${moneyScoreColorClass(product.currentScore ?? 0)}`}
                    >
                      {product.currentScore}
                    </TableCell>
                    <TableCell>{product.currentVerdict && <VerdictBadge verdict={product.currentVerdict} />}</TableCell>
                    <TableCell>
                      <ComplianceRiskBadge risk={product.complianceRisk} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {product.sources[0] ? formatEur(product.sources[0].price) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
