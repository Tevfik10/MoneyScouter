"use client";

import { useTransition } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runScoutAction } from "@/server/actions/pipeline";

export function RunScoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          toast.info("Zoekronde gestart… echte productdata, geen AI-kosten.");
          try {
            const result = await runScoutAction();
            if (result.status === "BUDGET_STOPPED") {
              toast.warning("Zoekronde gestopt: dagelijkse Apify-budgetlimiet is bereikt.");
            } else if (result.status === "FAILED") {
              toast.error("Zoekronde mislukt — bekijk Zoekrondes voor details.");
            } else {
              toast.success("Zoekronde voltooid.");
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Zoekronde mislukt.");
          }
        });
      }}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      Start zoekronde
    </Button>
  );
}
