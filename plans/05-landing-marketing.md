# Plan 05 — Landing page, marketing, and trust scaffolding

**Goal:** the messaging core is already strong (headline, animated demo loop,
honest comparisons, llms.txt). What's missing is almost entirely trust-and-
commerce scaffolding: no OG image, no pricing statement, no GitHub link, no
hosted-vs-self-host resolution, SEO machinery leaking into user-facing copy, and
a stranded `/example` page. Ordered by expected conversion impact.

Key files: `src/app/page.tsx`, `src/lib/marketing.ts`,
`src/components/marketing/{page,shell}.tsx`, `src/app/example/{layout,page}.tsx`,
`src/app/layout.tsx`, `src/lib/seo.ts`.

Verification: `tsc --noEmit`, `bun run lint`, `bun run build` (cacheComponents:
any new dynamic access needs `<Suspense>`).

---

## A. OG image (biggest single gap)

No page has any social image; `twitter.card` is `summary`.
1. Add `src/app/opengraph-image.tsx` (Next `ImageResponse`): dark canvas,
   the wordmark `vantezzen/pay`, headline
   `Charge for your side project — without building billing`, and the trust
   strap `Stripe & Polar · shadcn registry · self-hostable` in mono. Keep it
   text-only and high-contrast; 1200×630.
2. Set `twitter: { card: "summary_large_image" }` in the root layout metadata.
3. Verify docs/marketing pages inherit it via `metadataBase` (they will, since
   the file-convention image applies to the route tree root).

## B. Answer "what does it cost?" and "hosted or self-host?" on the landing page

Nothing on any page states the model. Add one section to `src/app/page.tsx`
between Features and the final CTA — two cards side by side
(`grid sm:grid-cols-2`):

- **Card 1 — "Use the hosted instance"**: body
  `"Sign up on pay.vantezzen.io and connect your own Stripe or Polar account. Your providers charge their fees — vantezzen/pay adds none."`
  CTA: `Start selling` → `/register`.
- **Card 2 — "Run your own"**: body
  `"One small Next.js + Postgres app. Same features, your infrastructure, your keys."`
  CTA: `Self-host guide` → `/docs/self-host`.

Eyebrow: "Hosted or self-hosted". H2: `"Both are the real thing"`.
**Before writing copy, confirm the actual hosted offering/pricing with the
maintainer if anything ambiguous remains** — do not invent pricing claims. If
the hosted instance is free/invite-based, state that plainly in card 1.
Also add a single line under the hero trust strap: `"Free to self-host · no added fees"`
(adjust to whatever card 1 says — the two must agree).

## C. GitHub + trust signals

1. Add a GitHub link (icon + "GitHub") to the landing nav
   (`src/app/page.tsx:130-172`), the marketing shell nav
   (`src/components/marketing/shell.tsx:36-43`), and both footers. URL: the repo
   the docs edit-links already use (`github.com/vantezzen/pay` — verify against
   `src/app/docs/[[...slug]]/page.tsx:34`).
2. Promote the security fact that's already written in a compare FAQ
   (`src/lib/marketing.ts:353-357`) onto the landing page: change the sixth
   feature card or add a footer line:
   `"Card data never touches your server — checkout is hosted by Stripe or Polar."`

## D. Install command near the hero

The product's pitch is the shadcn registry, but the install command only appears
inside one guide. In the demo section's right panel (below the `GATE_SNIPPET`,
`src/app/page.tsx:233-259`), add a second, smaller copyable line:
`npx shadcn@latest add https://pay.vantezzen.io/r/pay-purchase.json`
with the caption `"Components install into your codebase — you own the files."`
Reuse the existing copy-button component used for `GATE_SNIPPET`.

## E. Un-strand `/example`

`src/app/example/layout.tsx` renders bare content: no header, no way back, no
CTA. Add a minimal header (wordmark → `/`) and a footer CTA card:
`"Like what you see? This whole page is the registry components with default styling."`
+ buttons `Get started` → `/register`, `Read the docs` → `/docs`. Keep
`noindex`. Also link `/example` more prominently: in the landing demo section
add `"Or try the live example →"` under the code panel.

## F. Mobile fixes

1. Hero CTA row (`src/app/page.tsx:196`): add `flex-wrap` (three buttons crush
   at ~360px).
2. Nav: allow wrapping or hide "Guides" behind `sm:` on the landing nav; do not
   build a hamburger for four links.

## G. Copy hygiene

1. **Typographic dashes**: replace hyphen-minus used as punctuation with em/en
   dashes across `src/app/page.tsx`, `src/lib/marketing.ts`,
   `src/components/landing/hero-demo.tsx` captions (~15 occurrences). Don't
   touch code snippets.
2. Feature card title `"No auth required, unless you already have one"` →
   `"No user accounts needed — unless you have them"` (body stays).
3. `"Using an AI Agent?"` card: make the heading a real `<h3>`
   (`src/app/page.tsx:269` renders it as `<p>`).
4. Remove SEO machinery from user-facing surfaces:
   - Delete the "SEO benefit of component-led docs" section from
     `src/lib/marketing.ts:264-272` (internal content-strategy notes published
     as guide content).
   - Remove the "Discovery focus" keyword-chip card and the "Search intent"
     sidebar label from `src/components/marketing/page.tsx:68-84,196-207`
     (keep the data in `marketing.ts` if it feeds metadata; just stop rendering
     it).
5. Canonicalize the agent-prompt URL: landing prompt says
   `https://pay.vantezzen.io/docs/agent.mdx`, docs index says `/docs/agent` —
   pick `/docs/agent.mdx` (raw markdown is what an agent wants) and use it in
   both places.

## H. Footer completeness (landing + marketing shell)

Add to both footers: GitHub, `/docs/llms.txt`, and legal links. Legal pages
don't exist yet — create minimal `src/app/(marketing)/privacy/page.tsx` and
`/imprint/page.tsx` **only if the maintainer provides content**; otherwise add
a `TODO` note in the PR description rather than shipping empty legal pages.
(The operator appears to be a German entity — an Impressum is legally required
for the hosted service; flag this explicitly in the PR.)

## I. Comparison-page expansion (SEO, lower priority)

1. Add `polar-vs-vantezzen-pay` to `src/lib/marketing.ts` compare articles —
   same honest structure as the Stripe one ("sits on top of Polar, not instead
   of it"; when to use Polar directly).
2. Optional follow-ups (separate PR): Lemon Squeezy and Paddle comparisons —
   highest comparison-shopping search volume.
3. Vary the `updated:` dates when touching articles (all currently share
   `2026-07-07`).

## Acceptance criteria

1. Sharing `/`, any guide, or any docs page produces a branded
   `summary_large_image` card (verify the `opengraph-image` route renders in
   `bun run build` output).
2. The landing page answers pricing/hosting in one section, and hero copy agrees
   with it.
3. GitHub is linked in both navs and footers; the card-data security line is on
   the landing page.
4. An install command with copy button is visible one scroll from the hero.
5. `/example` has a way back and a CTA; hero CTAs wrap on small screens.
6. No "Discovery focus" / "Search intent" / "SEO benefit" text renders anywhere
   user-facing; punctuation dashes are typographic.
7. `tsc --noEmit && bun run lint && bun run build` pass.
