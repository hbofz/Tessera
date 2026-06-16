/**
 * The visual palette (DESIGN.md §4b).
 *
 * Accessibility is LOAD-BEARING here, not optional: "color carries meaning, so
 * accessibility is load-bearing" (§4b). A purely-hue encoding would make the
 * grid unreadable for colorblind users AND ambiguous for everyone in bad
 * lighting. So every color is REDUNDANTLY encoded by BOTH a hue and a distinct
 * SHAPE. A cell is identifiable without perceiving color at all.
 *
 * The hues are drawn from the Okabe–Ito colorblind-safe qualitative palette,
 * which is distinguishable across the common forms of color vision deficiency.
 */

import type { Cell, Color } from "../engine/types.js";
import { EMPTY } from "../engine/types.js";

/** A renderable cell appearance: a fill color plus a shape glyph for the
 *  redundant, color-independent channel. */
export interface CellStyle {
  /** Okabe–Ito hue. */
  readonly fill: string;
  /** A short, distinct shape name used to pick an SVG/clip shape. */
  readonly shape: "circle" | "triangle" | "square";
  /** A unicode glyph fallback (used in text contexts / tests / ASCII). */
  readonly glyph: string;
  /** Accessible label for screen readers. */
  readonly label: string;
}

export const CELL_STYLES: Record<Color, CellStyle> = {
  // Okabe–Ito vermillion / bluish-green / blue — three mutually distinguishable
  // hues, each paired with a unique shape.
  R: { fill: "#D55E00", shape: "circle", glyph: "●", label: "red circle" },
  G: { fill: "#009E73", shape: "triangle", glyph: "▲", label: "green triangle" },
  B: { fill: "#0072B2", shape: "square", glyph: "■", label: "blue square" },
};

/** Appearance of an empty cell — no shape, a faint neutral background. Empty is
 *  part of the picture (§4b), so it has a deliberate look, not "nothing". */
export const EMPTY_STYLE = {
  fill: "#EDEDED",
  glyph: "·",
  label: "empty",
} as const;

/** The glyph for any cell (color or empty) — used by ASCII rendering & tests. */
export function cellGlyph(cell: Cell): string {
  return cell === EMPTY ? EMPTY_STYLE.glyph : CELL_STYLES[cell].glyph;
}

/** The accessible label for any cell. */
export function cellLabel(cell: Cell): string {
  return cell === EMPTY ? EMPTY_STYLE.label : CELL_STYLES[cell].label;
}
