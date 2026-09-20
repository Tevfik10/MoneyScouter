# MoneyScouter

An AI commerce intelligence platform that discovers, filters, researches
and scores product opportunities — spending AI budget only on the small
fraction of candidates that survive deterministic, zero-cost filtering
first. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full
system design (data flow, agent architecture, DB schema, cost control,
provider architecture, V1 scope).

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Prisma +
PostgreSQL, Vitest.

## Getting started

Requires a local PostgreSQL instance.

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL, DIRECT_URL and (optionally) APIFY_API_TOKEN
pnpm exec prisma migrate deploy
pnpm run db:seed        # runs one demo (mock/LLM-free) Scout run to populate sample data
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the UI is in Dutch.
Two pipelines are available from the Dashboard ("Overzicht"):

- **Start zoekronde** — the real pipeline: discovers products via Apify
  (AliExpress + Google Shopping), dedupes, filters, shortlists and scores
  them with deterministic, zero-AI agents. Requires `APIFY_API_TOKEN`.
- **Demo uitvoeren (nagebootste data)** — the mock pipeline: no external
  calls, no `APIFY_API_TOKEN` needed, safe to run anytime. This is what
  `pnpm run db:seed` also uses.

Neither pipeline calls OpenAI/Anthropic — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow.

## Environment variables

- `DATABASE_URL` — the connection Prisma Client uses for all runtime
  queries. Against Supabase, use the **Transaction Pooler** connection
  string (port 6543) with `?pgbouncer=true` appended, e.g.
  `postgresql://...@aws-0-xx.pooler.supabase.com:6543/postgres?pgbouncer=true`.
  The `pgbouncer=true` flag tells Prisma to skip prepared statements, which
  PgBouncer's transaction-mode pooling doesn't support across requests.
- `DIRECT_URL` — a non-pooled (or session-mode pooled) connection used only
  by the Prisma CLI for `prisma migrate deploy`/`dev`. Transaction-mode
  pooling doesn't reliably support the advisory locks and DDL migrations
  need. Against Supabase, use the **Session Pooler** connection string
  (port 5432 via the pooler host) rather than the raw direct connection —
  most serverless platforms, including Vercel, can't reliably reach
  Supabase's direct connection over IPv6. The generated Prisma Client
  never uses this at runtime, only the CLI does at build/migration time.
- `APIFY_API_TOKEN` — required only for the real pipeline ("Start
  zoekronde"). Server-only: read in `src/server/providers/apify/client.ts`,
  never sent to the browser or logged. Without it, a real run fails fast
  with a clear error instead of silently discovering nothing; the demo
  pipeline doesn't need it at all.

## Deploying (Vercel + Supabase)

1. In Vercel → Project → Settings → Environment Variables, set:
   - `DATABASE_URL` = Supabase Transaction Pooler string + `?pgbouncer=true`
   - `DIRECT_URL` = Supabase Session Pooler string (or direct connection,
     if your Vercel deployment has IPv6 egress)
2. The `build` script (`prisma migrate deploy && next build`) runs
   migrations against `DIRECT_URL` automatically on every deploy, before
   building. It only ever applies pending migrations — it never drops
   tables or data, and is a safe no-op when the schema is already current.
3. Deploy. No manual migration step is required.

## Development

```bash
pnpm run lint          # eslint
pnpm exec tsc --noEmit # typecheck
pnpm run test          # vitest (includes an integration test against
                        # the local Postgres instance)
pnpm run build          # production build
```

## Providers

V1 ships a deterministic mock discovery provider and a deterministic mock
model provider so the full pipeline runs for free, end to end, without any
external API keys. Real providers (AliExpress, Alibaba, CJdropshipping,
Google Shopping, Trends, a real LLM) implement the same
`DiscoveryProvider` / `ModelProvider` interfaces under
`src/server/providers/` and `src/server/ai/providers/` — see
`docs/ARCHITECTURE.md` section F.
