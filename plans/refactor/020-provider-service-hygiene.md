# Plan 020: Provider-service hygiene — dead code, boot-time config validation, observable errors, Vault timeout

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the excerpts below against the live
> files under `services/provider/src/`. Key anchors: dead `verifyAndNormalize`
> methods at `adapters/stripe.ts:119` and `adapters/polar.ts:145`;
> `console.error(err)` in `server.ts` (~line 38); no-timeout `fetch` in
> `secrets/index.ts` `vaultRequest` (~line 126). On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M (four small independent fixes)
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / dx
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

The provider service is deliberately a separate Bun package so the web server
never touches Stripe/Polar API keys — that architecture is settled and stays.
But the package has accumulated: (a) dead adapter methods that duplicate the
live webhook-verification path and will silently drift from it, (b) config
that is only validated on first use, so a typo'd `PAY_SECRETS_PROVIDER`
deploys green and fails on the first real operation, (c) a catch-all error
log with no operation context, making "Provider operation failed" undebuggable
in production, and (d) a Vault HTTP call with no timeout that can hang every
in-flight request behind it. All four are small, independent, and directly
serve the "work very reliable" goal.

## Current state

The provider service lives in `services/provider` (own package.json,
tsconfig, .env). It must NOT import from the web app's `src/` tree. Typecheck
for it runs via the root script: `bun run typecheck` (which chains
`bun run --cwd services/provider typecheck`).

**(a) Dead adapter methods.** `providers/index.ts` is the only webhook entry
path and calls the *standalone* functions:

```ts
// services/provider/src/providers/index.ts:31-56
export async function verifyWebhook(row, rawBody, headers) {
  ...
  return row.provider === "stripe"
    ? verifyStripeWebhook(rawBody, headers, webhookSecret)
    : verifyPolarWebhook(rawBody, headers, webhookSecret);
}
export function normalizeWebhook(provider, payload, providerEventId) {
  return provider === "stripe"
    ? normalizeStripeEvent(payload as never)
    : normalizePolarEvent(payload as never, providerEventId);
}
```

The class methods `verifyAndNormalize` (stripe.ts:119-134, polar.ts:145-158)
and `normalizeStoredPayload` (stripe.ts:136-142, polar.ts:160-165) have ZERO
callers (verified by grep across `services/provider/src`). Both adapters are
also constructed with `webhookSecret: null` everywhere
(`providers/index.ts:27-28`, `operations/handler.ts` create path), so the
methods could never succeed anyway.

**(b) Lazy config validation.** `secrets/index.ts:150` —
`configuredProvider()` decides `"env" | "vault"` at request time; an invalid
value or missing `PAY_ENCRYPTION_KEY` surfaces only when the first secret is
touched. `server.ts` currently starts listening after reading `config`
(`config.ts` validates `PAY_PROVIDER_SERVICE_SECRET` at import — good; secrets
config gets no such treatment).

**(c) Context-free error logging.** `services/provider/src/server.ts`:

```ts
try {
  const request = (await req.json()) as ProviderServiceRequest;
  const data = await handleProviderRequest(request);
  ...
} catch (err) {
  console.error(err);
  return providerJson(400, {
    ok: false,
    error: err instanceof ProviderInputError ? err.message : "Provider operation failed",
  });
}
```

Note `request` is scoped inside the `try`, so the catch can't see which `op`
failed.

**(d) No Vault timeout.** `secrets/index.ts` `vaultRequest`:

```ts
const res = await fetch(`${config.address}/v1/${config.mount}/${action}/${config.key}`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-vault-token": config.token },
  body: JSON.stringify(body),
});
```

Repo precedent for the fix: `src/lib/outbound-webhooks.ts` uses
`signal: AbortSignal.timeout(10_000)` on its outbound fetch.

**Also in scope (one-liner):** `operations/handler.ts` create-account path
swallows webhook-provisioning failures completely:

```ts
try {
  webhookSecret = (await api.createWebhook({ url: request.webhookUrl })).webhookSecret;
} catch {
  // The dashboard will guide the user through manual setup.
}
```

The graceful fallback is intentional (keep it); the *silence* is the bug — an
operator can't distinguish "restricted key, expected" from "provider outage".

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (both packages) | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Provider service starts | `bun run --cwd services/provider start` (with valid `.env`) | prints `provider-service listening on :3001`; Ctrl-C |

## Scope

**In scope**:
- `services/provider/src/providers/adapters/stripe.ts`, `polar.ts` (delete dead methods)
- `services/provider/src/providers/contract.ts` (remove the methods from the
  `PaymentProvider` interface IF declared there — read it first)
- `services/provider/src/server.ts` (log context, startup validation call)
- `services/provider/src/secrets/index.ts` (export a `validateSecretsConfig()`, Vault timeout)
- `services/provider/src/operations/handler.ts` (webhook-provision warn log)

