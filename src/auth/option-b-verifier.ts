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
