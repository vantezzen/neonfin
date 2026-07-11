# Plan 016: Consolidate the three copy-to-clipboard primitives into one module

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the excerpts below against
> `src/components/app/copy.tsx` and `src/components/dashboard/copy-text.tsx`.
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

The dashboard has two files implementing copy-to-clipboard three ways:
`src/components/app/copy.tsx` (a shared `useCopy()` hook powering `CopyInline`
and `CodeSnippet`) and `src/components/dashboard/copy-text.tsx` (`CopyText`,
which hand-rolls the same copied-state logic inline). Fixes to copy behavior
(e.g. clipboard permission errors) must land twice, and new code has no obvious
"right" primitive to import. Consolidating into `app/copy.tsx` gives one hook,
three variants, one import path.

## Current state

- `src/components/app/copy.tsx` (76 lines) — has the shared hook and two variants:

  ```tsx
  function useCopy() {
    const [copied, setCopied] = useState(false);
    return {
      copied,
      copy: (v: string) => {
        void navigator.clipboard.writeText(v);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
    };
  }
  /** Compact inline copyable value - for ids shown next to labels. */
  export function CopyInline({ value, label, className }: {...}) {...}
  /** Full-width code block with a copy button. */
  export function CodeSnippet({ code }: { code: string }) {...}
  ```

- `src/components/dashboard/copy-text.tsx` (29 lines) — duplicates the state
  logic inline instead of using `useCopy()`:

  ```tsx
  export function CopyText({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);
    return (
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {value}
        </code>
        <Button ... onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }} ...>
  ```

- `CopyText` importers (complete list): `src/components/dashboard/api-keys-section.tsx`,
  `src/components/dashboard/provider-accounts-section.tsx`,
  `src/components/dashboard/provider-connect-wizard.tsx`.
  (Re-verify: `grep -rln "copy-text" src`)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**:
- `src/components/app/copy.tsx` (add `CopyField`)
- `src/components/dashboard/copy-text.tsx` (delete)
- The three importer files (import path + name swap only)

**Out of scope**:
- Any visual change — `CopyField` must render the exact JSX `CopyText` renders
  today (same classes), only the copied-state logic switches to `useCopy()`.
- Registry files (`registry/pay/...`) — consumer-facing; they have their own
  copy logic on purpose (zero-dependency constraint).

## Git workflow

- Branch: `advisor/016-consolidate-copy-primitives`
- Stage only in-scope files. Commit: `Consolidate copy primitives`.

## Steps

### Step 1: Move CopyText into app/copy.tsx as CopyField

Add to `src/components/app/copy.tsx` (keeping `CopyText`'s exact JSX/classes,
but using the file's `useCopy()` hook instead of local state):

```tsx
/** Labeled value with a copy button - for keys/codes shown in settings. */
export function CopyField({ value }: { value: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-3 py-2 text-sm">
        {value}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={() => copy(value)}
        aria-label={copied ? "Copied" : "Copy"} title={copied ? "Copied" : "Copy"}>
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Switch the three importers, delete copy-text.tsx

In each of the three importer files, replace
`import { CopyText } from "@/components/dashboard/copy-text"` with
`import { CopyField } from "@/components/app/copy"` and rename the JSX usage.
Then delete `src/components/dashboard/copy-text.tsx`.

**Verify**: `grep -rn "copy-text\|CopyText" src` → no matches.

### Step 3: Full verification

**Verify**: `bun run typecheck`, `bun run lint`, `bun run build` → all exit 0.

## Test plan

None (repo convention). Manual QA: copy an API key on the project page —
button flips to a check for 1.5s, value lands on the clipboard.

## Done criteria

- [ ] `copy-text.tsx` deleted; `CopyField` exists in `app/copy.tsx` using `useCopy()`
- [ ] `grep -rn "CopyText" src` → no matches
- [ ] typecheck + lint + build exit 0
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- `CopyText` has gained props/variants beyond `{ value }` since planning.
- More than the three listed files import it.

## Maintenance notes

- Rule going forward: all dashboard copy UX imports from `app/copy.tsx`
  (`CopyInline` for ids, `CopyField` for keys/codes, `CodeSnippet` for blocks).
- Registry components intentionally keep their own copy logic (they ship to
  consumer apps and must not depend on dashboard modules).