**Out of scope**:
- The web app (`src/`), `shared/provider-service.ts` — no contract changes.
- Merging the service into the web app, adding generic decrypt/proxy endpoints
  (explicitly forbidden by TECH.md).
- Auth logic, encryption logic, adapter business behavior.
- Error MESSAGE strings returned to the web app (public behavior unchanged).

## Git workflow

- Branch: `advisor/020-provider-service-hygiene`
- Stage only `services/provider/`. One commit per lettered fix is ideal.

## Steps

### Step 1: Delete the dead adapter methods

Remove `verifyAndNormalize` and `normalizeStoredPayload` from both
`StripeProvider` and `PolarProvider`. Check
`services/provider/src/providers/contract.ts` (or wherever `PaymentProvider`
is defined — grep `interface PaymentProvider`): if the interface declares
them, delete the declarations too. If the interface marks them optional and
something else implements them, STOP.

Also check whether the `webhookSecret` constructor parameter is now write-only
in each adapter (it likely only existed for these methods): if nothing reads
`this.webhookSecret` anymore, remove the parameter and update the `new
StripeProvider(secretKey, null)` / `new PolarProvider(secretKey, null, env)`
call sites in `providers/index.ts` and `operations/handler.ts`. If it IS still
read elsewhere, leave it.

**Verify**: `grep -rn "verifyAndNormalize\|normalizeStoredPayload" services/provider/src` → no matches; `bun run typecheck` → exit 0.

### Step 2: Validate secrets config at boot

In `secrets/index.ts`, export a `validateSecretsConfig(): void` that: resolves
`configuredProvider()` (throws on invalid value — it already does), and for
`"env"` calls the key-loading path (`envKey()`) to force the
32-byte check; for `"vault"` calls `vaultConfig()` to force required-var
checks. No network calls.

In `server.ts`, call `validateSecretsConfig()` before `Bun.serve`/listen so a
misconfigured deploy exits non-zero at startup with the underlying error
message.

**Verify**: `PAY_SECRETS_PROVIDER=bogus bun run --cwd services/provider start`
→ exits non-zero mentioning the invalid provider; with a valid `.env` it
prints the listening line.

### Step 3: Add operation context to the server error log

Restructure the handler so `op` is known to the catch:

```ts
let op: string | undefined;
try {
  const request = (await req.json()) as ProviderServiceRequest;
  op = request.op;
  ...
} catch (err) {
  console.error(`[provider-service] op=${op ?? "unparsed"} failed:`, err);
  ...same response as today...
}
```

Response body stays byte-identical.

**Verify**: `bun run typecheck` → exit 0; `git diff services/provider/src/server.ts` shows no change to the `providerJson(...)` response construction.

### Step 4: Vault request timeout + webhook-provision warning

- In `vaultRequest`, add `signal: AbortSignal.timeout(10_000)` to the fetch
  options (mirror `src/lib/outbound-webhooks.ts`'s pattern).
- In `operations/handler.ts`, change the bare `catch {}` around
  `api.createWebhook(...)` to
  `catch (err) { console.warn("[provider-service] webhook auto-provisioning failed, falling back to manual setup:", err); }`
  — behavior otherwise unchanged.

**Verify**: `bun run typecheck` → exit 0; `grep -n "AbortSignal.timeout" services/provider/src/secrets/index.ts` → 1 hit.

### Step 5: Full verification

**Verify**: `bun run typecheck`, `bun run lint` → exit 0. Start the service
once with a valid `.env` → listening line prints.

## Test plan

None automated (repo convention). The Step 2 negative-start check is the
behavioral test.

## Done criteria

- [ ] No `verifyAndNormalize`/`normalizeStoredPayload` anywhere in `services/provider`
- [ ] Service exits non-zero at boot on invalid secrets config; starts clean on valid config
- [ ] Error log includes `op=`; response bodies unchanged
- [ ] Vault fetch has a 10s timeout; webhook-provision failure logs a warning
- [ ] `bun run typecheck` + `bun run lint` exit 0; no files outside `services/provider/` modified
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- Anything outside `services/provider/src` imports the dead methods (grep
  first — none found at planning time).
- `PaymentProvider` interface changes would ripple into
  `shared/provider-service.ts` — the shared contract must not change.
- Startup validation would break the documented `env`-provider default for
  local dev (it must not: `env` + valid key is the default happy path).

## Maintenance notes

- Webhook verification now has exactly one path (standalone functions used by
  `providers/index.ts`). New providers implement that pattern; do not
  reintroduce per-instance verify methods.
- If the service ever gains more config, extend `validateSecretsConfig` (or a
  broader `validateConfig`) rather than adding lazy reads.
- Deferred deliberately: structured logger (pino etc.) — `console.*` with an
  op prefix is proportionate for a single-endpoint service; request IDs can
  come later if multi-instance debugging demands it. Also deferred:
  distinguishing transient-vs-credential validation errors across the service
  boundary (would change the shared contract; do it when a real support case
  demands it).
