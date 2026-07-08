# neonFin

neonFin is a self-hostable payments and credit-wallet app for side projects. It
runs a Next.js dashboard/API, stores wallets and ledger entries in Postgres,
syncs prices with Stripe or Polar, and serves shadcn registry components for
consumer apps.

## Useful Links

- Product docs: `content/docs/index.mdx`
- Self-hosting: `content/docs/self-host/index.mdx`
- Component install: `content/docs/components/install.mdx`
- Registry config: `registry.json`

## Local Setup

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env` and fill the secrets.
3. Start local Postgres with `docker compose up -d`.
4. Run migrations with `bun run db:migrate`.
5. Start the app with `bun run dev` when you are working locally.

## Scripts

| Command | Purpose |
|---|---|
| `bun run lint` | Run ESLint. |
| `bun run test` | Run Bun tests. |
| `./node_modules/.bin/tsc --noEmit --incremental false --pretty false` | Typecheck without writing incremental artifacts. |
| `bun run db:generate` | Generate Drizzle migrations after schema changes. |
| `bun run db:migrate` | Apply migrations. |
| `bun run registry:build` | Build the shadcn registry output. |

## Notes For Agents

- Follow `AGENTS.md`; this repo uses a newer Next.js with changed APIs.
- Do not run `bun run dev` or `bun run build` as verification unless the
  operator explicitly asks.
- Prefer `bun run lint`, `bun run test`, and the no-emit TypeScript command for
  routine checks.
