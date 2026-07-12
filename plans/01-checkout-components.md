# Plan 01 — End-customer checkout experience

**Goal:** the checkout surfaces our developers' *users* see (PurchaseDialog, the
popup/redirect handoff pages, wallet dialog) must look polished, build trust, and
convert. Today the PurchaseDialog reads like an admin settings list, the success
page is a bare card that says "Thank you", and there are zero trust signals
anywhere. This plan redesigns those surfaces and adds tasteful vantezzen/pay
branding.

**Files touched:**
- `registry/pay/components/pay/purchase-dialog.tsx` (main redesign)
- `registry/pay/components/pay/provider.tsx` (only if `usePayMode` isn't already exported — it is, at `provider.tsx:282`; no change expected)
- `src/app/pay/success/[orderId]/page.tsx`, `success-poller.tsx`
- `src/app/pay/status/[orderId]/route.ts`
- `src/app/pay/cancelled/page.tsx`
- `src/app/pay/recover/page.tsx`
- `content/docs/components/purchase.mdx` (props table update)
- `src/components/docs/pay-component-demos.tsx` (purchase demo caption only — coordinate with plan 04)

**Constraints (critical):**
- `registry/pay/**` ships into consumer apps via shadcn. Keep everything
  token-based (`bg-muted`, `text-primary`, …) so it inherits the host app's
  theme. No hard-coded brand colors. No new dependencies. base-ui shadcn:
  `render` prop, never `asChild`.
- Do NOT change the public API of `PurchaseOptionControls`, `PurchaseOption`,
  `PurchaseFilters`, or the `renderOption` contract — consumers already use them.
  New props are additive with safe defaults.
- After changes: `bun run registry:build`, `tsc --noEmit`, `bun run test`,
  `bun run build`.

---

## 1. PurchaseDialog redesign (`registry/pay/components/pay/purchase-dialog.tsx`)

### 1.1 Option rows — make them look like offers, not table rows

Current row (`PurchaseOptionButton`, lines 80–149): flat `rounded-lg border p-3`,
title and price share the same `font-medium` weight, `product.name` is repeated
as a muted line in *every* row, and there is no highlight mechanism.

New `PurchaseOptionButton` layout (keep the export name and props):

```
┌────────────────────────────────────────────────┐
│ 600 minutes                    [Popular]  $5   │  ← title font-medium; price text-base font-semibold
│ 600 minutes / period                      /mo  │  ← existing sub-line; interval text-xs muted, under price
│ [Full access] [Priority]                       │  ← feature chips (keep current style)
│ ≈ $0.83 per 100 minutes                        │  ← NEW unit-price hint (credit packs only)
└────────────────────────────────────────────────┘
```

Concrete changes:
1. Row container: `rounded-xl border p-4` (was `rounded-lg border p-3`). Hover:
   `hover:border-primary/40 hover:bg-accent/40` (was `hover:bg-accent`). Keep
   `transition-colors`, `text-left`, disabled styles.
2. Price block (right column): amount in
   `text-base font-semibold tabular-nums`; interval (`/mo`, `/yr`) as a separate
   `text-xs text-muted-foreground` line *below* the amount, right-aligned. Keep
   the busy `Loader2` and the discount line-through behavior exactly as today.
3. **Remove the per-row `product.name` line** (current line 125) when all
   rendered options belong to one product. When options span multiple products,
   render group headers instead (see 1.3) — never repeat the product name inside
   every row.
4. **Unit-price hint** (new, only when `price.creditsGranted > 0` and
   `price.amountCents > 0`): a `text-xs text-muted-foreground` line under the
   title column. Format: pick the denominator that keeps the number readable —
   per 1 unit if unit price ≥ $0.10, else per 100 units. Use the existing
   `formatMoney`. Examples: `≈ $0.83 per 100 minutes`, `≈ $0.10 per image`.
   Implement as a small pure helper `unitPriceHint(price, product): string | null`
   in the same file, exported for tests.
5. **Recommended highlight** (new): when a row is recommended, add
   `border-primary ring-1 ring-primary` on the container and a pill in the title
   row: `<span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Popular</span>`.
   Wire-up: new dialog props
   ```ts
   /** Visually highlight one price as the suggested option. */
   recommendedPriceId?: string;
   /** Pill text for the recommended option. */
   recommendedLabel?: string; // default "Popular"
   ```
   Pass a new optional `recommended: boolean` field on
   `PurchaseOptionControls` (additive — existing consumers unaffected) and let
   `PurchaseOptionButton` read it. Add both props to `PurchaseButtonProps` and
   forward them.
6. Keep the "Current plan" pill exactly as-is (check icon + `bg-primary/10`).

### 1.2 Sorting

After filtering (current lines 310–312), sort options: preserve API product
order, then `amountCents` ascending within a product. Cheapest-first is correct
for credit packs (anchor low, upsell via unit-price hint) and matches how the
seed data and demos present tiers.

### 1.3 Product grouping (multi-product projects)

When the filtered options span >1 distinct product, render a group label above
each product's rows: `<p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{product.name}</p>`.
Single-product case renders the flat list exactly like today (minus the
redundant name line).

### 1.4 Email field — move it below the decision

Today the optional "Receipt and recovery email" input renders *above* the
options (lines 349–363): form friction before the user has seen what they can
buy. Changes:
1. Move the field **below** the options list, above the trust footer.
2. Default visibility becomes mode-aware: the field only matters for anonymous
   wallets (recovery). Read `usePayMode()` (exported from
   `@/components/pay/provider`) and change the render condition to:
   `collectCustomerEmail ?? mode === "credit_codes"` — i.e. change the prop type
   to `collectCustomerEmail?: boolean` with **no** literal default (remove
   `= true`), and compute the effective value. Document this default change in
   `purchase.mdx`.
3. New copy — label: `Email (optional)`; add a helper line under the input:
   `<p className="text-xs text-muted-foreground">Get a receipt and a recovery link for your credits.</p>`.
   Keep `autoComplete="email"`, keep the same validation and error message.

### 1.5 Header copy — derive a human default title

Replace the static defaults (`title = "Buy credits or subscription"`,
`description = "Choose an option to continue."`) with:
- If `title` prop given → use it.
- Else if effective filters have exactly one feature →
  `` `Unlock ${humanizeFeature(feature)}` ``.
- Else if `filters?.grantsCredits` → `"Add credits"`.
- Else → `"Choose your plan"`.

Default `description` becomes `"Payment is handled by our secure checkout."`
(keeps `DialogDescription` present for a11y; it doubles as a trust cue). Both
remain overridable props.

### 1.6 Trust footer + branding ("tony" branding)

Add a footer strip at the bottom of `DialogContent` (below options/email, above
the `canManage` footer — or merged with it):

```tsx
<div className="flex items-center justify-between gap-3 border-t pt-3">
  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
    <Lock className="size-3" aria-hidden />
    Secure checkout — card details never touch this site
  </p>
  {showBranding ? (
    <a
      href="https://pay.vantezzen.io"
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
    >
      powered by <span className="font-medium">vantezzen/pay</span>
    </a>
  ) : null}
</div>
```

New prop `showBranding?: boolean` (default `true`) on both `PurchaseDialogProps`
and `PurchaseButtonProps`. Import `Lock` from lucide-react. Use a real em dash.

### 1.7 Status messaging — separate reassurance from errors

`checkout_closed` currently renders in destructive red (lines 284–287) even
though its message is reassuring. Introduce a second state
`const [notice, setNotice] = useState<string | null>(null)`:
- `checkout_closed` → `setNotice("Confirming your payment — this page updates automatically once it's recorded.")` (not `setError`).
- Render notice as `<p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {notice}</p>`.
- `checkout_cancelled` stays an error but soften to informational styling too if
  trivial; otherwise keep as-is (it is not the user's failure — acceptable either way).
- Clear `notice` wherever `error` is cleared today.

### 1.8 Loading and empty states

- Loading (products === null): replace the lone spinner with two skeleton rows
  matching the option row height:
  `<div className="h-[76px] animate-pulse rounded-xl border bg-muted/40" />` ×2,
  inside the same `flex flex-col gap-2` container. Prevents layout jump.
- Default `emptyMessage` → `"Nothing is available to buy right now. Please check back later."`

### 1.9 Disabled-tier explanation

When `canManage` is true (user already subscribes to a product on offer), the
other tiers of that product render disabled with no explanation. Above the
"Manage subscription" footer button add:
`<p className="text-xs text-muted-foreground">To switch plans, use Manage subscription — a new checkout can't change an existing subscription.</p>`
(only when at least one rendered option was disabled for that reason).

---

## 2. Success page (`src/app/pay/success/[orderId]/`)

This page is pay-owned (runs on the pay instance), shown in the popup and as the
default redirect target. It should feel like a receipt moment, not a debug view.

### 2.1 Extend the status route

`src/app/pay/status/[orderId]/route.ts` currently returns
`{ status, code, balance, creditUnit }`. Add: `productName: string | null`,
`amountCents: number | null`, `currency: string | null`, `creditsGranted: number | null`
— all from the order's entitlement snapshot / joined price+product (the order
row already snapshots these; read, don't recompute). Update the `Status` type in
`success-poller.tsx`. This is a pay-internal route consumed only by this page —
additive change, safe.

### 2.2 Page shell (`page.tsx`)

- Keep the `Suspense`-isolated `Resolver` pattern exactly (cacheComponents
  requirement — do not inline `await params` outside the boundary).
- Drop the floating "Thank you" `<h1>` above the card. The card itself carries
  the moment (heading moves inside, see 2.3). Keep an `<h1 className="sr-only">Payment status</h1>` for a11y.
- Add a footer under the card:
  `<p className="mt-6 text-center text-xs text-muted-foreground">Secure checkout · powered by <a href="https://pay.vantezzen.io" className="font-medium hover:underline">vantezzen/pay</a></p>`.

### 2.3 Paid state (`success-poller.tsx`)

```
        (✓)            ← CheckCircle2 size-10 text-emerald-600,
                          className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500"
   Payment complete    ← text-lg font-semibold
 600 minutes — $5.00   ← NEW: from creditsGranted/creditUnit + amountCents/currency
                          (fall back to productName; omit line if all null)
 1,240 minutes now available.   ← existing balance line, keep
```

- When the window has an opener (popup flow): after posting the message, render
  `"Returning you to the app…"` instead of `"You can return to the app and keep going."` (the window closes itself 900ms later — say so).
- When there is **no** opener (redirect flow) and `returnOrigin` is a valid
  origin: render a primary button `Return to app` →
  `window.location.assign(returnOrigin)`. When no returnOrigin: keep the
  current sentence but change to `"You're all set — you can close this tab."`
- Format the amount with a tiny local `formatMoney(amountCents, currency)`
  helper (Intl.NumberFormat, same approach as `registry/pay/lib/pay/format.ts`;
  this page is app-side so it may import from `@/lib/format` if an equivalent
  exists — check `src/lib/format.ts` first, it has `formatMoney`).
- Keep the recovery-code block exactly as designed (it's good), but move it
  visually below the return CTA.

### 2.4 Failure states

Replace the single destructive paragraph (lines 92–100) with a proper layout per
terminal status:
- Icon: `XCircle` (failed/expired) or `RotateCcw` (refunded), `size-8 text-destructive` / muted for refunded.
- Heading: `Payment failed` / `Checkout expired` / `Payment refunded`.
- Body: failed/expired → `"No charge was made. You can close this window and try again."`;
  refunded → `"This payment was refunded. Credits from it have been removed."`
- Below, a muted order-id line with a copy button (reuse the copy-button pattern
  already in this file): `Order {orderId}` — support conversations need it, but
  it shouldn't be the headline like today.
- If `returnOrigin` is valid and no opener: show the `Return to app` button here too.

### 2.5 "Taking longer" state

Keep the 60s escalation, but add the order-id + copy affordance under it so a
stuck user can contact support without screenshotting a spinner.

---

## 3. Cancelled page (`src/app/pay/cancelled/page.tsx`)

Currently a static "Checkout cancelled / No charge was made. You can close this
window and try again." — correct for the popup flow, a dead end for redirect.

- Keep the `CancelledPopupNotice` postMessage behavior untouched.
- Pass `returnOrigin` through to the visible content: when valid (reuse the same
  `popupOrigin`-style validation) and `!window.opener`, render an outline button
  `Return to app` → `returnOrigin`. This needs a small client component; keep
  the `Suspense` isolation for `searchParams` (cacheComponents).
- Add an icon above the heading (`XCircle className="mx-auto size-8 text-muted-foreground"`) and the same branding footer line as the success page.
- Body copy → `"No charge was made. Your items are still available whenever you're ready."`

---

## 4. Recover page (`src/app/pay/recover/page.tsx`)

Small consistency pass only: add the same branding footer line under the card as
success/cancelled. No other changes — the page is already good.

---

## 5. WalletDialog — light polish only (`registry/pay/components/pay/wallet-dialog.tsx`)

Do NOT restructure. Three small fixes:
1. The billing box description `"Manage invoices, payment methods, and subscriptions."` — fine. But the **billing "Manage" button** for code wallets is disabled until `currentCode` loads with no hint; add `title="Loading wallet…"` while `!currentCode && !externalAuth`.
2. Copy affordance: `copy()` silently no-ops when clipboard is unavailable —
  acceptable, but show the code selected (`select()` on the field) as fallback if
  `WalletCodeField` exposes a ref cheaply; if not, skip (do not over-engineer).
3. Dialog description for code wallets → `"Your wallet code keeps credits available across devices — like a gift card number."` (the analogy does more than the abstract sentence).

---

## 6. Docs + demo alignment

- `content/docs/components/purchase.mdx`: add `recommendedPriceId`,
  `recommendedLabel`, `showBranding` to the props table; update the
  `collectCustomerEmail` row ("defaults to true in credit-codes mode, false in
  external-auth mode"); update default `title`/`description`/`emptyMessage`
  values; document `PurchaseOptionControls.recommended`.
- `src/components/docs/pay-component-demos.tsx`: set
  `recommendedPriceId` in the purchase demo if a stable demo price id is
  available via env/config — if not cheaply available, skip; do not hardcode ids.

## Acceptance criteria

1. `bun run registry:build && tsc --noEmit && bun run test && bun run build` all pass.
2. PurchaseDialog renders: derived title, options sorted cheapest-first,
   single-product list without repeated product names, unit-price hints on
   credit packs, skeleton loading rows, email field below options (credit-codes
   mode only by default), trust footer with lock + powered-by link.
3. `recommendedPriceId` adds ring + "Popular" pill; `showBranding={false}` hides
   the powered-by link but keeps the secure-checkout line.
4. `checkout_closed` renders as a muted status with spinner, not red.
5. Success page: animated check, purchase summary line, popup auto-close message,
   redirect-flow "Return to app" button, redesigned failure states with copyable
   order id, branding footer.
6. Cancelled page: return button for redirect flow, branding footer.
7. No new dependencies in `registry/pay/**`; no secret env reads anywhere; no
   `asChild` usage.
8. Add a small unit test for `unitPriceHint` (pure function) following the style
   of `src/lib/amounts.test.ts`.
