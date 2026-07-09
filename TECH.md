# TECH.md

Technical guide for building deeply into `vantezzen/pay`.

This file is for contributors who need to understand the system shape before
changing core behavior. It is intentionally focused on architecture,
invariants, data flow, and extension points rather than product copy.

## Product Shape

`vantezzen/pay` is a self-hostable payment microservice for side projects. It
provides:

- A Next.js dashboard for project owners.
- A Bun provider service for Stripe/Polar secrets and provider SDK calls.
- A public REST API under `/api/v1`.
- Stripe and Polar provider adapters inside the provider service.
- Postgres-backed wallets, ledger entries, orders, subscriptions, API keys, and
  webhook logs.
- A shadcn registry that installs a typed browser client, server client, and
  React components into consumer apps.
- Fumadocs documentation and LLM-friendly docs routes.

The hosted instance is `https://pay.vantezzen.io`, but the app is designed to
run on a custom domain with only environment changes.

## Core Stack

- Runtime/app: Next.js `16.2.10`, React `19.2.4`, TypeScript.
- Database: Postgres via `postgres` and Drizzle ORM.
- Auth: `better-auth` with email/password, email verification, password reset,
  GitHub OAuth, and Drizzle adapter.
- UI: Base UI, shadcn registry components, Tailwind CSS v4.
- Docs: Fumadocs MDX from `content/docs`.
- Payments: Stripe SDK and Polar SDK inside the provider service.
- Provider runtime: standalone Bun package under `services/provider`.
- Tests: Bun test runner.

Important: this project uses a newer Next.js version with breaking API changes.
Before changing Next.js-specific behavior, read the relevant files under
`node_modules/next/dist/docs/`.

## Local Setup

