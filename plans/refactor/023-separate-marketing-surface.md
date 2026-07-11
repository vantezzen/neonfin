# Plan 023: Gate the marketing surface off self-hosted instances

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Verify `src/app/page.tsx` still links to
> `/guides` (~line 148) and `/compare` (~line 429), and that
> `src/lib/env.ts` still defines
> `PAY_BILLING_MODE: z.enum(["self_hosted", "hosted"]).default("self_hosted")`.
> On mismatch, STOP.

## Status

- **Priority**: P3 (product-decision plan — maintainer should skim "Why" and
  the Decision section before execution)
- **Effort**: M
- **Risk**: MED (routing changes on the public root; cacheComponents/Suspense
  build constraints apply)
- **Depends on**: none (014 deletes unrelated files; no overlap)
- **Category**: tech-debt / direction
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

A self-hoster who deploys pay on `pay.their-domain.com` currently serves
vantezzen/pay's *product marketing* from their own domain: the 496-line
landing page (`src/app/page.tsx`), `/guides/*` and `/compare/*` (backed by 559
lines of hardcoded content in `src/lib/marketing.ts`), and the `/example` demo
page. That is confusing for their users ("Try vantezzen/pay" CTAs on a private
billing instance), bad for SEO (duplicate marketing content on N domains), and
it entangles marketing copy with the self-hostable product — one of the
maintainer's explicit complaints ("clean up the user interface from
unnecessary clutter").

## Decision (recommended, encoded in this plan)

Use the existing `PAY_BILLING_MODE` env var as the switch — no new env var:

- `hosted` (the official pay.vantezzen.io instance): full marketing surface,
  unchanged.
- `self_hosted` (the default): `/` redirects to `/login` (or `/dashboard` when
  signed in — the landing already redirects signed-in users; keep that);
  `/guides`, `/compare`, `/example` return 404 via `notFound()`. Docs
  (`/docs`) stay available everywhere — they are product documentation, not
  marketing.

Rationale: the variable already exists, already defaults to self-hosted, and
already means "this is the official instance". TECH.md documents it. An
alternative (`NEXT_PUBLIC_HIDE_MARKETING_PAGES`) was considered and rejected —
a second flag that must agree with the first is a config bug waiting to
happen. If the maintainer prefers marketing to move to a separate repo/site
entirely, STOP after Step 1 and report — that is a bigger move this plan does
not attempt.

## Current state

- `src/app/page.tsx` (496 lines) — marketing landing; links to `/guides`
  (line ~148) and `/compare` (lines ~429-432).
- `src/app/guides/page.tsx`, `src/app/guides/[slug]/`, `src/app/compare/`,
  `src/app/compare/[slug]/` — render `MarketingIndexPage`/
  `MarketingArticlePage` from `src/components/marketing/page.tsx` (379 lines).
- `src/lib/marketing.ts` (559 lines) — pure content data:
  `export const guides: MarketingPage[]` (line 30), `comparisons` (line 376),
  `marketingPages`, `getMarketingPage()`, `marketingPath()`.
- `src/app/example/page.tsx` — live component demo driven by
  `NEXT_PUBLIC_EXAMPLE_PAY_KEY`/`_URL`.
- `src/lib/env.ts` — `PAY_BILLING_MODE` enum, default `"self_hosted"`.
  Server-only module (`import "server-only"` at line 1); page components can
  read it in server components only.
- `docker-compose.yml` already pins `PAY_BILLING_MODE: self_hosted` for the
  web service.
- Likely SEO surface to check: `src/lib/seo.ts`, any `sitemap.ts`/`robots.ts`
  under `src/app/` (glob for them in Step 4) — marketing URLs must not be
  emitted on self-hosted instances.
- **Build constraint (repo memory + AGENTS.md)**: `cacheComponents` is on —
  pages doing dynamic work (env reads, `headers()`) need the documented
  Suspense/dynamic patterns, and only `bun run build` catches violations. This
  repo also runs a NEWER Next.js than your training data: before touching
  routing/`notFound()`/redirect behavior, read the relevant guides under
  `node_modules/next/dist/docs/` (per AGENTS.md).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build (the real gate here) | `bun run build` | exit 0 |

## Scope

**In scope**:
- New: `src/lib/billing/mode.ts` helper (or reuse an existing billing-mode
  helper if one exists — grep `src/lib/billing/` first)
- `src/app/page.tsx` (mode branch), `src/app/guides/**`, `src/app/compare/**`,
  `src/app/example/page.tsx` (mode gate)
- Sitemap/robots/SEO emitters if they list marketing routes
- `content/docs/self-host/index.mdx` — one paragraph documenting the behavior
- `TECH.md` — one line under the `PAY_BILLING_MODE` description

**Out of scope**:
- `src/lib/marketing.ts` content itself — data stays; it is simply unreachable
  when self-hosted.
- `/docs` — available in both modes.
- Deleting `/example` (it also backs docs demos config — verify; gate, don't
  delete).
