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
      return <Big>{answer.value}</Big>;
    case "cell":
      return <Chip cell={answer.value} />;
    case "line":
      return (
        <span style={{ display: "inline-flex", gap: 4 }}>
          {answer.value.map((c, i) => (
            <Chip key={i} cell={c} />
          ))}
        </span>
      );
  }
}

function Big({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontSize: 28, fontVariantNumeric: "tabular-nums" }}>{children}</strong>;
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
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 6,
        background: fill,
        color: "rgba(255,255,255,0.95)",
        fontSize: 16,
      }}
    >
      {!isEmpty && glyph}
    </span>
  );
}