1. Install dependencies with `bun install`.
2. Install provider service dependencies with `bun install --cwd services/provider`.
3. Copy `.env.example` to `.env`.
4. Copy `services/provider/.env.example` to `services/provider/.env`.
5. Fill web secrets:
   - `DATABASE_URL`
   - `PAY_PROVIDER_SERVICE_URL`
   - `PAY_PROVIDER_SERVICE_SECRET`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL`
   - `NEXT_PUBLIC_APP_URL`
   - `RESEND_API_KEY` and `RESEND_FROM` for email flows
6. Fill provider service secrets:
   - `DATABASE_URL`
   - `PAY_PROVIDER_SERVICE_SECRET`
   - `PAY_SECRETS_PROVIDER`
   - `PAY_ENCRYPTION_KEY` when using the `env` secrets provider.
7. Start Postgres with Docker if using the local default.
8. Run migrations with `bun run db:migrate`.
9. Seed realistic demo data with `bun run db:seed`.

Do not seed with `NODE_ENV=production`; `scripts/db-seed.ts` refuses to run.

Useful scripts:

| Command | Purpose |
|---|---|
| `bun run lint` | Run ESLint. |
| `bun run test` | Run Bun tests. |
| `bun run db:generate` | Generate Drizzle migrations after schema changes. |
| `bun run db:migrate` | Apply migrations. |
| `bun run db:reset -- --yes` | Reset local DB, then run migrations. |
| `bun run db:seed` | Create screenshot/demo data. |
| `bun run db:studio` | Open Drizzle Studio. |
| `bun run registry:build` | Build shadcn registry output. |
| `bun run dev` | Run Next.js and the provider service in watch mode. |
| `bun run dev:web` | Run only the Next.js app. |
| `bun run provider-service` | Run only the internal Bun provider service. |

## Environment

Web-app server-only environment is validated lazily in `src/lib/env.ts`:

- `DATABASE_URL`: Postgres connection string.
- `PAY_PROVIDER_SERVICE_URL`: internal provider-service URL used by the web app.
- `PAY_PROVIDER_SERVICE_SECRET`: shared secret used by the web app to call the provider service.
- `BETTER_AUTH_SECRET`: better-auth session signing secret.
- `BETTER_AUTH_URL`: auth base URL.
- `PAY_ALLOW_SIGNUPS`: `"true"` or `"false"`. First user is always allowed.
- `RESEND_API_KEY`, `RESEND_FROM`: transactional email for auth flows and
  wallet recovery.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: optional dashboard GitHub OAuth.
- `NEXT_PUBLIC_APP_URL`: public app URL used for checkout callbacks.
- `PAY_BILLING_MODE`: `"self_hosted"` or `"hosted"`, default
  `"self_hosted"`. Self-hosted installs must not require hosted billing.
- `PAY_HOSTED_PAY_SECRET_KEY`: secret key for the official hosted instance's
  own external-auth pay project. Required only when `PAY_BILLING_MODE=hosted`.
- `PAY_ALL_ACCESS_EMAILS`, `PAY_ALL_ACCESS_USER_IDS`: comma-separated hosted
  billing allowlists that resolve to the internal all-access plan.
- `NEXT_PUBLIC_HOSTED_PAY_URL`, `NEXT_PUBLIC_HOSTED_PAY_KEY`: public dogfood
  pay URL/key for hosted billing UI. The public key is not an enforcement
  signal; server-side billing mode is.

Example/demo docs use public variables:

- `NEXT_PUBLIC_EXAMPLE_PAY_KEY`
- `NEXT_PUBLIC_EXAMPLE_PAY_URL`

Never add secret env reads to client components or registry browser files.

Provider service environment is read in `services/provider`:

- `DATABASE_URL`: Postgres connection string.
- `PAY_PROVIDER_SERVICE_SECRET`: shared secret accepted by the provider service.
- `PAY_PROVIDER_SERVICE_PORT`: optional local port, default `3001`.
- `PAY_SECRETS_PROVIDER`: `"env"` or `"vault"`, default `"env"`.
- `PAY_ENCRYPTION_KEY`: base64 32-byte key for the `env` secrets provider.
- `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_TRANSIT_MOUNT`, `VAULT_TRANSIT_KEY`:
  Vault Transit settings for the `vault` secrets provider.

The Next.js app logs a server warning if provider-only variables such as
`PAY_ENCRYPTION_KEY` or `VAULT_TOKEN` are present in the web process.

## Directory Map

| Path | Purpose |
|---|---|
| `src/app` | App Router pages and route handlers. |
| `src/app/api/v1` | Public REST API consumed by registry clients. |
| `src/app/api/webhooks/[provider]/[accountId]` | Provider webhook entrypoint. |
| `src/app/dashboard` | Owner dashboard. |
| `src/app/docs` | Fumadocs docs app and search/LLM routes. |
| `src/app/pay` | Checkout success/cancel/popup handoff pages. |
| `src/db` | Drizzle schema and DB client. |
| `src/lib` | Server domain logic, API auth, providers, queries, actions. |
| `services/provider` | Standalone Bun provider service package. Owns provider secret encryption/decryption and Stripe/Polar SDK calls. |
| `src/components/dashboard` | Dashboard UI. |
| `src/components/docs` | MDX components and live component demos. |
| `registry/pay` | Files shipped to consumer apps through shadcn registry. |
| `content/docs` | Documentation source. |
| `drizzle` | Generated migrations and snapshots. |
| `scripts` | DB reset/seed utilities. |

## Data Model

All schema lives in `src/db/schema.ts` plus better-auth tables in
`src/db/auth-schema.ts`.

Primary domain tables:

| Table | Role |
|---|---|
| `projects` | One billing project owned by a dashboard user. Holds mode, allowed origins, code prefix, anonymous wallet limits. |
| `provider_accounts` | Stripe/Polar credentials encrypted at rest. |
| `products` | Sellable credit/access product. Defines product type, credit unit, free grant, renewal mode. |
| `prices` | Purchasable offer. For subscriptions each price is a tier. Stores credits granted, feature slugs, interval, provider price id. |
| `wallets` | Billing identity. Either anonymous `code` wallet or `external` wallet keyed by `externalUserId`. |
| `credit_balances` | Denormalized per `(wallet, product)` balance cache. |
| `ledger_entries` | Append-only balance changes. Source of truth for audit. |
| `orders` | Checkout attempts and immutable entitlement snapshots. |
| `subscriptions` | Active/canceled recurring access derived from provider webhooks. |
| `feature_grants` | Manual/support feature access independent of purchases. |
| `webhook_events` | Raw provider event log for idempotency/debugging/replay. |
| `api_keys` | Publishable and secret project API keys. |
| `rate_limit_buckets` | Postgres token buckets for public API abuse controls. |

Important database invariants:

- Money uses integer minor units (`amountCents`).
- Credits use `numeric(20, 6)` and arithmetic happens in SQL, not JS floats.
- `ledger_entries` are append-only. Never mutate historical ledger rows to
  "fix" a balance.
- `credit_balances.balance` is a denormalized cache of the ledger sum.
- Deductions and retries rely on per-wallet idempotency keys.
- `orders` snapshot price/product entitlements at checkout time. Fulfillment,
  refunds, and access derivation must use the snapshot so later price edits do
  not alter old purchases.
- Subscription and one-time purchase feature access is derived. Do not copy
  provider-derived access into `feature_grants`.
- `feature_grants` is only for manual/support grants.
- Secret API keys are hashed only. Publishable keys store plaintext because
  they are public by design.
- Provider credentials are encrypted by the provider service with either local
  AES-GCM (`PAY_SECRETS_PROVIDER=env`) or Vault Transit
  (`PAY_SECRETS_PROVIDER=vault`).

## Project Modes

`projects.mode` controls identity:

- `credit_codes`: anonymous wallet code stored by the browser client in
  `localStorage`.
- `external_auth`: server-side app passes `externalUserId` with a secret key.

Do not mix modes in API behavior:

- Code wallets require publishable-key/browser flow.
- External wallets require server-side secret-key flow.
- `/api/v1/checkout` accepts either `code` or `externalUserId`, never both.

## Credits And Wallet Logic

Core wallet/credit logic is in `src/lib/credits.ts`.

Key behavior:

- `createCodeWallet` creates a unique human-readable code using the project
  prefix.
- Balance rows are created lazily per active product.
- Free grants are applied when the balance row is created.
- Monthly free grants use top-up-to semantics, not additive accumulation.
- Code wallets can expire after inactivity unless they have a paid order.
- Expired unpaid wallets have positive balances zeroed with `expiry` ledger
  rows.
- `deductCredits` must lock the balance row, verify enough credits, insert a
  `deduction` ledger row, and update the balance in one transaction.
- `creditWalletTx` is the transaction-aware primitive for grants, purchases,
  refunds, renewals, and support adjustments.

Credit reasons:

- `purchase`
- `deduction`
- `free_grant`
- `manual`
- `refund`
- `expiry`

## Access And Features

Access is computed from three sources:

- Active subscriptions.
- Paid one-time orders.
- Manual `feature_grants`.

Feature slugs live on `prices.features`. For subscriptions, the active
subscription's current price defines access. For one-time purchases, the paid
order snapshot defines access.

Manual revoke only removes a row from `feature_grants`; it must not remove
subscription or one-time access. To remove derived access, end/refund the
underlying provider/order state.

## Checkout Flow

Checkout route: `src/app/api/v1/checkout/route.ts`.

Flow:

1. Authenticate bearer key with `authenticate()`.
2. Validate request body.
3. Enforce project mode and key kind:
   - `externalUserId` requires secret key and `external_auth`.
   - `code` requires `credit_codes`.
4. For publishable keys, verify `successUrl` and `cancelUrl` origins when an
   allowlist is configured.
5. Load active price/product and provider account.
6. Resolve target wallet:
   - code wallet if `code` is passed,
   - external wallet if `externalUserId` is passed,
   - no pinned wallet when creating a fresh anonymous checkout.
7. Reject duplicate active subscriptions to the same product with
   `already_subscribed`.
8. Insert a pending order with entitlement snapshots.
9. Ask the provider service to create checkout.
10. Persist provider checkout id.
11. Return `{ url, checkoutId, orderId }`.

Provider success URLs default to `/pay/success/{orderId}`. The browser client
can override this for redirect checkout. Popup checkout relies on postMessage
from pay-owned success/cancel pages plus order polling.

## Fulfillment And Webhooks

Provider events enter through:

`src/app/api/webhooks/[provider]/[accountId]/route.ts`

The provider service verifies webhook signatures and normalizes raw events into
`NormalizedEvent` from `src/lib/provider-service/types.ts`:

- `order.paid`
- `order.refunded`
- `subscription.renewed`
- `subscription.ended`
- `ignored`

Fulfillment lives in `src/lib/fulfillment.ts`.

Important fulfillment rules:

- Webhook signatures are verified by the provider service.
- Raw events are stored in `webhook_events` for idempotency and debugging.
- Fulfillment locks the matching order row with `FOR UPDATE`.
- Paid/refunded orders short-circuit on replay.
- Webhook account id is checked against the order's provider account to prevent
  cross-account fulfillment.
- Fulfillment resolves the wallet in this order:
  1. Wallet pinned on the order.
  2. Existing code wallet from checkout metadata.
  3. Fresh code wallet.
- One-time purchases add credits once and derive features from the paid order.
- Subscription purchases/renewals apply included credits according to product
  `renewalMode` and keep/update a subscription row.
- Refunds reverse credits with a `refund` ledger row and cancel any
  subscription started by that order.
- Subscription ended events cancel the matching subscription row.

## Provider Service

Provider service entrypoint: `services/provider/src/server.ts`.
Shared HTTP contract: `shared/provider-service.ts`.
Web app client: `src/lib/provider-service/client.ts`.
Web compatibility re-export: `src/lib/provider-service/types.ts`.

The provider service is intentionally a separate package with its own
`package.json`, `node_modules`, `tsconfig.json`, and `.env`. It should not
import from the web app `src/` tree.

The provider service owns:

- provider account secret encryption/decryption
- Stripe/Polar SDK clients
- provider product/price creation
- checkout creation
- billing portal/customer session creation
- webhook signature verification
- stored webhook payload normalization for replay

The web app owns:

- dashboard/session authorization
- public API auth
- order insertion
- wallet and credit fulfillment
- webhook event logging after signature verification

Never add a generic decrypt endpoint or arbitrary provider proxy to the provider
service. Its API must stay operation-based.

Stripe adapter:

- `catalogMode = "shared_product"`.
- Creates one Stripe product and multiple Stripe prices.
- Propagates metadata to checkout session and payment/subscription objects.
- Handles checkout completion, full charge refunds, subscription cycle
  invoices, and subscription deleted events.

Polar adapter:

- `catalogMode = "price_product"`.
- Creates one Polar product per vantezzen/pay price.
- Uses Polar checkouts and customer sessions.
- Treats `subscription.canceled` as scheduled cancellation and waits for
  `subscription.revoked` to end access.

Provider errors sent to public API clients should stay generic. Use
`src/lib/api/provider-errors.ts` rather than leaking provider details.

## Public API

Public API auth and CORS live in `src/lib/api/http.ts`.

Bearer key rules:

- Publishable keys start with `pay_pk_`.
- Secret keys start with `pay_sk_`.
- Secret keys are rejected from browser-origin requests.
- Publishable requests enforce project origin allowlist if configured.
- Publishable requests are rate limited per `(api key, client IP)`.
- Invalid code attempts have a separate rate limit.

Stable API errors are returned as:

```json
{
  "error": "Human readable message",
  "code": "stable_machine_code"
}
```

Clients should branch on HTTP status or `code`, not message text.

Route map:

| Route | Purpose |
|---|---|
| `GET /api/v1/products` | Product catalog and active prices. |
| `POST /api/v1/wallets` | Create anonymous code wallet. |
| `GET /api/v1/wallets/{code}` | Read code wallet balances/access. |
| `POST /api/v1/wallets/{code}/deduct` | Deduct credits from code wallet. |
| `GET /api/v1/wallets/{code}/portal` | Provider billing portal URL. |
| `POST /api/v1/wallets/external` | Get/create external-auth wallet. |
| `POST /api/v1/wallets/external/deduct` | Deduct from external-auth wallet. |
| `POST /api/v1/wallets/external/portal` | Provider billing portal URL for external-auth wallets. |
| `POST /api/v1/checkout` | Create provider checkout. |
| `GET /api/v1/orders/{ref}` | Poll order by order id or provider checkout id. |
| `POST /api/v1/credit` | Manual credit grant by code or external user. |
| `POST /api/v1/features` | Manual feature grant/revoke. |

## Dashboard And Server Actions

Dashboard routes live under `src/app/dashboard`.

Server actions live under `src/lib/actions`:

- `projects.ts`: project creation/update and key management.
- `products.ts`: product/price lifecycle and provider sync.
- `providers.ts`: provider account creation/update.
- `wallets.ts`: wallet support actions and manual adjustments.
- `webhooks.ts`: webhook log/replay actions.
- `state.ts`: shared action state helpers.

Dashboard query modules live under `src/lib/queries` and should remain read
focused. Keep mutations in actions or route handlers.

Auth/session access should go through `src/lib/auth/dal.ts` and
`src/lib/auth/server.ts`, not direct cookie parsing in random modules.

## Registry Output

Registry metadata is in `registry.json`.

Registry files are source files copied into consumer apps by `shadcn`:

| Registry item | Installs |
|---|---|
| `pay-client` | `lib/pay/index.ts` |
| `pay-server` | `lib/pay/server.ts` |
| `pay-provider` | `components/pay/provider.tsx` |
| `pay-credits` | `components/pay/remaining-credits.tsx` |
| `pay-wallet` | wallet button/dialog/code/QR files and `lib/pay/qr.ts` |
| `pay-purchase` | purchase dialog/button |
| `pay-gate` | credit and feature gates |

Registry client rules:

- Keep `registry/pay/lib/pay/index.ts` zero-dependency and browser-safe.
- Keep `registry/pay/lib/pay/server.ts` zero-dependency and server-only by
  convention. It must never expose `pay_sk_` to browser code.
- Browser client stores `pay_code` in `localStorage`.
- Browser client stores pending checkout order id in `pay_pending_order`.
- Popup checkout is desktop-first. Touch/mobile defaults to redirect.
- Popup checkout must handle:
  - popup blocked,
  - user closes popup,
  - provider cancellation,
  - transient polling failures,
  - successful payment with postMessage or polling.

Registry component rules:

- Components should be useful after `shadcn add` with minimal edits.
- Avoid coupling registry files to dashboard-only utilities.
- Keep component imports aligned with the registry targets, e.g.
  `@/lib/pay` and `@/components/pay/...`.
- When public API shapes change, update registry clients, docs, and live docs
  demos together.

## Docs

Docs source: `content/docs`.

Docs app:

- `src/app/docs/[[...slug]]/page.tsx`
- `src/app/docs/layout.tsx`
- `src/app/docs/api/search/route.ts`
- `src/app/docs/llms.txt/route.ts`
- `src/app/docs/llms-full.txt/route.ts`
- `src/lib/docs/source.ts`
- `src/lib/docs/get-llm-text.ts`

Fumadocs config is in `source.config.ts`.

MDX components are registered in `src/components/docs/mdx.tsx`.
Live component previews are in `src/components/docs/pay-component-demos.tsx`.

Docs structure:

- `getting-started`: beginner path.
- `workflows`: common operational tasks.
- `concepts`: mental models and deeper explanations.
- `components`: registry components and typed clients.
- `api`: raw HTTP API.
- `self-host`: operations and deployment.

When changing behavior, update both:

- reference docs (`components/client`, `components/server`, `api/*`), and
- workflow/concept docs that explain how users should think about it.

## Security Boundaries

Hard rules:

- Never send `pay_sk_` to the browser.
- Reject secret keys on requests with an `Origin` header.
- Enforce allowed origins for publishable-key browser calls.
- Validate checkout redirect origins for publishable-key calls.
- Keep provider secret encryption/decryption inside the provider service.
- Do not add generic decrypt or arbitrary provider-proxy routes.
- Store only hashes for secret API keys.
- Verify webhook signatures before normalization.
- Guard webhook fulfillment by provider account id.
- Use stable idempotency keys for retryable mutations.
- Keep provider errors generic in public responses.

## Rate Limiting

Rate limiting is Postgres-backed in `src/lib/api/rate-limit.ts` using
`rate_limit_buckets`.

Current categories:

- Publishable-key API requests per `(api key, client IP)`.
- Invalid recovery-code attempts per `(project, client IP)`.
- Anonymous wallet creation limits per project/IP/hour are modeled on the
  project and enforced in wallet creation flows.

Do not add in-memory rate limits; they break in serverless/multi-instance
deployments.

## Billing Portal

Billing portal behavior:

- Browser client calls `getPortalUrl({ returnUrl })`.
- API route reads wallet provider customer id.
- Provider adapter creates a Stripe billing portal session or Polar customer
  session.
- The wallet must have a provider customer from a completed purchase.

Portal should be the primary customer-facing path for invoices, payment methods,
subscription changes/cancellation, and provider-supported refund flows.

## Demo Data

`bun run db:seed` creates a realistic account:

- Email: `pay@vantezzen.io`
- Password: `1234`

The seed script creates provider accounts, projects, products, prices, wallets,
orders, webhooks, ledger entries, API keys, and enough recent activity for
dashboard screenshots.

The seed script deletes/recreates that specific demo account's data, not the
whole database.

## Testing And Verification

Use:

- `bun run lint`
- `bun run test`
- `node_modules/.bin/tsc --noEmit`
- `bun run registry:build` after registry changes
- `bun run db:generate` after schema changes

Existing focused tests include:

- `src/lib/amounts.test.ts`
- `src/lib/api/provider-errors.test.ts`

Test behavior, not implementation details. For risky changes, add small tests
around the public contract: error codes, idempotency, rounding, access
derivation, or provider normalization.

## Safe Extension Points

Add a new payment provider:

1. Implement `PaymentProvider`.
2. Add provider account UI and encrypted credential handling.
3. Normalize provider events into existing `NormalizedEvent` types.
4. Ensure checkout metadata carries at least `orderId` and `projectId`.
5. Add webhook signature verification.
6. Add provider portal URL support or document unsupported behavior.

Add a new product/access behavior:

1. Extend schema types only when current `products`, `prices`,
   `subscriptions`, and `featureGrants` cannot express it.
2. Preserve order snapshots.
3. Preserve ledger append-only behavior.
4. Update fulfillment, refunds, dashboard UI, registry clients, and docs.

Add public API endpoints:

1. Use `authenticate()` from `src/lib/api/http.ts`.
2. Return stable `code` values with `apiError()`.
3. Add CORS headers for browser-readable responses.
4. Enforce key kind and project mode explicitly.
5. Use rate limiting for publishable-key mutation endpoints.

Add registry surface:

1. Add files under `registry/pay`.
2. Register them in `registry.json`.
3. Ensure imports use the installed target paths.
4. Update docs and live demos.
5. Run `bun run registry:build`.

## Common Pitfalls

- Do not compute credit balances by adding JS floats. Use SQL numeric updates
  and the helpers in `src/lib/credits.ts`.
- Do not mutate orders after payment in a way that changes entitlement
  snapshots.
- Do not duplicate active subscription access into manual feature grants.
- Do not leak provider SDK errors through the public API.
- Do not make provider checkout URLs with untrusted publishable-key redirects.
- Do not call server-only helpers from registry browser components.
- Do not bypass the project owner scope in dashboard actions.
- Do not make dashboard query helpers perform mutations.
- Do not run schema migrations without checking generated SQL.

## Naming Notes

Current public names and prefixes are:

- Product/project name: `vantezzen/pay`.
- Browser key prefix: `pay_pk_`.
- Secret key prefix: `pay_sk_`.
- Browser client factory: `createPayClient`.
- Server client factory: `createPayServerClient`.
- Registry install namespace: `pay-*`.

Older internal context may mention `neonfin`; do not reintroduce that naming in
new user-facing code or docs unless intentionally writing migration notes.
