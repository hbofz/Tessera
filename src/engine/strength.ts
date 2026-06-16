/**
 * The strength meter (DESIGN.md §7) — the project's signature.
 *
 * Reports TWO independent numbers defending two different attacks:
 *
 *   Metric 1 — Blind-guess resistance: an attacker who knows nothing taps a
 *     random answer. Strength = effective entropy of the *actual* answer
 *     distribution (§7 subtlety: answers aren't uniform — "count of red" bulges
 *     in the middle — so we use Shannon entropy of the simulated distribution,
 *     not the raw answer-space count, or the meter overstates strength).
 *
 *   Metric 2 — Observations-to-crack: model the attacker as ELIMINATION over the
 *     rule space (§9.4 enumerable menu makes this possible). Each observed
 *     (grid, answer) eliminates every rule that would have produced a different
 *     answer; count observations until one rule survives. Monte-Carlo it and
 *     report a distribution (§7: median + a cautious low percentile).
 *
 * Honesty rules (§7): assume Kerckhoffs (attacker knows the algorithm and does
 * optimal elimination) → report CONSERVATIVE numbers, labeled approximate.
 *
 * This module is pure given an injected grid sampler + PRNG, so it is itself
 * deterministic and testable. Wall-clock/Math.random are NOT used here.
 */

import type { Answer, Grid, Rule } from "./types.js";
import { applyRule } from "./rule.js";
import { allRules, ruleSpaceSize, type EnumerateOptions } from "./enumerate.js";

// --- Answer canonicalization (for histogram keys & elimination equality) ---

/** A stable string key for an Answer, so we can bucket/compare them. Matches
 *  answersEqual semantics in rule.ts (§9.5: exact, never fuzzy). */
export function answerKey(a: Answer): string {
  switch (a.kind) {
    case "cell":
      return `c:${a.value}`;
    case "count":
      return `n:${a.value}`;
    case "line":
      return `l:${a.value.join("")}`;
  }
}

/** Source of fresh sample grids — the public grid distribution (§7 pseudocode:
 *  "C ← random grid from the seed distribution"). Injected so the meter is
 *  deterministic in tests and can reuse the real clock in production. */
export type GridSampler = () => Grid;

// ===========================================================================
// Metric 1 — Blind-guess resistance (effective answer entropy)
// ===========================================================================

export interface BlindGuessResult {
  /** Effective Shannon entropy of the answer distribution, in bits. */
  readonly bits: number;
  /** Number of DISTINCT answers observed across the sample. */
  readonly distinctAnswers: number;
  /** Per-attempt blind-guess success probability against an OPTIMAL guesser
   *  (who always guesses the single most-likely answer) — the conservative
   *  figure to surface (§7 honesty rules). */
  readonly optimalGuessProb: number;
  readonly samples: number;
}

/**
 * Estimate the answer distribution of a fixed rule R across many random grids,
 * then summarize it. Effective entropy < log2(answer_space) whenever the
 * distribution is peaked — which is the whole point of the §7 subtlety.
 */