- Auth pages, dashboard, API routes — untouched.
- Moving marketing to a separate repo (bigger decision, not this plan).

## Git workflow

- Branch: `advisor/023-separate-marketing-surface`
- Stage only in-scope files. Commit per step.

## Steps

### Step 1: Add the mode helper

Check `src/lib/billing/` for an existing accessor (e.g. a `plans.ts` or mode
helper). If none fits, create `src/lib/billing/mode.ts`:

```ts
import "server-only";
import { serverEnv } from "@/lib/env"; // ← match the actual export name in src/lib/env.ts

export function isHostedInstance(): boolean {
  return serverEnv().PAY_BILLING_MODE === "hosted";
}
```

(Read `src/lib/env.ts` for the real accessor name/shape first — it caches a
parsed schema; match its usage elsewhere, e.g. grep `PAY_BILLING_MODE` in
`src/`.)

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Gate the marketing routes

In each of `src/app/guides/page.tsx`, `src/app/guides/[slug]/page.tsx`,
`src/app/compare/page.tsx`, `src/app/compare/[slug]/page.tsx`,
`src/app/example/page.tsx` (server component level — if `example/page.tsx` is
`"use client"`, add the gate in a thin server wrapper or its layout):

```ts
import { notFound } from "next/navigation";
import { isHostedInstance } from "@/lib/billing/mode";
// at the top of the (async) page component:
if (!isHostedInstance()) notFound();
```

Respect the cacheComponents constraint: reading env makes the page dynamic —
follow whatever pattern the repo already uses for dynamic pages (check how
`src/app/dashboard/page.tsx` handles dynamic data + Suspense; consult
`node_modules/next/dist/docs/` on `notFound` and dynamic APIs in this
version). If `generateStaticParams` exists on the `[slug]` pages, the gate
must still build — if the build fails on static/dynamic conflict, STOP and
report the exact error rather than restructuring rendering.

**Verify**: `bun run build` → exit 0.

### Step 3: Branch the root page

In `src/app/page.tsx`: when `!isHostedInstance()`, `redirect("/login")`
(keeping the existing signed-in → dashboard redirect logic that runs first —
read the top of the file for how it resolves the session). The marketing JSX
renders only for the hosted instance. Keep the diff minimal: an early branch,
not a rewrite of the landing markup.

**Verify**: `bun run build` → exit 0.

### Step 4: SEO surface

`ls src/app/sitemap.ts src/app/robots.ts 2>/dev/null` and grep `src/lib/seo.ts`
for `guides`/`compare`/`marketingPages`. Wherever marketing URLs are emitted,
gate them with `isHostedInstance()` too.

**Verify**: `grep -rn "marketingPages\|/guides\|/compare" src/app/sitemap.ts src/lib/seo.ts 2>/dev/null` — every hit is inside a hosted-mode branch (or the files don't exist).

### Step 5: Document

- `TECH.md` `PAY_BILLING_MODE` entry: append "Also controls the marketing
  surface: `self_hosted` instances 404 `/guides`, `/compare`, `/example` and
  redirect `/` to the login/dashboard."
- `content/docs/self-host/index.mdx`: one short paragraph saying the same in
  operator-facing language.

**Verify**: `bun run lint` → exit 0; `bun run build` → exit 0.

## Test plan

Manual (repo convention): run `bun run dev` with default env
(`self_hosted`) → `/` lands on login, `/guides` 404s; set
`PAY_BILLING_MODE=hosted` (plus its required `PAY_HOSTED_PAY_SECRET_KEY` if
env validation demands it — if that requirement makes local hosted-mode
testing impractical, note it and verify via the code path instead) → marketing
renders.

## Done criteria

- [ ] `self_hosted`: `/` → login/dashboard redirect; `/guides`, `/compare`, `/example` → 404
- [ ] `hosted`: all marketing routes unchanged
- [ ] Sitemap/SEO emitters gated
- [ ] TECH.md + self-host docs updated
- [ ] `bun run typecheck` + `bun run lint` + `bun run build` exit 0
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- The maintainer intended marketing to move out of the repo entirely — if you
  find a note/issue/plan saying so, stop and defer.
- `bun run build` fails on cacheComponents/static-dynamic conflicts after one
  reasonable fix attempt following the in-repo docs — report the exact error.
- `example/page.tsx` turns out to be load-bearing for the docs live demos
  (imported, not just linked) — gate only the route, never delete shared
  pieces.
- Hosted-mode env validation (`PAY_HOSTED_PAY_SECRET_KEY` etc.) blocks even a
  code-level verification — report.

## Maintenance notes

- New marketing pages must go behind `isHostedInstance()` — reviewers should
  reject unconditional marketing routes.
- If the maintainer later extracts marketing to its own site, this gate makes
  the extraction trivial: everything behind `isHostedInstance()` moves out.
- Deferred: making the login page friendlier as a self-hosted "front door"
  (logo/instance name) — cosmetic, separate change.
