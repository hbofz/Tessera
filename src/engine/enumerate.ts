/**
 * Rule-space enumeration (DESIGN.md §5, §9.4).
 *
 * The menu is finite and enumerable BY DESIGN — that's the invariant (§9.4)
 * that makes both verifier hashing (§6) and the strength simulation (§7)
 * possible. This module materializes the menu for a given grid size.
 *
 * Two enumerations matter:
 *   - enumerateRules(): the full SELECT × TRANSFORM(×1–2) × READOUT space, used
 *     by the strength meter's elimination attacker (§7 Metric 2).
 *   - the per-slot menus, used by the builder UI (§8) to offer choices.
 *
 * Size note (§5): "~5 SELECT × ~6 TRANSFORM × ~5 READOUT ≈ 150 base rules,
 * rising to thousands once you allow a chain of two transforms." The numbers
 * here are grid-size-dependent (regions/lines/corners scale with rows/cols).
 */

import type {
  Color,
  DiagonalKind,
  Direction,
  Quadrant,
  Readout,
  Rule,
  Select,
  Transform,
} from "./types.js";
import { COLORS } from "./types.js";

const DIRECTIONS: readonly Direction[] = ["up", "down", "left", "right"];
const QUADRANTS: readonly Quadrant[] = ["tl", "tr", "bl", "br"];
const DIAGONALS: readonly DiagonalKind[] = ["main", "anti"];

/** All SELECT options for a grid of the given size. */
export function enumerateSelects(rows: number, cols: number): Select[] {
  const out: Select[] = [{ type: "all" }];
  for (const value of COLORS) out.push({ type: "color", value });
  for (let r = 0; r < rows; r++) out.push({ type: "region", region: { kind: "row", index: r } });
  for (let c = 0; c < cols; c++) out.push({ type: "region", region: { kind: "col", index: c } });
  for (const which of QUADRANTS) out.push({ type: "region", region: { kind: "quadrant", which } });
  for (const which of DIAGONALS) out.push({ type: "region", region: { kind: "diagonal", which } });
  return out;
}

/** All single TRANSFORM options (the v1 set: shift/recolor/reflect). */
export function enumerateTransforms(): Transform[] {
  const out: Transform[] = [];
  for (const dir of DIRECTIONS) out.push({ type: "shift", dir });
  // recolor swaps: unordered pairs of distinct colors.
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      out.push({ type: "recolor", op: "swap", a: COLORS[i] as Color, b: COLORS[j] as Color });
    }
  }
  out.push({ type: "recolor", op: "rotate", dir: "fwd" });
  out.push({ type: "recolor", op: "rotate", dir: "rev" });
  out.push({ type: "reflect", axis: "h" });
  out.push({ type: "reflect", axis: "v" });
  return out;
}

/** All READOUT options for a grid of the given size. */
export function enumerateReadouts(rows: number, cols: number): Readout[] {
  const out: Readout[] = [];
  // cell: center + 4 corners + (optionally) explicit cells. v1 menu = center +
  // corners (§5: "center / a corner").
  out.push({ type: "cell", target: { kind: "center" } });
  for (const which of QUADRANTS) out.push({ type: "cell", target: { kind: "corner", which } });
  // count of each color.
  for (const color of COLORS) out.push({ type: "count", color });
  // line: each row (ltr/rtl) and each col (ttb/btt).
  for (let r = 0; r < rows; r++) {
    out.push({ type: "line", which: { kind: "row", index: r }, order: "ltr" });
    out.push({ type: "line", which: { kind: "row", index: r }, order: "rtl" });
  }
  for (let c = 0; c < cols; c++) {
    out.push({ type: "line", which: { kind: "col", index: c }, order: "ttb" });
    out.push({ type: "line", which: { kind: "col", index: c }, order: "btt" });
  }
  return out;
}

/** Options for transform chains of length 1..maxChain (v1: maxChain = 2). */
export function enumerateTransformChains(maxChain: number): Transform[][] {
  if (maxChain < 1) throw new Error("maxChain must be ≥1");
  const singles = enumerateTransforms();
  const chains: Transform[][] = singles.map((t) => [t]);
  if (maxChain >= 2) {
    for (const a of singles) {
      for (const b of singles) {
        chains.push([a, b]);
      }
    }
  }
  if (maxChain > 2) {
    throw new Error("v1 enumeration supports chains up to length 2 (§5)");
  }
  return chains;
}

export interface EnumerateOptions {
  readonly rows: number;
  readonly cols: number;
  /** Max transform-chain length (v1 = 2, §5). */
  readonly maxChain: number;
}

/**
 * The full rule space: every (select, transform-chain, readout) combination.
 * This is what the §7 elimination attacker starts from. Returned as a lazy
 * generator so callers can count or stream without holding the whole array if
 * it's large; a materializing helper is below for convenience.
 */
export function* enumerateRules(opts: EnumerateOptions): Generator<Rule> {
  const selects = enumerateSelects(opts.rows, opts.cols);
  const chains = enumerateTransformChains(opts.maxChain);
  const readouts = enumerateReadouts(opts.rows, opts.cols);
  for (const select of selects) {
    for (const transforms of chains) {
      for (const readout of readouts) {
        yield { select, transforms, readout };
      }
    }
  }
}

/** Materialize the full rule space into an array. */
export function allRules(opts: EnumerateOptions): Rule[] {
  return [...enumerateRules(opts)];
}

/** Count the rule space without materializing it (for the meter's reporting). */
export function ruleSpaceSize(opts: EnumerateOptions): number {
  const s = enumerateSelects(opts.rows, opts.cols).length;
  const c = enumerateTransformChains(opts.maxChain).length;
  const r = enumerateReadouts(opts.rows, opts.cols).length;
  return s * c * r;
}
