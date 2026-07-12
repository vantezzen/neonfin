# Plan 04 — Documentation: fix the broken path, add the missing steps

**Goal:** the docs are already strong (accurate props tables, live demos,
llms.txt), but the advertised "5-minute quickstart" 404s, the getting-started
path never has the reader make a test payment, and several structural defects
undermine trust. Ordered by impact.

Verification: `bun run build` (fumadocs compiles MDX at build; broken imports
and the slug collision surface there), `bun run lint`. Cross-check every code
sample you touch against `registry/pay/lib/pay/index.ts` /
`server.ts` / `registry/pay/components/pay/provider.tsx` exports.

---

## A. Write the missing quickstart page (bug: 404 on the primary path)

`/docs/getting-started/quickstart` is linked from
`content/docs/getting-started/index.mdx:43`, `choose-setup.mdx:22`,
`frameworks.mdx:39` (and named in `workflows/index.mdx:6`) but does not exist.

Create `content/docs/getting-started/quickstart.mdx` — one condensed page,
Next.js App Router + credit-codes mode, assembled from content that already
exists in `dashboard.mdx`, `install.mdx`, `first-feature.mdx`:

1. **Frontmatter**: title "5-minute quickstart", description "From a fresh
   project to a paid test checkout."
2. **Prerequisites** (3 bullets): a pay instance login, Stripe in test mode,
   a Next.js app with shadcn initialized (`npx shadcn@latest init`).
3. **Steps** (use the `<Steps>` component like the workflow pages):
   1. *Create a project & connect Stripe* — two sentences + link to
      `getting-started/dashboard` for detail. Mention the wizard registers the
      webhook automatically with a restricted key.
   2. *Create a product and pack* — e.g. "600 minutes — $5".
   3. *Install* — the single multi-URL `npx shadcn@latest add` command +
      `.env.local` block (copy from `install.mdx`, keep in sync).
   4. *Wrap your app in `<PayProvider>`* — minimal snippet.
   5. *Gate a feature* — the `<CreditGate>` + `useCredits().deduct()` snippet
      from `first-feature.mdx` (short form).
   6. *Make a test payment* — click the purchase button, pay with
      `4242 4242 4242 4242`, watch the balance update; check the order under
      Dashboard → Orders. Include the local-webhook callout (see B).
4. End with: "Want the detail behind each step? Follow [the full path](/docs/getting-started)."
5. Add `quickstart` to `content/docs/getting-started/meta.json` right after
   `index`.

## B. Add a "Test your first payment" step to the full path

The getting-started path never validates the integration; the Stripe test card
appears nowhere in MDX (only inside the live demo component).

Create `content/docs/getting-started/test-payment.mdx`, slotted in
`meta.json` between `first-feature` and `go-live`:
- Run the checkout from your gated feature (or the dashboard's flask
  "Test checkout" button on a synced sandbox price).
- Test card `4242 4242 4242 4242`, any future expiry, any CVC.
- **Local development callout** (this is the trap that eats 20 minutes): if your
  pay instance runs on localhost, Stripe can't deliver webhooks — run
  `stripe listen --forward-to <your-instance>/api/webhooks/stripe/<accountId>`
  (the exact command with the right account id is shown on the Providers page).
  Without it the checkout succeeds but credits never arrive.
- Also add now-instead-of-later origins advice: "If you configured Allowed
  origins, include your dev origin (e.g. `http://localhost:3000`) or browser
  calls will fail during development." (Cross-ref `troubleshooting.mdx`.)
- Verify: balance updated in your app; order `paid` under Orders; webhook
  `processed` under Webhooks.
- Update `go-live.mdx` and `getting-started/index.mdx`'s "The path" list to
  reference the new step.

## C. Structural defects (all confirmed, mechanical)

1. **Slug collision**: delete `content/docs/components.mdx` (legacy stub that
   collides with `components/index.mdx` on `/docs/components`). If old inbound
   links matter, add `"/docs/components"` handling to `src/lib/docs/moved.ts`
   only if the path differs — it doesn't, so plain deletion is correct.
2. **`content/docs/components/client.mdx`**: the "Read orders" section is wedged
   between the `## Config` heading and its table. Move "Read orders" down beside
   the checkout/orders material so Config is followed by its table.
