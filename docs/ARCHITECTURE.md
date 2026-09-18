# MoneyScouter — Architecture

"Find products before I waste money on them."

This document is the working architecture for MoneyScouter, written before
implementation and kept up to date as the system evolves. It covers the
full long-term vision but is explicit about what V1 actually builds.

## A. System Architecture

MoneyScouter is a funnel, not a chatbot wrapper. The core design rule is:
**never spend AI money on work that deterministic code can do for free.**

```
MASS DISCOVERY        (providers, no AI)
   -> DEDUPLICATION    (fingerprint hash, no AI)
   -> DETERMINISTIC FILTER  (rules/thresholds, no AI)
   -> CHEAP ENRICHMENT (cheap model, batched, only for filter-survivors)
   -> SHORTLIST         (score cut, no AI)
   -> DEEP RESEARCH     (cheap model, structured extraction, cached)
   -> SPECIALIST AGENTS (Market/Competitor/Supplier/Margin/Trend/Brand/Angle/Risk)
   -> SKEPTIC AGENT     (adversarial pass, strong model, small set)
   -> JUDGE AGENT        (strong model, small set, transparent scoring)
   -> OPPORTUNITY REPORT / MORNING BRIEF
```

Every stage narrows the set and every stage after "Mass Discovery" is
cheaper per-item than the one before it applied to the full set. The
number of items reaching the Judge is small by construction (tens, not
thousands), which is what keeps the nightly run under budget.

Runtime shape for V1: a Next.js app (UI + API routes) backed by Postgres,
with the pipeline runnable either from the UI ("Run Scout" button), a CLI
script, or a scheduled job. The pipeline is implemented as plain
TypeScript modules under `src/server/pipeline/*`, not as a separate
service — there is no operational reason to split it out yet, and doing
so would add deployment complexity for no V1 benefit. Long-running/nightly
execution should run outside the Vercel request/response cycle (a Node
script triggered by a scheduler), because a multi-stage AI pipeline does
not fit serverless function time limits — see "Nightly Autopilot" below.

## B. Data Flow

1. **Discovery**: each enabled `DiscoveryProvider` returns raw
   `DiscoveredProduct[]` (title, price, images, supplier info, URLs,
   raw metadata). Nothing is written to `products` yet.
2. **Fingerprinting**: each raw item is hashed into a `Fingerprint`
   (supplier + supplier_product_id, normalized title, price bucket,
   category). Looked up against `product_fingerprints`.
   - No match -> `NEW`, insert `Product` + `ProductSource`.
   - Match, unchanged -> `SEEN_BEFORE`, only `price_history`/`last_seen_at`
     touched, no re-analysis.
   - Match, meaningfully changed (price delta, new supplier, trend
     change) -> `UPDATED`, eligible for re-analysis.
3. **Deterministic filter**: pure-code rule engine reads `FilterSettings`
   (configurable in Settings) and produces `PASS` / `REJECT` +
   machine-readable reasons, stored on the `Decision` row. Rejected
   products stop here — zero AI spent.
4. **Cheap enrichment**: survivors get a cheap-model pass (or, in V1's
   mock provider, a deterministic heuristic standing in for it) that
   scores basic commercial interest and writes a `ResearchCache` entry
   keyed by a content hash, so re-runs on unchanged data are free.
5. **Shortlist cut**: top-N by enrichment score (N and cutoffs are
   settings) become `SHORTLISTED` and move to deep research.
6. **Deep research + specialist agents**: each shortlisted product gets
   one `ResearchRun`. Specialist agents each read the same structured
   research bundle (not raw pages) and write one `AgentResult` row per
   agent, with token/cost accounting on `AiCall`.
7. **Skeptic**: runs last among specialists, explicitly instructed to
   argue against the product, using the other agents' structured output
   as input (not re-fetching sources).
8. **Judge**: reads all `AgentResult`s for the product (bull + bear),
   applies the configurable weighted rubric, writes a `Score` and a
   `Decision` (`REJECT` / `WATCH` / `INTERESTING` / `HIGH_POTENTIAL`)
   with a human-readable "why".
9. **Reporting**: the Morning Brief and Opportunity pages are pure reads
   over `research_runs` + `scores` + `decisions` for the latest
   `run_id` — no AI at render time.

Every step that writes a `Decision` or `Score` also writes a
`DecisionLog` row capturing which rule/agent/model/prompt version
produced it, so any number on screen can be traced back to its inputs.

## C. Agent Architecture

Agents are **responsibilities**, not necessarily separate expensive model
calls. In V1 they are plain async functions with a shared signature:

```ts
type AgentInput = { product: ProductBundle; research: ResearchBundle };
type AgentOutput = { summary: string; findings: Record<string, unknown>; };
type Agent = (input: AgentInput, ctx: RunContext) => Promise<AgentOutput>;
```

