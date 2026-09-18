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
cp .env.example .env   # set DATABASE_URL
pnpm exec prisma migrate deploy
pnpm run db:seed        # runs one real Scout run to populate demo data
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click **Run Scout**
on the Dashboard to trigger a new pipeline run at any time — it discovers,
deduplicates, filters, enriches, shortlists, deep-researches (specialist
agents + Skeptic + Judge) and scores products end to end, never exceeding
the configured daily AI budget (see Settings).

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
