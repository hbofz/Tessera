/**
 * AnswerInput — taps in the derived scalar answer (DESIGN.md §4, §5 READOUT).
 *
 * The answer's SHAPE depends on the readout type, so this component adapts:
 *   - cell  → pick one cell appearance (a color or empty)
 *   - count → enter / step a number
 *   - line  → tap a short sequence of cell appearances
 *
 * Reused by BOTH practice mode (§6) and the login flow (§10). It is pure input:
 * it produces an Answer and never reveals the expected one (§9.1).
 *
 * Design intent (§3 "calm, not stressful"): tapping colored chips, not typing —
 * fast, low-friction, forgiving. The chips are the same colorblind-safe styles
 * as the grid (color + shape), so input and challenge read the same way.
 */

import { useState } from "react";
import type { Answer, Cell, Color } from "../engine/types.js";
import type { ReadoutShape } from "../engine/readout-shape.js";
import { COLORS, EMPTY } from "../engine/types.js";
import { CELL_STYLES, EMPTY_STYLE, cellLabel } from "./palette.js";

export interface AnswerInputProps {
  /** The readout SHAPE determines which input to show. Crucially this is only
   *  the kind (+ dimensions), NOT the full readout — so the input never needs
   *  the secret rule (§9.1). Under Option B the client doesn't even have the
   *  rule; the shape is all the UI requires. */
  readonly shape: ReadoutShape;
  readonly onSubmit: (answer: Answer) => void;
  readonly disabled?: boolean;
}

export function AnswerInput({ shape, onSubmit, disabled }: AnswerInputProps) {
  switch (shape.kind) {
    case "cell":
      return <CellAnswer onSubmit={onSubmit} disabled={disabled} />;
    case "count":
      return <CountAnswer onSubmit={onSubmit} disabled={disabled} maxCount={shape.max} />;
    case "line":
      return <LineAnswer onSubmit={onSubmit} disabled={disabled} lineLength={shape.length} />;
  }
}

// --- shared chip ---

const CELL_OPTIONS: readonly Cell[] = [...COLORS, EMPTY];

function CellChip({
  cell,
  selected,
  onClick,
  disabled,
}: {
  cell: Cell;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean | undefined;
}) {
  const isEmpty = cell === EMPTY;
  const fill = isEmpty ? EMPTY_STYLE.fill : CELL_STYLES[cell as Color].fill;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={cellLabel(cell)}
      style={{
        width: 44,
        height: 44,
        borderRadius: 8,
        border: selected ? "3px solid #111" : "1px solid rgba(0,0,0,0.15)",
        background: fill,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 18,
        color: "rgba(255,255,255,0.95)",
      }}
    >
      {!isEmpty && CELL_STYLES[cell as Color].glyph}
    </button>
  );
}

// --- cell readout: pick one ---

interface VariantProps {
  readonly onSubmit: (answer: Answer) => void;
  readonly disabled?: boolean | undefined;
}

function CellAnswer({ onSubmit, disabled }: VariantProps) {
  const [picked, setPicked] = useState<Cell | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div role="group" aria-label="pick the cell" style={{ display: "flex", gap: 8 }}>
        {CELL_OPTIONS.map((cell) => (
          <CellChip
            key={cell}
            cell={cell}
            selected={picked === cell}
            onClick={() => setPicked(cell)}
            disabled={disabled}
          />
        ))}
      </div>
      <SubmitButton
        disabled={disabled || picked === null}
        onClick={() => picked !== null && onSubmit({ kind: "cell", value: picked })}
      />
    </div>
  );
}

// --- count readout: a stepper ---

function CountAnswer({ onSubmit, disabled, maxCount = 99 }: VariantProps & { maxCount?: number }) {
  const [n, setN] = useState(0);
  const clamp = (x: number) => Math.max(0, Math.min(maxCount, x));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <StepButton label="decrease" onClick={() => setN((x) => clamp(x - 1))} disabled={disabled}>
          −
        </StepButton>
        <output aria-label="count" style={{ fontSize: 28, minWidth: 48, fontVariantNumeric: "tabular-nums" }}>
          {n}
        </output>
        <StepButton label="increase" onClick={() => setN((x) => clamp(x + 1))} disabled={disabled}>
          +
        </StepButton>
      </div>
      <SubmitButton disabled={disabled} onClick={() => onSubmit({ kind: "count", value: n })} />
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{ width: 44, height: 44, borderRadius: 8, fontSize: 22, cursor: disabled ? "default" : "pointer" }}
    >
      {children}
    </button>
  );
}

// --- line readout: tap a sequence ---

function LineAnswer({ onSubmit, disabled, lineLength = 4 }: VariantProps & { lineLength?: number }) {
  // One slot per line cell; each slot cycles through the cell options on tap.
  const [seq, setSeq] = useState<Cell[]>(() => Array.from({ length: lineLength }, () => EMPTY as Cell));

  const cycle = (i: number) =>
    setSeq((prev) => {
      const next = prev.slice();
      const cur = CELL_OPTIONS.indexOf(next[i]!);
      next[i] = CELL_OPTIONS[(cur + 1) % CELL_OPTIONS.length]!;
      return next;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
      <div role="group" aria-label="tap each cell in order" style={{ display: "flex", gap: 8 }}>
        {seq.map((cell, i) => (
          <CellChip
            key={i}
            cell={cell}
            selected={false}
            onClick={() => cycle(i)}
            disabled={disabled}
          />
        ))}
      </div>
      <SubmitButton disabled={disabled} onClick={() => onSubmit({ kind: "line", value: seq.slice() })} />
    </div>
  );
}

// --- submit ---

function SubmitButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean | undefined }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 28px",
        borderRadius: 999,
        border: "none",
        background: disabled ? "#ccc" : "#111",
        color: "#fff",
        fontSize: 16,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      Check
    </button>
  );
}
