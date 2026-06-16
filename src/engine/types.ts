/**
 * Core data model for the Tessera rule engine.
 *
 * See DESIGN.md §4b (grid & cell model) and §5 (rule vocabulary).
 *
 * Two decisions are baked in here and must stay consistent with the strength
 * meter (§7):
 *   - Cells are one of 3 real colors OR empty (§4b: "3 colors + empty").
 *   - "Empty as background" semantics (§4b leaning recommendation): only the 3
 *     real colors are moved/recolored/reflected by transforms; empty is what is
 *     left behind when a colored cell moves away. See rule.ts for the exact
 *     collision/vacancy rules.
 */

/** The three real colors. Names are intentionally palette-agnostic — the actual
 *  hues (which must be colorblind-safe, §4b) are a rendering concern, not a
 *  model concern. The engine only cares about identity and the cyclic order
 *  R → G → B → R used by the "rotate" recolor (§5). */
export const COLORS = ["R", "G", "B"] as const;
export type Color = (typeof COLORS)[number];

/** Empty is a distinct cell state, not a 4th color. Under "empty as background"
 *  it is never itself selected/transformed; it only appears where colored cells
 *  vacate. */
export const EMPTY = "_" as const;
export type Empty = typeof EMPTY;

/** A single cell: a real color or empty. */
export type Cell = Color | Empty;

export function isColor(cell: Cell): cell is Color {
  return cell !== EMPTY;
}

/**
 * A grid is a row-major 2D array of cells, `rows` tall and `cols` wide.
 * Default is 4×4 (§4b). We keep rows/cols explicit (rather than assuming
 * square) so the size knob in §4b is a pure data change, not a code change.
 *
 * Invariant: `cells.length === rows` and every row has length `cols`.
 */
export interface Grid {
  readonly rows: number;
  readonly cols: number;
  /** `cells[r][c]` — row r (0 = top), col c (0 = left). */
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
}

// ---------------------------------------------------------------------------
// Canonical rule encoding (DESIGN.md §5).
//
// R = SELECT → TRANSFORM (×1–2) → READOUT
//
// This is the "password chosen from a structured space" (§6) — finite and
// enumerable (INVARIANT §9.4). The discriminated unions below ARE that finite
// menu; widening them is how the rule space grows, and any addition must remain
// enumerable.
// ---------------------------------------------------------------------------

// --- SELECT: which cells the rule attends to (§5) ---

/** All cells (all colored cells, since empty is background). */
export interface SelectAll {
  readonly type: "all";
}

/** Cells of one color — "color is pre-attentive; the eye finds it instantly". */
export interface SelectColor {
  readonly type: "color";
  readonly value: Color;
}

/** A region of the grid. The named regions from §5. */
export type RegionKind =
  | { readonly kind: "row"; readonly index: number }
  | { readonly kind: "col"; readonly index: number }
  | { readonly kind: "quadrant"; readonly which: Quadrant }
  | { readonly kind: "diagonal"; readonly which: DiagonalKind };

export type Quadrant = "tl" | "tr" | "bl" | "br";
/** "main" = top-left→bottom-right; "anti" = top-right→bottom-left. */
export type DiagonalKind = "main" | "anti";

export interface SelectRegion {
  readonly type: "region";
  readonly region: RegionKind;
}

export type Select = SelectAll | SelectColor | SelectRegion;

// --- TRANSFORM: the move (§5; v1 = shift/recolor/reflect, chain ≤2) ---

export type Direction = "up" | "down" | "left" | "right";

/** Shift selected cells one step in a direction, wrapping around (§5). */
export interface TransformShift {
  readonly type: "shift";
  readonly dir: Direction;
}

/** Recolor: either swap two colors, or rotate the 3-color cycle (§5). */
export type TransformRecolor =
  | {
      readonly type: "recolor";
      readonly op: "swap";
      readonly a: Color;
      readonly b: Color;
    }
  | {
      readonly type: "recolor";
      readonly op: "rotate";
      /** "fwd" = R→G→B→R; "rev" = R→B→G→R. */
      readonly dir: "fwd" | "rev";
    };

/** Reflect: mirror the selection across the vertical or horizontal axis (§5). */
export interface TransformReflect {
  readonly type: "reflect";
  /** "h" = mirror left↔right; "v" = mirror top↔bottom. */
  readonly axis: "h" | "v";
}

export type Transform = TransformShift | TransformRecolor | TransformReflect;

// --- READOUT: the single scalar fact reported (§5, the §4 bottleneck) ---

export type CellTarget =
  | { readonly kind: "center" }
  | { readonly kind: "corner"; readonly which: Quadrant }
  | { readonly kind: "at"; readonly row: number; readonly col: number };

/** Color of one fixed cell — tiny answer space, fastest (§5). */
export interface ReadoutCell {
  readonly type: "cell";
  readonly target: CellTarget;
}

/** Count of one color across the whole grid — balanced default (§5). */
export interface ReadoutCount {
  readonly type: "count";
  readonly color: Color;
}

/** Read a line (a row or column) as a short color sequence — the entropy
 *  workhorse (§5). */
export interface ReadoutLine {
  readonly type: "line";
  readonly which:
    | { readonly kind: "row"; readonly index: number }
    | { readonly kind: "col"; readonly index: number };
  /** Reading order along the line. */
  readonly order: "ltr" | "rtl" | "ttb" | "btt";
}

export type Readout = ReadoutCell | ReadoutCount | ReadoutLine;

/** The canonical encoded rule (§5). This is what the builder outputs, what gets
 *  hashed (§6), and what the strength meter enumerates (§7). */
export interface Rule {
  readonly select: Select;
  /** 1 or 2 transforms (v1 caps the chain at 2, §5). Applied left→right. */
  readonly transforms: readonly Transform[];
  readonly readout: Readout;
}

// --- Answer ---

/**
 * The readout result. A cell readout yields a single Cell (a color or empty);
 * a count yields a number; a line yields a sequence of cells. We keep it a
 * structured value (not a string) so equality is exact (INVARIANT §9.5: an
 * answer is right or wrong, never fuzzy) and so the strength meter can reason
 * about the distribution. Rendering to tappable symbols is a UI concern.
 */
export type Answer =
  | { readonly kind: "cell"; readonly value: Cell }
  | { readonly kind: "count"; readonly value: number }
  | { readonly kind: "line"; readonly value: readonly Cell[] };
