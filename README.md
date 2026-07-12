<p align="center">
    <img src="src/app/icon.png" alt="vantezzen/pay" width="150"/>
</p>

# vantezzen/pay

> Charge for your side project without building billing

vantezzen/pay is a self-hostable payment microservice for your side projects. It
runs a Next.js dashboard/API, stores wallets and ledger entries in Postgres,
syncs prices with Stripe or Polar, and serves shadcn registry components for
consumer apps.

![Dashboard](src/assets/dashboard.png)

Try it at [https://pay.vantezzen.io](https://pay.vantezzen.io) or learn how to host it yourself at [https://pay.vantezzen.io/docs/self-host](https://pay.vantezzen.io/docs/self-host).

## Local Setup

1. Install web dependencies with `bun install`.
2. Install provider service dependencies with `bun install --cwd services/provider`.
3. Copy `.env.example` to `.env` and fill the secrets.
4. Copy `services/provider/.env.example` to `services/provider/.env` and fill the provider secrets.
5. Start local Postgres with `docker compose up -d`.
6. Run migrations with `bun run db:migrate`.
7. Start the app with `bun run dev` (runs the Next.js app and the provider service).

See [TECH.md](TECH.md#local-setup) for the full list of required environment variables.

## Scripts

| Command | Purpose |
|---|---|
| `bun run lint` | Run ESLint. |
| `bun run test` | Run Bun tests. |
| `bun run db:generate` | Generate Drizzle migrations after schema changes. |
| `bun run db:migrate` | Apply migrations. |
| `bun run registry:build` | Build the shadcn registry output. |