V1 implements these agents (see section G for what's stubbed vs live):

- **Scout** — not an LLM agent; it's the discovery+dedup+filter pipeline.
- **Market Agent** — demand/trend read from structured signals.
- **Competitor Agent** — competitor landscape from structured data.
- **Supplier Agent** — compares suppliers/prices/lead times (deterministic
  where possible; the data is numeric, not language).
- **Margin Agent** — pure calculation (bad/base/good scenarios), no LLM
  needed at all — implemented as deterministic code per the "AI is not
  needed here" principle.
- **Brand Agent** — brandability / positioning read, cheap LLM.
- **Angle Agent** — generates 3-5 marketing angles, cheap-to-mid LLM,
  only for products that already look promising.
- **Risk Agent** — compliance/IP/return-risk flags; mostly rule-based
  (category/keyword lookups against an exclusion list) with an LLM pass
  only for the residual judgement calls.
- **Skeptic Agent** — adversarial pass, mid-tier LLM, only for shortlist.
- **Judge Agent** — final scoring synthesis, strongest configured model,
  only for the handful of products that reach this stage.

The Model Router (`src/server/ai/router.ts`) maps a *task type*
(`classification`, `extraction`, `summarization`, `reasoning`, `judge`) to
a *model tier* (`cheap`, `standard`, `strong`), and a tier to a concrete
provider/model id from config. Swapping providers means changing config,
not code. In V1 the only wired-up provider is a deterministic
`MockModelProvider` that fabricates realistic structured output and a
token/cost estimate — this keeps the whole pipeline runnable, testable and
free while the interface is ready for a real Claude/OpenAI provider to be
dropped in later.

## D. Database Schema (Postgres, via Prisma)

Core tables (see `prisma/schema.prisma` for the authoritative version):

- `Product` — canonical product record (title, category, images, status).
- `ProductSource` — one row per (product, supplier) listing: price,
  supplier URL, MOQ, shipping.
- `ProductFingerprint` — dedup key -> product id, for O(1) "seen before".
- `PriceHistory` — time series of observed prices per source.
- `ResearchRun` — one row per pipeline execution (nightly or manual),
  with funnel counters (`discovered`, `rejected`, `filtered_in`,
  `enriched`, `shortlisted`, `deep_researched`, `high_potential`) and
  total AI cost.
- `ResearchCache` — content-hash keyed cache of enrichment/research
  output so unchanged products are never re-billed.
- `AgentRun` / `AgentResult` — one `AgentRun` per (research_run, product,
  agent); `AgentResult` holds the structured JSON output + summary.
- `Score` — the Judge's rubric breakdown + Money Score + verdict, per
  (research_run, product).
- `Decision` — the funnel decision at each stage (filter/shortlist/judge)
  with machine-readable reasons, forming the audit trail.
- `AiCall` — every single model call: provider, model, tier, input/output
  tokens, estimated cost, run/agent/product ids, timestamp. This table is
  what the Cost Controller reads and writes.
- `Setting` — key/value app settings (budgets, thresholds, weights),
  editable from the Settings screen.
- `PromptVersion` — versioned prompt text per agent, so `AiCall`/
  `AgentResult` rows can reference exactly which prompt produced them.
- `Watchlist` — products being monitored though not currently actionable,
  with score history for the "moved into High Potential" alerting.
- `ValidationTest` — placeholder table for the future Validation Lab
  (concept, landing copy, status), created now so the interface exists
  but with no automation wired to it in V1.

## E. Cost Control Design

Single source of truth: `src/server/ai/costController.ts`.

```
estimateCost(tier, inputTokens, outputTokens)
   -> checkBudget(runId): sums today's AiCall.estimated_cost
   -> if (spent + estimate > hardLimit) -> throw BudgetExceededError, log, STOP
   -> else execute call via provider, record actual usage, write AiCall row
```

- `daily_budget_eur` (soft target, default 2.50) and `hard_limit_eur`
  (default 3.00) are `Setting` rows, editable in the UI.
- The check is atomic per call: every single AI call — regardless of
  agent — goes through `costController.spend()`. There is no code path
  that calls a model provider directly.
- Once the hard limit would be exceeded, the pipeline stops taking on
  new work for that run (already-completed stages are preserved) and the
  run is marked `BUDGET_STOPPED` rather than `FAILED`.
- A dedicated test (`budgetEnforcement.test.ts`) proves that at
  hard_limit_eur = 3.00, a call that would push total spend past €3.00 is
  rejected before execution.
- Dashboard reads (`today spend / budget`, `this month`, `cost per
  shortlisted product`, `cost per high-potential opportunity`) are all
  aggregate queries over `AiCall`, nothing cached/hand-maintained.

## F. Provider Architecture

Two provider families, both behind interfaces so real integrations can
replace mocks one at a time without touching pipeline code:

```
src/server/providers/discovery/   DiscoveryProvider   (finds products)
src/server/providers/ai/          ModelProvider        (runs model calls)
```

`DiscoveryProvider`:
```ts
interface DiscoveryProvider {
  id: string; // "aliexpress" | "mock" | ...
  discover(params: DiscoveryParams): Promise<DiscoveredProduct[]>;
}
```
V1 ships `MockDiscoveryProvider`, which deterministically generates a
realistic, varied catalog (so re-running produces the same "already
seen" behavior real data would). Real providers (AliExpress, CJdrop-
shipping, Google Shopping, Trends, competitor scraping) are documented
as future adapters implementing the same interface; none are wired to
live external APIs in V1 (no ToS/API-key setup has happened yet) — this
is intentional per the "don't build fragile scraping hacks" instruction.

`ModelProvider`:
```ts
interface ModelProvider {
  id: string;
  run(input: ModelCallInput): Promise<ModelCallOutput>; // incl. token usage
}
```
V1 ships `MockModelProvider` (deterministic, free, structured). A real
Anthropic/OpenAI provider is a drop-in later; the Model Router and Cost
Controller do not change.

## G. V1 Scope

Built now:
1. Dashboard / Command Center shell (nav: Dashboard, Discover,
   Opportunities, Watchlist, Products, Suppliers, Competitors, Research
   Runs, Agents, Validation Lab, Costs, Settings).
2. Postgres schema (Prisma) covering all tables above.
3. Provider interfaces + working mock discovery provider.
4. Deduplication / fingerprinting.
5. Deterministic Stage-1 filter with configurable thresholds.
6. Research pipeline (enrichment -> shortlist -> deep research).
7. Specialist agents: Market, Competitor, Supplier, Margin (deterministic),
   Brand, Angle, Risk — enough to prove the "many small responsibilities"
   architecture; Trend is folded into Market for V1 to avoid a
   responsibility with near-identical inputs/outputs (documented as a
   later split, not built twice now).
8. Skeptic agent.
9. Judge agent + transparent, configurable Money Score rubric.
10. Opportunity detail page with full "why" breakdown.
11. Research run history.
12. Cost tracking (per call, per run, per day, per month, per outcome).
13. Hard daily AI budget enforcement (tested).
14. Nightly run architecture (resumable job runner, not literally
    scheduled at fixed clock times — see below).
15. Morning Brief.
16. Settings screen (budgets, filter thresholds, scoring weights).

Explicitly NOT built in V1: real supplier/marketplace integrations, real
ad platform integrations, the AI Command Bar (stubbed as a disabled input
with example queries), the Learning Loop's weight-adjustment proposals,
Validation Lab automation, multi-user auth. Interfaces for these exist
where cheap to add (e.g. `ValidationTest` table, `Watchlist` table) so
nothing has to be re-architected later.

## H. Folder Structure

```
prisma/
  schema.prisma
  seed.ts
src/
  app/                        Next.js App Router pages
    (dashboard)/
      page.tsx                Morning Brief / Dashboard
      opportunities/
      watchlist/
      products/
      suppliers/
      competitors/
      research-runs/
      agents/
      validation-lab/
      costs/
      settings/
    api/
      pipeline/run/route.ts   POST -> triggers a pipeline run
      ...
  components/
    ui/                       shadcn/ui primitives
    ...                       app-specific components
  server/
    ai/
      router.ts                Model Router
      costController.ts        Cost Controller
      providers/
        mockModelProvider.ts
    providers/
      discovery/
        types.ts
        mockDiscoveryProvider.ts
    pipeline/
      fingerprint.ts
      filter.ts
      enrichment.ts
      shortlist.ts
      research.ts
      agents/
        market.ts competitor.ts supplier.ts margin.ts
        brand.ts angle.ts risk.ts skeptic.ts judge.ts
      orchestrator.ts          runScout()
    db.ts                      Prisma client singleton
    settings.ts                typed settings accessor
  lib/
  types/
docs/
  ARCHITECTURE.md
tests/  (or *.test.ts colocated, via Vitest)
```

## I. Implementation Plan

1. Scaffold Next.js + TypeScript + Tailwind + shadcn/ui.
2. Prisma schema + local Postgres + migration + seed script.
3. Cost Controller + Model Router + Mock Model Provider + tests.
4. Discovery provider interface + Mock Discovery Provider.
5. Fingerprinting/dedup + tests.
6. Deterministic filter engine + configurable settings + tests.
7. Enrichment + shortlist cut.
8. Specialist agents + Skeptic + Judge + Money Score + tests.
9. Orchestrator (`runScout`) wiring all stages, budget-aware, resumable,
   writing `ResearchRun`/`DecisionLog`.
10. API routes to trigger a run and read results.
11. UI: shell/nav, Dashboard/Morning Brief, Opportunities list, Product
    detail page, Research Runs, Costs, Settings.
12. Seed a demo run so the UI is populated on first load.
13. Typecheck, lint, test, fix, commit in logical phases.

Each numbered step above is committed separately once it typechecks,
lints and passes its tests.
