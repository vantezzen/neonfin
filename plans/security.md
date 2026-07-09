# Provider Secrets Security Plan

> Planned at commit `9322021` on 2026-07-09.
>
> This plan is intentionally broader than a single implementation ticket. It
> records the target security posture, the honest threat-model limits, and the
> order in which implementation plans should be split out.

## Goal

Make `vantezzen/pay` credible for hosted and self-hosted use when customers ask:

> Why should I trust you with my Stripe or Polar credentials?

The answer must be technically true, not marketing phrasing. The target posture:

- Database theft alone cannot decrypt provider credentials.
- Webhook verification does not touch provider API keys.
- Provider API keys are least-privilege and provider-side restricted where
  possible.
- Hosted deployments can keep provider keys outside the Next.js web runtime.
- The docs clearly state which deployment modes protect against which attacker.

## Current State

Relevant current files:

- `src/db/schema.ts` stores provider credentials on `provider_accounts`:
  `secretKeyEnc` and `webhookSecretEnc`.
- `src/lib/crypto.ts` encrypts and decrypts secrets with
  `PAY_ENCRYPTION_KEY` using AES-256-GCM.
- `src/lib/providers/index.ts` has one `getProvider(account)` factory that
  decrypts both the provider API key and the webhook secret.
- `src/app/api/v1/checkout/route.ts` needs a provider API key to create
  checkout sessions.
- `src/lib/actions/products.ts` needs a provider API key to create provider
  products/prices.
- `src/app/api/v1/wallets/[code]/portal/route.ts` needs a provider API key to
  create billing portal/customer sessions.
- `src/app/api/webhooks/[provider]/[accountId]/route.ts` only needs the webhook
  signing secret, but currently calls `getProvider(account)` and therefore also
  decrypts the provider API key.
- `src/lib/actions/webhooks.ts` replays stored webhook payloads through
  `getProvider(account).normalizeStoredPayload(...)`, even though replay
  normalization should require no secret at all.

Important distinction:

- Provider API key compromise can allow real API calls to Stripe or Polar within
  the key's permissions.
- Webhook signing secret compromise can allow forged webhook events for that
  provider account, which can corrupt wallet/access state. It should not allow
  provider API calls or money movement by itself.

## Honest Threat Model

There is no cryptographic trick that makes a single compromised process safe if
that same process has everything needed to use a bearer credential.

If the Next.js web process can decrypt provider keys, a web RCE can decrypt
provider keys. If the Next.js web process can call a generic "decrypt this
ciphertext" service, a web RCE can call that service too. Vault Transit improves
storage, rotation, auditability, and DB/env compromise resistance, but a web
runtime with a Vault token and ciphertext can still request decrypts.

To make a web app compromise not compromise provider keys, key material and
general decrypt authority must leave the web app's trust boundary.

The practical options are:

1. Provider-native delegation, such as OAuth/Connect/managed keys. This is the
   strongest model because `vantezzen/pay` never stores raw long-lived user
   provider keys. This is out of scope for the current product direction.
2. A separate provider-agent service that stores/decrypts provider keys and
   exposes only narrow, policy-checked operations. This can be easy to self-host
   as a sidecar container, but it is still a separate trust boundary.
3. Hardware or enclave-backed execution. This can reduce key extraction risk in
   hosted deployments, but it is not simple self-hosting and still needs a narrow
   operation API to avoid becoming "decrypt over HTTP".
4. User-held pepper/unlock keys. This can make unattended decrypt impossible,
   which also breaks or complicates checkouts, portals, webhooks, background
   retries, and future automation. It is useful only for deployments willing to
   require a human/admin presence before provider operations.

Conclusion: for this project, the credible path is optional secure sidecar mode,
not public-key peppering.

## Security Tiers

### Tier 1: In-Process Hardening

This keeps the single Next.js app deployment promise. It does not protect
provider API keys from full web RCE, but it does reduce accidental access and
DB-only compromise impact.

Implement:

