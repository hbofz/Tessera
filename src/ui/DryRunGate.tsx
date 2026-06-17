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
  // don't coincide with the preview samples the user just saw. (The 1000 offset
  // is load-bearing for tests — keep it.)
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
    <div className="flex flex-col items-center gap-4 w-full">
      <p className="text-sm text-text-muted m-0 text-center max-w-[42ch] leading-relaxed">
        From memory now — no hints. Get <strong className="text-text">{needed} of {rounds}</strong>{" "}
        right to lock it in.
      </p>

      <ProgressDots rounds={rounds} index={index} correct={correct} />

      <div className="w-full max-w-[300px]">
        <GridView grid={grid} ariaLabel={`dry-run grid ${index + 1} of ${rounds}`} />
      </div>

      {/* key={index} remounts the input each round, clearing the prior pick. */}
      <AnswerInput key={index} shape={shape} onSubmit={submit} disabled={lastResult !== null} />

      <div
        role="status"
        data-testid="dryrun-feedback"
        aria-live="assertive"
        className="min-h-6 font-semibold"
      >
        {lastResult === "pass" && <span className="text-success">Correct ✓</span>}
        {lastResult === "fail" && <span className="text-danger">Not that one</span>}
      </div>

      <small className="text-text-faint tabular-nums">
        {correct} correct · {remaining} to go
      </small>
    </div>
  );
}

function ProgressDots({ rounds, index, correct }: { rounds: number; index: number; correct: number }) {
  return (
    <div
      role="img"
      aria-label={`${correct} of ${index} attempted rounds correct`}
      className="flex gap-2"
    >
      {Array.from({ length: rounds }, (_, i) => {
        const done = i < index;
        return (
          <span
            key={i}
            className={
              "w-2.5 h-2.5 rounded-pill transition " +
              (done ? "bg-ink" : "bg-surface-2 border border-border")
            }
          />
        );
      })}
    </div>
  );
}
