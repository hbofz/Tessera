# Tessera — Design & Decision Document

> Handoff doc. This captures every design decision made so far, **and the reasoning behind each**, so an implementer can build v1 without the original conversation. Where a decision has a non-obvious rationale, it's written down — please don't silently undo a decision whose "why" you can't see.

---

## 1. What Tessera is (one paragraph)

Tessera is a **TOTP-style second factor where the rolling secret is a *move you perform in your head*, not a code you copy.** The app shows a small grid of colored cells that changes every ~30–60s (like a rolling TOTP code, but a picture). The user has a secret *rule* — a transformation they apply to the grid in their head — and they tap in a small derived answer. The system applies the same rule and checks the answer matches. The grid changes every time; the move never does. An observer who watches 100 logins sees 100 different grids and never learns the move.

**This is a personal learning project, not a product.** It is not trying to replace passkeys, not protecting real money, and not inventing new cryptography.

---

## 2. Threat model (what Tessera actually defends)

Tessera is a **second factor layered on top of a TOTP-like seed.** Two secrets:

- **Layer 1 — the grid seed** (the machine's secret): lives on the phone and the server, generates the rolling grid. Exactly like a TOTP seed.
- **Layer 2 — the move** (the human's secret): lives only in the user's head. The new thing.

| Attack | Plain TOTP | Tessera |
|---|---|---|
| **Phone stolen / compromised** (seed leaks) | ✗ broken | ✓ protected — the move isn't on the phone |
| **Shoulder-surfer** watches logins | n/a | ✓ protected — they see grids, not the move |
| **Server breached** | ✗ broken | ✓ *if* Option B verifier (see §6); ✗ if Option A |
| **Phone compromised AND user observed N times** | ✗ | ~ depends on rule strength (see §7) |

**The two rows that justify Tessera's existence are phone-compromise and shoulder-surfing** — exactly where TOTP/passwords are weak. The server-breach row is the Option A/B fork in §6.

---

## 3. Decided parameters (the settled choices)

| Decision | Choice | Why |
|---|---|---|
| Platform | **Web app, mobile-friendly** | Fastest to prototype; runs on a phone browser; no install. |
| Input shape | **Derived scalar readout** (report one fact about the transformed grid, not the whole grid) | Fast & calm; and critically it *hides most of the transform from any observer*, throttling how fast the move leaks. See §4. |
| Rule structure | **Fixed pipeline: SELECT → TRANSFORM → READOUT** | Keeps the rule a finite, enumerable selection → hashable like a password (§6) and simulable by the strength meter (§7). |
| v1 transform set | **Core three: shift, recolor, reflect; chain up to 2.** Rotate / count-and-mark are *advanced*, deferred. | MVP discipline. Prove the loop, then expand. |
| Difficulty | **User chooses their own complexity**, made honest by a strength meter shown at setup | The difficulty slider is a real point in a tradeoff triangle, not a vibe (§7). |
| Verification | **Option B is the goal** (server never stores the move). v1 may start pragmatic (B2) and design toward true zero-knowledge (B1). | Keeps the central promise — "the secret never leaves your head" — true, not just mostly true. |
| Forgiveness | Two cheap dials: grid **period** and a login **grace window** over adjacent ticks | "Calm, not stressful" costs almost no security — it widens *time* tolerance, not *answer* tolerance. |

---

## 4. Why the scalar readout matters (don't revert this)

The most literal reading of the original vision was "tap back the whole transformed grid." **We deliberately rejected that.** A full-grid answer hands an observer a complete input→output example of the rule on *every single login* — it maximizes leakage and is slow to enter.

A **scalar readout** (e.g. "the color of the center cell after the move", or "read the bottom row as a 4-symbol sequence") reveals only one *projection* of the transformed grid. The observer sees the public grid and a tiny answer, never the full transform. This:
- is fast to enter (close to the 6-digit-code feel),
- is far more shoulder-surf resistant,
- and **lets the rules stay simple** while still leaking slowly — because the readout itself is a one-way-ish veil.

This is formalized in §7: the readout is an **information bottleneck** that caps how many bits an attacker learns per login.

---

## 4b. Grid & visual spec

| Aspect | Decision | Notes |
|---|---|---|
| **Grid size** | **Default 4×4 (16 cells)**; user may increase at setup | 4×4 is the working-memory sweet spot — interesting but mentally manipulable, clean for reflections/quadrants. Larger sizes are a difficulty knob (bigger rule/answer space, harder to hold in the head). |
| **Cell model** | **3 colors + empty (4 states)** | Keeps the vision's literal "colored and empty squares" charm AND gives recolor moves something to work with. Empty cells are part of the picture, not absence of one. |
| **Cell shape / palette feel** | **Deferred to build** | Must be *pleasant* — color is part of the charm, not just function (vision). Constraint for the implementer: palette should be **colorblind-safe**, because color carries meaning here, so accessibility is load-bearing, not optional. |

**Open sub-question for the rule engine — how does "empty" behave under TRANSFORM?** Two coherent readings; implementer hits this on day one:
- *Empty as a 4th color:* recolor can map to/from empty, shifts move empty cells like any other, count can count empties. Simplest, most uniform engine.
- *Empty as background (leaning recommendation):* only the 3 real colors shift/recolor; empty is what's left behind when a colored cell moves away. Matches the "slide the colored tiles, leaving blanks" mental image better, but a slightly more complex engine.

Whichever is chosen, it changes the answer/rule space, so the **strength meter (§7) must use the same model.** Keep them consistent.

---

## 5. The rule vocabulary (v1)

A rule is a three-stage pipeline. The user fills each slot from a menu. The user's secret is *which options they picked*.

```
R  =  SELECT  →  TRANSFORM (×1–2)  →  READOUT
```

**SELECT — which cells the rule attends to:**
- All cells
- Cells of one color (e.g. only red) — *color is pre-attentive; the eye finds it instantly*
- A region (top row / a column / a quadrant / the diagonal)

**TRANSFORM — the move itself (v1 = these three, chain up to 2):**
- **Shift** selected cells one step ↑ ↓ ← → (wrap around)
- **Recolor** (swap two colors, or rotate a 3-color cycle)
- **Reflect** (mirror left↔right or top↔bottom)
- *(deferred/advanced: rotate 90°, count-and-mark. Rejected outright: coordinate arithmetic — that's the "math homework" feeling the vision warns against.)*

**READOUT — the one fact reported (this is the scalar):**
- Color of one fixed cell (center / a corner) — tiny answer space, fastest
- Count of a color ("how many red now") — balanced default
- Read a line (e.g. bottom row left→right) as a short color sequence — **the entropy workhorse**, use when you want a bigger answer space

**Canonical encoded form** (what the builder outputs, what gets hashed):
```json
{
  "select":    { "type": "color", "value": "red" },
  "transforms":[ { "type": "shift", "dir": "down" } ],
  "readout":   { "type": "line", "which": "bottom", "order": "ltr" }
}
```

**Key property:** the menu is finite and enumerable. With ~5 SELECT × ~6 TRANSFORM × ~5 READOUT ≈ 150 base rules, rising to thousands once you allow a chain of two transforms. Small enough to hash and to simulate; large enough that the rule isn't trivially guessable.

---

## 6. Verification — how the server checks without storing the move

**The reframe that makes this tractable:** because the rule is a *selection from a finite menu*, the encoded `R` behaves exactly like a **password chosen from a structured space.** And "verify a secret you don't store" is a 40-year-solved problem. The grid `C(t)` is **not secret** — both sides derive it from the shared seed — so the only secret to protect is `R`.

- **Option A (rejected as the goal):** server stores `R`. Simple, but a server breach leaks the move, contradicting the core promise. Acceptable *only* as a consciously-labeled v1 shortcut, not the destination.
- **Option B1 (the real version):** server stores `slow_hash(R, salt)`, never `R`. Client computes the answer locally (grid is public) and proves knowledge of `R` bound to the current tick `t` (so it can't be replayed), SRP/OPAQUE-style. Server never runs or learns `R`.
- **Option B2 (pragmatic middle):** server stores `R` *encrypted* under a key the user supplies each login; decrypts transiently to verify, never stores cleartext. Survives an at-rest DB breach; weaker than B1 (R is briefly in RAM).

**What the server stores (Option B):** `slow_hash(R, salt)`, the salt, the grid seed, and grid params (size, palette, period). **Never the raw rule.**

**Cost of B:** `R` is low-entropy, so a leaked verifier is offline-brute-forceable. Defenses: a deliberately slow hash (Argon2/scrypt) and the largest sensible rule space. This is the same brute-force concern as §7's blind-guessing, surfacing at the verifier.

**App-wiring decision (the live demo now runs Option B).** B-enum verifies by enumerating the menu and hashing each candidate. With a *slow* hash this is unusable: a `count` readout has hundreds of candidates × ~68ms scrypt ≈ **17s per login**. A deeper constraint also surfaced: a fast *client-side* proof would require the client to hold `R`, which breaks §2 row 1 ("the move isn't on the phone"). The only design that is simultaneously **server-safe, phone-safe, and fast** in this UX is **server-side enumeration with a FAST hash**. So the app uses SHA-256 (`verifyhash.ts`), making a worst-case verify ~43ms. The accepted tradeoff: a *leaked verifier* becomes cheaply brute-forceable (R is low-entropy). Mitigations: login rate-limiting (§6, present) and an optional server-held **pepper** (keyed hash) so a DB-only breach that misses the pepper can't brute-force at all. The scrypt path (`slowhash.ts`) is retained for higher-hardness deployments where verify latency is acceptable. The "peek the move" practice reminder is **dropped** under Option B — there is no rule on the device to show, by design.

> **This is the single most important technical decision in the project.** It determines whether "the secret never leaves your head" is literally true. The enumerable-menu constraint (§5) is what makes B possible — a Turing-complete rule language would make `R` un-hashable and the strength meter unsimulable. Keep the rule space finite.

---

## 7. The strength meter (the project's signature)

The meter reports **two independent numbers**, defending two different attacks:

### Metric 1 — Blind-guess resistance (closed form)
An attacker who knows nothing guesses the answer. Per-attempt success = `1 / answer_space`. The answer space is set by the **readout + palette + grid size**:

| Readout | Answer space | ~bits |
|---|---|---|
| one cell, 3 colors | 3 | 1.6 |
| count of a color, 4×4 | 17 | 4 |
| read a line, 4 cells, 3 colors | 81 | 6.3 |
| read a line, 5 cells, 3 colors | 243 | 7.9 |

**Subtlety:** answers aren't uniform (e.g. "count of red" bulges in the middle), so compute **effective entropy** (Shannon entropy of the *actual* answer distribution, via simulation) — not the raw count — or the meter overstates strength.

### Metric 2 — Observations-to-crack (simulated)
Model the attacker as **elimination over the rule space.** Start with the full menu `H`; each observed `(grid, answer)` eliminates every rule that would have produced a different answer; done when one rule survives.

To first order: `observations ≈ log₂(|rule space|) / (information per observation)`.

The **information per observation is capped by the answer entropy**, not the grid size — *this is why the scalar readout is load-bearing.* A full-grid answer leaks many bits/login; a single-cell scalar leaks ≤ ~1.6 bits/login. Shrinking the readout throttles the attacker's learning rate.

**Compute it by Monte-Carlo — simulate the attacker directly:**
```
for many trials:
   H ← all possible rules (the menu)
   n ← 0
   while |H| > 1:
      C ← random grid from the seed distribution
      A ← R(C)                      # true answer
      H ← { r in H : r(C) == A }    # eliminate inconsistent rules
      n ← n + 1
   record n
report distribution of n (median + a cautious low percentile)
```
No closed form needed; the enumerable rule space makes this fast. This naturally captures correlation and non-uniform informativeness.

### The tradeoff the meter must surface
A **richer readout** → harder to blind-guess but *faster* rule inference. A **sparse readout** → the reverse. The strongest configs fight on both fronts by enlarging the **rule space** (chaining, select options) while keeping the readout moderate. Show **both** numbers so the user navigates the tradeoff knowingly.

### Honesty rules for the meter
Assume the attacker knows the algorithm (Kerckhoffs) and does optimal elimination — i.e. report the **conservative** numbers. Label them "approximate, conservative" in the UI so the meter never lies by false precision.

---

## 8. The builder (how a user creates their move)

A **guided, concrete-first wizard** — the *only* place the move is ever visible. Three steps, each with a **live before→after preview** so the user learns by watching, not reading:

1. **Which cells?** (SELECT) — selected cells glow on a live sample grid.
2. **What do you do?** (TRANSFORM) — before→after preview; "+ add a second move" enables chaining.
3. **What do you report?** (READOUT) — the readout target is highlighted; shows the answer for the current sample.

Affordances:
- **"Show another grid"** button re-runs the move on fresh samples (also lets the user practice). *Safe* — samples are public grids; over-fitting to them leaks nothing.
- **Strength verdict shown at commit** (§7), on the review screen, so the difficulty choice is informed at the moment of choosing.
- **Mandatory dry-run gate** before enrollment finishes: the user performs their move on fresh grids with **no preview and no hint** (e.g. 2 of 3 correct). This guarantees the move is genuinely memorized before it guards anything, and is the clean seam where the move goes dark.

**Builder output:** the canonical encoded `R` (§5) → fed to the strength meter (preview) and to the verifier hash (§6).

---

## 9. INVARIANTS — do not violate

1. **The move is shown ONLY during the builder, and visibility ends at the dry-run gate.** After enrollment, the app NEVER displays the rule, nor a before→after preview, nor "your answer would be X" — only PASS/FAIL. *A "review your move" settings screen that re-displays R would silently destroy the entire premise.* (This is the easiest invariant to break by accident.)
2. **The raw rule `R` is never stored** in the Option B world — only `slow_hash(R, salt)`. (Option A storing `R` is a labeled v1 shortcut only.)
3. **The grid is public; the move is the only secret.** Don't add "security" by hiding the grid — that's not where the secret lives.
4. **The rule space stays finite and enumerable.** Don't let the vocabulary drift toward a programmable/Turing-complete language — it breaks both the verifier hashing (§6) and the strength simulation (§7).
5. **Forgiveness lives in the time domain** (period + grace window), never in fuzzy answer-matching. An answer is right or wrong.

---

## 10. Architecture map

```
ENROLLMENT (once):  builder → canonical R → strength meter (preview)
                                          → server stores: slow_hash(R, salt), salt,
                                            grid seed, grid params.  R itself: never stored.

GRID CLOCK (always): C(t) = deterministic_grid(seed, floor(time / period))
                     same fn on phone + server → identical rolling grid. C is public.

LOGIN:  phone shows C(t) → user computes A = readout(transform(C(t))) in head → taps A
        → [B1: send proof-of-knowledge(R, t)] / [B2: send A, server checks via transient R]
        → server verifies vs slow_hash(R,salt), with grace window (t-1, t, t+1) + rate-limit
        → PASS / FAIL

PRACTICE MODE: same grid clock + same R, client-only, instant right/wrong feedback,
               streak tracker. NEVER shows R or the transformed grid — only correct/incorrect.
```

**Seven components:** rule menu · encoder (move → canonical R) · grid clock · verifier store · login flow · strength meter · practice mode.

---

## 11. Build v1 in this order (suggested)

The original vision's "smallest thing that proves the magic" is one screen doing four things: show a rolling grid, set a rule, apply it and tap an answer, get pass/fail. Concretely:

1. **Grid clock** — deterministic `C(t)` from a seed; renders a pretty colored grid that ticks every period. (Watch for *degenerate grids* where a readout is trivially constant — see open question §12.)
2. **Rule engine** — implement SELECT → TRANSFORM(shift/recolor/reflect, chain ≤2) → READOUT(cell/count/line) over a grid. Pure function `R(C) → answer`. This is the testable core; unit-test it hard.
3. **Builder wizard** — the §8 flow, producing canonical `R`, ending in the dry-run gate.
4. **Login/verify loop** — show `C(t)`, take the tapped answer, check `A == R(C(t))` with grace window. (v1 may use Option A storage + a "server-breach out of scope" note; design the interface so swapping to B later is clean.)
5. **Strength meter** — Metric 1 (closed form) + Metric 2 (Monte-Carlo). Show at commit.
6. **Practice mode** — reuse 1+2, add instant feedback + streak.

If the single screen (1–4) feels good, the idea is validated and the rest is extra. **Resist building the fancy version first.**

---

## 12. Open questions (not yet decided)

- ~~**B1 vs B2** concrete protocol~~ — **DECIDED & built: "B-enum"** (`src/auth/option-b-verifier.ts`). The server stores `slow_hash(canonical(R), salt)` only (never R) and verifies by *enumerating the finite menu* (§9.4): for each candidate rule `r` where `r(C(t)) == A`, it checks `slow_hash(r) == stored`; PASS if the enrolled R is among them. This exploits the enumerable-menu invariant directly, needs no SNARK toolchain (unlike textbook B1), and is genuinely stronger than B2 (R is never decrypted into RAM). The server learns the answer `A` and that *some* rule producing `A` matches — but not *which* rule, since many rules can yield the same `A`. The across-many-logins elimination attack of §7 is the modeled, accepted limit. Implements the same `Verifier` interface as Option A, so `login.ts` is unchanged (the §6 seam). Slow hash is scrypt via a `SlowHash` interface (browser can inject PBKDF2/Argon2).
- **Grid generation quality** — what makes a grid both *pleasant* and a *good challenge*; how to avoid degenerate grids (e.g. where "count of red" is always the same, or a readout is constant regardless of the move). Likely: reject/regenerate grids whose answer distribution across the rule space is too peaked.
- **Naming** — "Tessera" is a working title (a tessera is one tile in a mosaic). Rename freely.

---

## 13. Stretch / dreams (explicitly later)

Duress rule (a second move that signals trouble) · layered/longer rules for more security · true two-device setup (one poses the challenge, one verifies) · customizable grid sizes/palettes/themes · practice streak tracking.

## 14. Non-goals

Not a business. Not replacing passkeys/banks/real security infra. Not new cryptography. Not for protecting real money — a sandbox for building and learning.
