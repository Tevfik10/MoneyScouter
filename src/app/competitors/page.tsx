import { Swords } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatEur, formatNumber } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const competitors = await prisma.competitor.findMany({
    orderBy: { name: "asc" },
    include: {
      sightings: {
        include: { product: { select: { title: true, category: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Concurrenten"
        description={`${formatNumber(competitors.length)} concurrenten gezien bij tot nu toe onderzochte producten`}
      />
      <div className="p-6">
        {competitors.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="Nog geen concurrenten gevonden"
            description="Concurrenten verschijnen hier zodra de Concurrentie Agent producten heeft onderzocht."
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concurrent</TableHead>
                  <TableHead>Recente waarnemingen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium align-top">{c.name}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {c.sightings.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs">
                            <span>
                              {s.product.title} <span className="text-muted-foreground">({s.positioning})</span>
                            </span>
                            <span className="tabular-nums font-medium">{s.price ? formatEur(s.price) : "—"}</span>
                          </div>
                        ))}
                      </div>
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
