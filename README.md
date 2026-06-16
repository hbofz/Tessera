# Tessera

A TOTP-style second factor where the rolling secret is a **move you perform in your head**, not a code you copy. See [`DESIGN.md`](./DESIGN.md) for the full design & decision record — it's the source of truth; this README is just a map.

> Personal learning project. Not a product, not real security infrastructure, not new cryptography.

## Status

The **pure, testable core** is complete. The **frontend** (React + Vite) is now scaffolded, starting with the colorblind-safe grid renderer.

| §11 step | Component | Module | Status |
|---|---|---|---|
| 1 | Grid clock — deterministic `C(t)` from a seed | `src/engine/clock.ts` | ✅ |
| 2 | Rule engine — `R(C) → answer` | `src/engine/rule.ts` | ✅ |
| 4 | Login / verify loop — grace window, rate limit, replay defense | `src/auth/` | ✅ |
| 5 | Strength meter — blind-guess entropy + Monte-Carlo elimination | `src/engine/strength.ts` | ✅ |
| — | Grid renderer — colorblind-safe (hue + shape), live ticking | `src/ui/GridView.tsx` | ✅ |
| 6 | Practice mode — drill the move, instant feedback + streak | `src/ui/Practice.tsx` | ✅ |
| 3 | Builder wizard (§8) | `src/ui/` | ⬜ last piece |

The full loop now works end-to-end in practice mode: clock → grid → tap answer → verifier → PASS/FAIL. Only the builder (which produces the rule, currently hard-coded) remains for v1.

## Layout

```
src/
  engine/        the pure core — runs in-browser and in Node
    types.ts       canonical rule encoding (§5) + grid/cell model (§4b)
    grid.ts        immutable grids + parse/format helpers
    prng.ts        deterministic splitmix64 PRNG (cross-platform identical)
    clock.ts       C(t) = grid(seed, tick), degenerate-grid rejection (§12)
    rule.ts        SELECT → TRANSFORM(×≤2) → READOUT, the pure pipeline
    enumerate.ts   the finite/enumerable rule space (§9.4)
    strength.ts    the §7 strength meter
  auth/          server-side verification (depends on engine)
    verifier.ts    the §6 seam — Option A now, swappable to Option B
    login.ts       attemptLogin: grace window + rate limit + replay defense
  ui/            React frontend (Vite)
    palette.ts     colorblind-safe styles (Okabe–Ito hue + redundant shape)
    GridView.tsx   the reusable grid renderer
    AnswerInput.tsx  taps in the scalar answer (cell / count / line)
    Practice.tsx   practice mode — drill the move, streak, PASS/FAIL only
    useGridClock.ts  hook: subscribe to the rolling C(t)
    App.tsx        harness: tabs between the live grid and practice mode
index.html       Vite entry
```

## Key decisions baked into the code (don't silently revert — see DESIGN.md §9)

- **Empty as background** (§4b): only the 3 real colors transform; empty is what's left behind.
- **Scalar readout** (§4): the answer is a small projection of the transformed grid, never the whole grid.
- **Finite, enumerable rule space** (§9.4): the discriminated unions in `types.ts` *are* the menu.
- **Forgiveness lives in the time domain only** (§9.5): exact answer matching, grace over adjacent ticks.
- **Verifier returns only PASS/FAIL** (§9.1); the move is never displayed outside the (future) builder.

## Develop

```sh
npm install
npm run dev       # vite dev server — see the live ticking grid
npm test          # vitest run (engine + auth + ui)
npm run typecheck # strict tsc
npm run build     # typecheck + production bundle
```
