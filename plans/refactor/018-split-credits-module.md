# Plan 018: Split the 859-line credits.ts into a credits/ package (move-only, stable import path)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Run
> `grep -n "^export \|^function \|^async function \|^class " src/lib/credits.ts`
> and compare with the symbol table below. On material mismatch, STOP.
>
> **History note**: an earlier audit round REJECTED splitting credits.ts
> because there was no test safety net. The maintainer has since explicitly
> waived that concern and requested structural refactoring. The mitigation is
> the move-only discipline below: function bodies must not change by a single
> character.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH if bodies change; LOW-MED as a disciplined move-only refactor
- **Depends on**: land plan 017 first (it imports from `@/lib/credits`; the
  path stays stable either way, but avoid concurrent branches editing the same
  imports)
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

`src/lib/credits.ts` (859 lines) is the transaction-critical core of the
product and currently bundles six concerns: error types, wallet lifecycle
(code + external), balance-row initialization/sync/expiry, access computation,
deduction, and crediting. Nearly every feature touches it, every reviewer must
scroll all of it, and its internal seams are invisible. Splitting it into a
directory package with an index re-export keeps every call site unchanged
(`@/lib/credits` resolves to the directory index) while giving each concern a
reviewable home. This is the highest-value structural change in `src/lib`.

## Current state

Symbol map of `src/lib/credits.ts` (line → symbol), grouped by target file:

**→ `shared.ts`** (helpers + types used across the package)
- 29 `export toNum`, 32 `fmt`, 38 `export isUniqueViolation`
- 75-105 types: `BalanceView`, `SubscriptionView`, `WalletAccess`,
  `WalletWithBalances`, `Tx` (`Parameters<typeof db.transaction>...`)

**→ `errors.ts`**
- 50 `InsufficientCreditsError`, 56 `WalletNotFoundError`,
  62 `WalletExpiredError`, 68 `ProductNotFoundError`

**→ `balances.ts`** (balance rows, grants, expiry, product listing)
- 111 `codeExpiryDate`, 117 `hasPaidOrder`, 125 `expireWalletBalances`,
  153 `expireCodeWalletIfNeeded`, 170 `initialGrant`, 184 `initBalanceRow`,
  218 `initBalanceRows`, 257 `syncBalance`, 309 `activeProducts`,
  315 `activeProductsTx`, 321 `viewOf`

**→ `wallets.ts`** (wallet lifecycle)
- 336 `insertCodeWallet`, 360 `createCodeWalletTx`, 376 `createCodeWallet`,
  391 `findActiveCodeWalletTx`, 405 `findActiveCodeWallet`,
  427 `getOrCreateExternalWallet`, 475 `readExternalWallet`

**→ `access.ts`** (reads/derivation)
- 493 `computeWalletAccess`, 557 `readWalletByCode`, 570 `readWalletById`,
  606 `soleProductId`

**→ `mutations.ts`** (ledger-writing primitives)
- 616 `deductFromWallet`, 694 `deductByCode`, 711 `deductByExternalId`,
  735 `creditWalletTx`, 807 `creditWallet`, 828 `applyIncludedCredits`

Non-negotiable invariants documented in `TECH.md` (quote, for context — the
move must not touch any of this logic): "ledger_entries are append-only",
"credit_balances.balance is a denormalized cache of the ledger sum",
"Deductions and retries rely on per-wallet idempotency keys", "Monthly free
grants use top-up-to semantics, not additive accumulation", "arithmetic
happens in SQL, not JS floats".

Known cross-file needs after the split (private today, must become exported
from their new home): `expireCodeWalletIfNeeded`, `initBalanceRow(s)`,
`syncBalance`, `activeProducts(Tx)`, `viewOf`, `initialGrant`, `fmt`,
`hasPaidOrder`, `codeExpiryDate` — check actual usage while moving and export
exactly what's needed, nothing more.

Importers of `@/lib/credits` (do not edit them; the path keeps working):
API routes under `src/app/api/v1/`, `src/lib/fulfillment.ts`,
`src/lib/actions/wallets.ts`, `src/lib/queries/*`, `src/lib/api/ledger.ts`
(imports `toNum`), and (after plan 017) `src/lib/api/credit-errors.ts`.
Re-verify with `grep -rln "@/lib/credits" src`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build | `bun run build` | exit 0 |
| Tests | `bun run test` | pass |

