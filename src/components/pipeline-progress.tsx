"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { getRunProgressAction } from "@/server/actions/pipeline";
import type { RunProgress } from "@/server/queries/runProgress";
import { cn } from "@/lib/utils";

type StepState = "done" | "active" | "pending";

function Step({ label, state, sub }: { label: string; state: StepState; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      {state === "done" && (
        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {state === "active" && (
        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-500">
          <Loader2 className="size-3 animate-spin" strokeWidth={3} />
        </span>
      )}
      {state === "pending" && (
        <span className="flex size-4.5 shrink-0 items-center justify-center text-muted-foreground/40">
          <Circle className="size-2.5" />
        </span>
      )}
      <span className={cn("text-sm", state === "pending" ? "text-muted-foreground" : "text-foreground")}>{label}</span>
      {sub && <span className="text-xs tabular-nums text-muted-foreground">{sub}</span>}
    </div>
  );
}

/**
 * Live "Zoekronde bezig" checklist for an active run. Polls a read-only
 * server action every 2.5s and renders exactly what the backend has
 * confirmed so far (PipelineStageRun rows for Scout/Dedup/Filter, real
 * Decision/AgentResult counts for the research stage) — never a simulated
 * or time-based progress animation.
 */
export function PipelineProgress({ runId, initialStatus }: { runId: string; initialStatus: string }) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const result = await getRunProgressAction(runId);
      if (cancelled || !result) return;
      setProgress(result);
      setStatus(result.status);
      if (result.status === "RUNNING") {
        timer = setTimeout(poll, 2500);
      }
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  if (status !== "RUNNING") return null;

  const scoutDone = progress?.scoutDone ?? false;
  const dedupDone = progress?.dedupDone ?? false;
  const filterDone = progress?.filterDone ?? false;
  const shortlistTarget = progress?.shortlistTarget ?? 0;
  const researchedCount = progress?.researchedCount ?? 0;
  const researchDone = filterDone && shortlistTarget > 0 && researchedCount >= shortlistTarget;
  const researchActive = filterDone && !researchDone;

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-cyan-600 dark:text-cyan-400">
        <Loader2 className="size-3.5 animate-spin" />
        Zoekronde bezig
      </div>
      <Step label="Producten zoeken" state={scoutDone ? "done" : "active"} />
      <Step label="Dubbele producten verwijderen" state={dedupDone ? "done" : scoutDone ? "active" : "pending"} />
      <Step label="Eerste selectie" state={filterDone ? "done" : dedupDone ? "active" : "pending"} />
      <Step
        label="Markt, marge en risico onderzoeken"
        state={researchDone ? "done" : researchActive ? "active" : "pending"}
        sub={researchActive || researchDone ? `${researchedCount} van ${shortlistTarget}` : undefined}
      />
    </div>
  );
}
