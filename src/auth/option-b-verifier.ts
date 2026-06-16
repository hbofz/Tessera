/**
 * Option B verifier — "B-enum" (DESIGN.md §6, §12 decision).
 *
 * The real version of the promise: the server stores slow_hash(R, salt), NEVER
 * R. Verification exploits the enumerable-menu invariant (§9.4):
 *
 *   enroll(R):   store { hash: slow_hash(canonical(R), salt), salt, params }
 *   verify(A):   for each candidate rule r in the finite menu:
 *                   if r(grid) == A  AND  slow_hash(canonical(r), salt) == hash:
 *                      PASS
 *                PASS iff the enrolled R is among the matches.
 *
 * Why this is genuinely zero-knowledge-ish about R:
 *   - The server never has R, only its slow hash.
 *   - It learns the answer A (public-ish — it's what the user taps) and that
 *     *some* rule producing A hashes to the stored value. Many distinct rules
 *     can produce the same A on a given grid, so the server cannot tell WHICH
 *     rule is the user's from one login. (Across many logins the elimination
 *     attack of §7 still applies — that's the modeled, accepted limit, not a
 *     protocol flaw.)
 *   - A DB breach yields only slow_hash(R) → offline brute force bounded by the
 *     deliberately-slow hash and the rule-space size (§6 "Cost of B").
 *
 * Performance: we FIRST filter the menu to candidates whose r(grid) == A (cheap,
 * pure applyRule) and ONLY slow-hash those. For a typical answer that's a
 * handful of candidates, so a login runs a few slow-hashes, not thousands.
 *
 * Implements the same Verifier interface as Option A, so login.ts is unchanged
 * (the §11.4 / §6 seam goal: swapping A→B touches only this layer).
 */

import type { Answer, Grid, Rule } from "../engine/types.js";
import { applyRule, answersEqual } from "../engine/rule.js";
import { allRules, type EnumerateOptions } from "../engine/enumerate.js";
import type { Credential, Verifier } from "./verifier.js";
import { canonicalRule } from "./canonical.js";
import { digestsEqual, ScryptSlowHash, type SlowHash } from "./slowhash.js";

export const OPTION_B_KIND = "option-b-enum-hash" as const;

interface OptionBPayload {
  /** slow_hash(canonical(R), salt). The raw rule is NEVER stored (§9.2). */
  readonly hash: string;
  readonly salt: string;
  /** The rule-space bounds — needed to enumerate the menu at verify time.
   *  Public (they're grid params), so storing them leaks nothing about R. */
  readonly enumerate: EnumerateOptions;
}

export class OptionBVerifier implements Verifier {
  readonly kind = OPTION_B_KIND;

  constructor(
    private readonly enumerate: EnumerateOptions,
    private readonly slow: SlowHash = new ScryptSlowHash(),
  ) {}

  enroll(rule: Rule): Credential {
    const salt = this.slow.newSalt();
    const hash = this.slow.hash(canonicalRule(rule), salt);
    const payload: OptionBPayload = { hash, salt, enumerate: this.enumerate };
    return { kind: this.kind, payload };
  }

  verify(credential: Credential, grid: Grid, submitted: Answer, _tick: number): boolean {
    if (credential.kind !== this.kind) {
      throw new Error(`OptionBVerifier cannot verify a "${credential.kind}" credential`);
    }
    const { hash, salt, enumerate } = credential.payload as OptionBPayload;

    // The credential's enumerate bounds drive allRules(), whose size grows fast
    // with grid dimensions and chain length. Treat them as UNTRUSTED input — a
    // breach-and-tamper attacker (the exact threat Option B defends) could set
    // huge dimensions to make every login a massive enumeration + slow-hash
    // storm (amplification DoS). Reject anything outside sane, self-consistent
    // bounds. We also require the credential's bounds to match the grid it's
    // being verified against, so a swollen menu can't be smuggled in.
    if (!boundsOk(enumerate, grid)) return false;

    // 1. Cheap filter: which menu rules would produce this answer on this grid?
    const candidates = allRules(enumerate).filter((r) => answersEqual(applyRule(grid, r), submitted));

    // 2. Expensive check ONLY on those: does any candidate hash to the stored
    //    verifier? Constant-time digest compare avoids a timing oracle.
    for (const r of candidates) {
      const h = this.slow.hash(canonicalRule(r), salt);
      if (digestsEqual(h, hash)) return true;
    }
    return false;
  }
}

/** Hard cap on grid dimensions the verifier will enumerate over. The §4b grid
 *  is 4×4 by default and a difficulty knob may raise it, but well below this. */
const MAX_DIM = 8;

/** Validate the credential's enumerate bounds (untrusted): sane, self-consistent
 *  with the grid being verified, and within the v1 chain cap. Returns false (not
 *  throw) so a tampered credential fails the login rather than crashing it. */
function boundsOk(enumerate: EnumerateOptions, grid: Grid): boolean {
  const { rows, cols, maxChain } = enumerate;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || !Number.isInteger(maxChain)) return false;
  if (rows < 1 || cols < 1 || rows > MAX_DIM || cols > MAX_DIM) return false;
  if (maxChain < 1 || maxChain > 2) return false; // v1 chain cap (§5)
  // The menu must be enumerated over the SAME shape as the grid being checked,
  // or readouts/regions wouldn't line up anyway — and it blocks smuggling a
  // larger menu than the grid warrants.
  if (rows !== grid.rows || cols !== grid.cols) return false;
  return true;
}
