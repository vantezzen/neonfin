# Plan 019: Restructure the registry browser client and unify consumer-facing formatting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the excerpts below against the live
> files. Key anchors: `createPayClient` at `registry/pay/lib/pay/index.ts:225`;
> duplicate `formatCredits` at `purchase-dialog.tsx:40` and
> `remaining-credits.tsx:6`. On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (this code ships into consumer apps via `shadcn add`)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

`registry/pay/lib/pay/index.ts` is 926 lines, ~700 of which live inside the
single `createPayClient()` factory: HTTP layer, localStorage code storage,
catalog/wallet/deduct calls, and the popup-checkout state machine all in one
closure. This file is copied verbatim into every consumer's repo — its
readability IS the product's DX. Separately, the two shipped components
implement `formatCredits` twice with different output (one applies
`Intl.NumberFormat`, one doesn't), so the same balance renders as `1,000` in
one component and `1000` in another, and consumers get no reusable money/credit
formatter at all.

## Current state

**Hard constraints (from TECH.md — violating these is a plan failure):**
- `registry/pay/lib/pay/index.ts` must stay **zero-dependency and browser-safe**.
- `registry/pay/lib/pay/server.ts` must stay zero-dependency, server-only.
- Registry items may ship multiple files — precedent: the `pay-wallet` item in
  `registry.json` ships 5 components + `lib/pay/qr.ts`. Every file added to the
  `pay-client` item lands in the consumer's `lib/pay/` directory.
- `src/lib/pay` and `src/components/pay` are **symlinks** into `registry/pay/`,
  so `bun run typecheck` covers registry files.
- After registry changes always run `bun run registry:build`.

**Anatomy of `registry/pay/lib/pay/index.ts`:**
- 13–143: exported types (`PayClientConfig`, `Product`, `Price`, `WalletInfo`,
  `CheckoutResult`, `OrderStatus`, ...)
- 145–148: constants (`DEFAULT_STORAGE_KEY = "pay_code"`,
  `PENDING_ORDER_KEY = "pay_pending_order"`, `POPUP_POLL_MS = 1500`)
- 150–222: module-level helpers — `hasStorage`, `randomKey`, `checkoutError`,
  `shouldUseRedirect`, `popupFeatures`, `openCheckoutPopup`,
  `CheckoutPopupMessage` type
- 225–end: `createPayClient(config)` — one giant closure containing the HTTP
  layer (`fetchWithTimeout`/`request`), code storage, catalog/wallet/deduct
  methods, checkout initiation, `waitForPopupCheckout` (the popup/polling/
  postMessage state machine, ~130 lines), `startCheckout`, and utility queries.

**Duplicate credit formatting in shipped components:**

`registry/pay/components/pay/purchase-dialog.tsx:29-42`:
```tsx
function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
function formatCredits(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}
```

`registry/pay/components/pay/remaining-credits.tsx:6-9`:
```tsx
function formatCredits(n: number): string {
  const value = Number.isInteger(n) ? n : Number(n.toFixed(6));
  return new Intl.NumberFormat().format(value);
}
```

**Swallowed error in purchase-dialog (~line 253):** the products load ends in
`.catch(() => active && setError("Couldn't load purchase options."))` — a wrong
publishable key and a network blip produce the same silent message; nothing
reaches the console for the integrating developer.

**Effect-cleanup inconsistency:** `provider.tsx`'s resume-polling effect uses
an `active` flag guard (lines ~159–210, correct pattern); the wallet-dialog
`loadCode()` effect (wallet-dialog.tsx ~77–103) runs async work with no
`active` flag, so a slow wallet fetch can set state after close/unmount.

**registry.json today** (`pay-client` item, lines 6–23): ships exactly
`lib/pay/error.ts` + `lib/pay/index.ts`. Components get `error.ts` transitively
via `registryDependencies` → pay-provider → pay-client (verified; do not add
error.ts to component items).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck (covers registry via symlinks) | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Registry build | `bun run registry:build` | exit 0, regenerates `public/r/*.json` |
| App build | `bun run build` | exit 0 |

## Scope

**In scope**:
- `registry/pay/lib/pay/index.ts` (split), new `registry/pay/lib/pay/format.ts`,
  new `registry/pay/lib/pay/popup.ts`
- `registry/pay/components/pay/purchase-dialog.tsx`,
  `remaining-credits.tsx` (use shared format), `wallet-dialog.tsx` (effect
  cleanup only)
- `registry.json` (add the two new files to the `pay-client` item)
- `content/docs/components/client.mdx` — ONLY if it lists the installed file
  set; check and update the file list if so.

**Out of scope**:
- `registry/pay/lib/pay/server.ts` and `qr.ts`.
- Any behavioral change to the checkout flow, storage keys, or polling
  cadence — the popup state machine moves, it does not change.
- API response types / codegen (recorded as a direction option, not this plan).
- Renaming any exported symbol — consumers' existing imports must keep working
  (`import { createPayClient } from "@/lib/pay"`).

## Git workflow

- Branch: `advisor/019-registry-client-structure`
- Stage only in-scope files. Commit per step.

## Steps

### Step 1: Extract `format.ts` and dedupe component formatters

Create `registry/pay/lib/pay/format.ts` (zero-dependency, browser-safe):

```ts
/** Format a credit amount for display (trims float noise, locale-aware grouping). */
export function formatCredits(n: number): string {
  const value = Number.isInteger(n) ? n : Number(n.toFixed(6));
  return new Intl.NumberFormat().format(value);
}

/** Format integer minor units as localized currency, with a plain fallback. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
```

(The `Intl` variant of `formatCredits` wins — thousands separators are the
better default; note in the commit that purchase-dialog's credit display gains
grouping.) Delete both local `formatCredits` and the local `formatMoney` from
the two components and import from `@/lib/pay/format` (that alias is what
consumers use; inside this repo the symlink makes it resolve).

Add the file to `registry.json` under the `pay-client` item:

```json
{ "path": "registry/pay/lib/pay/format.ts", "type": "registry:lib", "target": "lib/pay/format.ts" }
```

**Verify**: `bun run typecheck` → exit 0; `bun run registry:build` → exit 0;
`grep -rn "function formatCredits\|function formatMoney" registry/pay/components` → no matches.

### Step 2: Extract the popup machinery into `popup.ts`

Create `registry/pay/lib/pay/popup.ts` and MOVE (verbatim) the module-level
popup helpers from `index.ts`: `popupFeatures`, `openCheckoutPopup`,
`CheckoutPopupMessage`, plus the `waitForPopupCheckout` machinery. Where
`waitForPopupCheckout` currently closes over client internals (the `request`
helper, `mode`, storage accessors — read the actual closure before moving),
convert those to explicit function parameters passed from `createPayClient`.
This is the only allowed signature change, and it must be
parameter-threading only — no logic edits. Add a short module comment listing
the states the machine handles (popup blocked / user closed / provider cancel /
transient poll failure / success via postMessage or polling — from TECH.md).

Register the file in `registry.json` under `pay-client` like Step 1.

**Verify**: `bun run typecheck` → exit 0; `bun run registry:build` → exit 0;
`wc -l registry/pay/lib/pay/index.ts` → meaningfully smaller (expect roughly
650–700); `git diff` on the moved code shows only parameter threading.

### Step 3: Log swallowed errors in purchase-dialog

In `purchase-dialog.tsx`, change the products-load catch to keep the generic
UI message but log the real error for the integrating developer:

```tsx
.catch((err) => {
  if (!active) return;
  console.error("[pay] Failed to load products:", err);
  setError("Couldn't load purchase options.");
});
```

Apply the same `console.error("[pay] ...", err)` pattern to the checkout-start
and portal catch blocks in the same file if they also swallow (read them
first).

**Verify**: `grep -n "console.error(\"\[pay\]" registry/pay/components/pay/purchase-dialog.tsx` → ≥1 hit; typecheck passes.

### Step 4: Fix the wallet-dialog effect cleanup

In `wallet-dialog.tsx` (~lines 77–103), add the `active`-flag pattern used by
`provider.tsx`: `let active = true;` at effect start, guard all `set*` calls
after awaits with `if (!active) return;`, and `return () => { active = false; };`.
Match `provider.tsx:159-210` exactly in style. No other changes in the file.

**Verify**: `bun run typecheck` → exit 0.

### Step 5: Full verification + docs check

Check `content/docs/components/client.mdx` for a list of files the `pay-client`
item installs; if present, add `lib/pay/format.ts` and `lib/pay/popup.ts`.

**Verify**: `bun run lint`, `bun run build`, `bun run registry:build` all exit 0.

## Test plan

None automated (repo convention). Maintainer manual QA: the docs live demos
(`src/components/docs/pay-component-demos.tsx` renders the real components) —
open the components docs page in dev, confirm the purchase dialog lists prices
with formatted money and starts a popup checkout.

## Done criteria

- [ ] `format.ts` + `popup.ts` exist, registered in `registry.json` under `pay-client`
- [ ] Zero `formatCredits`/`formatMoney` definitions left in components
- [ ] `index.ts` no longer contains popup machinery; public exports unchanged
      (`grep -n "export" registry/pay/lib/pay/index.ts` — same exported names as before, verified against the pre-change list)
- [ ] purchase-dialog logs real errors; wallet-dialog effect has cleanup
- [ ] typecheck + lint + build + registry:build all exit 0
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- Extracting `waitForPopupCheckout` requires changing its logic (not just
  threading parameters) to sever a closure — report the coupling.
- `registry:build` output changes any item other than `pay-client` (and the
  two components' items from Steps 1/3/4).
- Any previously exported symbol from `@/lib/pay` would disappear or rename.

## Maintenance notes

- Consumers who installed `pay-client` before this change won't have
  `format.ts`/`popup.ts` until they re-run `shadcn add`; `index.ts` importing
  `./format` and `./popup` makes the item's files move together — mention in
  release notes/changelog if one exists.
- Direction option recorded (not planned): generate the client's API types
  from the server's route/OpenAPI definitions to kill silent type drift between
  `WalletInfo` (client) and the live API. Today they are hand-maintained.
- Deferred: locale prop for `Intl.NumberFormat` calls (browser-locale default
  is acceptable; revisit if a consumer with app-level i18n asks).
