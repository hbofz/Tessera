/**
 * StrengthVerdict — surfaces the §7 strength meter at commit (DESIGN.md §8).
 *
 * Shows BOTH numbers (§7): blind-guess resistance and observations-to-crack, so
 * the difficulty choice is informed. Per the §7 honesty rules, the numbers are
 * labeled "approximate, conservative" and that caveat is kept VISIBLE (not a
 * tiny footnote) — the meter must never lie by false precision.
 *
 * The meter is Monte-Carlo and CPU-heavy, so we run it AFTER mount and show a
 * "measuring…" state rather than blocking render.
 */

import { useEffect, useRef, useState } from "react";
import type { Rule } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { gridAtTick } from "../engine/clock.js";
import { strengthReport, type StrengthReport } from "../engine/strength.js";
import { Metric } from "./components/Metric.js";
import { Spinner } from "./components/Spinner.js";

export interface StrengthVerdictProps {
  readonly rule: Rule;
  readonly params: GridParams;
  readonly sampleSeed: string;
  /** v1 caps the transform chain at 2 (§5). */
  readonly maxChain?: number;
}

export function StrengthVerdict({ rule, params, sampleSeed, maxChain = 2 }: StrengthVerdictProps) {
  const [report, setReport] = useState<StrengthReport | null>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    let active = true;
    setReport(null);
    const id = setTimeout(() => {
      const sampler = () => gridAtTick(sampleSeed, tickRef.current++, params);
      const r = strengthReport(
        rule,
        { rows: params.rows, cols: params.cols, maxChain },
        sampler,
        { blindSamples: 1500, trials: 60 },
      );
      if (active) setReport(r);
    }, 0);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [rule, params, sampleSeed, maxChain]);

  if (!report) {
    return (
      <div className="flex items-center justify-center gap-2.5 text-text-muted py-4">
        <Spinner size={18} />
        <span>Measuring your move's strength…</span>
      </div>
    );
  }

  const guessBits = report.blindGuess.bits.toFixed(1);
  const guessOneIn = Math.max(1, Math.round(1 / report.blindGuess.optimalGuessProb));
  const median = report.observations.median;
  const low = report.observations.lowPercentile;

  // Intuitive gauges (presentation only; the numbers remain the honest signal).
  // Answer entropy realistically spans ~1.6 (one cell) … ~8 (5-cell line) bits.
  const guessLevel = clamp01((report.blindGuess.bits - 1) / 7);
  // Observations-to-crack: log scale, ~1 login (weak) … ~40 logins (strong).
  const learnLevel = clamp01(Math.log2(Math.max(1, median)) / Math.log2(40));

  return (
    <div className="flex flex-col gap-3 w-full">
      <Metric
        title="Hard to guess"
        big={`~1 in ${guessOneIn.toLocaleString()}`}
        sub={`${guessBits} bits of answer entropy per login`}
        level={guessLevel}
      />
      <Metric
        title="Hard to learn by watching"
        big={`~${median} logins`}
        sub={`a watcher needs about this many to crack it (as few as ${low} if lucky)`}
        level={learnLevel}
      />
      <p className="text-xs text-text-muted m-0 text-center flex items-center justify-center gap-1.5">
        <span aria-hidden="true">≈</span>
        Approximate &amp; conservative — assumes an attacker who knows exactly how Tessera works.
      </p>
    </div>
  );
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
