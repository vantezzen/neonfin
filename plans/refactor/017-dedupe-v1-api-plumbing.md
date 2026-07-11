# Plan 017: Deduplicate /api/v1 route plumbing (cursor codec, credit-error mapping, sole-product default)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the excerpts below against the live
> files (`src/app/api/v1/orders/route.ts`, `src/lib/api/ledger.ts`, both deduct
> routes). On material mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches public API error paths — behavior must be byte-identical)
- **Depends on**: none. Coordinate with plan 018 (both touch files importing
  `@/lib/credits`); land this one first.
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

The ~14 public v1 routes have grown three copy-paste patterns that have already
started to drift:

1. The base64url cursor codec is implemented twice, character-for-character
   (`orders/route.ts` and `lib/api/ledger.ts`).
2. The credits-domain error → HTTP error mapping (`InsufficientCreditsError` →
   402, `WalletNotFoundError` → 404, etc.) is repeated in every wallet route,
   and the code-wallet and external-wallet variants have already diverged
   subtly (rate-limit handling, which errors are caught).
3. The "default to the sole product" block is duplicated across deduct/credit
   routes.

Every future route copies one of the variants at random; a fix to one mapping
doesn't reach the others. Extracting three small helpers removes the drift risk
without inventing a route framework.

**Deliberate scope decision**: do NOT build a generic "handler factory" that
abstracts whole routes. The differences between code-wallet and external-wallet
routes (auth kind, mode checks, invalid-code rate limiting) are real and should
stay visible in each route file. We extract only the identical fragments.

## Current state

- `src/app/api/v1/orders/route.ts:16-39` — local `Cursor` type +
  `decodeCursor`/`encodeCursor`:

  ```ts
  type Cursor = { createdAt: string; id: string };
  function decodeCursor(value: string | undefined): Cursor | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      if (
        typeof parsed?.createdAt !== "string" ||
        Number.isNaN(new Date(parsed.createdAt).valueOf()) ||
        typeof parsed?.id !== "string"
      ) { return null; }
      return parsed;
    } catch { return null; }
  }
  function encodeCursor(order: { createdAt: Date; id: string }): string { ... }
  ```

- `src/lib/api/ledger.ts:7-30` — `decodeLedgerCursor`/`encodeLedgerCursor`,
  byte-identical logic, different names.

- `src/app/api/v1/orders/route.ts:54-61` — the ONLY route returning an inline
  error JSON instead of using `apiError()` from `src/lib/api/http.ts`:

  ```ts
  return Response.json(
    { error: "Invalid cursor", code: "invalid_body",
      details: [{ path: "cursor", message: "Invalid cursor" }] },
    { status: 400, headers: cors },
  ```

- `src/app/api/v1/wallets/[code]/deduct/route.ts` (106 lines) vs
  `src/app/api/v1/wallets/external/deduct/route.ts` (77 lines). Both contain,
  verbatim:

  ```ts
  // Default to the sole product when the caller omits one.
  const productId = parsed.data.productId ?? (await soleProductId(project.id));
  if (!productId) {
    return apiError(400, "product_required", "productId is required (project has multiple products)", cors);
  }
  ```

  and near-identical catch blocks:

  ```ts
  if (e instanceof InsufficientCreditsError) {
    return apiError(402, "insufficient_credits", "Insufficient credits", cors, {
      balance: e.balance, requested: e.requested });
  }
  ...
  if (e instanceof ProductNotFoundError)
    return apiError(400, "unknown_product", "Unknown product", cors);
  ```

  Differences to PRESERVE exactly: the code route additionally maps
  `WalletExpiredError` → 410 and wraps `WalletNotFoundError` with
  `invalidCodeAttempt()` rate limiting (twice: pre-check and catch); the
  external route requires a secret key and checks `project.mode`.

- Error classes live in `src/lib/credits.ts` (`InsufficientCreditsError`,
  `WalletNotFoundError`, `WalletExpiredError`, `ProductNotFoundError`).
- `apiError(status, code, message, headers, extra?)` and `invalidCodeAttempt()`
  live in `src/lib/api/http.ts`; `INVALID_CODE_LIMIT` and `rateLimitHeaders`
  come from `src/lib/api/rate-limit.ts` / `response.ts`.
- Repo convention: stable machine `code` values in error bodies — clients
  branch on `code`, never on message text. Do not change any `code` string.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build | `bun run build` | exit 0 |
| Existing API tests | `bun run test` | pass (http.test.ts, provider-errors.test.ts) |

## Scope

**In scope**:
- New: `src/lib/api/cursor.ts`, `src/lib/api/credit-errors.ts`
- Modified: `src/app/api/v1/orders/route.ts`, `src/lib/api/ledger.ts`,
  `src/app/api/v1/wallets/[code]/deduct/route.ts`,
  `src/app/api/v1/wallets/external/deduct/route.ts`,
  `src/app/api/v1/credit/route.ts` (if it repeats the sole-product/error blocks
  — check first),
  `src/app/api/v1/wallets/[code]/route.ts`,
  `src/app/api/v1/wallets/[code]/ledger/route.ts`,
  `src/app/api/v1/wallets/external/route.ts`,
  `src/app/api/v1/wallets/external/ledger/route.ts` (same check)

