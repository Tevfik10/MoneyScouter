import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function ValidationLabPage() {
  const tests = await prisma.validationTest.findMany({ include: { product: true }, orderBy: { createdAt: "desc" } });

  return (
    <div>
      <PageHeader
        title="Validation Lab"
        description="Prepares landing pages, ad concepts and copy for a High Potential product before you spend real money."
      />
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground space-y-2">
            {tests.length === 0 ? (
              <>
                <p>No validation tests yet.</p>
                <p>
                  In V1, this screen is a placeholder for the future workflow: approve a HIGH_POTENTIAL
                  opportunity, and MoneyScouter prepares a concept, positioning, landing page copy, ad
                  concepts and image prompts for your review — never publishing or spending anything
                  without explicit approval.
                </p>
              </>
            ) : (
              tests.map((t) => (
                <div key={t.id} className="border-b border-border py-3 last:border-0">
                  <div className="font-medium text-foreground">{t.product.title}</div>
                  <div className="text-xs">{t.status}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
