"use server";

import { revalidatePath } from "next/cache";
import { runScout } from "@/server/pipeline/orchestrator";

const PATHS_TO_REVALIDATE = [
  "/",
  "/opportunities",
  "/research-runs",
  "/costs",
  "/products",
  "/watchlist",
  "/discover",
];

export async function runScoutAction() {
  const result = await runScout({ trigger: "manual" });
  for (const path of PATHS_TO_REVALIDATE) revalidatePath(path);
  return result;
}