**Out of scope**:
- `src/lib/api/http.ts` — no restructuring of auth/CORS (considered and
  rejected: 280 lines with small focused functions is fine).
- `src/lib/credits.ts` — plan 018's territory; import from it, don't edit it.
- Response shapes, status codes, `code` strings, rate-limit semantics — must be
  byte-identical. This is refactoring, not redesign.
- `/api/v1/checkout/route.ts` — its wallet-resolution branching is
  checkout-specific; leave it.

## Git workflow

- Branch: `advisor/017-dedupe-v1-api-plumbing`
- Stage only in-scope files. Commit per step. Message style: short imperative.

## Steps

### Step 1: Extract the cursor codec

Create `src/lib/api/cursor.ts` with `import "server-only";`, exporting
`Cursor`, `decodeCursor`, `encodeCursor` (bodies copied verbatim from
`orders/route.ts:16-39`). Switch `orders/route.ts` and `lib/api/ledger.ts` to
import from it and delete their local copies (in `ledger.ts`, keep the
exported name `decodeLedgerCursor` as a re-export alias ONLY if other files
import it — check with `grep -rn "decodeLedgerCursor" src`; otherwise update
the importers to the new names).

**Verify**: `bun run typecheck` → exit 0;
`grep -rn "base64url" src/app/api/v1 src/lib/api` → hits only in `cursor.ts`.

### Step 2: Standardize the orders-route cursor error

Replace the inline error JSON at `orders/route.ts:54-61` with:

```ts
return apiError(400, "invalid_body", "Invalid cursor", cors, {
  details: [{ path: "cursor", message: "Invalid cursor" }],
});
```

First confirm `apiError`'s `extra` parameter spreads into the body at the top
level (read `apiError` in `src/lib/api/http.ts:135`); the response body must
remain `{ error, code, details }`. If `apiError` nests extras differently,
STOP.

**Verify**: `bun run test` → pass; response shape unchanged per your reading of
`apiError`.

### Step 3: Extract credit-error mapping and sole-product default

Create `src/lib/api/credit-errors.ts`:

```ts
import "server-only";
// Maps credits-domain errors to public API responses. Wallet-not-found is NOT
// handled here: code-wallet routes must rate-limit invalid codes first.
export function creditErrorResponse(e: unknown, cors: Record<string, string>): Response | null {
  if (e instanceof InsufficientCreditsError) { /* 402 block, verbatim */ }
  if (e instanceof WalletExpiredError) { /* 410 block, verbatim */ }
  if (e instanceof ProductNotFoundError) { /* 400 unknown_product, verbatim */ }
  return null;
}

export async function requireProductId(project: Project, requested: string | undefined, cors: ...): Promise<string | Response> { /* sole-product block, verbatim */ }

export async function walletNotFoundResponse(projectId: string, req: Request, cors: ...): Promise<Response> {
  /* the invalidCodeAttempt + 429/404 block from the code deduct route, verbatim */
}
```

Rewrite the catch blocks in both deduct routes (and the other wallet routes in
scope, where the identical blocks appear) to:
`const mapped = creditErrorResponse(e, cors); if (mapped) return mapped;` then
route-specific handling (`WalletNotFoundError` → `walletNotFoundResponse(...)`
in code routes, plain 404 `apiError` in external routes), then `throw e;`.

The external deduct route does not catch `WalletExpiredError` today — adding
the shared mapper technically makes it catch it too. That is acceptable ONLY
because external wallets never throw it (`readExternalWallet` has no expiry
path); note this in the commit message. If you find external wallets CAN throw
`WalletExpiredError`, STOP.

**Verify**: `bun run typecheck` → exit 0; `bun run test` → pass;
`grep -c "instanceof InsufficientCreditsError" -r src/app/api/v1` → 0
(all mapped through the helper).

### Step 4: Full verification

**Verify**: `bun run lint` → exit 0; `bun run build` → exit 0. Then diff-check:
`git diff src/app/api/v1` must show no changes to status codes, `code` strings,
or header handling.

## Test plan

Run `bun run test` (existing `src/lib/api/http.test.ts` and
`provider-errors.test.ts` must stay green). No new tests (repo convention),
but the helpers are pure enough that the maintainer may add coverage later.

## Done criteria

- [ ] Cursor codec exists once (`src/lib/api/cursor.ts`); both former copies import it
- [ ] `creditErrorResponse` / `requireProductId` / `walletNotFoundResponse` used by the wallet routes; no duplicated catch blocks remain in scope files
- [ ] `orders/route.ts` uses `apiError` for the cursor error
- [ ] typecheck + lint + build + test all exit 0
- [ ] `git diff` shows zero changes to response `code` strings or status codes
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- `apiError`'s extra-parameter behavior differs from the inline JSON shape
  (Step 2).
- External-auth wallets turn out to have an expiry path (Step 3).
- Any helper extraction would change a status code, `code` string, or
  rate-limit call order.

## Maintenance notes

- New v1 routes should import these helpers; PR review should reject fresh
  inline copies of the catch blocks.
- If a third wallet kind is ever added, revisit whether the route-level
  resolution belongs in a shared resolver (deliberately NOT built now — two
  variants don't justify it).
- Plan 018 splits `src/lib/credits.ts`; the error-class import path
  `@/lib/credits` stays stable, so these helpers are unaffected.
