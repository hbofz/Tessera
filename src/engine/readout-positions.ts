/**
 * Readout target positions (DESIGN.md §8 step 3: "the readout target is
 * highlighted").
 *
 * Returns which cells a readout READS, so the builder can glow them on the
 * preview. Pure; mirrors the position logic in rule.ts's applyReadout. A `count`
 * readout has no single target (it scans the whole grid), so it returns null.
 */

import type { CellTarget, Quadrant, Readout } from "./types.js";

export interface PosLite {
  readonly row: number;
  readonly col: number;
}

export function readoutPositions(readout: Readout, rows: number, cols: number): PosLite[] | null {
  switch (readout.type) {
    case "cell":
      return [resolveCell(readout.target, rows, cols)];
    case "count":
      return null; // whole-grid scan; nothing single to highlight
    case "line": {
      if (readout.which.kind === "row") {
        const r = readout.which.index;
        return Array.from({ length: cols }, (_, c) => ({ row: r, col: c }));
      }
      const c = readout.which.index;
      return Array.from({ length: rows }, (_, r) => ({ row: r, col: c }));
    }
  }
}

function resolveCell(target: CellTarget, rows: number, cols: number): PosLite {
  switch (target.kind) {
    case "center":
      return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
    case "corner":
      return cornerPos(target.which, rows, cols);
    case "at":
      return { row: target.row, col: target.col };
  }
}

function cornerPos(which: Quadrant, rows: number, cols: number): PosLite {
  const row = which === "tl" || which === "tr" ? 0 : rows - 1;
  const col = which === "tl" || which === "bl" ? 0 : cols - 1;
  return { row, col };
}
