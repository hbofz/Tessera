/**
 * Builder menu options + human labels (DESIGN.md §8).
 *
 * These labels exist ONLY for the builder — the one place the move is visible
 * (§9.1). They must never be imported by practice/login UI, or they'd risk
 * naming the move outside the builder. Each option pairs a human label with the
 * canonical encoded fragment (§5) it produces.
 *
 * Options are generated for a given grid size so regions/lines/corners match
 * the actual grid (consistent with enumerate.ts, which the strength meter uses).
 */

import type {
  Color,
  Direction,
  Quadrant,
  Readout,
  Select,
  Transform,
} from "../engine/types.js";
import { COLORS } from "../engine/types.js";
import { CELL_STYLES } from "./palette.js";

export interface Option<T> {
  readonly label: string;
  readonly value: T;
}

const colorName = (c: Color) => CELL_STYLES[c].label.split(" ")[0]!; // "red" etc.

const DIR_LABEL: Record<Direction, string> = {
  up: "up",
  down: "down",
  left: "left",
  right: "right",
};

const QUAD_LABEL: Record<Quadrant, string> = {
  tl: "top-left",
  tr: "top-right",
  bl: "bottom-left",
  br: "bottom-right",
};

export function selectOptions(rows: number, cols: number): Option<Select>[] {
  const out: Option<Select>[] = [{ label: "All cells", value: { type: "all" } }];
  for (const c of COLORS) {
    out.push({ label: `Only ${colorName(c)} cells`, value: { type: "color", value: c } });
  }
  for (let r = 0; r < rows; r++) {
    out.push({ label: `Row ${r + 1}`, value: { type: "region", region: { kind: "row", index: r } } });
  }
  for (let c = 0; c < cols; c++) {
    out.push({ label: `Column ${c + 1}`, value: { type: "region", region: { kind: "col", index: c } } });
  }
  for (const q of ["tl", "tr", "bl", "br"] as const) {
    out.push({
      label: `${QUAD_LABEL[q]} quadrant`,
      value: { type: "region", region: { kind: "quadrant", which: q } },
    });
  }
  out.push({
    label: "Main diagonal",
    value: { type: "region", region: { kind: "diagonal", which: "main" } },
  });
  out.push({
    label: "Anti-diagonal",
    value: { type: "region", region: { kind: "diagonal", which: "anti" } },
  });
  return out;
}

export function transformOptions(): Option<Transform>[] {
  const out: Option<Transform>[] = [];
  for (const dir of ["up", "down", "left", "right"] as const) {
    out.push({ label: `Slide ${DIR_LABEL[dir]}`, value: { type: "shift", dir } });
  }
  // Swaps: unordered distinct pairs.
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = i + 1; j < COLORS.length; j++) {
      const a = COLORS[i]!;
      const b = COLORS[j]!;
      out.push({ label: `Swap ${colorName(a)} ↔ ${colorName(b)}`, value: { type: "recolor", op: "swap", a, b } });
    }
  }
  out.push({ label: "Rotate colors (forward)", value: { type: "recolor", op: "rotate", dir: "fwd" } });
  out.push({ label: "Rotate colors (back)", value: { type: "recolor", op: "rotate", dir: "rev" } });
  out.push({ label: "Mirror left ↔ right", value: { type: "reflect", axis: "h" } });
  out.push({ label: "Mirror top ↔ bottom", value: { type: "reflect", axis: "v" } });
  return out;
}

export function readoutOptions(rows: number, cols: number): Option<Readout>[] {
  const out: Option<Readout>[] = [{ label: "Color of the center cell", value: { type: "cell", target: { kind: "center" } } }];
  for (const q of ["tl", "tr", "bl", "br"] as const) {
    out.push({
      label: `Color of the ${QUAD_LABEL[q]} corner`,
      value: { type: "cell", target: { kind: "corner", which: q } },
    });
  }
  for (const c of COLORS) {
    out.push({ label: `Count of ${colorName(c)}`, value: { type: "count", color: c } });
  }
  for (let r = 0; r < rows; r++) {
    out.push({
      label: `Read row ${r + 1} (left→right)`,
      value: { type: "line", which: { kind: "row", index: r }, order: "ltr" },
    });
  }
  for (let c = 0; c < cols; c++) {
    out.push({
      label: `Read column ${c + 1} (top→bottom)`,
      value: { type: "line", which: { kind: "col", index: c }, order: "ttb" },
    });
  }
  return out;
}
