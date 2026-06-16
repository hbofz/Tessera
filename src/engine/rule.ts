/**
 * The Tessera rule engine: the pure core, R(C) → answer.  (DESIGN.md §11.2)
 *
 *   R = SELECT → TRANSFORM (×1–2) → READOUT     (§5)
 *
 * This file is deliberately the most carefully-specified in the project,
 * because every ambiguity here makes the unit tests meaningless and silently
 * desyncs the strength meter (§7), which must reason about the *same* semantics.
 *
 * ===========================================================================
 * "EMPTY AS BACKGROUND" SEMANTICS  (the §4b day-one fork — decided)
 * ===========================================================================
 * Empty is NOT a 4th color. Only the 3 real colors participate in transforms;
 * empty is what remains where a colored cell has moved away. Concretely:
 *
 *   SELECT chooses a set of POSITIONS (coordinates). A transform acts on the
 *   colors currently sitting in those positions; empty positions in the
 *   selection contribute nothing to move/recolor but still define the shape of
 *   the region a reflect/shift operates within.
 *
 *   SHIFT:  collect the colored cells in the selection, move each one step in
 *           `dir` with wrap-around *within the selection's bounding behavior*
 *           (see shift() for the precise wrap). Every selected position is first
 *           cleared to empty, then colors are written to their destinations.
 *           A destination that falls on a NON-selected cell DOES overwrite it
 *           (the tile slid onto it). COLLISIONS (two colors → one cell) are
 *           resolved deterministically: later source in row-major order wins.
 *
 *   RECOLOR: remap the color of every selected colored cell. Empty stays empty
 *           (you can't recolor nothing — "empty as background"). Positional;
 *           never moves anything.
 *
 *   REFLECT: mirror the CONTENT of selected positions across the axis, pairing
 *           each selected position with its mirror image *across the whole
 *           grid's axis*. If a selected position's mirror is also selected, the
 *           two swap. If the mirror is NOT selected, the selected cell's content
 *           is written into the mirror position (and the original is cleared to
 *           empty only if its own mirror didn't write something back). Empty
 *           content reflects too (an empty mirroring onto a colored cell clears
 *           it) — because reflect is about positions, and "what's at the
 *           mirror of a selected cell" is well-defined including emptiness.
 *
 * These rules are chosen to (a) match the "slide the colored tiles, leaving
 * blanks" mental image, and (b) be fully deterministic so R(C) is a function.
 * ===========================================================================
 */

import type {
  Answer,
  Cell,
  Color,
  Direction,
  Grid,
  Quadrant,
  Readout,
  Rule,
  Select,
  Transform,
  TransformRecolor,
  CellTarget,
} from "./types.js";
import { COLORS, EMPTY, isColor } from "./types.js";
import { cellAt, emptyCells, makeGrid, toMutableCells } from "./grid.js";

/** A position in the grid. */
interface Pos {
  readonly row: number;
  readonly col: number;
}

// ===========================================================================
// SELECT — resolve a Select into the concrete set of positions it covers.
// Returns positions in row-major order (deterministic, matters for collisions).
// ===========================================================================

export function resolveSelect(grid: Grid, select: Select): Pos[] {
  const positions: Pos[] = [];
  switch (select.type) {
    case "all":
      forEachPos(grid, (row, col) => positions.push({ row, col }));
      return positions;

    case "color":
      forEachPos(grid, (row, col) => {
        if (cellAt(grid, row, col) === select.value) positions.push({ row, col });
      });
      return positions;

    case "region": {
      const region = select.region;
      switch (region.kind) {
        case "row":
          requireIndex(region.index, grid.rows, "row");
          for (let c = 0; c < grid.cols; c++) positions.push({ row: region.index, col: c });
          return positions;
        case "col":
          requireIndex(region.index, grid.cols, "col");
          for (let r = 0; r < grid.rows; r++) positions.push({ row: r, col: region.index });
          return positions;
        case "quadrant":
          return quadrantPositions(grid, region.which);
        case "diagonal": {
          // Diagonals are defined for square grids; for non-square we walk the
          // main/anti diagonal up to min(rows, cols).
          const n = Math.min(grid.rows, grid.cols);
          for (let i = 0; i < n; i++) {
            positions.push(region.which === "main" ? { row: i, col: i } : { row: i, col: grid.cols - 1 - i });
          }
          return positions;
        }
      }
    }
  }
}

