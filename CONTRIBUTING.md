# Contributing / dev notes

A small map of how the project is put together, for anyone (including future me)
poking at the code.

## Ground rules

- **The engine is one codebase.** `src/engine/` and the pure bits of `src/auth/`
  run unchanged in the browser, in Node (tests), and in Deno (the Supabase Edge
  Function). Never fork the rule logic — if the Edge Function needs it, it's
  synced from `src/`, not rewritten.
- **`DESIGN.md` is the source of truth.** It records every non-obvious decision
  *and why*. The invariants in §9 are load-bearing — don't silently revert one
  whose rationale you can't see. Notably: the move is shown ONLY in the builder
  (§9.1), the raw rule is never stored (§9.2), the rule space stays finite and
  enumerable (§9.4), and forgiveness lives only in the time domain (§9.5).
- **Tests are the spec.** The engine and verifier are covered hard; keep them
  green and add cases when you change behavior.

## Commands

```sh
npm test             # vitest — engine + auth + ui
npm run typecheck    # strict tsc (noUncheckedIndexedAccess, exactOptionalPropertyTypes…)
npm run dev          # vite; add `-- --host` to reach it from a phone on the LAN
npm run build        # typecheck + production bundle
npm run sync:edge    # regenerate supabase/functions/_shared/engine/ from src/
```

## The engine-sync workflow

The Edge Function can't import `src/` directly (Node-style `.js` specifiers don't
resolve in Deno). `scripts/sync-engine-to-edge.mjs` copies the pure modules into
`supabase/functions/_shared/engine/`, rewriting `.js` → `.ts` imports and
refusing anything that imports a `node:` builtin.

**If you change the engine, run `npm run sync:edge` before deploying the
function**, or the server will verify with stale logic. The generated folder is
committed (so deploys are self-contained) but is always regenerated from `src/`.

## Layout at a glance

| Path | What |
|---|---|
| `src/engine/` | pure rule engine, grid clock, strength meter |
| `src/auth/` | verification (never stores the move), persistence, rate limit |
| `src/ui/` | React: builder, practice, two-device modes, Supabase client |
| `supabase/migrations/` | DB schema + Row-Level Security |
| `supabase/functions/verify/` | the Edge Function (enroll / start-login / claim / submit) |
| `scripts/` | engine sync + a live end-to-end backend smoke test |

## Backend smoke test

`scripts/e2e-backend.mjs` drives the **live** deployed function through the whole
flow (enroll → login → honest PASS → wrong FAIL → rate-limit). Run with the
project's anon key:

```sh
ANON_KEY=<anon-key> npx tsx scripts/e2e-backend.mjs
```

## Security note

This is a learning project. The verifier uses a fast hash (so logins are
instant) which makes a *leaked verifier* brute-forceable; rate-limiting is the
online defense. See `DESIGN.md §6` for the full tradeoff. Don't use this to
protect anything real.