export function blindGuessResistance(rule: Rule, sample: GridSampler, samples = 5000): BlindGuessResult {
  const counts = new Map<string, number>();
  for (let i = 0; i < samples; i++) {
    const a = applyRule(sample(), rule);
    const k = answerKey(a);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let bits = 0;
  let maxP = 0;
  for (const c of counts.values()) {
    const p = c / samples;
    if (p > 0) bits -= p * Math.log2(p);
    if (p > maxP) maxP = p;
  }
  return {
    bits,
    distinctAnswers: counts.size,
    optimalGuessProb: maxP,
    samples,
  };
}

// ===========================================================================
// Metric 2 — Observations-to-crack (Monte-Carlo elimination)
// ===========================================================================

export interface ObservationsResult {
  /** Median observations to uniquely identify the rule. */
  readonly median: number;
  /** A cautious LOW percentile (§7: report a cautious low percentile) — the
   *  number of logins after which a lucky attacker may already have cracked it.
   *  Default p10. Lower = the meter is being honest about the bad case. */
  readonly lowPercentile: number;
  readonly lowPercentileP: number;
  readonly trials: number;
  /** Total rules in the enumerated space (the attacker's starting hypothesis
   *  set), for context. */
  readonly ruleSpaceSize: number;
  /** Distribution tail: max observed across trials (worst case in the sample). */
  readonly max: number;
}

/**
 * Simulate the elimination attacker directly (§7 pseudocode). For each trial we
 * start from the full rule space `H`, repeatedly draw a public grid, compute the
 * TRUE answer under the secret rule, and discard every hypothesis that would
 * have answered differently — until one survives.
 *
 * `precomputeAnswers` caches each hypothesis's answer per drawn grid within a
 * trial via a single pass, so a trial costs O(|H_remaining|) per observation.
 *
 * Termination: a rule is uniquely identified once |H| == 1, OR once every
 * surviving hypothesis is BEHAVIORALLY IDENTICAL to the truth. The latter
 * matters: distinct encodings can coincide on every grid (e.g. two transform
 * chains with the same net effect), so they can never be split by observation —
 * waiting for |H| == 1 would loop forever. We detect this by checking, each
 * observation, whether all survivors already agreed with the truth on the drawn
 * grid AND no elimination occurred; when the survivor set stops shrinking we
 * treat the rule as learned. A hard `maxObservations` cap backstops it.
 */
export function observationsToCrack(
  rule: Rule,
  enumerate: EnumerateOptions,
  sample: GridSampler,
  opts: { trials?: number; lowPercentileP?: number; maxObservations?: number } = {},
): ObservationsResult {
  const trials = opts.trials ?? 200;
  const lowPercentileP = opts.lowPercentileP ?? 0.1;
  const maxObservations = opts.maxObservations ?? 200;

  const universe = allRules(enumerate);
  const space = universe.length;

  const results: number[] = [];
  for (let t = 0; t < trials; t++) {
    let hypotheses = universe;
    let n = 0;
    // Count consecutive observations that eliminated nothing. If the survivor
    // set fails to shrink across `stallLimit` distinct grids, the remaining
    // hypotheses are (almost surely) behaviorally identical to the truth — the
    // move has effectively been learned; stop. stallLimit > 1 guards against a
    // single uninformative grid ending the trial early.
    const stallLimit = 3;
    let stall = 0;
    while (hypotheses.length > 1 && n < maxObservations) {
      const grid = sample();
      const truth = answerKey(applyRule(grid, rule));
      const survivors: Rule[] = [];
      for (const h of hypotheses) {
        if (answerKey(applyRule(grid, h)) === truth) survivors.push(h);
      }
      n++;
      if (survivors.length === hypotheses.length) {
        if (++stall >= stallLimit) break;
      } else {
        stall = 0;
      }
      hypotheses = survivors;
    }
    results.push(n);
  }

  results.sort((a, b) => a - b);
  return {
    median: percentile(results, 0.5),
    lowPercentile: percentile(results, lowPercentileP),
    lowPercentileP,
    trials,
    ruleSpaceSize: space,
    max: results[results.length - 1] ?? 0,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx]!;
}

// ===========================================================================
// Combined report (what the builder shows at commit, §7 / §8)
// ===========================================================================

export interface StrengthReport {
  readonly blindGuess: BlindGuessResult;
  readonly observations: ObservationsResult;
  readonly ruleSpaceSize: number;
  /** Always true — a reminder for the UI that these are conservative estimates
   *  and must be labeled "approximate, conservative" (§7 honesty rules). */
  readonly approximate: true;
}

export function strengthReport(
  rule: Rule,
  enumerate: EnumerateOptions,
  sample: GridSampler,
  opts: {
    blindSamples?: number;
    trials?: number;
    lowPercentileP?: number;
    maxObservations?: number;
  } = {},
): StrengthReport {
  return {
    blindGuess: blindGuessResistance(rule, sample, opts.blindSamples),
    observations: observationsToCrack(rule, enumerate, sample, {
      ...(opts.trials !== undefined ? { trials: opts.trials } : {}),
      ...(opts.lowPercentileP !== undefined ? { lowPercentileP: opts.lowPercentileP } : {}),
      ...(opts.maxObservations !== undefined ? { maxObservations: opts.maxObservations } : {}),
    }),
    ruleSpaceSize: ruleSpaceSize(enumerate),
    approximate: true,
  };
}
