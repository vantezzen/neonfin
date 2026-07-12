# Plan 03 - Day-2 dashboard: operations, support, and navigation

**Goal:** once a project is live, the owner's core questions - "did customer X
pay?", "why does this wallet have N credits?", "did the webhook fail?" - must be
answerable in seconds. Today entities don't link to each other, Orders has no
search, and a copy bug renders "1,234 credits credits" on four surfaces.

Ordered by impact. Verification: `tsc --noEmit`, `bun run lint`, `bun run test`,
`bun run build`. Stick to the design language: `Status` dots, `EmptyState`,
`PageHeader`/`SectionHeader`, `formatDateTime`, toast feedback.

---

## A. Fix the doubled-unit copy bug (user-visible on 4 surfaces)

`formatLargeNumber(value, unit = "credits")` always appends a unit
(`src/lib/format.ts:39-45`); several call sites append another:
1. `src/app/dashboard/page.tsx:207` → renders "1,234 credits credits used".
2. `src/app/dashboard/wallets/page.tsx:229-231` → "1,234 credits images".
3. `src/app/dashboard/wallets/[id]/page.tsx:101-105` → doubled in Balances.
4. `src/app/dashboard/wallets/[id]/page.tsx:304-306` → Ledger "Change" column
   hardcodes "credits" even when the product's unit is e.g. "images" (wrong
   unit, the inverse problem).

Fix: make the helper's unit **optional** (`unit?: string`; append only when
provided), then audit every call site: pass the correct `creditUnit` exactly
once. Grep all usages of `formatLargeNumber` and normalize. Add 3-4 cases to a
small unit test (`src/lib/format.test.ts`, mirroring `amounts.test.ts` style).

## B. Cross-link orders ↔ wallets ↔ webhooks

1. **Orders table** (`src/app/dashboard/orders/page.tsx:185-191`): the issued
   code becomes a link to `/dashboard/wallets/{walletId}` (keep the copy
   affordance beside it). `listOrders` already returns `walletId`
   (`src/lib/queries/orders.ts:24-42`).
2. **Wallet detail gets an Orders section** (`src/app/dashboard/wallets/[id]/page.tsx`):
   between Access and Ledger, `SectionHeader` "Orders" / "Checkouts that paid
   into this wallet." Table: date, product, status dot, amount, provider link
   (reuse `ProviderLink`). Query: extend `getWalletDetail`
   (`src/lib/queries/wallets.ts:85-108`) with the wallet's orders (limit 50,
   newest first). Empty state: `"No orders yet for this wallet."`
3. **Wallet identity block**: under the title, render createdAt, lastSeenAt,
   customer email (when present), and provider customer id with a provider
   deep-link where `providerCustomerUrl` logic exists (`src/lib/providers/links.ts`
   - add a customer-URL helper for Stripe; Polar returns null, render plain
   text). Extend `getWalletDetail`'s select accordingly.
4. **Webhook rows** (`src/app/dashboard/webhooks/page.tsx`): in the expanded
   area, when the stored event references an order the fulfillment matched,
   link `Order → /dashboard/orders?…` or, better, straight to the wallet if
   resolvable. If the linkage isn't cheaply available from `webhook_events`,
   render the `providerEventId` (already fetched at `orders.ts:71`, never
   displayed) + full error text (see E.2) and skip deep links - do not build a
   new join table for this.

## C. Orders page: search + filters (`src/app/dashboard/orders/page.tsx`)

1. Add a search input (same pattern/markup as Wallets,
   `wallets/page.tsx:158-185`): matches customer email, order id, provider
   checkout id, issued code. Implement in `listOrders` with the same escaped
   `LIKE` approach used by `searchWallets` (`src/lib/queries/wallets.ts:33`).
2. Add a status `<select>` (All / Paid / Pending / Failed / Refunded / Expired)
   next to the existing project filter; both submit via the existing GET form.
3. Fix the filtered-empty state: when any filter/search is active, say
   `“No orders match your filters.”` with a "Clear filters" link (Wallets
   already does this - copy the pattern, `wallets/page.tsx:188-197`).
4. Remove "sortable by status" (alphabetical status sort is meaningless) -
   status is now a filter.
5. Add a "Refunds happen in your provider's dashboard" affordance: a one-line
   muted note under the header:
   `"Need to refund? Open the order in Stripe or Polar - refunds sync back automatically."`
   And fix the headerless provider-link column: give it a header `Provider`,
   and for Polar orders render a plain `Polar` label (no URL available,
   `src/lib/providers/links.ts:55-64`) instead of blank.

## D. Subscriptions get a home

There is no way to answer "how many active subscribers do I have?". Add a
**Subscriptions** section to the Orders page (tab or stacked section - prefer a
stacked section above Orders when any subscription exists, to avoid new nav):
- Query: new `listSubscriptions(ownerId, { projectId })` in
  `src/lib/queries/` (read-only module) joining product/price/wallet.
