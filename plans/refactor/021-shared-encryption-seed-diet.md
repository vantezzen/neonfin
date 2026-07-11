# Plan 021: Extract secret encryption into shared/ and remove the seed script's duplicate crypto

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the excerpts below against
> `services/provider/src/secrets/index.ts` and `scripts/db-seed.ts:55-130`.
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (ciphertext format compatibility is load-bearing)
- **Depends on**: plan 020 (both edit `services/provider/src/secrets/index.ts`;
  land 020 first)
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

`scripts/db-seed.ts` (1749 lines) contains a full, independent
reimplementation of the provider service's secret encryption: AES-256-GCM with
AAD context binding, the `env:v1:` wire format, key validation, and a Vault
Transit client. If the encryption format ever changes in
`services/provider/src/secrets/index.ts` and not in the seed script (or vice
versa), seeded provider accounts silently become undecryptable. The repo
already has an established cross-package sharing mechanism — both packages
`export * from "../../../shared/provider-service"` — so the crypto belongs in
`shared/` with exactly one implementation.

## Current state

- Sharing mechanism (verified):
  - `services/provider/src/contract.ts:1` — `export * from "../../../shared/provider-service";`
  - `src/lib/provider-service/types.ts:1` — same file, same mechanism.
- `services/provider/src/secrets/index.ts` — the canonical implementation:
  `SecretPurpose`, `SecretContext`, `contextBytes()`, `envKey()` (base64,
  32-byte check), an env AES-GCM provider, `VaultTransitSecretsProvider` +
  `vaultRequest()`, `configuredProvider()`, and the public
  `encryptSecret()`/`decryptSecret()`.
- `scripts/db-seed.ts:55-130` — the duplicate. Excerpt (verbatim from the
  working tree):

  ```ts
  async function encryptSecret(plaintext: string, context: SecretContext): Promise<string> {
    const provider = process.env.PAY_SECRETS_PROVIDER ?? "env";
    if (provider === "vault") {
      return vaultEncrypt(plaintext, context);
    }
    if (provider !== "env") {
      throw new Error('PAY_SECRETS_PROVIDER must be "env" or "vault"');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    cipher.setAAD(contextBytes(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const body = [iv, tag, ciphertext].map((b) => b.toString("base64url")).join(".");
    return `env:v1:${body}`;
  }
  ```

  plus its own `contextBytes`, `encryptionKey`, `requiredEnv`, `vaultEncrypt`.
