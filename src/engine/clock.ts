/**
 * The grid clock (DESIGN.md §11.1, §10).
 *
 *   C(t) = deterministic_grid(seed, floor(time / period))
 *
 * Same function on phone and server → identical rolling grid. The grid is
 * PUBLIC (§9.3); the only secret is the move. So this file has no security
 * responsibility — only determinism and producing *pleasant, non-degenerate*
 * grids (§4b, §12).
 *
 * Degenerate grids (§12): a grid where a readout is trivially constant
 * regardless of the move (e.g. all-empty, or all one color) leaks nothing and
 * feels broken. We reject-and-regenerate using a pluggable `accept` predicate.
 * The DEFAULT predicate does cheap *structural* checks (variety of colors, not
 * too empty/full). A richer, rule-aware predicate ("answer distribution across
 * the rule space is too peaked", §12) can be supplied by the strength-meter
 * layer without this module depending on the rule engine.
 */

import type { Cell, Color, Grid } from "./types.js";
import { COLORS, EMPTY } from "./types.js";
import { makeGrid } from "./grid.js";
import { Prng } from "./prng.js";

export interface GridParams {
  readonly rows: number;
  readonly cols: number;
  /** Seconds per tick (§3: ~30–60s). The clock floors wall-time by this. */
  readonly periodSeconds: number;
  /**
   * Target fraction of cells that are empty, in [0,1). The generator aims for
   * this density; the exact count varies per grid. ~0.3 gives a lively but not
   * crowded picture. Empties are part of the picture (§4b), so we never want 0,
   * and never so high the grid is mostly blank.
   */
  readonly emptyDensity: number;
}

export const DEFAULT_PARAMS: GridParams = {
  rows: 4,
  cols: 4, // §4b default 4×4
  periodSeconds: 45,
  emptyDensity: 0.3,
};

/** A predicate deciding whether a freshly generated grid is acceptable (i.e.
 *  not degenerate). Return false to force regeneration. */
export type AcceptGrid = (grid: Grid) => boolean;

/**
 * Default structural acceptance (§12, cheap tier): reject grids that are
 * obviously degenerate regardless of any rule.
 *   - must contain at least 2 distinct real colors (so recolor/count/line have
 *     something to distinguish),
 *   - must not be entirely empty,
 *   - empties must be within a sane band of the requested density so the look
 *     stays consistent.
 */
export function defaultAccept(params: GridParams): AcceptGrid {
  const total = params.rows * params.cols;
  return (grid) => {
    const colorsSeen = new Set<Color>();
    let empties = 0;
    for (const row of grid.cells) {
      for (const cell of row) {
        if (cell === EMPTY) empties++;
        else colorsSeen.add(cell);
      }
    }
    if (colorsSeen.size < 2) return false;
    if (empties === total) return false;
    // Keep within ±0.2 of target density (loose — just rules out extremes).
    const frac = empties / total;
    if (frac > params.emptyDensity + 0.25) return false;
    if (frac < Math.max(0, params.emptyDensity - 0.25)) return false;
    return true;
  };
}

/**
 * Generate a single candidate grid from a PRNG (no acceptance check). Each cell
 * is empty with probability ~emptyDensity, else a uniformly random real color.
 */
function generateCandidate(prng: Prng, params: GridParams): Grid {
  const cells: Cell[][] = [];
  for (let r = 0; r < params.rows; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < params.cols; c++) {
      if (prng.nextFloat() < params.emptyDensity) {
        row.push(EMPTY);
      } else {
        row.push(COLORS[prng.nextInt(COLORS.length)] as Cell);
      }
    }
    cells.push(row);
  }
  return makeGrid(cells);
}

/**
 * The deterministic grid at a given tick. Phone and server call this with the
 * same (seed, params, tick) and get byte-identical grids.
 *
 * Acceptance/regeneration is also deterministic: we advance the SAME prng
 * stream and take the first candidate that passes `accept`. Because the stream
 * is seeded purely from (seed, tick), both sides walk the identical sequence
 * and converge on the identical accepted grid. We cap attempts so a pathological
 * predicate can't loop forever; on exhaustion we return the last candidate
 * (better a slightly-degenerate grid than a hang — and the default predicate is
 * easily satisfiable in practice).
 */
export function gridAtTick(
  seed: string,
  tick: number,
  params: GridParams = DEFAULT_PARAMS,
  accept: AcceptGrid = defaultAccept(params),
  maxAttempts = 64,
): Grid {
  const prng = Prng.fromSeed(seed, tick);
  let last: Grid = generateCandidate(prng, params);
  if (accept(last)) return last;
  for (let i = 1; i < maxAttempts; i++) {
    last = generateCandidate(prng, params);
    if (accept(last)) return last;
  }
  return last; // exhausted — return best effort (see doc comment)
}

/** Floor wall-clock time (ms since epoch) into a tick index. */
export function tickForTime(timeMs: number, params: GridParams = DEFAULT_PARAMS): number {
  return Math.floor(timeMs / 1000 / params.periodSeconds);
}

/** Convenience: the current grid for a given wall-clock time. */
export function gridAtTime(
  seed: string,
  timeMs: number,
  params: GridParams = DEFAULT_PARAMS,
  accept?: AcceptGrid,
): Grid {
  const tick = tickForTime(timeMs, params);
  return gridAtTick(seed, tick, params, accept ?? defaultAccept(params));
}

/**
 * The adjacent ticks for the login grace window (§3, §10: "grace window over
 * adjacent ticks (t-1, t, t+1)"). Returns the ticks an answer may be validated
 * against, newest-relevant first is not required — order is [t-1, t, t+1].
 */
export function graceTicks(tick: number): [number, number, number] {
  return [tick - 1, tick, tick + 1];
}
