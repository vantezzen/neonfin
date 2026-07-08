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
| `bun run db:generate` | Generate Drizzle migrations after schema changes. |
| `bun run db:migrate` | Apply migrations. |
| `bun run registry:build` | Build the shadcn registry output. |