- Split provider capabilities so webhook paths never decrypt provider API keys.
- Add a self-describing secret envelope format with authenticated context.
- Bind ciphertext to `(accountId, ownerId, provider, purpose)` as AES-GCM AAD.
- Add `keyId` support for future encryption-key rotation.
- Keep legacy ciphertext decrypt support for `iv.tag.ciphertext`.
- Write new ciphertext as `paysec:v1:<payload>`.
- Document that this tier protects against DB leakage, backups, logs, and
  accidental ciphertext swaps, not web RCE.

### Tier 2: Vault Transit Storage

This keeps one public app, but moves encryption keys out of the application env.
It is self-hostable with Vault or OpenBao.

Implement:

- `PAY_SECRETS_PROVIDER=env | vault`.
- `env` provider keeps current self-host simplicity.
- `vault` provider calls Vault Transit encrypt/decrypt APIs.
- The app stores Vault ciphertext in Postgres.
- Vault policies should allow only the Transit key operations needed by the app.
- Vault audit logs become part of the hosted security story.

Be explicit in docs: if the web process has both DB access and a Vault token, a
web RCE can still request decrypts. Vault is not a complete web-RCE boundary by
itself.

### Tier 3: Hardened Provider Agent

This is the first tier that can honestly say:

> A compromise of the Next.js web app does not expose provider API keys.

It does this by ensuring the web app never receives:

- provider API keys,
- webhook signing secrets,
- the encryption key,
- a Vault token capable of decrypting provider secrets,
- DB privileges to read secret-bearing rows.

Architecture:

- `pay-web`: the current Next.js app. Publicly exposed. Does dashboard, public
  API auth, wallets, orders, docs, UI.
- `pay-agent`: internal-only service. No browser exposure. Owns provider API
  key decrypt/use. Calls Stripe/Polar. Optionally verifies provider webhooks.
- `Postgres`: split credentials:
  - web role can read provider account metadata but not secret ciphertext.
  - agent role can read provider secret ciphertext/reference rows.
- `Vault/OpenBao` in hosted or hardened self-host mode:
  - only `pay-agent` has Transit decrypt authority.
  - `pay-web` has no Vault token.
- Network policy:
  - `pay-web` can call `pay-agent`.
  - `pay-web` cannot call Vault.
  - ideally `pay-web` cannot call Stripe/Polar directly.
  - `pay-agent` can call Vault and Stripe/Polar.

Agent API must be operation-based, never decrypt-based:

- `createCheckout({ orderId, returnUrls })`
- `createPortalSession({ walletId, returnUrl })`
- `syncProduct({ productId })`
- `verifyWebhook({ provider, accountId, rawBody, headers })`

The agent must never expose:

- `decryptSecret(...)`
- `getProviderKey(...)`
- arbitrary Stripe/Polar proxy calls
- arbitrary provider URL + method + body forwarding

Limits of this tier:

- A web RCE can still call allowed agent operations as the web app.
- It should not be able to extract provider keys.
- It should not be able to call arbitrary provider APIs.
- Abuse is limited by agent policy, provider key permissions, rate limits,
  audit logs, and emergency disable controls.
- If the attacker gets host root or compromises both containers/services, this
  boundary is gone.

This is still easy self-hosting if shipped as a Docker Compose profile:

- default profile: one Next.js app, `PAY_SECRETS_PROVIDER=env`
- secure profile: `pay-web`, `pay-agent`, Postgres roles, Vault/OpenBao

### Tier 4: Provider-Native Delegation

This remains the strongest long-term answer but is out of scope for now:

- Stripe Connect/OAuth or managed API keys.
- Polar OAuth/partner integration if it fits the product later.

This would let `vantezzen/pay` store revocable provider-issued grants instead of
raw merchant-created API keys.

## Implementation Roadmap

### Phase 1: Split Provider Capabilities

Priority: P1. Effort: S/M. Risk: LOW.

Files likely in scope:

- `src/lib/providers/index.ts`
- `src/lib/providers/types.ts`
- `src/lib/providers/stripe.ts`
- `src/lib/providers/polar.ts`
- `src/app/api/webhooks/[provider]/[accountId]/route.ts`
- `src/lib/actions/webhooks.ts`

Target shape:

- Add `getProviderApiClient(account)` for checkout/catalog/portal operations.
- Add `getWebhookVerifier(account)` for webhook signature verification.
- Add pure normalization helpers that do not require provider instances or
  secrets.
- Update webhook route and webhook replay action so neither can read
  `secretKeyEnc`.

Verification:

- `rg -n "getProvider\\(" src/app src/lib` should show no webhook route/replay
  callers.
- `rg -n "secretKeyEnc" src/app/api/webhooks src/lib/actions/webhooks.ts`
  should return no matches.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

### Phase 2: Add Secrets Provider Interface And v1 Envelope

Priority: P1. Effort: M. Risk: MED.

Files likely in scope:

- `src/lib/crypto.ts`
- `src/lib/env.ts`
- `src/lib/actions/providers.ts`
- `scripts/db-seed.ts`
- focused tests under `src/lib`
- `content/docs/self-host/environment.mdx`
- `TECH.md`

Target shape:

- Add `PAY_SECRETS_PROVIDER`, defaulting to `env`.
- Replace direct `encryptSecret(plaintext)` / `decryptSecret(encoded)` usage
  with context-aware async functions:
  - `encryptProviderSecret(plaintext, context)`
  - `decryptProviderSecret(ciphertext, context)`
- Include `purpose: "provider_api_key" | "webhook_secret"` in the context.
- New encryption writes `paysec:v1:...` with authenticated context.
- Legacy decrypt continues to support existing `iv.tag.ciphertext`.
- Add tests proving:
  - v1 round-trip works.
  - wrong account id / owner id / provider / purpose fails auth.
  - legacy ciphertext still decrypts.

Verification:

- `bun run test src/lib/crypto.test.ts` exits 0, or the equivalent Bun test
  filter if file naming differs.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

### Phase 3: Add Vault Transit Provider

Priority: P2. Effort: M. Risk: MED.

Files likely in scope:

- `src/lib/secrets/*` or equivalent new module.
- `src/lib/env.ts`
- docs under `content/docs/self-host/*`
- `TECH.md`

Target env:

- `PAY_SECRETS_PROVIDER=vault`
- `VAULT_ADDR`
- `VAULT_TOKEN`
- `VAULT_TRANSIT_MOUNT=transit`
- `VAULT_TRANSIT_KEY=pay-provider-secrets`

Target behavior:

- `encryptProviderSecret` calls Vault Transit encrypt.
- `decryptProviderSecret` calls Vault Transit decrypt.
- Plaintext never goes to Postgres.
- Vault errors map to operationally useful server-side logs but generic public
  API errors.
- Docs include a minimal Vault/OpenBao setup and policy.

Verification:

- Unit tests mock `fetch` for Vault encrypt/decrypt success and failure.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

### Phase 4: Least-Privilege Provider Guidance

Priority: P1. Effort: S. Risk: LOW.

Files likely in scope:

- `content/docs/workflows/providers.mdx`
- `content/docs/self-host/operations.mdx`
- provider dashboard copy in `src/app/dashboard/providers/page.tsx`
- provider connection wizard copy in
  `src/components/dashboard/provider-connect-wizard.tsx`

Target docs:

- Recommend Stripe restricted API keys (`rk_...`) over unrestricted `sk_...`.
- List the required Stripe permission categories based on actual adapter calls:
  products/prices write, checkout sessions write, billing portal sessions write,
  customers read/write if required by Stripe for portal/session behavior.
- Recommend Stripe access policies/IP or ASN restrictions for production.
- Recommend scoped Polar Organization Access Tokens with only required scopes:
  products, checkouts, customer sessions, and webhooks if automated later.
- State webhook secrets separately from provider API keys.

Verification:

- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

### Phase 5: Audit Trail And Emergency Controls

Priority: P2. Effort: M. Risk: MED.

Target behavior:

- Log provider API key use without logging secret material:
  - timestamp
  - provider account id
  - owner/project id when available
  - purpose: checkout, catalog sync, portal, webhook verify
  - actor: API key id, dashboard user id, system
  - result: success/failure
- Add per-provider-account disabled state.
- Add global env kill switch for provider API operations.
- Public API returns a stable error code for disabled provider accounts.

