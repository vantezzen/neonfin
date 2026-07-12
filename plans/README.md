# UX Improvement Plans - vantezzen/pay

Source: full UX audit (2026-07-12) covering the dashboard, developer/registry components,
end-customer checkout flow, documentation, and marketing surfaces.

## Plans, in priority order

| Plan | Surface | Why this order |
|---|---|---|
| [01-checkout-components.md](01-checkout-components.md) | PurchaseDialog, success/cancel pages, wallet dialog | End-customer conversion. If developers' users don't convert, developers churn. |
| [02-onboarding-flow.md](02-onboarding-flow.md) | Signup → first paid test checkout | First-session experience decides adoption. Contains 2 outright bugs. |
| [03-dashboard-operations.md](03-dashboard-operations.md) | Overview, wallets, orders, webhooks, settings | Day-2 retention; contains a user-visible copy bug on 4 surfaces. |
| [04-docs.md](04-docs.md) | content/docs + docs app | Contains a 404 on the primary getting-started path. |
| [05-landing-marketing.md](05-landing-marketing.md) | Landing, compare, guides, SEO | Trust and conversion scaffolding; no bugs, highest-leverage additions. |

Each plan is self-contained: exact files, exact copy, and acceptance criteria. They
can be implemented independently and in parallel (they touch disjoint files, with
one noted exception: plan 01 and plan 04 both touch
`src/components/docs/pay-component-demos.tsx` - land 01 first).

## Conventions for implementers (read before starting)

- **Next.js version is newer than your training data.** Read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next-specific code.
  `cacheComponents` is enabled: any dynamic access (`await params`,
  `await searchParams`, cookies, etc.) must be isolated inside a `<Suspense>`
  boundary or `next build` fails. Only `next build` catches this - always run it.
- **Registry files (`registry/pay/**`) ship into consumer apps.** They must stay
  zero-dependency (lib) / shadcn-only (components), browser-safe, and must not
  import dashboard-only utilities. `src/` symlinks into `registry/` so
  `tsc --noEmit` covers registry code. shadcn here is base-ui flavored: use the
  `render` prop, never `asChild`.
- **Design language (dashboard surfaces):** Polar-style. `bg-canvas` shell,
  `Status` dots (never filled badges), `EmptyState` / `PageHeader` /
  `SectionHeader` primitives, `formatDateTime` for dates, toast feedback via the
  existing `FormDialog` / `ConfirmAction` / `MutationForm` patterns.
- **Verification:** `node_modules/.bin/tsc --noEmit`, `bun run lint`,
  `bun run test`, `bun run build`. After registry changes also
  `bun run registry:build`. Do NOT start dev servers or curl/browser-test -
  the maintainer does manual testing.
- **If you run inside an isolated agent worktree:** the worktree may branch from a
  stale ancestor. `git reset --hard` to the intended base commit as your first step.
- Do not reintroduce the old "neonfin" naming anywhere user-facing.
- Typography in user-facing copy: when a plan specifies an em/en dash, use the
  actual character (`-`/`–`), not a hyphen-minus.
