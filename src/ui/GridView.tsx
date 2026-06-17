/**
 * GridView — the reusable, colorblind-safe grid renderer (DESIGN.md §4b).
 *
 * Used by BOTH the builder wizard (§8, with highlights) and practice/login
 * (§6/§10, plain). Each colored cell is a hue + a distinct SHAPE so it's
 * identifiable without perceiving color (§4b: "color carries meaning, so
 * accessibility is load-bearing").
 *
 * A11y: the grid is a labelled `role="group"` (a region), and each cell is its
 * own `role="img"` with a color+shape label. (Previously the container was also
 * role="img", which nests images and hides the cells from assistive tech.)
 *
 * It is a PURE PRESENTATION component: it never shows the rule, a before→after
 * transform, or an expected answer outside the builder — §9.1 stays the caller's
 * job (this component has no concept of a rule).
 */

import type { CSSProperties } from "react";
import type { Cell, Grid } from "../engine/types.js";
import { EMPTY } from "../engine/types.js";
import { CELL_STYLES, EMPTY_STYLE, cellLabel } from "./palette.js";

export interface GridViewProps {
  readonly grid: Grid;
  /**
   * Optional set of "row,col" keys to visually emphasize (e.g. selected cells
   * in the builder §8 step 1; the readout target in step 3). Presentation-only.
   */
  readonly highlight?: ReadonlySet<string>;
  /**
   * Pixel size of each cell. If omitted, the grid sizes responsively to its
   * container (good on phones) while staying square.
   */
  readonly cellSize?: number;
  /** Accessible label for the whole grid region. */
  readonly ariaLabel?: string;
}

/** Stable key for a position, matching the engine's row-major convention. */
export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function GridView({ grid, highlight, cellSize, ariaLabel = "challenge grid" }: GridViewProps) {
  // Responsive when no fixed size: cap by a sensible max but let cells shrink to
  // fit narrow viewports. Fixed size when a caller needs an exact footprint.
  const col = cellSize
    ? `repeat(${grid.cols}, ${cellSize}px)`
    : `repeat(${grid.cols}, minmax(0, 1fr))`;
  const row = cellSize
    ? `repeat(${grid.rows}, ${cellSize}px)`
    : `repeat(${grid.rows}, minmax(0, 1fr))`;

  const containerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: col,
    gridTemplateRows: row,
    gap: cellSize ? 6 : "clamp(3px, 1.2vw, 6px)",
    aspectRatio: cellSize ? undefined : `${grid.cols} / ${grid.rows}`,
    // Responsive mode: fill the parent (which sets the real width via a wrapper),
    // never overflow it. Fixed mode: an exact pixel footprint. The old
    // `min(cols*72px, 88vw)` ignored the wrapper and overflowed on desktop.
    width: cellSize ? "fit-content" : "100%",
    maxWidth: cellSize ? undefined : `${grid.cols * 72}px`,
    boxSizing: "border-box",
  };

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r]![c]!;
      const key = posKey(r, c);
      cells.push(
        <CellView key={key} cell={cell} highlighted={highlight?.has(key) ?? false} />,
      );
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={containerStyle}
      className="p-2.5 rounded-xl bg-surface-2 border border-border"
    >
      {cells}
    </div>
  );
}

interface CellViewProps {
  readonly cell: Cell;
  readonly highlighted: boolean;
}

function CellView({ cell, highlighted }: CellViewProps) {
  const isEmpty = cell === EMPTY;
  const fill = isEmpty ? EMPTY_STYLE.fill : CELL_STYLES[cell].fill;

  const style: CSSProperties = {
    background: fill,
    // Highlight is REDUNDANTLY encoded: a thick dark ring (shape/contrast) AND a
    // soft glow — perceivable without relying on the glow's color (§4b). The old
    // glow-only #FFD54F failed for users who can't distinguish the gold.
    boxShadow: highlighted
      ? "0 0 0 3px var(--color-text), inset 0 0 0 2px var(--color-surface), 0 0 14px 2px color-mix(in srgb, var(--color-accent) 60%, transparent)"
      : "inset 0 0 0 1px rgba(0,0,0,0.06)",
    transition: "box-shadow 120ms ease, transform 120ms ease",
    transform: highlighted ? "scale(1.04)" : undefined,
    zIndex: highlighted ? 1 : undefined,
  };

  return (
    <div
      role="img"
      aria-label={cellLabel(cell) + (highlighted ? ", highlighted" : "")}
      style={style}
      className="aspect-square w-full h-full rounded-lg flex items-center justify-center"
    >
      {!isEmpty && <Shape cell={cell} />}
    </div>
  );
}

/** The redundant, color-independent shape channel (§4b). */
function Shape({ cell }: { cell: Exclude<Cell, typeof EMPTY> }) {
  const shape = CELL_STYLES[cell].shape;
  const fill = "rgba(255,255,255,0.92)";
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ width: "50%", height: "50%" }}
    >
      {shape === "circle" && <circle cx="50" cy="50" r="42" fill={fill} />}
      {shape === "square" && <rect x="12" y="12" width="76" height="76" rx="6" fill={fill} />}
      {shape === "triangle" && <polygon points="50,8 92,88 8,88" fill={fill} />}
    </svg>
  );
}