## Scope

**In scope**:
- Delete `src/lib/credits.ts`; create `src/lib/credits/` containing
  `index.ts`, `shared.ts`, `errors.ts`, `balances.ts`, `wallets.ts`,
  `access.ts`, `mutations.ts`.

**Out of scope** (do NOT touch):
- Every importer of `@/lib/credits` — zero call-site changes allowed.
- Function bodies, SQL, transaction boundaries, lock ordering — MOVE ONLY.
- `src/lib/fulfillment.ts` — reads from credits; unchanged.
- `src/lib/api/ledger.ts` — unchanged (its `toNum` import resolves via index).

## Git workflow

- Branch: `advisor/018-split-credits-module`
- Stage only `src/lib/credits*`. Commit: `Split credits.ts into credits/ package`.

## Steps

### Step 1: Create the package skeleton with index re-exports

Create `src/lib/credits/index.ts` that re-exports the full current public
surface:

```ts
export * from "./errors";
export * from "./shared";
export * from "./wallets";
export * from "./balances";
export * from "./access";
export * from "./mutations";
```

Note: today's file starts with `import "server-only";` — check line 1 of
`credits.ts`; whatever guard it has, replicate it at the top of EVERY new file
(not just the index), since deep imports become possible.

### Step 2: Move code verbatim per the symbol map

Cut each symbol from `credits.ts` into its target file exactly as-is. Adjust
only: (a) import statements at the top of each new file, (b) `export` keywords
on the formerly-private helpers listed in Current state that are used across
the new files. Keep `fmt` and other single-file-private helpers unexported
where only one file uses them.

Delete `src/lib/credits.ts` once empty.

**Verify** after each file move: `bun run typecheck` → exit 0 (the index keeps
the surface whole, so intermediate states typecheck).

### Step 3: Prove it was move-only

```sh
git show HEAD~0 --stat   # or git diff main... — whatever matches your branch
git diff <base> -- src/lib/credits* | grep "^[+-]" | grep -v "^[+-][+-]" \
  | grep -v "^import\|^[+-]import\|^[+-]export \* \|^[+-]$" | sort | uniq -c | sort -rn | head -40
```

Every removed line from `credits.ts` must reappear verbatim (allowing only
`export ` keyword additions on the listed helpers). Manually eyeball the diff
for `mutations.ts` in particular — the deduction/credit logic is the money
path.

**Verify**: `bun run test` → pass; `bun run lint` → exit 0; `bun run build` → exit 0.

## Test plan

`bun run test` (existing suite). Manual QA by maintainer afterward: create a
wallet, deduct, grant, checkout+fulfill in dev — but the move-only diff review
in Step 3 is the primary safety mechanism.

## Done criteria

- [ ] `src/lib/credits.ts` gone; `src/lib/credits/` with the seven files exists
- [ ] `grep -rln "@/lib/credits/" src | grep -v "src/lib/credits/"` → empty
      (no deep imports from outside the package yet — everything still goes
      through the index)
- [ ] Zero edits outside `src/lib/credits*` (`git status`)
- [ ] typecheck + lint + build + test all exit 0
- [ ] Step 3 diff review confirms bodies unchanged
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- The symbol table doesn't match the live file (drift).
- A move requires changing a function body (not just imports/export keywords)
  to compile — report the coupling instead of "fixing" it.
- You are tempted to "improve" anything while in there (naming, queries,
  transaction shape). Don't. Report follow-up ideas in your summary instead.

## Maintenance notes

- Future rule: new credit logic lands in the matching module; if a function
  needs helpers from three sibling modules, that's a smell to raise in review.
- The index re-export keeps external imports stable; deep imports
  (`@/lib/credits/mutations`) are allowed later if the maintainer prefers, but
  switch importers deliberately, not incidentally.
- Follow-up deliberately deferred: `queries/wallets.ts` overlaps with
  `access.ts` reads (three wallet-fetch layers). Consolidate only when one of
  them next changes for a feature.
