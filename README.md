# Tessera

**A two-factor authenticator where your secret isn't a code you copy — it's a move you perform in your head.**

A normal authenticator shows you a 6-digit code to type. Tessera shows you a small grid of colored shapes. You apply a secret *rule* of your own to that grid — a little transformation that lives only in your memory — and tap in the answer. The grid changes every time; the move never does. Someone could watch you log in a hundred times and still learn nothing, because they'd see a hundred different grids and never the rule that connects them.

> **A personal learning project**, not a product. It is not trying to replace passkeys, not protecting real money, and not inventing new cryptography. It's a sandbox for exploring one idea: *what if the thing you memorize is a procedure, not a pattern?*

---

## The idea in 30 seconds

There are three moving parts:

1. **The grid** (the challenge) — a 4×4 square of colored shapes that rolls to a new one every ~45s, like a TOTP code but a picture. It's public.
2. **The move** (your secret) — a transformation you apply in your head, e.g. *"slide the red shapes down, then tell me how many reds there are."* It lives only in your memory.
3. **The answer** (the response) — you run your move on the grid and tap in one small fact about the result. The system runs the same move and checks it matches.

The move is built from a fixed menu — **SELECT → TRANSFORM → READOUT** — so it's a finite, enumerable secret (like a password chosen from a structured space). That's what makes it verifiable *without the server ever storing it*.

## What's built

A working end-to-end system, in two flavors:

- **Solo sandbox** — build a move, prove you've memorized it, and practice it on one device.
- **Two-device flow** — the real authenticator experience: a demo app on your laptop shows a pairing code; your phone (the authenticator) does the move and approves the login. The verify happens on a real server (Supabase Edge Function); the laptop is notified live via Realtime.

In both, **the move never leaves the device it was built on** — the server stores only a one-way fingerprint of it.

## Try it

```sh
npm install
npm run dev          # http://localhost:5173
```

Pick a mode on the home screen:

- **🧩 Solo sandbox** — *Build a move* → pass the "prove it from memory" gate → *Practice*. No network needed.
- **📱 Be the authenticator** + **🔐 Log in to the demo app** — the two-device flow (needs the Supabase backend; see below). Open the app on two devices on the same Wi-Fi (`npm run dev -- --host` exposes it to your phone).

A good first move: **All cells → Slide down → Count of red.** A count is the easiest answer to tap while you're learning.

## How it works

```
                    THE GRID  C(t)  — public, rolls every period, identical
                              on every device (derived from a shared seed)
                                        │
        build once (move shown ONCE)    │  every login (move stays in your head)
  ┌─────────────────────────────┐       │      ┌──────────────────────────────┐
  │ SELECT → TRANSFORM → READOUT │       │      │ see grid → do move in head →  │
  │   = your secret rule R       │       │      │   tap a small answer A        │
  └──────────────┬──────────────┘       │      └───────────────┬──────────────┘
                 │ store hash(R) only    │                      │ A
                 ▼                       ▼                      ▼
            ┌─────────────────────────────────────────────────────┐
            │ VERIFIER: re-derive C(t), enumerate the finite menu,  │
            │ find a rule that yields A and whose hash matches.     │
            │ → PASS / FAIL.  Never learns which rule is yours.     │
            └─────────────────────────────────────────────────────┘
```

The verifier never stores or sees the rule — only `hash(canonical(R))`. At login it **enumerates the finite menu of possible moves**, keeps the ones that would produce your answer on this grid, and checks if any of them hashes to the stored fingerprint. Many moves can produce the same answer, so a single login reveals almost nothing.

See [`DESIGN.md`](./DESIGN.md) for the full design & decision record — every non-obvious choice and *why*.

## Architecture

```
src/
  engine/                 the pure core — runs identically in the browser, Node, and Deno
    types.ts                canonical rule encoding + grid/cell model
    grid.ts · prng.ts       immutable grids; deterministic cross-platform PRNG
    clock.ts                C(t) = grid(seed, tick); degenerate-grid rejection
    rule.ts                 SELECT → TRANSFORM(×≤2) → READOUT — the pure pipeline R(C)→answer
    enumerate.ts            the finite, enumerable rule space (what makes verification possible)
    strength.ts             the strength meter (blind-guess entropy + Monte-Carlo crack estimate)
    readout-shape.ts        the answer's shape (so the UI can render input without the rule)
  auth/                   verification — never stores the move
    verifier.ts             the Verifier seam (Option A cleartext ↔ Option B hash-based)
    option-b-verifier.ts    "B-enum": store hash(R), verify by enumerating the menu
    canonical.ts            stable rule serialization (the hash input)
    verifyhash.ts           pure-JS SHA-256 (browser + Deno safe)
    login.ts                grace window + rate limit + replay defense
    persistence.ts          localStorage enrollment (survives refresh)
  ui/                     React frontend (Vite)
    GridView · AnswerInput · palette   colorblind-safe (hue + redundant shape)
    Builder · DryRunGate · StrengthVerdict   the move builder (the only place the move is shown)
    Practice                drill the move, streak, PASS/FAIL only
    LaptopMode · PhoneMode  the two-device flow
    backend.ts              Supabase client + Edge Function calls + Realtime

supabase/
  migrations/             enrollments, login_sessions, auth_attempts (+ RLS)
  functions/verify/       the Edge Function: enroll / start-login / claim / submit
  functions/_shared/engine/   the engine, synced from src/ (one engine, never two)
```

The engine is **one codebase** shared everywhere. `npm run sync:edge` copies it into the Edge Function as Deno-native modules so there's never a second, drifting implementation.

## Security model — and honest limitations

**What Tessera defends** (where passwords/TOTP are weak):

| Attack | Tessera |
|---|---|
| **Shoulder-surfer** watches you log in | ✅ Protected — they see grids + tiny answers, never the move |
| **Phone stolen / compromised** | ✅ Protected — the move isn't stored on the device; it's in your head |
| **Server database breached** | ✅ Protected — the server stores only a hash of the move, never the move |

**Honest limitations** (this is a learning project — these are disclosed, not hidden):

- **The move is low-entropy.** It's chosen from a small menu, so a *leaked verifier hash* is brute-forceable offline. Mitigated by per-device **rate-limiting** (online guessing is throttled) and by choosing a stronger move (the strength meter shows you the tradeoff). A production version would use a slow hash (scrypt/Argon2) — Tessera uses fast SHA-256 so logins are ~instant; see [`DESIGN.md §6`](./DESIGN.md) for the full tradeoff writeup.
- **Watched *and* observed many times:** an attacker who records many `(grid, answer)` pairs can narrow the move by elimination. The scalar-answer design throttles this; the strength meter estimates how many observations it would take.
- Not audited, not for protecting anything real.

## Development

```sh
npm install
npm run dev          # vite dev server (add `-- --host` to reach it from your phone)
npm test             # vitest: engine + auth + ui (149 tests)
npm run typecheck    # strict tsc
npm run build        # typecheck + production bundle
npm run sync:edge    # regenerate the Edge Function's copy of the engine from src/
```

### Backend (Supabase)

The two-device flow needs the Supabase project. The frontend reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from `.env` (the committed values are the **public** anon key — safe to ship; real security is enforced by Row-Level Security + the Edge Function).

```sh
supabase link --project-ref <your-project-ref>
supabase db push                          # apply migrations
supabase functions deploy verify --no-verify-jwt   # deploy the verifier
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for project conventions and the engine-sync workflow.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free to use, study, modify, and share
for **any noncommercial purpose**, with attribution. Commercial use is not
granted. (A learning project, not a product — see the limitations above.)
