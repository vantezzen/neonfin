# Plan 02 - First-run onboarding: signup → first paid test checkout

**Goal:** a new user should get from signup to a confirmed sandbox payment
without hitting a dead end, a contradiction, or a silent failure. The audit found
two outright bugs (A, B below) and a set of sequencing/copy gaps. Work top-down;
items are ordered by impact.

**Verification for every item:** `tsc --noEmit`, `bun run lint`, `bun run test`,
`bun run build`. Use existing primitives (`FormDialog`, `ConfirmAction`,
`EmptyState`, `Status`, toasts). No dev-server testing.

---

## A. Fix the broken first-payment moment (bug)

`createTestCheckout` sends the user back to
`/dashboard/projects/{id}?tab=orders` (`src/lib/actions/products.ts:391-394`),
but `ProjectTabs` only knows `products | developers | settings`
(`src/components/dashboard/project-tabs.tsx:5-12`), so the return from the
user's *first successful payment* silently lands on the Products tab with no
feedback.

Fix:
1. Change the success URL to `/dashboard/projects/{id}?test-checkout=success&order={orderId}`
   and the cancel URL to `/dashboard/projects/{id}?test-checkout=cancelled`.
2. On the project page, read those params (inside the existing Suspense-safe
   pattern - cacheComponents) and render a dismissible outcome banner above the
   tabs:
   - Success: green `Status` dot + `"Test payment received - your integration works end to end."`
     with two links: `View order` → `/dashboard/orders?project={id}` and
     `Webhook log` → `/dashboard/webhooks`. If the webhook hasn't arrived yet
     (order still pending), say
     `"Test checkout completed - waiting for the webhook to record it."`
     and link to the Providers page which already polls for the first event.
   - Cancelled: neutral `"Test checkout cancelled - no order was completed."`
3. Dismiss = link back to the bare project URL (no client state needed).

## B. Fix the email-less "Check your email" dead end (bug)

On instances without `RESEND_API_KEY`, `register()` still redirects to
`/verify-request` (`src/lib/auth/actions.ts:60`) telling users to open an email
that will never be sent (`src/lib/email.ts:56-70` silently no-ops;
`src/lib/auth/server.ts:16-18` disables verification).

Fix:
1. In `register()`, branch on the same `emailVerificationEnabled` flag the auth
   server uses: when email is disabled, redirect to
   `/login?registered=1` instead. Login page shows a one-line success notice:
   `"Account created. Sign in to continue."`
2. Better: when verification is disabled, sign the user in directly after
   registration (better-auth supports this - the credentials are in hand) and
   redirect to `/dashboard`. Prefer this if it doesn't fight better-auth's flow;
   otherwise ship (1).
3. On `/verify-request`, if verification is disabled server-side, render the
   same "Account created - sign in" state instead of the resend form (belt and
   suspenders for old links).
4. The resend form's blanket response (`src/lib/auth/actions.ts:246`) may keep
   its enumeration-safe copy when email IS enabled; when disabled, say
   `"This instance doesn't send email. You can sign in directly."`

## C. Un-knot the home "Get started" checklist (`src/components/dashboard/setup-checklist.tsx`, `src/lib/queries/dashboard.ts`)

Step 2 ("Finish project setup") can only complete after step 3's provider exists
(`isLive` needs a synced price - `src/lib/queries/dashboard.ts:98-129`), yet
step 3's copy says to connect the provider *"after your catalog is ready"*.

Fix - reorder and redefine so completion is monotonic:
1. Step 1: `Create your first project` (unchanged).
2. Step 2: `Connect a payment provider` - copy: `"Paste a Stripe or Polar key. This powers checkout for every project."` Done when a provider account exists **regardless of webhook secret** (see D for the half-configured case).
3. Step 3: `Create a product and go live` - copy: `"Add a product and price, then run a test checkout."` Done when `isLive`.
4. When a provider account exists but lacks its webhook secret, step 2 shows an
   amber sub-note: `"Almost there - finish the webhook step so payments get recorded."`
   with a **Finish setup** button that resumes the existing account
   (`ProviderConnectWizard` already supports `resumeAccount` - today only
   `/dashboard/providers` uses it; the home checklist's button starts a new
   account and creates duplicates, `setup-checklist.tsx:59`).
5. Completion moment: instead of `return null` when complete
   (`setup-checklist.tsx:22`), render - once - a dismissible success card:
   `"You're live 🎉"` / `"Orders, wallets, and webhooks now fill in as your app gets used."`
   with links to Docs → workflows and the Orders page. Persist dismissal in a
   cookie or a `dismissed_setup_complete` flag - simplest robust option:
   render the card only while `state.completedRecently` (any paid order < 7 days
   old and total paid orders ≤ 3); otherwise null. Pick whichever is least
   stateful; do not add a DB migration just for this.

## D. Provider wizard sharp edges (`src/components/dashboard/provider-connect-wizard.tsx`)

1. **Silent auto-provisioning:** when the restricted key allows webhook creation,
   the wizard auto-closes with no feedback (`provider-connect-wizard.tsx:105-107`).
   Instead show a final confirmation step (reuse step-3 chrome):
   `"Connected. We registered the webhook endpoint for you - complete a test checkout to see the first event arrive."`
   with buttons `Done` and `View provider status` → `/dashboard/providers`.
   When auto-provisioning *fails* and the wizard falls back to manual steps, add
   an info line at the top of step 2:
   `"We couldn't create the webhook automatically (the key may lack webhook write access), so add it manually below."`
   (the server already knows - surface the flag from `start.webhookConfigured` /
   the operation result instead of only `console.warn`,
   `services/provider/src/operations/handler.ts:59-69`).
