import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { moneyScoreColorClass } from "@/components/verdict-badge";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const entries = await prisma.watchlist.findMany({
    orderBy: { addedAt: "desc" },
    include: { product: true },
  });

  return (
    <div>
      <PageHeader
        title="Watchlist"
        description="Not interesting yet — monitored for price, trend or competition changes."
      />
      <div className="space-y-3 p-6">
        {entries.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Nothing on the watchlist right now.
            </CardContent>
          </Card>
        )}
        {entries.map((e) => (
          <Link key={e.id} href={`/opportunities/${e.productId}`}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div>
                  <div className="font-medium">{e.product.title}</div>
                  <div className="text-xs text-muted-foreground">{e.reason}</div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className={`text-xl font-bold tabular-nums ${moneyScoreColorClass(e.product.currentScore ?? 0)}`}>
                    {e.product.currentScore ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">added {formatDateTime(e.addedAt)}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
