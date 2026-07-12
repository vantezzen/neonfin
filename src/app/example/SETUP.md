# Prism Studio demo — dashboard setup

The `/example` page is a fictional app ("Prism Studio", an AI gradient-art
generator) with vantezzen/pay fully wired in. It needs a small demo catalog in
the dashboard plus two env vars. This file describes the exact setup.

> **Fast path:** `bun run db:seed:prism -- --email you@example.com` creates
> everything below in your local database (idempotent — re-running resets the
> catalog). You only attach + sync your sandbox provider in the dashboard
> afterwards. The manual steps below double as the reference for what the
> script creates.

The page hardcodes only two things, both feature slugs:

| Constant | Value | Used by |
|---|---|---|
| Pro feature slug | `pro` | Premium styles + watermark removal (`useFeature`, upgrade dialogs) |
| License feature slug | `commercial-license` | One-time unlock card (`FeatureGate`) |

Everything else (products, prices, credit unit) is discovered at runtime — but
the copy on the page assumes the catalog below (an "images" credit unit, a
monthly free grant, a Pro subscription, a one-time license).

## 1. Project

1. Create a project, e.g. **Prism Studio** (identity mode: **Anonymous credit
   codes** — the default).
2. In project **Settings → Allowed origins**, add the origin the demo runs on
   (e.g. `https://pay.vantezzen.io`, plus `http://localhost:3000` for local
   dev). Leaving it blank also works but is not recommended for the hosted
   instance.

## 2. Provider

Connect a **sandbox/test** Stripe (or Polar) account via **Providers →
Connect provider**. It must be a sandbox account — the demo page tells
visitors to pay with Stripe's `4242 4242 4242 4242` test card.

If the pay instance runs on localhost, remember webhooks need forwarding
(`stripe listen --forward-to …` — the exact command is shown on the Providers
page). Without it, demo checkouts succeed but wallets never top up.

## 3. Products

### Product 1 — credit pack: "Images"

- Type: **Credit pack**
- Credit unit: `images`
- **Monthly free grant: 10** (this powers "your first renders are free" — new
  wallets can generate immediately without paying)

Prices (three packs, so the page can auto-suggest the middle one as
"Popular" via `recommendedPriceId`):

| Label | Credits | Price |
|---|---|---|
| Starter | 100 images | $4 |
| Studio | 300 images | $9 |
| Max | 1000 images | $19 |

### Product 2 — subscription: "Prism Pro"

- Type: **Subscription**
- Feature slugs on every tier: `pro` (exact slug — the page checks
  `useFeature("pro")`)
- Included credits: none required (optional: add included images per cycle if
  you also want to showcase subscription credit refills)

Tiers:

| Label | Interval | Price |
|---|---|---|
| Pro Monthly | monthly | $7/mo |
| Pro Yearly | yearly | $59/yr |

### Product 3 — one-time unlock: "Commercial license"

- Type: **One-time unlock**
- Feature slug: `commercial-license` (exact slug)

| Label | Price |
|---|---|
| Lifetime license | $19 one-time |

Attach all three products to the sandbox provider and make sure every price
shows as **Synced**.

## 4. Environment

Copy the project's **publishable** key (Developers tab) into the web app's
env:

```bash
NEXT_PUBLIC_EXAMPLE_PAY_URL="https://pay.vantezzen.io"   # this instance's own URL
NEXT_PUBLIC_EXAMPLE_PAY_KEY="pay_pk_…"                    # the Prism Studio project's publishable key
```

If either var is missing, `/example` renders a "Demo not configured" notice
instead of the app.

## 5. Manual test checklist

What the demo exercises, in a sensible order:

1. **Fresh wallet:** open `/example` in a private window → balance shows
   10 images (free grant), no signup.
2. **Metering:** generate a few renders → each costs 1 image, the balance
   animates down. Renders are watermarked (no Pro yet).
3. **Out of credits:** spend to 0 → the Generate button swaps to the
   CreditGate's zero-config "Buy images" fallback. Buy the Studio pack with
   `4242 4242 4242 4242` → popup closes, "Payment confirmed" banner, balance
   tops up. (The "+" next to the balance marks the middle pack "Popular" via
   the `recommendMiddleOption` strategy — it needs ≥2 packs to fire, so keep
   the three-pack catalog above.)
4. **Subscription:** click a locked style chip or "Upgrade" → buy Pro Monthly
   → locked styles unlock and watermarks disappear from the whole gallery.
   The header button now shows the tier; clicking it offers "Manage
   subscription" (billing portal).
5. **One-time unlock:** buy the commercial license → the sidebar card flips to
   "Commercial license active".
6. **Wallet:** open the wallet button → copy the code, scan/restore on
   another device, open the billing portal.
7. **Reveal mode:** toggle "Reveal the components" in the banner → every
   pay-powered element gets a labeled outline.
8. **Persistence:** reload the page → wallet, Pro, license, and balance are
   all still there (renders are session-only by design).
