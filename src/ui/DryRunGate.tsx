/**
 * DryRunGate — the mandatory enrollment gate (DESIGN.md §8).
 *
 * "Before enrollment finishes: the user performs their move on fresh grids with
 * NO preview and NO hint (2 of 3 correct). This guarantees the move is genuinely
 * memorized before it guards anything, and is the clean seam where the move goes
 * dark."
 *
 * So this is the LAST place anything move-adjacent appears — and even here it
 * shows nothing but the grid and PASS/FAIL. No preview, no readout highlight, no
 * expected answer (§9.1). If the user can't pass, they go back to review (where
 * the move is still visible) to re-learn — they never finish enrollment without
 * proving recall.
 */

import { useMemo, useState } from "react";
import type { Answer, Rule } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { gridAtTick } from "../engine/clock.js";
import { applyRule, answersEqual } from "../engine/rule.js";
import { readoutShape } from "../engine/readout-shape.js";
import { GridView } from "./GridView.js";
import { AnswerInput } from "./AnswerInput.js";

export interface DryRunGateProps {
  readonly rule: Rule;
  readonly params: GridParams;
  readonly sampleSeed: string;
  /** How many fresh grids to attempt. */
  readonly rounds?: number;
  /** How many must be correct to pass. */
  readonly needed?: number;
  readonly onPass: () => void;
  readonly onFail: () => void;
}

export function DryRunGate({
  rule,
  params,
  sampleSeed,
  rounds = 3,
  needed = 2,
  onPass,
  onFail,
}: DryRunGateProps) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [lastResult, setLastResult] = useState<"pass" | "fail" | null>(null);

  // Distinct fresh grids for the gate, drawn from a dedicated offset so they
  // don't coincide with the preview samples the user just saw.
  const grid = useMemo(
    () => gridAtTick(`${sampleSeed}#dryrun`, 1000 + index, params),
    [sampleSeed, index, params],
  );

  const shape = readoutShape(rule.readout, params.rows, params.cols);

  const submit = (answer: Answer) => {
    const expected = applyRule(grid, rule);
    const ok = answersEqual(answer, expected);
    const newCorrect = correct + (ok ? 1 : 0);
    const newIndex = index + 1;
    setLastResult(ok ? "pass" : "fail");
    setCorrect(newCorrect);

    if (newIndex >= rounds) {
      // Decide once all rounds are done.
      setTimeout(() => (newCorrect >= needed ? onPass() : onFail()), 700);
    } else {
      setTimeout(() => {
        setIndex(newIndex);
        setLastResult(null);
      }, 700);
    }
  };

  const remaining = rounds - index;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <p style={{ color: "#666", fontSize: 14, margin: 0, textAlign: "center" }}>
        From memory now — no hints. Get {needed} of {rounds} right to lock it in.
      </p>

      <ProgressDots rounds={rounds} index={index} />

      <GridView grid={grid} cellSize={56} ariaLabel={`dry-run grid ${index + 1} of ${rounds}`} />

      {/* key={index} remounts the input each round, clearing the prior pick. */}
      <AnswerInput
        key={index}
        readout={rule.readout}
        {...(shape.kind === "line" ? { lineLength: shape.length } : {})}
        {...(shape.kind === "count" ? { maxCount: shape.max } : {})}
        onSubmit={submit}
        disabled={lastResult !== null}
      />

      <div role="status" data-testid="dryrun-feedback" aria-live="assertive" style={{ minHeight: 24, fontWeight: 600 }}>
        {/* PASS/FAIL only — never the expected answer (§9.1). */}
        {lastResult === "pass" && <span style={{ color: "#009E73" }}>Correct ✓</span>}
        {lastResult === "fail" && <span style={{ color: "#D55E00" }}>Not that one</span>}
      </div>

      <small style={{ color: "#aaa" }}>
        {correct} correct · {remaining} to go
      </small>
    </div>
  );
}

function ProgressDots({ rounds, index }: { rounds: number; index: number }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: 8 }}>
      {Array.from({ length: rounds }, (_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: i < index ? "#111" : "#ddd",
          }}
        />
      ))}
    </div>
  );
}
