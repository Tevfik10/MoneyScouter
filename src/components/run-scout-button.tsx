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
          toast.info("Scout run started… real Apify discovery, zero LLM calls.");
          try {
            const result = await runScoutAction();
            if (result.status === "BUDGET_STOPPED") {
              toast.warning("Run stopped: daily Apify budget reached.");
            } else if (result.status === "FAILED") {
              toast.error("Run failed — check Research Runs for details.");
            } else {
              toast.success("Scout run complete.");
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Run failed.");
          }
        });
      }}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      Run Scout
    </Button>
  );
}
