/**
 * AnswerInput — taps in the derived scalar answer (DESIGN.md §4, §5 READOUT).
 *
 * The answer's SHAPE drives which input shows:
 *   - cell  → pick one cell appearance (a color or empty)
 *   - count → enter / step a number
 *   - line  → tap a short sequence of cell appearances (each slot cycles)
 *
 * Reused by BOTH practice (§6) and login (§10). Pure input: it produces an
 * Answer and never reveals the expected one (§9.1).
 *
 * Design intent (§3 "calm, not stressful"): tapping colored chips, not typing.
 * Chips use the same colorblind-safe styles (color + shape) as the grid, so
 * input and challenge read the same way (§4b).
 */

import { useState } from "react";
import type { Answer, Cell, Color } from "../engine/types.js";
import type { ReadoutShape } from "./../engine/readout-shape.js";
import { COLORS, EMPTY } from "../engine/types.js";
import { CELL_STYLES, EMPTY_STYLE, cellLabel } from "./palette.js";
import { Button } from "./components/Button.js";

export interface AnswerInputProps {
  /** The readout SHAPE determines which input to show — only the kind (+ dims),
   *  NOT the full readout, so the input never needs the secret rule (§9.1).
   *  Under Option B the client doesn't even have the rule. */
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
  ariaLabel,
}: {
  cell: Cell;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean | undefined;
  ariaLabel?: string;
}) {
  const isEmpty = cell === EMPTY;
  const fill = isEmpty ? EMPTY_STYLE.fill : CELL_STYLES[cell as Color].fill;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel ?? cellLabel(cell)}
      style={{
        background: fill,
        boxShadow: selected
          ? "0 0 0 3px var(--color-text), inset 0 0 0 2px var(--color-surface)"
          : "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
      className="w-12 h-12 rounded-lg flex items-center justify-center text-white transition active:scale-95 disabled:opacity-50 disabled:active:scale-100"
    >
      {!isEmpty && (
        <span aria-hidden="true" className="text-lg leading-none drop-shadow">
          {CELL_STYLES[cell as Color].glyph}
        </span>
      )}
    </button>
  );
}

interface VariantProps {
  readonly onSubmit: (answer: Answer) => void;
  readonly disabled?: boolean | undefined;
}

// --- cell readout: pick one ---

function CellAnswer({ onSubmit, disabled }: VariantProps) {
  const [picked, setPicked] = useState<Cell | null>(null);
  return (
    <div className="flex flex-col gap-3 items-center">
      <div role="group" aria-label="pick the cell" className="flex gap-2">
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
  const hi = Math.max(0, maxCount);
  const clamp = (x: number) => Math.max(0, Math.min(hi, x));
  return (
    <div className="flex flex-col gap-3 items-center">
      <div className="flex gap-2 items-center">
        <StepButton label="decrease" onClick={() => setN((x) => clamp(x - 1))} disabled={disabled || n <= 0}>
          −
        </StepButton>
        <output
          aria-label="count"
          className="text-3xl min-w-[3rem] text-center"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {n}
        </output>
        <StepButton label="increase" onClick={() => setN((x) => clamp(x + 1))} disabled={disabled || n >= hi}>
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
      className="w-12 h-12 rounded-lg text-2xl border border-border bg-surface text-text hover:bg-surface-2 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100"
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
    <div className="flex flex-col gap-3 items-center">
      <div role="group" aria-label="tap each cell in order" className="flex gap-2 items-end">
        {seq.map((cell, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <CellChip
              cell={cell}
              selected={false}
              onClick={() => cycle(i)}
              disabled={disabled}
              // Slot position is announced so SR users know which they're editing,
              // and the visible index below gives the same cue to sighted users.
              ariaLabel={`position ${i + 1}: ${cellLabel(cell)} (tap to change)`}
            />
            <span aria-hidden="true" className="text-xs text-text-faint tabular-nums">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-faint m-0">Tap a tile to cycle its color.</p>
      <SubmitButton disabled={disabled} onClick={() => onSubmit({ kind: "line", value: seq.slice() })} />
    </div>
  );
}

// --- submit ---

function SubmitButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean | undefined }) {
  return (
    <Button onClick={onClick} disabled={disabled} size="md">
      Check
    </Button>
  );
}