function quadrantPositions(grid: Grid, which: Quadrant): Pos[] {
  // Split into top/bottom and left/right halves. Odd dimensions: the middle
  // row/col belongs to the lower-index half (top / left), so quadrants tile
  // the grid without gaps or overlap.
  const midRow = Math.ceil(grid.rows / 2);
  const midCol = Math.ceil(grid.cols / 2);
  const rowRange = which === "tl" || which === "tr" ? [0, midRow] : [midRow, grid.rows];
  const colRange = which === "tl" || which === "bl" ? [0, midCol] : [midCol, grid.cols];
  const out: Pos[] = [];
  for (let r = rowRange[0]!; r < rowRange[1]!; r++) {
    for (let c = colRange[0]!; c < colRange[1]!; c++) {
      out.push({ row: r, col: c });
    }
  }
  return out;
}

// ===========================================================================
// TRANSFORM
// ===========================================================================

export function applyTransform(grid: Grid, transform: Transform, selected: Pos[]): Grid {
  switch (transform.type) {
    case "shift":
      return shift(grid, selected, transform.dir);
    case "recolor":
      return recolor(grid, selected, transform);
    case "reflect":
      return reflect(grid, selected, transform.axis);
  }
}

/**
 * SHIFT — move colored content of selected cells one step, wrapping.
 *
 * Wrap behavior: wrapping is over the FULL grid dimension (a cell shifted right
 * off column cols-1 reappears at column 0 of the same row). This matches §5's
 * "shift … (wrap around)" and keeps the move easy to perform in the head: the
 * grid is a torus.
 */
function shift(grid: Grid, selected: Pos[], dir: Direction): Grid {
  const out = toMutableCells(grid);
  const [dr, dc] = delta(dir);

  // 1. Clear every selected position to empty (the "leaving blanks" step).
  //    We snapshot the source colors first so clearing doesn't lose them.
  const moving: Array<{ to: Pos; color: Color }> = [];
  for (const { row, col } of selected) {
    const cell = grid.cells[row]![col]!;
    if (isColor(cell)) {
      moving.push({
        to: { row: mod(row + dr, grid.rows), col: mod(col + dc, grid.cols) },
        color: cell,
      });
    }
    out[row]![col] = EMPTY;
  }

  // 2. Write moved colors to destinations, in source row-major order so that on
  //    collision the LATER source wins (documented, deterministic).
  for (const { to, color } of moving) {
    out[to.row]![to.col] = color;
  }

  return makeGrid(out);
}

/** RECOLOR — remap selected colored cells; empty untouched. */
function recolor(grid: Grid, selected: Pos[], t: TransformRecolor): Grid {
  const out = toMutableCells(grid);
  const map = recolorMap(t);
  for (const { row, col } of selected) {
    const cell = grid.cells[row]![col]!;
    if (isColor(cell)) out[row]![col] = map(cell);
  }
  return makeGrid(out);
}

function recolorMap(t: TransformRecolor): (c: Color) => Color {
  if (t.op === "swap") {
    return (c) => (c === t.a ? t.b : c === t.b ? t.a : c);
  }
  // rotate: fwd = R→G→B→R ; rev = the inverse.
  const order = COLORS; // ["R","G","B"]
  return (c) => {
    const i = order.indexOf(c);
    const step = t.dir === "fwd" ? 1 : -1;
    return order[mod(i + step, order.length)]!;
  };
}

/**
 * REFLECT — mirror selected positions across the grid's axis.
 *
 * "h" mirrors columns (left↔right): (r,c) ↔ (r, cols-1-c).
 * "v" mirrors rows (top↔bottom):    (r,c) ↔ (rows-1-r, c).
 *
 * For each selected position p, we read the content at p and WRITE it to p's
 * mirror. We start from a copy of the original so a selected cell whose mirror
 * is not selected leaves the original in place unless something overwrites it.
 * When both a cell and its mirror are selected, both writes happen and the
 * effect is a swap. (See the module header for the precise contract.)
 */
function reflect(grid: Grid, selected: Pos[], axis: "h" | "v"): Grid {
  const out = toMutableCells(grid);
  const mirror = (p: Pos): Pos =>
    axis === "h"
      ? { row: p.row, col: grid.cols - 1 - p.col }
      : { row: grid.rows - 1 - p.row, col: p.col };

  for (const p of selected) {
    const m = mirror(p);
    out[m.row]![m.col] = grid.cells[p.row]![p.col]!;
  }
  return makeGrid(out);
}

// ===========================================================================
// READOUT — project the transformed grid to a single scalar Answer (§5).
// ===========================================================================