3. **Mermaid block renders as plain text** in
   `content/docs/concepts/checkout-flow.mdx`: the numbered list below it already
   covers the same content — delete the ```mermaid block (do not add a mermaid
   dependency).
4. **Orphaned page**: `content/docs/concepts/providers.mdx` is absent from
   `concepts/meta.json`, has zero inbound links, and lags
   `workflows/providers.mdx` (recommends raw `sk_test_` keys, manual webhooks
   only). Delete it and add a redirect entry in `src/lib/docs/moved.ts` →
   `/docs/workflows/providers`.
5. **`content/docs/api/errors.mdx`**: two consecutive paragraphs both explain
   `requestId` and end with the same sentence — merge into one.
6. **`content/docs/api/server-side-users.mdx`**: the get-or-create wallet
   response example omits `features` and `subscriptions`, which the real
   `ExternalWallet` type returns (`registry/pay/lib/pay/server.ts:41`). Add them
   to the example JSON.
7. **`content/docs/workflows/support-adjustments.mdx`**: snippets call an
   undefined `pay` — add the one-line setup
   `const pay = createPayServerClient({ baseUrl, secretKey })` (or an import
   comment) at the top of the first snippet.
8. **`content/docs/agent.mdx`**: (a) the first server-route example uses
   `export const payServer = …` inside a route file — exporting non-handler
   values from an App Router route file breaks the build; change to plain
   `const`. (b) Replace the literal `&apos;` entity with a real apostrophe.
9. **`content/docs/workflows/index.mdx:6`**: "sit between the quickstart and the
   low-level reference" — fine once A ships; verify the link points to the new
   page.
10. **`content/docs/api/index.mdx`**: move the `GET /api/v1/me` example out of
    "## Orders" into its own "## Identify your key" heading; expand the secret
    key row in the key-types table to list its real capabilities (wallets,
    grants, deduct, checkout, portal, features, orders).
11. **Vocabulary**: add "Feature" (and "Credits") to the vocabulary list in
    `concepts/index.mdx`, and add `access-and-features` to its "Recommended
    reading" list.
12. **`getting-started/frameworks.mdx`**: reframe as the branch it is — retitle
    intro to "Not using the Next.js App Router?" and move it after
    `first-feature` in `meta.json`; update the numbered "The path" list in
    `getting-started/index.mdx` accordingly.

## D. Demo snippets must match demo behavior (`src/components/docs/pay-component-demos.tsx`)

*(Coordinate with plan 01, which also touches this file — land 01 first.)*

1. **CreditGate demo**: the displayed snippet shows a bare
   `<CreditGate cost={5}><Button>Run premium action</Button></CreditGate>` while
   the live panel actually calls `deduct(5)` on click. Update the snippet string
   to include the `onClick={() => deduct(5)}` handler — the docs' own core
   lesson is "deduct inside the click handler".
2. **useCredits demo snippet**: add the `idempotencyKey` the page's callout
   insists on (e.g. `deduct(10, { idempotencyKey: crypto.randomUUID() })`).
3. **FeatureGate demo**: virtually every visitor sees "Locked" with no path to
   unlock. Add a caption under the demo:
   `"Locked? Buy the subscription in the PurchaseDialog demo — the demos share one wallet, so it unlocks here."`
   (Verify the demo subscription actually grants the `analytics` feature slug
   used here; if not, align the slugs.)
4. **Discoverability of consumer webhooks**: in `first-feature.mdx`, after "You
   do not need to write a checkout callback page", add: "If your *server* needs
   to react to payments, use [consumer webhooks](/docs/api/webhooks)." Add the
   same cross-link to `concepts/checkout-flow.mdx`.

## E. New recipe: "Build a pricing page" (high search-intent gap)

Create `content/docs/workflows/pricing-page.mdx` (add to `workflows/meta.json`):
compose `getProducts()` + `PurchaseDialog`/`renderOption` (or inline
`PurchaseOptionButton`s) + `useSubscription` into an inline pricing table —
the single most common payments page. Include:
- A complete, copy-pasteable component: three tiers side by side, current-plan
  state from `useSubscription`, `recommendedPriceId` highlight (new prop from
  plan 01), and a "Manage subscription" path via `getPortalUrl()`.
- Document `PurchaseOptionControls` (`busy/disabled/current/recurring/buy`,
  plus `recommended` after plan 01) — currently undocumented anywhere despite
  `renderOption` being a public prop.
- A short "Hooks reference" section (or separate page
  `components/hooks.mdx` if cleaner): `useSubscription` (full return shape from
  `provider.tsx:382`), `useSubscriptions`, `usePayMode`, `usePayCheckout`,
  `PAY_CHECKOUT_PAID_EVENT`.

## F. Smaller accuracy fixes

1. `components/client.mdx`: document `getMe()`, the checkout `idempotencyKey`
   and `code` options (`StartCheckoutOptions`, `registry/pay/lib/pay/index.ts:112`).
2. `getting-started/dashboard.mdx`: clarify the "Attach the product" step with
   the UI location (product card → provider strip → Attach); switch the key
   example from `sk_test_...` to a restricted `rk_test_...` key with a pointer
   to `workflows/providers.mdx` for scopes.
3. `getting-started/choose-setup.mdx`: after the self-host quick-start block,
   add the missing final command (`bun run dev`) so the sequence actually starts
   the app.
4. `getting-started/install.mdx`: add one visible-feedback sanity check at the
   end — "Drop `<RemainingCredits />` anywhere inside the provider; if you see a
   number, your keys, origin, and instance are wired correctly."
5. `self-host/database.mdx` vs TECH.md: check `scripts/db-reset.ts` for the real
   flag (`--yes` vs `--force`) and make both documents agree.
6. `components/install.mdx` vs `getting-started/install.mdx`: unify on the
   single multi-URL `npx shadcn add` command and the same "common install" set.

## Acceptance criteria

1. No internal docs link 404s (re-run the link check: extract all `](/docs/...)`
   targets from `content/docs/**` and diff against the file tree + `movedDocs`).
2. `/docs/getting-started/quickstart` exists, is in the sidebar, and ends with a
   completed test payment.
3. The getting-started path includes a test-payment step with the Stripe test
   card and the local-webhook + localhost-origins callouts.
4. `components.mdx` collision and `concepts/providers.mdx` orphan are gone
   (with redirect); mermaid text-dump removed; all punch-list items C.1–C.12 done.
5. Demo snippet strings match live demo behavior.
6. `bun run build` passes (this validates MDX + the moved-docs redirects).
