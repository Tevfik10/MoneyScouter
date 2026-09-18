import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEurPrecise, formatNumber } from "@/lib/format";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const AGENT_INFO: Record<string, { role: string; tier: string; ai: boolean }> = {
  MARKET: { role: "Reads demand and trend signals for the target market.", tier: "cheap", ai: true },
  COMPETITOR: { role: "Maps the competitive landscape: sellers, pricing, positioning.", tier: "cheap", ai: true },
  SUPPLIER: { role: "Compares suppliers on price, rating, shipping and MOQ.", tier: "— deterministic", ai: false },
  MARGIN: { role: "Calculates bad/base/good unit-economics scenarios.", tier: "— deterministic", ai: false },
  BRAND: { role: "Asks whether this can be a believable branded concept, not just a markup.", tier: "cheap", ai: true },
  ANGLE: { role: "Generates 3-5 marketing angles, only for products Brand already likes.", tier: "standard", ai: true },
  RISK: { role: "Compliance/IP/return risk. Category classification is rule-based; residual judgement is AI.", tier: "cheap", ai: true },
  SKEPTIC: { role: "Argues the bear case: why this product is a bad idea.", tier: "standard", ai: true },
  JUDGE: { role: "Computes the transparent Money Score rubric and writes the final why/concerns/next step.", tier: "strong", ai: true },
};

export default async function AgentsPage() {
  const stats = await prisma.aiCall.groupBy({
    by: ["agentType"],
    where: { agentType: { not: null } },
    _count: { _all: true },
    _sum: { estimatedCostEur: true },
  });
  const statsByAgent = Object.fromEntries(stats.map((s) => [s.agentType, s]));

  return (
    <div>
      <PageHeader title="Agents" description="What each agent does, and what it has actually cost so far." />
      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(AGENT_INFO).map(([type, info]) => {
          const s = statsByAgent[type];
          return (
            <Card key={type}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{type}</CardTitle>
                <Badge variant="outline">{info.tier}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{info.role}</p>
                {info.ai ? (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{formatNumber(s?._count._all ?? 0)} calls</span>
                    <span className="font-medium tabular-nums">
                      {formatEurPrecise(Number(s?._sum.estimatedCostEur ?? 0))} total
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No AI calls — pure calculation.</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
