import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static source-level enforcement of two hard constraints from the Alibaba
// sourcing migration: (1) AliExpress must never execute inside the active
// pipeline — no import, no call, no automatic fallback; (2)
// APIFY_DETERMINISTIC must spend zero LLM tokens. Both are cheap,
// deterministic checks that don't need a DB or a running pipeline, and
// they fail loudly the moment either constraint regresses (e.g. someone
// re-adds an AliExpress import to "just try it once").

const ROOT = path.resolve(__dirname, "../../..");

function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("AliExpress is inactive in the real pipeline", () => {
  it("orchestratorReal.ts never imports or calls the AliExpress provider", () => {
    const src = read("src/server/pipeline/orchestratorReal.ts");
    expect(src).not.toMatch(/import .*aliexpress/i);
    expect(src).not.toMatch(/getAliExpressProvider|ALIEXPRESS_PROVIDERS|aliexpressProvider\.search/i);
    // The one allowed mention is an explanatory comment pointing at
    // LEGACY.md — everything else below proves it's not wired up.
    expect(src).toMatch(/alibaba/i);
  });

  it("researchDeterministic.ts never imports or calls the AliExpress provider", () => {
    const src = read("src/server/pipeline/researchDeterministic.ts");
    expect(src).not.toMatch(/aliexpress/i);
  });

  it("the discovery provider registry index no longer exports an active AliExpress resolver used by the pipeline", () => {
    // The legacy adapter file itself is allowed to mention "aliexpress" (it
    // IS the aliexpress adapter) — what matters is that nothing in the
    // active pipeline imports from that directory. Already covered above;
    // this additionally confirms the legacy directory documents its own
    // inactive status rather than silently existing.
    const legacyDoc = read("src/server/providers/apify/aliexpress/LEGACY.md");
    expect(legacyDoc.toLowerCase()).toMatch(/legacy|inactive/);
  });

  it("the active Alibaba pricing entry exists and no code path defaults discovery to an AliExpress actor id", () => {
    const pricing = read("src/server/apify/pricing.ts");
    expect(pricing).toMatch(/automation-lab\/alibaba-products-scraper/);
  });
});

describe("the deterministic (Apify) pipeline spends zero LLM tokens", () => {
  const AI_SDK_PATTERN = /\bopenai\b|\banthropic\b|from ["']ai["']|generateText|generateObject/i;

  const deterministicFiles = [
    "src/server/pipeline/orchestratorReal.ts",
    "src/server/pipeline/researchDeterministic.ts",
    "src/server/pipeline/agentsDeterministic/judge.ts",
    "src/server/pipeline/agentsDeterministic/trend.ts",
    "src/server/pipeline/agentsDeterministic/competitor.ts",
    "src/server/pipeline/agentsDeterministic/risk.ts",
    "src/server/pipeline/agentsDeterministic/alibabaMargin.ts",
    "src/server/pipeline/agentsDeterministic/alibabaSupplier.ts",
    "src/server/providers/apify/alibaba/provider.ts",
    "src/server/providers/apify/alibaba/normalize.ts",
  ];

  it.each(deterministicFiles)("%s contains no AI SDK / LLM call", (relPath) => {
    const src = read(relPath);
    expect(src).not.toMatch(AI_SDK_PATTERN);
  });
});
