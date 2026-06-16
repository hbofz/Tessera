/**
 * StrengthVerdict — surfaces the §7 strength meter at commit (DESIGN.md §8).
 *
 * Shows BOTH numbers (§7): blind-guess resistance and observations-to-crack,
 * so the difficulty choice is informed. Per the §7 honesty rules, the numbers
 * are labeled "approximate, conservative" — the meter must never lie by false
 * precision (Kerckhoffs: assume the attacker knows the algorithm).
 *
 * The meter is Monte-Carlo and CPU-heavy, so we run it AFTER mount and show a
 * "measuring…" state rather than blocking render.
 */

import { useEffect, useRef, useState } from "react";
import type { Rule } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { gridAtTick } from "../engine/clock.js";
import { strengthReport, type StrengthReport } from "../engine/strength.js";

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
    // Defer to a macrotask so the "measuring…" state paints first.
    const id = setTimeout(() => {
      const sampler = () => gridAtTick(sampleSeed, tickRef.current++, params);
      const r = strengthReport(
        rule,
        { rows: params.rows, cols: params.cols, maxChain },
        sampler,
        // Modest sample/trial counts keep the UI responsive; §7 numbers stay
        // conservative regardless.
        { blindSamples: 1500, trials: 60 },
      );
      // Don't update state if we've unmounted/moved on (the meter is synchronous
      // and can outlive the review step).
      if (active) setReport(r);
    }, 0);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [rule, params, sampleSeed, maxChain]);

  if (!report) {
    return <p style={{ textAlign: "center", color: "#888" }}>Measuring your move's strength…</p>;
  }

  const guessBits = report.blindGuess.bits.toFixed(1);
  const guessOneIn = Math.max(1, Math.round(1 / report.blindGuess.optimalGuessProb));
  const median = report.observations.median;
  const low = report.observations.lowPercentile;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Metric
        title="Hard to guess"
        big={`~1 in ${guessOneIn.toLocaleString()}`}
        sub={`${guessBits} bits of answer entropy per login`}
      />
      <Metric
        title="Hard to learn by watching"
        big={`~${median} logins`}
        sub={`a watcher needs about this many to crack it (as few as ${low} if lucky)`}
      />
      <p style={{ fontSize: 12, color: "#999", margin: 0, textAlign: "center" }}>
        Approximate, conservative — assumes an attacker who knows exactly how Tessera works.
      </p>
    </div>
  );
}

function Metric({ title, big, sub }: { title: string; big: string; sub: string }) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 13, color: "#666" }}>{title}</span>
      <strong style={{ fontSize: 22 }}>{big}</strong>
      <span style={{ fontSize: 12, color: "#999" }}>{sub}</span>
    </div>
  );
}
