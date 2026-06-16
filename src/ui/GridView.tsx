/**
 * GridView — the reusable, colorblind-safe grid renderer (DESIGN.md §4b).
 *
 * Used by BOTH the builder wizard (§8, with highlights) and practice/login
 * (§6/§10, plain). It renders a Grid with each colored cell shown as a hue +
 * a distinct SHAPE so it's identifiable without perceiving color (§4b: "color
 * carries meaning, so accessibility is load-bearing").
 *
 * It is a PURE PRESENTATION component: it only displays a grid. It never shows
 * the rule, a before→after transform of the user's move, or an expected answer
 * outside the builder — keeping INVARIANT §9.1 the caller's job, not something
 * this component can accidentally violate (it has no concept of a rule).
 */

import type { CSSProperties } from "react";
import type { Cell, Grid } from "../engine/types.js";
import { EMPTY } from "../engine/types.js";
import { CELL_STYLES, EMPTY_STYLE, cellLabel } from "./palette.js";

export interface GridViewProps {
  readonly grid: Grid;
  /**
   * Optional set of "row,col" keys to visually emphasize (e.g. selected cells
   * glow in the builder, §8 step 1; the readout target is highlighted, step 3).
   * Presentation-only — the engine decides WHICH cells; this just draws them.
   */
  readonly highlight?: ReadonlySet<string>;
  /** Pixel size of each cell. Default 48. */
  readonly cellSize?: number;
  /** Accessible label for the whole grid region. */
  readonly ariaLabel?: string;
}

/** Stable key for a position, matching the engine's row-major convention. */
export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function GridView({ grid, highlight, cellSize = 48, ariaLabel = "challenge grid" }: GridViewProps) {
  const containerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${grid.cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${grid.rows}, ${cellSize}px)`,
    gap: 6,
    padding: 10,
    background: "#FAFAFA",
    borderRadius: 12,
    width: "fit-content",
  };

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      const key = posKey(r, c);
      cells.push(
        <CellView
          key={key}
          cell={cell}
          size={cellSize}
          highlighted={highlight?.has(key) ?? false}
        />,
      );
    }
  }

  return (
    <div role="img" aria-label={ariaLabel} style={containerStyle}>
      {cells}
    </div>
  );
}

interface CellViewProps {
  readonly cell: Cell;
  readonly size: number;
  readonly highlighted: boolean;
}

function CellView({ cell, size, highlighted }: CellViewProps) {
  const isEmpty = cell === EMPTY;
  const fill = isEmpty ? EMPTY_STYLE.fill : CELL_STYLES[cell].fill;

  const wrapStyle: CSSProperties = {
    width: size,
    height: size,
    background: fill,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: highlighted ? "0 0 0 3px #111, 0 0 12px 2px #FFD54F" : "inset 0 0 0 1px rgba(0,0,0,0.06)",
    transition: "box-shadow 120ms ease",
  };

  return (
    <div style={wrapStyle} role="img" aria-label={cellLabel(cell) + (highlighted ? ", highlighted" : "")}>
      {!isEmpty && <Shape cell={cell} size={size} />}
    </div>
  );
}

/** The redundant, color-independent shape channel (§4b). */
function Shape({ cell, size }: { cell: Exclude<Cell, typeof EMPTY>; size: number }) {
  const s = Math.round(size * 0.5);
  const shape = CELL_STYLES[cell].shape;
  const stroke = "rgba(255,255,255,0.9)";
  const common = { fill: stroke } as const;

  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-hidden="true">
      {shape === "circle" && <circle cx="50" cy="50" r="42" {...common} />}
      {shape === "square" && <rect x="12" y="12" width="76" height="76" rx="6" {...common} />}
      {shape === "triangle" && <polygon points="50,8 92,88 8,88" {...common} />}
    </svg>
  );
}