Verification:

- Tests cover disabled provider account on checkout and portal.
- Tests cover audit record creation around successful and failed provider calls.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

### Phase 6: Hardened Provider Agent

Priority: P2/P3. Effort: L. Risk: HIGH.

This should not be mixed into the first crypto refactor. Implement only after
Phases 1-5 are stable.

Target shape:

- Add an internal `pay-agent` process from the same repository or a small
  package under the same repo.
- It exposes only operation-based endpoints, never decrypt endpoints.
- It owns provider API key decrypt/use.
- It can optionally own webhook verification.
- It has a separate DB role and Vault token from `pay-web`.
- `pay-web` no longer needs `PAY_ENCRYPTION_KEY`, `VAULT_TOKEN`, or access to
  provider secret rows in secure mode.
- Docker Compose includes a secure profile that starts Postgres, Vault/OpenBao,
  `pay-web`, and `pay-agent`.

Hard design requirement:

The web app must not be able to turn agent access into arbitrary provider API
access. If the agent API starts looking like `{ provider, method, path, body }`,
stop and redesign.

Verification:

- In secure mode, `pay-web` env does not contain provider encryption/Vault
  credentials.
- In secure mode, the web DB role cannot select provider secret ciphertext rows.
- In secure mode, checkout still works through the agent.
- Agent tests prove arbitrary decrypt and arbitrary provider proxy operations do
  not exist.
- `bun run test` exits 0.
- `bun run lint` exits 0.
- `node_modules/.bin/tsc --noEmit` exits 0.

## Legal And Trust Track

This should run in parallel before hosted customer usage is serious.

Create and maintain:

- Privacy policy.
- Terms of service.
- Impressum.
- DPA for EU customers.
- Subprocessor list.
- Incident response and breach notification process.
- Security contact and `/.well-known/security.txt`.
- Public security page that explains the security tiers honestly.

Do not claim PCI compliance casually. The accurate claim is that
`vantezzen/pay` does not collect card details and uses Stripe/Polar-hosted
payment flows; merchants still need to satisfy their own PCI obligations.

## Public Security Claims We Can Make After Each Tier

After Tier 1:

- "Provider secrets are encrypted at rest."
- "Webhook handling does not decrypt provider API keys."
- "Database-only compromise is materially harder because ciphertext is
  authenticated to its account and purpose."

After Tier 2:

- "Provider secret encryption keys can live outside the app and database using
  Vault/OpenBao Transit."
- "Vault audit logs can record decrypt operations."
- "DB backups and app database access alone are not enough to decrypt secrets."

After Tier 3:

- "In secure mode, the public Next.js web process has no provider API keys, no
  provider secret decrypt token, and no DB permission to read provider secret
  rows."
- "A web-app RCE cannot extract provider API keys from the web process."
- "Provider API access is limited to narrow audited operations performed by an
  internal provider agent."

Never claim:

- "A web compromise cannot do anything payment-related."
- "Vault alone prevents web RCE from using secrets."
- "Keys are impossible to compromise."
- "No trust is required."

## Deferred Or Rejected Ideas

### Public-Key Pepper / Customer-Held Decryption Shard

Rejected for default mode.

It has a useful property: the server cannot decrypt without a user/customer-held
piece. But the product needs unattended provider operations: browser checkout,
server-side checkout, webhook handling, portal sessions, retries, and future
automation. If the missing shard is public in app code, it is scrapeable. If it
is not public, the product becomes an unlock-required workflow.

Possible future niche:

- optional "locked provider account" mode where provider operations require a
  dashboard admin to unlock the account for a short period.
- only useful for teams willing to trade automation for stronger key custody.

### Generic Vault Decrypt Endpoint

Rejected.

It improves key storage but not the web-RCE threat model. Any caller that can
submit arbitrary ciphertext for decryption is effectively holding decrypt
authority.

### Arbitrary Provider Proxy

Rejected.

An internal service endpoint shaped like `{ method, path, body }` is almost the
same as handing the web app the provider API key. The agent API must be built
around business operations with explicit validation.
