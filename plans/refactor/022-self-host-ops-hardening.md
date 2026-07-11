# Plan 022: Self-host operational hardening — automatic migrations, health endpoint, internal port, docs accuracy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command before moving on. On any STOP condition, stop and
> report. When done, update the status row in `plans/refactor/README.md`.
>
> **Drift check (run first)**: Compare the docker-compose excerpt below with
> the live `docker-compose.yml`. On mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / docs
- **Planned at**: commit `f95f3b5` (working tree, 2026-07-11)

## Why this matters

The maintainer's stated goals include "easily self hostable" and "work very
reliable". Today the self-host path works only if the operator follows the
docs exactly: migrations are a separate manual `docker compose run` step the
web service does not depend on (skip it → the app boots against an empty
schema and crashes on first use), the web app exposes no health endpoint for
load balancers, the internal provider service publishes its port on all host
interfaces even though only the web container should reach it, and TECH.md's
route map is missing three shipped endpoints. Each fix is small; together they
remove the main "footgun" class for self-hosters.

## Current state

`docker-compose.yml` (working tree):

```yaml
  web:
    profiles: ["secure"]
    ...
    depends_on:
      postgres:
        condition: service_healthy
      provider-service:
        condition: service_started
    ports:
      - "3000:3000"

  provider-service:
    profiles: ["secure"]
    ...
    ports:
      - "3001:3001"          # published to the host — only web needs it

  migrate:
    profiles: ["secure"]
    build: { ..., target: migrate }
    depends_on:
      postgres:
        condition: service_healthy
    # nothing depends on migrate
```

- `content/docs/self-host/deployment.mdx` (~line 34) documents the manual
  step: `docker compose --profile secure run --rm migrate` before `up`.
- Health: `services/provider/src/server.ts` serves `GET /healthz`; the web app
  has no equivalent route (no `src/app/api/health/`).
- `TECH.md` route map (lines ~389-404) omits three implemented endpoints:
  `GET /api/v1/me` (`src/app/api/v1/me/route.ts`),
  `GET /api/v1/wallets/{code}/ledger`, `GET /api/v1/wallets/external/ledger`.
- `TECH.md:94-95` documents `RESEND_API_KEY`/`RESEND_FROM` as "transactional
  email for auth flows and wallet recovery" without saying they are optional;
  `src/lib/env.ts` marks both `optionalString`, and `src/lib/email.ts` warns
  and no-ops when unset.
- `.env.example` declares `NEXT_PUBLIC_EXAMPLE_PAY_KEY` /
  `NEXT_PUBLIC_EXAMPLE_PAY_URL` (~lines 39-40) with no comment explaining they
  only power the optional `/example` demo page.
- Env validation: `src/lib/env.ts` marks `PAY_PROVIDER_SERVICE_URL`/`_SECRET`
  optional, so a web deploy without a provider service boots fine and fails
  mid-request on the first provider operation. (Deliberate scope note: a
  full startup preflight was considered and reduced to the health endpoint
  below — the health check probing the provider service gives orchestrators
  the same signal without changing boot semantics.)
- Repo constraint (memory + docs): `cacheComponents` is enabled — **route
  handlers are unaffected**, but only `bun run build` catches related errors;
  always run it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Build | `bun run build` | exit 0 |
| Compose config sanity | `docker compose --profile secure config` | renders without error |

## Scope

**In scope**:
- `docker-compose.yml`
- New: `src/app/api/health/route.ts`
- `content/docs/self-host/deployment.mdx`, `content/docs/self-host/index.mdx`
  (only where the migration step / profile behavior is described)
- `TECH.md` (route map + Resend clarification)
- `.env.example` (comments only)

**Out of scope**:
- `Dockerfile`, `Dockerfile.provider-service` — build stages unchanged.
- `src/lib/env.ts` — no validation-strictness changes.
- Auth-protecting the health endpoint (it must stay unauthenticated for LBs;
  it returns no sensitive data).
- Marketing pages on self-hosted instances — that is plan 023.

## Git workflow

- Branch: `advisor/022-self-host-ops`
- Stage only in-scope files. Commit per step.

## Steps

### Step 1: Make migrations a hard dependency of web

In `docker-compose.yml`, add to the `web` service's `depends_on`:

```yaml
      migrate:
        condition: service_completed_successfully
```

Leave the `migrate` service otherwise as-is (drizzle migrations are
idempotent; re-running on every `up` is safe and is the point).

