"use server";

import { revalidatePath } from "next/cache";
import { runScout } from "@/server/pipeline/orchestrator";
import { runScoutReal } from "@/server/pipeline/orchestratorReal";
import { getRunProgress, RunProgress } from "@/server/queries/runProgress";

const PATHS_TO_REVALIDATE = [
  "/",
  "/opportunities",
  "/research-runs",
  "/costs",
  "/products",
  "/watchlist",
  "/discover",
  "/agents",
  "/competitors",
  "/suppliers",
];

/** The primary "Run Scout" action — launches a real run (Apify discovery,
 * zero LLM calls, rule-based Judge). Per master spec V1.1 section 14. */
export async function runScoutAction() {
  const result = await runScoutReal({ trigger: "manual" });
  for (const path of PATHS_TO_REVALIDATE) revalidatePath(path);
  return result;
}

/** Secondary action for local development/demo without Apify credentials —
 * the original V1 mock-discovery + mock-LLM pipeline. Never the default
 * button; only exposed from the Discover page, clearly labeled. */
export async function runDemoScoutAction() {
  const result = await runScout({ trigger: "manual" });
  for (const path of PATHS_TO_REVALIDATE) revalidatePath(path);
  return result;
}

/** Read-only poll target for the live pipeline progress UI — never starts
 * or affects a run, only reports what the backend already knows. */
export async function getRunProgressAction(runId: string): Promise<RunProgress | null> {
  return getRunProgress(runId);
}