export function applyReadout(grid: Grid, readout: Readout): Answer {
  switch (readout.type) {
    case "cell": {
      const { row, col } = resolveCellTarget(grid, readout.target);
      return { kind: "cell", value: cellAt(grid, row, col) };
    }
    case "count": {
      let n = 0;
      forEachPos(grid, (row, col) => {
        if (grid.cells[row]![col] === readout.color) n++;
      });
      return { kind: "count", value: n };
    }
    case "line": {
      const line = lineCells(grid, readout.which, readout.order);
      return { kind: "line", value: line };
    }
  }
}

function resolveCellTarget(grid: Grid, target: CellTarget): Pos {
  switch (target.kind) {
    case "center":
      // For even dimensions there is no single center; we pick the lower-right
      // of the four central cells deterministically (floor of the upper-mid).
      return { row: Math.floor(grid.rows / 2), col: Math.floor(grid.cols / 2) };
    case "corner": {
      const row = target.which === "tl" || target.which === "tr" ? 0 : grid.rows - 1;
      const col = target.which === "tl" || target.which === "bl" ? 0 : grid.cols - 1;
      return { row, col };
    }
    case "at":
      if (!(target.row >= 0 && target.row < grid.rows && target.col >= 0 && target.col < grid.cols)) {
        throw new Error(`readout cell (${target.row},${target.col}) out of bounds`);
      }
      return { row: target.row, col: target.col };
  }
}

function lineCells(
  grid: Grid,
  which: { kind: "row"; index: number } | { kind: "col"; index: number },
  order: "ltr" | "rtl" | "ttb" | "btt",
): Cell[] {
  let cells: Cell[];
  if (which.kind === "row") {
    requireIndex(which.index, grid.rows, "row");
    cells = grid.cells[which.index]!.slice();
    if (order === "rtl") cells.reverse();
    else if (order !== "ltr") {
      throw new Error(`order ${order} is not valid for a row line (use ltr/rtl)`);
    }
  } else {
    requireIndex(which.index, grid.cols, "col");
    cells = grid.cells.map((row) => row[which.index]!);
    if (order === "btt") cells.reverse();
    else if (order !== "ttb") {
      throw new Error(`order ${order} is not valid for a column line (use ttb/btt)`);
    }
  }
  return cells;
}

// ===========================================================================
// The whole pipeline: R(C) → answer.
// ===========================================================================

export function applyRule(grid: Grid, rule: Rule): Answer {
  validateRule(rule);
  let current = grid;
  for (const transform of rule.transforms) {
    // SELECT is re-resolved against the CURRENT grid before each transform.
    // This matters for color-selection chains: e.g. "select red, recolor red→
    // green, then shift red" selects the (now fewer) red cells at the time the
    // second transform runs — which is the intuitive reading of the move.
    const selected = resolveSelect(current, rule.select);
    current = applyTransform(current, transform, selected);
  }
  return applyReadout(current, rule.readout);
}

/** Structural validation of a Rule (the finite-menu invariant, §9.4). Throws on
 *  malformed rules so the engine never silently produces a wrong answer. */
export function validateRule(rule: Rule): void {
  if (rule.transforms.length < 1 || rule.transforms.length > 2) {
    throw new Error(`v1 rules must have 1 or 2 transforms (got ${rule.transforms.length}) — §5`);
  }
  for (const t of rule.transforms) {
    if (t.type === "recolor" && t.op === "swap" && t.a === t.b) {
      throw new Error("recolor swap requires two distinct colors");
    }
  }
}

// ===========================================================================
// Answer equality (§9.5: an answer is right or wrong, never fuzzy).
// ===========================================================================

export function answersEqual(a: Answer, b: Answer): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "cell":
      return a.value === (b as Extract<Answer, { kind: "cell" }>).value;
    case "count":
      return a.value === (b as Extract<Answer, { kind: "count" }>).value;
    case "line": {
      const bv = (b as Extract<Answer, { kind: "line" }>).value;
      return a.value.length === bv.length && a.value.every((cell, i) => cell === bv[i]);
    }
  }
}

// ===========================================================================
// Small helpers.
// ===========================================================================

function forEachPos(grid: Grid, fn: (row: number, col: number) => void): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) fn(r, c);
  }
}

function delta(dir: Direction): [number, number] {
  switch (dir) {
    case "up":
      return [-1, 0];
    case "down":
      return [1, 0];
    case "left":
      return [0, -1];
    case "right":
      return [0, 1];
  }
}

/** True modulo (handles negatives), for torus wrap. */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function requireIndex(index: number, bound: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= bound) {
    throw new Error(`${label} index ${index} out of range [0, ${bound})`);
  }
}

// Keep `emptyCells` referenced for callers/tests that build canvases; it is part
// of the public grid toolkit even though shift() builds from a copy.
export { emptyCells };
