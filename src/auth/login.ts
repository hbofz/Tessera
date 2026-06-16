/**
 * Login / verify loop (DESIGN.md §10, §11.4).
 *
 *   phone shows C(t) → user computes A = readout(transform(C(t))) in head
 *     → taps A → server verifies vs the stored credential, with a grace window
 *       over adjacent ticks (t-1, t, t+1) + rate-limit → PASS / FAIL
 *
 * This module is the SERVER-SIDE check. It is pure given an injected clock + a
 * Verifier (the §6 seam) + a clock source, so it is deterministic and testable.
 *
 * Three doc-mandated behaviors live here:
 *   - Grace window in the TIME domain only (§9.5): we accept the answer if it
 *     matches the move on ANY of the adjacent ticks. We never fuzzy-match the
 *     answer itself — each tick's check is exact PASS/FAIL.
 *   - Rate limiting (§6): R is low-entropy, so a leaked/forgotten attacker could
 *     brute-force. We throttle attempts per account.
 *   - Replay/anti-reuse: MONOTONIC TICK PROGRESS. A successful login records the
 *     tick it consumed; any future attempt whose matching tick is ≤ the highest
 *     already-consumed tick is rejected as replay. This closes the whole grace
 *     window to reuse (an attacker who captures an answer cannot replay it
 *     against the earlier or current tick, since those are now ≤ the high-water
 *     mark), which a per-tick "consumed set" did not fully cover.
 *
 * CONCURRENCY: this check-then-record is NOT atomic. A single-process caller is
 * fine; a multi-process/clustered deployment MUST serialize attempts per account
 * (e.g. a per-account lock) or two parallel requests can both pass the rate
 * check before either records. Out of scope for the v1 learning sandbox.
 */

import type { Answer } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { gridAtTick, tickForTime, graceTicks, defaultAccept } from "../engine/clock.js";
import type { AcceptGrid } from "../engine/clock.js";
import type { Credential, Verifier } from "./verifier.js";

/**
 * What the server persists per enrolled account (§10: "server stores:
 * credential, grid seed, grid params"). The credential is opaque (§6); the seed
 * + params let the server reconstruct the public grid C(t) for any tick.
 *
 * CRITICAL CONSISTENCY INVARIANT: the grid is only identical on phone and server
 * (§10) if BOTH derive it with the same (seed, params, accept) triple. The
 * degenerate-grid `accept` predicate (§12) is part of grid identity, not a
 * cosmetic filter — a server using a different predicate would regenerate a
 * different grid and reject every honest login. attemptLogin() defaults `accept`
 * to defaultAccept(params); if the client uses a custom predicate, the server
 * MUST be passed the same one. Treat the predicate as part of the params.
 */
export interface Enrollment {
  readonly credential: Credential;
  readonly seed: string;
  readonly params: GridParams;
}

export type LoginOutcome =
  | { readonly result: "pass"; readonly tick: number }
  | { readonly result: "fail"; readonly reason: "no-match" }
  | { readonly result: "fail"; readonly reason: "rate-limited"; readonly retryAfterMs: number }
  | { readonly result: "fail"; readonly reason: "replay" };

/**
 * Per-account mutable login state the server keeps (attempt history for rate
 * limiting + consumed ticks for replay defense). Kept separate from the
 * Enrollment (which is the immutable secret store).
 */
export interface LoginState {
  /** Epoch-ms timestamps of recent attempts, for the sliding-window limiter. */
  attempts: number[];
  /**
   * Highest tick ever consumed by a successful login, or null if none yet.
   * Enforces monotonic tick progress: a new login must match a tick STRICTLY
   * greater than this, which blocks replay across the entire grace window.
   */
  highWaterTick: number | null;
}

export function newLoginState(): LoginState {
  return { attempts: [], highWaterTick: null };
}

export interface RateLimitConfig {
  /** Max attempts allowed within `windowMs`. */
  readonly maxAttempts: number;
  /** Sliding window length in ms. */
  readonly windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60_000, // 5 attempts/min — generous for a human, brutal for a bruteforcer
};

/**
 * Attempt a login. Pure w.r.t. its inputs except for the in/out mutation of
 * `state` (attempts + consumedTicks), which the caller owns and persists.
 *
 * @param submitted   the answer the user tapped
 * @param nowMs       wall-clock at the server when the attempt arrives
 */
export function attemptLogin(
  enrollment: Enrollment,
  state: LoginState,
  verifier: Verifier,
  submitted: Answer,
  nowMs: number,
  rateLimit: RateLimitConfig = DEFAULT_RATE_LIMIT,
  accept: AcceptGrid = defaultAccept(enrollment.params),
): LoginOutcome {
  // 1. Rate limit FIRST — a throttled attempt costs no verification work and
  //    can't leak timing about correctness.
  pruneAttempts(state, nowMs, rateLimit.windowMs);
  if (state.attempts.length >= rateLimit.maxAttempts) {
    const oldest = state.attempts[0]!;
    return {
      result: "fail",
      reason: "rate-limited",
      retryAfterMs: oldest + rateLimit.windowMs - nowMs,
    };
  }
  // Record this attempt regardless of outcome (failed guesses count).
  state.attempts.push(nowMs);

  // 2. Grace window: check the answer against the move on each adjacent tick.
  const currentTick = tickForTime(nowMs, enrollment.params);
  const ticks = graceTicks(currentTick);

  // We try ticks newest-first (t+1, t, t-1) so an on-time user consumes the
  // latest valid tick, leaving the most room before the high-water mark blocks
  // the next login. (Order only affects which tick is recorded on a multi-tick
  // match; correctness of accept/replay is order-independent.)
  for (const tick of [ticks[2], ticks[1], ticks[0]]) {
    if (tick < 0) continue; // no grids before the epoch
    const grid = gridAtTick(enrollment.seed, tick, enrollment.params, accept);
    if (verifier.verify(enrollment.credential, grid, submitted, tick)) {
      // 3. Replay defense via monotonic tick progress: reject any tick at or
      //    below the high-water mark (covers the whole grace window, not just an
      //    exact repeat).
      if (state.highWaterTick !== null && tick <= state.highWaterTick) {
        return { result: "fail", reason: "replay" };
      }
      state.highWaterTick = tick;
      return { result: "pass", tick };
    }
  }

  return { result: "fail", reason: "no-match" };
}

// --- internal helpers ---

function pruneAttempts(state: LoginState, nowMs: number, windowMs: number): void {
  const cutoff = nowMs - windowMs;
  // attempts is kept sorted ascending (we always push nowMs which is monotonic
  // in practice); filter out anything older than the window.
  state.attempts = state.attempts.filter((t) => t > cutoff);
}