- Columns: wallet (link), product + tier label, status dot
  (Active / Canceled - access until {date}), renews/ends `formatDateTime`,
  provider link.
- Wallet detail: stop hiding non-active subscriptions
  (`wallets/[id]/page.tsx:57`) - show canceled ones as
  `"Canceled - access until {currentPeriodEnd}"` with a neutral dot.

## E. Webhooks page polish (`src/app/dashboard/webhooks/page.tsx`)

1. Map the `pending` status in the STATUS map (lines 20-24) - it currently
   renders as raw lowercase "pending"; label `Pending`, neutral tone.
2. Show the full error in the expanded area (today it's only a truncated
   one-liner in the summary row, line 120): `<pre className="whitespace-pre-wrap
   text-xs">` with the complete stored error.
3. Show which provider **account** (label) received the event, not just
   "stripe" - extend the query (`src/lib/queries/orders.ts:63-77`) to join the
   account label.
4. Replay button: make the toast honest - surface the fulfillment outcome
   (`processed` / `skipped (already fulfilled)` / error) instead of the
   unconditional "Webhook replayed" (`replay-webhook-button.tsx:9`).

## F. Navigation and shell fixes

1. **Settings reachability**: the cog icon in `NavUser` has no label
   (`src/components/dashboard/nav-user.tsx:26-28`). Add `title="Settings"` +
   `sr-only` text (match the adjacent logout button's pattern).
2. **Dashboard-scoped not-found**: add `src/app/dashboard/not-found.tsx` so
   `notFound()` from wallet/project detail keeps the dashboard shell (message:
   `"Not found"` / `"This page doesn't exist or you don't have access to it."`
   + link back to `/dashboard`).
3. **Project page cross-links**: on `/dashboard/projects/[id]`, add quick links
   near the header: `Orders` → `/dashboard/orders?project={id}`, `Wallets` →
   `/dashboard/wallets?project={id}` (both pages already support `?project=`).
4. **Timezone hints**: add `title={date.toISOString()}` to the webhook timestamp
   (`webhooks/page.tsx:129-131`) and ledger dates
   (`wallets/[id]/page.tsx:280-282`) - Wallets/Orders already do this.

## G. Design-language consistency sweep

1. `src/components/dashboard/settings-forms.tsx:80-82`: replace the
   Verified/Unverified `Badge` with the `Status` dot primitive.
2. `src/app/dashboard/wallets/[id]/page.tsx:82-85`: "This project has no
   products yet." plain `<p>` → `EmptyState`.
3. `src/components/dashboard/project-form.tsx:204-211` and the settings forms:
   move success feedback to toasts (the pattern every dialog form already uses);
   keep inline rendering only for field-level validation errors.
4. Guard the **identity mode switch** on live projects
   (`project-form.tsx:107-124`): when the project has any wallet and the mode
   changes, require an inline confirmation
   (`"Switching modes strands existing wallets of the other kind. Continue?"` -
   use `ConfirmAction`/dialog, don't silently save).

## H. Wallet support-tooling gaps (smaller, do last)

1. Adjust-balance dialog (`wallets/[id]/page.tsx:107-143`): show the current
   balance in the dialog description and reject adjustments that would push the
   balance below zero unless a new `Allow negative balance` checkbox is ticked
   (server-side check in `adjustBalance`, `src/lib/actions/wallets.ts:34-76`).
2. Grant-feature input: offer datalist suggestions from the project's known
   feature slugs (`knownFeaturesOf` already exists and is used in
   `project-first-steps.tsx:15,37`); keep free text allowed.
3. Ledger truncation: `getWalletDetail` caps at 200 entries silently
   (`wallets.ts:103`). Render a notice when the cap is hit:
   `"Showing the latest 200 entries."` (Full pagination is out of scope.)
4. Record the acting dashboard user in manual-adjustment ledger metadata
   (`wallets.ts:64-70`, add `actorUserId`) so the ledger can answer "who comped
   this?". Display as a muted suffix in the ledger note cell when present.

## Acceptance criteria

1. No surface renders a doubled or wrong credit unit; `format.test.ts` covers it.
2. From an order row you can reach the wallet in one click; from a wallet you
   can see its orders and identity metadata.
3. Orders supports search + status filter with a correct filtered-empty state.
4. Active and canceled subscriptions are visible somewhere project-wide and on
   the wallet page.
5. Webhooks: `pending` mapped, full error visible, account label shown, honest
   replay toast.
6. Settings cog is labeled; dashboard 404s keep the shell; mode switch is
   guarded.
7. `tsc --noEmit && bun run lint && bun run test && bun run build` pass.
