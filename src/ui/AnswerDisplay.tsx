/**
 * AnswerDisplay — read-only rendering of an Answer (DESIGN.md §8 step 3).
 *
 * ⚠️ Used ONLY inside the builder, where showing the answer is intended ("shows
 * the answer for the current sample", §8). It must NEVER be rendered in
 * practice/login feedback — that would violate §9.1. The component is harmless
 * by itself; the invariant is enforced by WHERE it is mounted (builder only).
 */

import type { Answer, Color } from "../engine/types.js";
import { EMPTY } from "../engine/types.js";
import { CELL_STYLES, EMPTY_STYLE } from "./palette.js";

export function AnswerDisplay({ answer }: { answer: Answer }) {
  switch (answer.kind) {
    case "count":
      return (
        <strong className="text-3xl tabular-nums" style={{ fontVariantNumeric: "tabular-nums" }}>
          {answer.value}
        </strong>
      );
    case "cell":
      return <Chip cell={answer.value} />;
    case "line":
      return (
        <span className="inline-flex gap-1.5">
          {answer.value.map((c, i) => (
            <Chip key={i} cell={c} />
          ))}
        </span>
      );
  }
}

function Chip({ cell }: { cell: Color | typeof EMPTY }) {
  const isEmpty = cell === EMPTY;
  const fill = isEmpty ? EMPTY_STYLE.fill : CELL_STYLES[cell].fill;
  const glyph = isEmpty ? EMPTY_STYLE.glyph : CELL_STYLES[cell].glyph;
  const label = isEmpty ? EMPTY_STYLE.label : CELL_STYLES[cell].label;
  return (
    <span
      role="img"
      aria-label={label}
      style={{ background: fill, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)" }}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-white text-base"
    >
      {!isEmpty && (
        <span aria-hidden="true" className="drop-shadow">
          {glyph}
        </span>
      )}
    </span>
  );
}
