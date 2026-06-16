/**
 * MovePeek — a deliberate, user-initiated reminder of the move (DESIGN.md §8/§9.1).
 *
 * The §9.1 invariant says the app shows only PASS/FAIL after enrollment and
 * NEVER passively reveals the move. A peek does not violate that: the user
 * EXPLICITLY chooses to reveal their own move to themselves, behind a confirm
 * that reminds them it exposes the secret. A shoulder-surfer watching practice
 * sees a button, not the move — the passive observer learns nothing, which is
 * the whole defense (§2).
 *
 * Safety choices:
 *   - Two-step confirm ("this shows your secret move").
 *   - Shows the move on a FRESH sample grid (`peekSeed`), not the exact grid the
 *     user just failed — so it teaches the move, not the answer to the puzzle in
 *     front of them.
 *   - Framed as "your move", not as grading the user's attempt.
 */

import { useMemo, useState } from "react";
import type { Answer, Grid, Rule } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { gridAtTick } from "../engine/clock.js";
import { applyRule, applyTransform, resolveSelect } from "../engine/rule.js";
import { readoutPositions } from "../engine/readout-positions.js";
import { GridView, posKey } from "./GridView.js";
import { AnswerDisplay } from "./AnswerDisplay.js";

export interface MovePeekProps {
  readonly rule: Rule;
  readonly params: GridParams;
  /** Seed for the fresh sample grid shown during the peek (public). */
  readonly peekSeed: string;
}

export function MovePeek({ rule, params, peekSeed }: MovePeekProps) {
  // closed → confirm → open
  const [phase, setPhase] = useState<"closed" | "confirm" | "open">("closed");
  const [sampleTick, setSampleTick] = useState(0);

  if (phase === "closed") {
    return (
      <button type="button" onClick={() => setPhase("confirm")} style={subtleBtn}>
        👁 Remind me my move
      </button>
    );
  }

  if (phase === "confirm") {
    return (
      <div style={confirmBox} role="alertdialog" aria-label="reveal your move?">
        <p style={{ margin: 0, fontSize: 14 }}>
          This shows your <strong>secret move</strong>. Make sure no one is watching your screen.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button type="button" onClick={() => setPhase("closed")} style={ghostBtn}>
            Cancel
          </button>
          <button type="button" onClick={() => setPhase("open")} style={dangerBtn}>
            Show my move
          </button>
        </div>
      </div>
    );
  }

  return (
    <MovePeekPanel
      rule={rule}
      params={params}
      grid={gridAtTick(`${peekSeed}#peek`, sampleTick, params)}
      onAnother={() => setSampleTick((t) => t + 1)}
      onHide={() => setPhase("closed")}
    />
  );
}

function MovePeekPanel({
  rule,
  params,
  grid,
  onAnother,
  onHide,
}: {
  rule: Rule;
  params: GridParams;
  grid: Grid;
  onAnother: () => void;
  onHide: () => void;
}) {
  const after = useMemo(() => {
    let g = grid;
    for (const t of rule.transforms) g = applyTransform(g, t, resolveSelect(g, rule.select));
    return g;
  }, [grid, rule]);

  const selectHighlight = useMemo(
    () => new Set(resolveSelect(grid, rule.select).map((p) => posKey(p.row, p.col))),
    [grid, rule.select],
  );

  const readoutHighlight = useMemo(() => {
    const positions = readoutPositions(rule.readout, params.rows, params.cols);
    return positions ? new Set(positions.map((p) => posKey(p.row, p.col))) : new Set<string>();
  }, [rule.readout, params.rows, params.cols]);

  const answer: Answer = useMemo(() => applyRule(grid, rule), [grid, rule]);

  return (
    <div style={{ ...confirmBox, gap: 12 }} role="region" aria-label="your move">
      <strong style={{ fontSize: 14 }}>Your move</strong>

      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center" }}>
        <PeekGrid grid={grid} highlight={selectHighlight} label="cells you act on" />
        <span aria-hidden="true" style={{ fontSize: 20, color: "#999" }}>
          →
        </span>
        <PeekGrid grid={after} highlight={readoutHighlight} label="after, with what to report" />
      </div>

      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 13, color: "#666" }}>For this grid you'd tap:</span>
        <div style={{ marginTop: 4 }}>
          <AnswerDisplay answer={answer} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" onClick={onAnother} style={ghostBtn}>
          ↻ Another grid
        </button>
        <button type="button" onClick={onHide} style={dangerBtn}>
          Hide my move
        </button>
      </div>
    </div>
  );
}

function PeekGrid({ grid, highlight, label }: { grid: Grid; highlight: ReadonlySet<string>; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <GridView grid={grid} highlight={highlight} cellSize={36} ariaLabel={label} />
      <small style={{ color: "#999", maxWidth: 120, textAlign: "center" }}>{label}</small>
    </div>
  );
}

const subtleBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#555",
  cursor: "pointer",
  fontSize: 13,
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const dangerBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const confirmBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  alignItems: "center",
  padding: 14,
  border: "1px solid #eee",
  borderRadius: 12,
  background: "#FCFCFC",
};
