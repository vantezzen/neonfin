# Plan 015: Split the 1132-line products-section.tsx into a products/ module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: This plan was written against the *working tree*
> on 2026-07-11 (commit `f95f3b5` plus uncommitted changes). Run
> `grep -n "^function \|^export function " src/components/dashboard/products-section.tsx`
> and compare against the anatomy table below. If the function list differs
> materially, STOP.
>
> **Supersedes**: `plans/010-split-products-section.md` and its stale branch
> `advisor/010-split-products-section-component` (@ `9cc5f8f`, based on an old
> commit). Do NOT merge or cherry-pick that branch — it conflicts with the
> current tree. This plan replaces it.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (pure structural move, but it is the main dashboard surface)
- **Depends on**: none (do after 014 to avoid conflicting deletes; no hard dependency)
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

`src/components/dashboard/products-section.tsx` is 1132 lines and contains the
entire product-catalog UI: the list, the product card, three dropdown/dialog
menus, the product form, the price form, and five helper subcomponents. Any
change to any one of these requires loading and understanding the whole file,
and it is the single largest non-generated file in `src/`. Splitting it into a
`products/` directory with one concern per file makes each piece reviewable and
keeps future product-type features (the most actively evolving dashboard area)
from growing one file without bound.

## Current state

Anatomy of `src/components/dashboard/products-section.tsx` (line anchors from
the working tree):

| Lines | Symbol | Concern |
|---|---|---|
| 76 | `PRODUCT_TYPES` (const) | product-type metadata |
| 119 | `typeMeta()` | product-type metadata |
| 123 | `export productPriceNoun()` | product-type metadata |
| 128 | `export knownFeaturesOf()` | product-type metadata |
| 136 | `export ProductsSection` | section: empty state or card list |
| 187 | `ProductCard` | card: header, price rows, provider strip |
| 418 | `TestCheckoutButton` | card action |
| 455 | `ProductMenu` | card action menu (toggle/edit/delete/sync) |
| 546 | `AttachProviderButton` | card action (FormDialog) |
| 587 | `Field` | small form-field wrapper used by the forms |
| 608 | `FreeGrantHelp` | product form help dialog |
| 646 | `ProductFields` | product form fields |
| 778 | `FreeGrantFields` | product form subsection |
| 811 | `export NewProductButton` | create flow (type picker → form dialog) |
| 904 | `FeaturesField` | price form field |
| 930 | `PriceFields` | price form fields |
| 1063 | `export AddPriceButton` | price create dialog |
| 1104 | `EditPriceButton` | price edit dialog |

External consumers (the complete list — verified by grep):

- `src/app/dashboard/projects/[id]/page.tsx:8` —
  `import { ProductsSection } from "@/components/dashboard/products-section";`
- `src/components/dashboard/project-first-steps.tsx:10-16` — imports
  `AddPriceButton`, `NewProductButton`, `knownFeaturesOf`, `productPriceNoun`.

Repo conventions to match:

- Dashboard components are client/server mixed files under
  `src/components/dashboard/`, kebab-case filenames.
- Forms use the shared `FormDialog` from `src/components/app/form-dialog.tsx`
  and server actions from `src/lib/actions/products.ts`. Do not change either.
- Design system: EmptyState/SectionHeader primitives from
  `src/components/app/` — already used inside this file; keep as-is.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:
- `src/components/dashboard/products-section.tsx` (shrinks to the section + re-exports)
- New files under `src/components/dashboard/products/` (created)

**Out of scope** (do NOT touch):
- `src/lib/actions/products.ts` — server actions; no signature changes.
- `src/components/dashboard/project-first-steps.tsx` and
  `src/app/dashboard/projects/[id]/page.tsx` — import paths must keep working
  via re-exports; do not edit these files.
- Any behavior, markup, class names, or copy. This is a MOVE-ONLY refactor.
- The stale branch `advisor/010-split-products-section-component`.

## Git workflow

- Branch: `advisor/015-split-products-section`
- Stage only in-scope files (the working tree has unrelated uncommitted changes).
- Commit message: `Split products-section into products/ module`.

## Steps

### Step 1: Create the module files (copy, don't rewrite)

Create `src/components/dashboard/products/` with these files, moving code
verbatim (imports adjusted, bodies untouched):

1. `meta.ts` — `PRODUCT_TYPES`, `typeMeta`, `productPriceNoun`,
   `knownFeaturesOf` (+ their types). Pure module, no `"use client"` unless the
   source section had it. Export all four.
2. `product-form.tsx` — `Field`, `FreeGrantHelp`, `ProductFields`,
   `FreeGrantFields`. Export `ProductFields` and `Field` (used by price form if
   it references `Field`; check imports while moving).
3. `price-form.tsx` — `FeaturesField`, `PriceFields`. Export `PriceFields`.
4. `product-card.tsx` — `ProductCard`, `TestCheckoutButton`, `ProductMenu`,
   `AttachProviderButton`. Export `ProductCard`.
5. `new-product-button.tsx` — `NewProductButton`. Export it.
6. `price-buttons.tsx` — `AddPriceButton`, `EditPriceButton`. Export both
   (`EditPriceButton` is used by `ProductCard` — keep that import working).

Preserve the `"use client"` directive at the top of every new file that
contains hooks/state (the original file is a client component — check its first
line and replicate).

**Verify**: `wc -l src/components/dashboard/products/*.ts*` → six files exist;
total ≈ original file's line count.

### Step 2: Shrink products-section.tsx to section + re-exports

`products-section.tsx` keeps only `ProductsSection` (lines 136–185's content),
importing `ProductCard` and `NewProductButton` from the new module, and
re-exports the public surface so no consumer changes:

```ts
export { NewProductButton } from "./products/new-product-button";
export { AddPriceButton } from "./products/price-buttons";
export { productPriceNoun, knownFeaturesOf } from "./products/meta";
```

**Verify**: `wc -l src/components/dashboard/products-section.tsx` → under 120.

### Step 3: Full verification

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0;
`bun run build` → exit 0.

### Step 4: Diff review for accidental changes

**Verify**: `git diff --stat` touches only in-scope files, and
`git diff -w src/components/dashboard/ | grep -c "^[+-].*className"` shows no
class-name churn beyond pure moves (spot-check: the diff for each moved
function body should be additions/deletions of identical text).

## Test plan

None (repo convention). Manual QA note for the maintainer: create a product,
add a price, edit a price, attach a provider, run a test checkout, toggle
active, delete — all from the project detail page.

## Done criteria

- [ ] `src/components/dashboard/products/` contains the six files above
- [ ] `products-section.tsx` < 120 lines, exports unchanged for consumers
- [ ] `project-first-steps.tsx` and `projects/[id]/page.tsx` NOT modified
- [ ] `bun run typecheck` + `bun run lint` + `bun run build` exit 0
- [ ] Status row updated in `plans/refactor/README.md` (and mark plan 010 as
      SUPERSEDED in `plans/README.md` if not already)

## STOP conditions

- The anatomy table doesn't match the live file (drifted tree).
- A moved component turns out to depend on module-level state shared with
  another destination file that can't be expressed as an import (e.g. a
  module-scope mutable variable) — report instead of restructuring behavior.
- You find yourself editing `src/lib/actions/products.ts` or changing any JSX.

## Maintenance notes

- New product-type features should now land in `products/meta.ts` +
  `products/product-form.tsx`, not in the section file.
- Reviewer: this must be a pure move — any diff hunk that is not
  delete-here/add-there of identical code needs justification.
- Deferred (deliberately): extracting shared dialog scaffolding across
  dashboard sections; do it only if a third section repeats the pattern.
