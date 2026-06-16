/**
 * Verifier abstraction (DESIGN.md §6, §11.4).
 *
 * The login flow (login.ts) MUST NOT know how verification works internally.
 * This interface is the seam that lets v1 ship Option A (server stores R) while
 * the design target Option B (server never stores R) slots in later WITHOUT
 * touching the login flow — exactly the §11.4 requirement:
 *   "v1 may use Option A storage ... design the interface so swapping to B
 *    later is clean."
 *
 * The contract every verifier obeys:
 *   - enroll(rule, params) → an opaque, storable Credential (what the server
 *     persists). For Option A this embeds R; for Option B it embeds
 *     slow_hash(R, salt) and NEVER R (§9.2).
 *   - verify(credential, grid, submitted) → boolean for a SINGLE tick's grid.
 *     The login flow calls this across the grace window; the verifier itself is
 *     stateless and tick-agnostic.
 *
 * INVARIANT (§9.1): a verifier returns only a boolean. It never returns R, the
 * expected answer, or any preview. PASS/FAIL is the only signal that leaves it.
 */

import type { Answer, Grid, Rule } from "../engine/types.js";
import { applyRule, answersEqual } from "../engine/rule.js";

/**
 * Opaque, serializable credential persisted by the server. The `kind` tag lets
 * the store know which verifier produced it (so a future migration from A→B can
 * coexist during rollout). Everything else is verifier-private — callers MUST
 * treat it as opaque and never inspect embedded secrets.
 */
export interface Credential {
  readonly kind: string;
  /** Verifier-private payload. Shape depends on `kind`. */
  readonly payload: unknown;
}

export interface Verifier {
  /** Identifier matching the `kind` stamped on credentials it produces. */
  readonly kind: string;

  /** Enrollment: turn a freshly-built rule into a storable credential (§8 →
   *  §6). Called once, at setup, with the move still in hand. */
  enroll(rule: Rule): Credential;

  /**
   * Check a submitted answer against the credential for a SINGLE grid (one
   * tick). Returns PASS/FAIL only (§9.1) — the boolean is the ONLY value that
   * leaves a verifier on a verification path. (It may still *throw* on a
   * programming error such as a mis-routed credential `kind`; that is a bug
   * signal, not a verification outcome, and a correct store never triggers it.)
   *
   * `tick` is passed even though Option A doesn't need it: a B1 zero-knowledge
   * verifier (§6) must bind the proof to the tick to prevent replay, so the
   * signature carries it now. This keeps the seam B1-ready, not just B2-ready —
   * swapping to either Option B never changes login.ts (§11.4).
   */
  verify(credential: Credential, grid: Grid, submitted: Answer, tick: number): boolean;
}

/**
 * OPTION A verifier — server stores the raw rule R (§6 Option A).
 *
 * Consciously a v1 SHORTCUT, not the destination (§6, §11.4): a server breach
 * leaks the move. We label it loudly so it can't masquerade as the real thing.
 * The point of going through the Verifier interface anyway is that login.ts is
 * already written against the seam, so the eventual swap to Option B touches
 * only this file's neighbors, never the flow.
 */
export const OPTION_A_KIND = "option-a-cleartext-rule" as const;

interface OptionAPayload {
  /** ⚠️ The raw rule. Present ONLY in Option A. Option B never stores this. */
  readonly rule: Rule;
}

export class OptionAVerifier implements Verifier {
  readonly kind = OPTION_A_KIND;

  enroll(rule: Rule): Credential {
    return { kind: this.kind, payload: { rule } satisfies OptionAPayload };
  }

  verify(credential: Credential, grid: Grid, submitted: Answer, _tick: number): boolean {
    if (credential.kind !== this.kind) {
      throw new Error(`OptionAVerifier cannot verify a "${credential.kind}" credential`);
    }
    const { rule } = credential.payload as OptionAPayload;
    // Option A replays R server-side; the grid already encodes the tick, so we
    // don't need `tick` here. A B1 verifier would use it to bind the proof.
    return answersEqual(applyRule(grid, rule), submitted);
  }
}

/**
 * ⚠️ OPTION A ONLY: recover the raw rule from an Option A credential.
 *
 * Under Option A the credential is the only place the rule lives after the
 * builder, so this lets an Option-A session reconstruct it (e.g. to drive
 * builder-style previews). Impossible under Option B by design (the rule is
 * never stored) — which is exactly why the app, now on Option B, has no such
 * affordance. Retained for the Option-A path / design record. Returns null for
 * non-Option-A credentials. Do NOT use on a verification path — verify() is the
 * only boolean-returning check (§9.1).
 */
export function recoverOptionARule(credential: Credential): Rule | null {
  if (credential.kind !== OPTION_A_KIND) return null;
  return (credential.payload as OptionAPayload).rule;
}