**Verify**: `docker compose --profile secure config` renders; the `web`
service shows all three dependencies.

### Step 2: Stop publishing the provider-service port to the host

In the `provider-service` service, replace:

```yaml
    ports:
      - "3001:3001"
```

with:

```yaml
    expose:
      - "3001"
```

The web container reaches it via the compose network
(`PAY_PROVIDER_SERVICE_URL: http://provider-service:3001` — already set); the
host does not need it. Add a YAML comment: `# internal-only: reachable from
the web container via the compose network`.

**Verify**: `docker compose --profile secure config | grep -A3 "expose"` shows
3001 exposed, and no `3001:3001` publish remains.

### Step 3: Add a web health endpoint

Create `src/app/api/health/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Unauthenticated readiness probe for load balancers / orchestration.
// Returns 200 when the database answers; 503 otherwise. No sensitive data.
export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
```

(Match the import style used by other route files — check how
`src/app/api/v1/orders/route.ts` imports `db`. If `db.execute` is not the
established drizzle call shape in this repo, use the minimal query the codebase
already uses elsewhere.) Do NOT probe the provider service here — a degraded
provider service should not take the whole web app out of rotation; document
that choice in a comment.

**Verify**: `bun run typecheck` → exit 0; `bun run build` → exit 0.

### Step 4: Docs accuracy pass

1. `content/docs/self-host/deployment.mdx`: remove/replace the manual
   `run --rm migrate` step — with Step 1, `docker compose --profile secure up -d`
   migrates automatically. Add a short callout: all app services use the
   `secure` profile, so plain `docker compose up` starts only Postgres —
   always pass `--profile secure`.
2. `TECH.md` route map: add three rows —
   `GET /api/v1/me` (inspect the authenticated key/project),
   `GET /api/v1/wallets/{code}/ledger`,
   `GET /api/v1/wallets/external/ledger` (cursor-paginated ledger entries).
   Also add `GET /api/health` wherever operational endpoints are described
   (or in the deployment doc's monitoring section if TECH.md has none).
3. `TECH.md` env section: mark `RESEND_API_KEY`/`RESEND_FROM` as *optional* —
   "if unset, email verification, password reset, and wallet recovery emails
   are disabled" (confirm exact behavior by reading `src/lib/email.ts` before
   writing the sentence).
4. `.env.example`: add a trailing comment to the two `NEXT_PUBLIC_EXAMPLE_*`
   lines: `# optional - only powers the /example demo page`.

**Verify**: `grep -n "run --rm migrate" content/docs/self-host/*.mdx` → no
matches (or only in a "manual migration" appendix if you kept one);
`grep -n "api/v1/me" TECH.md` → 1 hit.

### Step 5: Full verification

**Verify**: `bun run typecheck`, `bun run lint`, `bun run build` all exit 0.

## Test plan

None automated. If Docker is available locally, optionally:
`docker compose --profile secure up -d` on a scratch volume → web becomes
healthy without any manual migrate step; `curl localhost:3000/api/health` →
`{"ok":true}`; `curl localhost:3001/healthz` from the host → connection
refused (port no longer published). If Docker is not available, the compose
`config` checks in Steps 1–2 suffice.

## Done criteria

- [ ] `web` depends on `migrate: service_completed_successfully`
- [ ] provider-service port `expose`d, not published
- [ ] `GET /api/health` exists and builds
- [ ] deployment docs no longer require a manual migrate step; profile callout added
- [ ] TECH.md route map includes `/api/v1/me` + both ledger routes; Resend marked optional
- [ ] typecheck + lint + build exit 0
- [ ] Status row updated in `plans/refactor/README.md`

## STOP conditions

- The `migrate` Dockerfile target doesn't exist or exits non-zero on an
  already-migrated database (it must be idempotent — verify by reading the
  Dockerfile's migrate target before Step 1).
- Anything other than the web app depends on reaching `:3001` from the host
  (grep docs and scripts for `localhost:3001` first; dev mode runs outside
  Docker and is unaffected).

## Maintenance notes

- New public API endpoints must be added to the TECH.md route map — reviewers
  should check this (drift here is what this plan cleans up).
- If a Kubernetes/Helm story is ever added, `/api/health` (readiness) and the
  provider service's `/healthz` are the probe endpoints.
- Deferred: distinguishing liveness vs readiness, and probing the provider
  service from the web health check (revisit if operators ask for it).
