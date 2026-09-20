import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const VALIDATION_STATUS_LABEL_NL: Record<string, string> = {
  DRAFT: "Concept",
  READY_FOR_APPROVAL: "Klaar voor goedkeuring",
  APPROVED: "Goedgekeurd",
  REJECTED: "Afgewezen",
};

export default async function ValidationLabPage() {
  const tests = await prisma.validationTest.findMany({ include: { product: true }, orderBy: { createdAt: "desc" } });

  return (
    <div>
      <PageHeader
        title="Validatielab"
        description="Bereidt landingspagina's, advertentieconcepten en teksten voor een kansrijk product voor, voordat je er echt geld in steekt."
      />
      <div className="p-6">
        {tests.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Nog geen validatietests"
            description="Keur een product met hoge potentie goed en MoneyScouter bereidt een concept, positionering, landingspaginatekst, advertentieconcepten en beeldideeën voor je voor — er wordt nooit iets gepubliceerd of uitgegeven zonder jouw expliciete goedkeuring."
          />
        ) : (
          <Card>
            <CardContent className="py-4 text-sm space-y-2">
              {tests.map((t) => (
                <div key={t.id} className="border-b border-border py-3 last:border-0">
                  <div className="font-medium text-foreground">{t.product.title}</div>
                  <div className="text-xs text-muted-foreground">{VALIDATION_STATUS_LABEL_NL[t.status] ?? t.status}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