- The seed script runs as a plain bun script (`bun run scripts/db-seed.ts`).
  Constraint: plain bun scripts cannot import modules marked
  `import "server-only"` — the shared module must NOT carry that marker (the
  existing `shared/provider-service.ts` doesn't either).
- Wire-format invariant: ciphertexts are stored in Postgres
  (`provider_accounts.secretKeyEnc` / `webhookSecretEnc`) as
  `env:v1:<iv>.<tag>.<ct>` (base64url) or Vault's `vault:v1:...` — existing
  rows must keep decrypting.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (both packages) | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Seed roundtrip | `bun run db:seed` (against local dev DB) | completes; prints its summary |
| Decrypt check | log into dev dashboard, open a seeded project's provider account | credentials render (they decrypt via the provider service) |

## Scope

**In scope**:
- New: `shared/secret-encryption.ts`
- `services/provider/src/secrets/index.ts` — becomes a thin wrapper (provider
  selection + `SecretsProvider` classes delegating to shared primitives), or
  re-exports, preserving its public exports (`encryptSecret`, `decryptSecret`,
  `SecretPurpose`, `SecretContext`, and whatever plan 020 added)
- `scripts/db-seed.ts` — delete the duplicated crypto block, import from shared

**Out of scope**:
- The wire format itself — must remain bit-compatible in both directions.
- The rest of db-seed.ts (the 1500 lines of demo data). Splitting that into
  `scripts/seed/` modules was considered and deferred: it's cosmetic, churny,
  and the file is generated-data-shaped. Only the crypto leaves.
- `shared/provider-service.ts` — separate file, untouched.
- The web app must NOT gain the ability to decrypt provider secrets: nothing
  under `src/` may import `shared/secret-encryption.ts`. (The seed script is a
  local dev tool, not the web app.)

## Git workflow

- Branch: `advisor/021-shared-encryption`
- Stage only in-scope files. Commit: `Share secret encryption between provider service and seed`.

## Steps

### Step 1: Create `shared/secret-encryption.ts`

Move (verbatim) from `services/provider/src/secrets/index.ts`: the
`SecretPurpose`/`SecretContext` types, `contextBytes`, the env-key loader
(32-byte base64 validation), the AES-GCM encrypt/decrypt pair including the
`env:v1:` encode/parse, and the Vault Transit request/encrypt/decrypt client.
Export them. Use `node:crypto` imports (works under bun in both packages). No
`server-only` marker; instead add a top-of-file comment:

```ts
// Secret-encryption primitives shared by services/provider (runtime) and
// scripts/db-seed.ts (dev tooling). NEVER import this from the web app (src/)
// - the web server must not be able to decrypt provider credentials.
```

### Step 2: Make the provider service consume shared

`services/provider/src/secrets/index.ts` keeps its public API
(`encryptSecret`, `decryptSecret`, `validateSecretsConfig` from plan 020,
types) but implements it via imports from `../../../shared/secret-encryption`
(same relative-path style as `contract.ts`). Delete the now-duplicated bodies.

**Verify**: `bun run typecheck` → exit 0. Then the compatibility gate — in a
throwaway bun script (do not commit), encrypt with the OLD seed-script code
path (git stash / `git show :scripts/db-seed.ts`) and decrypt via the new
shared module with the same key + context → plaintext matches. Alternatively:
run `bun run db:seed` BEFORE the change, then after the change verify the
seeded provider account still decrypts in the dev dashboard (Step 4).

### Step 3: Put db-seed on the crypto diet

Delete `contextBytes`, `encryptionKey`, `encryptSecret`, `requiredEnv`,
`vaultEncrypt` (and their now-unused `node:crypto` imports) from
`scripts/db-seed.ts`; import `encryptSecret` and `SecretContext` from
`../shared/secret-encryption`. No other seed changes.

**Verify**: `grep -n "createCipheriv\|vaultEncrypt" scripts/db-seed.ts` → no
matches; `bun run typecheck` → exit 0.

### Step 4: Roundtrip verification

Run `bun run db:seed` against the local dev DB, then start dev
(`bun run dev`) and open the seeded demo project's provider account in the
dashboard — the provider service must decrypt the seeded credentials without
error (watch its console).

**Verify**: seed completes; no decryption errors in the provider-service log
when loading the provider account page.

## Test plan

The Step 2/4 roundtrip IS the test. No new automated tests (repo convention).

## Done criteria

- [ ] `shared/secret-encryption.ts` exists; provider service and seed both import it
- [ ] Crypto implemented exactly once (`grep -rn "aes-256-gcm" services shared scripts src` → hits only in `shared/secret-encryption.ts`)
- [ ] `grep -rn "secret-encryption" src/` → no matches (web app cannot decrypt)
- [ ] Seed → dashboard decrypt roundtrip works on dev
- [ ] typecheck + lint exit 0
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- The seed script's crypto turns out to differ from the service's in ANY
  detail (IV size, AAD composition, encoding, prefix) — that's a live
  divergence bug; report it rather than picking a side silently.
- Importing `node:crypto` from `shared/` breaks the Next.js build (it should
  not — nothing in `src/` imports the file; if the build complains, STOP).
- Plan 020 hasn't landed and the secrets file differs from its post-020 shape.

## Maintenance notes

- Any future change to the ciphertext format happens in exactly one file and
  needs a versioned prefix (`env:v2:`) with backward-compatible decrypt.
- Reviewer must confirm no `src/` import of the shared crypto module — that
  would undo the whole point of the provider-service isolation.
- Deferred: shrinking the remaining ~1600 lines of demo data in db-seed.ts.
  Revisit only if seed maintenance actually hurts (it's write-once data).
