"use client";

import { useTransition } from "react";
import { Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDemoScoutAction } from "@/server/actions/pipeline";

/** Local development/demo helper: runs the original mock-discovery +
 * mock-LLM pipeline, no Apify or LLM credentials required. Never the
 * primary Run Scout action. */
export function RunDemoScoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          toast.info("Demo run started… mock discovery + mock LLM agents, no real spend.");
          try {
            await runDemoScoutAction();
            toast.success("Demo run complete.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Demo run failed.");
          }
        });
      }}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
      Run Demo (mock data)
    </Button>
  );
}