2. **Signing-secret sanity check:** step 3 accepts any non-empty string
   (`src/lib/actions/providers.ts:117-119`). Add a shape check: Stripe secrets
   must match `/^whsec_/`; error copy:
   `"That doesn't look like a signing secret (Stripe secrets start with whsec_). Copy it from the webhook endpoint you just created."`
   Polar: keep min-length only.
3. **Post-wizard routing:** after finishing step 3, route (or link) the user to
   `/dashboard/providers` where the "Waiting for the first event…" poller lives
   - today nothing points there. The final screen from (1) covers this.
4. **Detected environment feedback:** when `environmentFromStripeKey` overrides
   the user's dropdown (`src/lib/actions/providers.ts:36-53`), show on step 2:
   `"Detected a test key - this account is in sandbox mode."`
5. **Provider-service infrastructure errors** currently leak raw strings into the
   dialog (`src/lib/provider-service/client.ts:26-31,49-52`). Map them: when the
   provider service is unreachable or unconfigured, show
   `"The provider service isn't reachable. Check PAY_PROVIDER_SERVICE_URL/SECRET on the server, then retry."`
   - still technical (the audience is the instance operator) but intentional.

## E. Secret key reveal - prevent accidental loss (`src/components/dashboard/api-keys-section.tsx`)

The one-time reveal dialog closes on Escape/outside-click with no confirmation
(`api-keys-section.tsx:226-241`).
1. Gate closing: the primary action is a `Copy and close` button; clicking the
   copy field also counts. If the user tries to dismiss without having copied,
   keep the dialog open and show `"Copy the key first - it won't be shown again."`
   Allow a secondary explicit `Close without copying` after that warning (never
   trap the user).
2. Add a one-line note to the Keys section header area:
   `"A publishable key was created with your project - you only need a secret key for server-side calls."`
   (counteracts the mint-more-keys nudge; a default key already exists,
   `src/lib/actions/projects.ts:113`).

## F. Copy contradictions and misc (quick wins)

1. **Allowed origins:** the project checklist demands "Add at least one app
   domain" (`src/components/dashboard/project-first-steps.tsx:111-124`) while the
   form says "Blank allows any" (`src/components/dashboard/project-form.tsx:127`).
   Resolve: make the checklist step complete when EITHER origins are set OR the
   user explicitly confirms. Change step copy to:
   `"Restrict browser calls to your app's domains in Settings - recommended before launch."`
   and add a `Mark done` button (same localStorage pattern as the integrate
   step). Change the form hint to
   `"One origin per line, e.g. https://app.example.com. Blank allows any origin - fine for development, restrict before launch."`
2. **Wrong location hint:** new-product dialog with no providers says "Connect a
   provider in Settings" (`src/components/dashboard/products/new-product-button.tsx:95`)
   - providers live under **Providers**. Change to
   `"Connect Stripe or Polar under Providers to enable checkout."` and make
   "Providers" a link to `/dashboard/providers`.
3. **Duplicate price on failed sync:** `createPrice` inserts then syncs in one
   action (`src/lib/actions/products.ts:224-231`); a sync failure leaves the
   dialog open inviting a duplicate resubmit. Split the outcome: if insert
   succeeded but sync failed, return success-with-warning so `FormDialog`
   closes, and toast:
   `"Price saved, but syncing to your provider failed: {reason}. Fix the provider connection, then use Sync now on the product."`
4. **Unverified-login dead end:** the `EMAIL_NOT_VERIFIED` login error
   (`src/lib/auth/actions.ts:19`, rendered `login-form.tsx:74-76`) gets a resend
   path: append a link `Resend verification email` → `/verify-request?email=…`.
5. **Signups-disabled round trip:** the login page hardcodes the register link
   (`src/app/(auth)/login/page.tsx:29`); call the existing `signupsOpen()` and
   hide it when closed.
6. **Test-checkout discoverability:** the flask icon only appears on row hover
   (`src/components/dashboard/products/product-card.tsx:326`). Make the action
   cluster always visible on synced sandbox prices (drop `sm:opacity-0
   group-hover:opacity-100` for the test-checkout button specifically), and add
   "Run a test checkout" as the explicit completion hint in checklist step 3
   copy (see C.3).
7. **Provider strip hidden for first-run users:** the "No payment provider -
   checkout is disabled" warning only renders when the owner already has
   provider accounts (`product-card.tsx:358`). Remove that outer condition so
   zero-provider users see the warning + connect action too.

## Acceptance criteria

1. Sandbox test checkout returns to a visible success/cancel banner with links
   to the order and webhook log; no `?tab=orders` references remain.
2. On an instance without Resend config, registering never shows "Check your
   email"; the user reaches the dashboard with at most one extra sign-in.
3. Home checklist steps complete strictly in order 1→2→3 with the new
   definitions; half-configured providers resume instead of duplicating.
4. Provider wizard: auto-provisioned webhooks produce a visible confirmation
   step; bad `whsec_` shapes are rejected with the specified copy.
5. Secret-key dialog cannot be dismissed accidentally before copy (but has an
   explicit escape hatch).
6. All copy changes match this plan verbatim (em dashes as written).
7. `tsc --noEmit && bun run lint && bun run test && bun run build` pass.
