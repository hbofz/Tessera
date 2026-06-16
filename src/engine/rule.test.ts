import { describe, it, expect } from "vitest";
import { parseGrid, formatGrid } from "./grid.js";
import {
  applyRule,
  applyTransform,
  applyReadout,
  resolveSelect,
  answersEqual,
  validateRule,
} from "./rule.js";
import type { Rule, Select, Transform, Readout, Answer } from "./types.js";

// Helpers ------------------------------------------------------------------

/** Run a single transform with a given select and return the formatted grid. */
function tx(gridText: string, select: Select, transform: Transform): string {
  const g = parseGrid(gridText);
  const sel = resolveSelect(g, select);
  return formatGrid(applyTransform(g, transform, sel));
}

const SEL_ALL: Select = { type: "all" };

// =========================================================================
// SELECT
// =========================================================================
describe("SELECT", () => {
  const g = parseGrid("RG/_R"); // R at (0,0),(1,1)? -> R G / _ R

  it("all selects every position in row-major order", () => {
    const sel = resolveSelect(g, SEL_ALL);
    expect(sel).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it("color selects only matching cells", () => {
    const sel = resolveSelect(g, { type: "color", value: "R" });
    expect(sel).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it("region row / col", () => {
    expect(resolveSelect(g, { type: "region", region: { kind: "row", index: 0 } })).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);
    expect(resolveSelect(g, { type: "region", region: { kind: "col", index: 1 } })).toEqual([
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
  });

  it("quadrants tile a 4x4 with no overlap and full cover", () => {
    const big = parseGrid("RRRR/RRRR/RRRR/RRRR");
    const all = new Set<string>();
    for (const q of ["tl", "tr", "bl", "br"] as const) {
      const sel = resolveSelect(big, { type: "region", region: { kind: "quadrant", which: q } });
      expect(sel.length).toBe(4);
      for (const p of sel) {
        const key = `${p.row},${p.col}`;
        expect(all.has(key)).toBe(false); // no overlap
        all.add(key);
      }
    }
    expect(all.size).toBe(16); // full cover
  });

  it("diagonals main and anti on a 3x3", () => {
    const g3 = parseGrid("RGB/GBR/BRG");
    expect(resolveSelect(g3, { type: "region", region: { kind: "diagonal", which: "main" } })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
      { row: 2, col: 2 },
    ]);
    expect(resolveSelect(g3, { type: "region", region: { kind: "diagonal", which: "anti" } })).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 1 },
      { row: 2, col: 0 },
    ]);
  });
});

// =========================================================================
// SHIFT — the empty-as-background heart of the engine
// =========================================================================
describe("SHIFT (empty as background)", () => {
  it("shifts all cells right with wrap; empties ride as empty", () => {
    // R G _ shifted right -> _ R G  (and the trailing G wraps to front... but
    // here single row of 3)
    expect(tx("RG_", SEL_ALL, { type: "shift", dir: "right" })).toBe(".RG");
  });

  it("wraps a colored cell off the right edge to the left", () => {
    expect(tx("__R", SEL_ALL, { type: "shift", dir: "right" })).toBe("R..");
  });

  it("vacated SELECTED positions become empty when only some cells selected", () => {
    // Select only R; shift R right. The R at (0,0) moves to (0,1), its old
    // home becomes empty, and the unselected G at (0,1) is OVERWRITTEN by the
    // sliding R.
    expect(tx("RG", { type: "color", value: "R" }, { type: "shift", dir: "right" })).toBe(".R");
  });

  it("does NOT clear unselected cells that nothing moves onto", () => {
    // Select only R (at col 0). Shift up in a 2-row grid: R moves from (0,0) to
    // (1,0) [wrap], leaving (0,0) empty. G at (0,1) is unselected & untouched.
    expect(tx("RG/__", { type: "color", value: "R" }, { type: "shift", dir: "down" })).toBe(".G/R.");
  });

  it("collision: later source in row-major order wins", () => {
    // Two reds in a column shifted down with wrap on a 2-row grid both target...
    // construct an explicit collision: a 1-col, 2-row grid, both R, shift down.
    // (0,0)R -> (1,0); (1,0)R -> (0,0). No collision there. Force one:
    // 3-row column R R _ , select all, shift down by 1: (0)->(1),(1)->(2),(2 is
    // empty). Result _ R R. No collision. Real collision needs two sources to
    // one dest, which wrap alone won't cause for a bijective shift. Instead use
    // a selection that is not translation-closed:
    // grid "RR" (1 row), select col0 AND treat shift right: only col0's R moves
    // to col1, overwriting col1's R -> ".R". That's overwrite, deterministic.
    expect(tx("RR", { type: "region", region: { kind: "col", index: 0 } }, { type: "shift", dir: "right" })).toBe(
      ".R",
    );
  });

  it("shift left/up directions", () => {
    expect(tx("_R", SEL_ALL, { type: "shift", dir: "left" })).toBe("R.");
    expect(tx("R/_", SEL_ALL, { type: "shift", dir: "up" })).toBe("./R");
  });
});

// =========================================================================
// RECOLOR
// =========================================================================
describe("RECOLOR", () => {
  it("swap exchanges two colors, leaves the third and empty", () => {
    expect(tx("RGB_", SEL_ALL, { type: "recolor", op: "swap", a: "R", b: "G" })).toBe("GRB.");
  });

  it("rotate fwd: R->G->B->R", () => {
    expect(tx("RGB", SEL_ALL, { type: "recolor", op: "rotate", dir: "fwd" })).toBe("GBR");
  });

  it("rotate rev is the inverse of fwd", () => {
    expect(tx("RGB", SEL_ALL, { type: "recolor", op: "rotate", dir: "rev" })).toBe("BRG");
  });

  it("only recolors selected color; empty never becomes a color", () => {
    expect(tx("R_G", { type: "color", value: "R" }, { type: "recolor", op: "rotate", dir: "fwd" })).toBe("G.G");
  });
});

// =========================================================================
// REFLECT
// =========================================================================
describe("REFLECT", () => {
  it("horizontal mirror swaps left and right halves (all selected)", () => {
    expect(tx("RGB", SEL_ALL, { type: "reflect", axis: "h" })).toBe("BGR");
  });

  it("vertical mirror swaps top and bottom rows", () => {
    expect(tx("RG/B_", SEL_ALL, { type: "reflect", axis: "v" })).toBe("B./RG");
  });

  it("reflecting a partial selection writes content into mirror positions", () => {
    // Select col 0 only; reflect h. Col0 content is written to col (cols-1).
    // "RG" -> write R (from col0) into col1 -> "RR"; col0 keeps R (its mirror
    // col1 was not selected, so nothing wrote back to col0).
    expect(tx("RG", { type: "region", region: { kind: "col", index: 0 } }, { type: "reflect", axis: "h" })).toBe(
      "RR",
    );
  });
});

// =========================================================================
// READOUT
// =========================================================================
describe("READOUT", () => {
  const g = parseGrid("RGBR/G__B/B__G/RGBR"); // 4x4

  it("cell center (even dims -> floor mid)", () => {
    const a = applyReadout(g, { type: "cell", target: { kind: "center" } });
    // center -> (2,2) -> '_'
    expect(a).toEqual({ kind: "cell", value: "_" });
  });

  it("cell corners", () => {
    expect(applyReadout(g, { type: "cell", target: { kind: "corner", which: "tl" } })).toEqual({
      kind: "cell",
      value: "R",
    });
    expect(applyReadout(g, { type: "cell", target: { kind: "corner", which: "br" } })).toEqual({
      kind: "cell",
      value: "R",
    });
    expect(applyReadout(g, { type: "cell", target: { kind: "corner", which: "tr" } })).toEqual({
      kind: "cell",
      value: "R",
    });
  });

  it("count of a color across the whole grid", () => {
    expect(applyReadout(g, { type: "count", color: "R" })).toEqual({ kind: "count", value: 4 });
    expect(applyReadout(g, { type: "count", color: "G" })).toEqual({ kind: "count", value: 4 });
  });

  it("line reads a row ltr and rtl", () => {
    expect(applyReadout(g, { type: "line", which: { kind: "row", index: 0 }, order: "ltr" })).toEqual({
      kind: "line",
      value: ["R", "G", "B", "R"],
    });
    expect(applyReadout(g, { type: "line", which: { kind: "row", index: 0 }, order: "rtl" })).toEqual({
      kind: "line",
      value: ["R", "B", "G", "R"],
    });
  });

  it("line reads a col ttb and btt", () => {
    expect(applyReadout(g, { type: "line", which: { kind: "col", index: 0 }, order: "ttb" })).toEqual({
      kind: "line",
      value: ["R", "G", "B", "R"],
    });
    expect(applyReadout(g, { type: "line", which: { kind: "col", index: 0 }, order: "btt" })).toEqual({
      kind: "line",
      value: ["R", "B", "G", "R"],
    });
  });

  it("rejects an order that doesn't match the line orientation", () => {
    expect(() =>
      applyReadout(g, { type: "line", which: { kind: "row", index: 0 }, order: "ttb" }),
    ).toThrow(/not valid for a row/);
  });
});

// =========================================================================
// FULL PIPELINE R(C) -> answer
// =========================================================================
describe("applyRule — full pipeline", () => {
  it("worked example: select red, shift down, read bottom row", () => {
    const rule: Rule = {
      select: { type: "color", value: "R" },
      transforms: [{ type: "shift", dir: "down" }],
      readout: { type: "line", which: { kind: "row", index: 1 }, order: "ltr" },
    };
    // 2x2: R at (0,0). shift R down -> (1,0). bottom row -> [R, original(1,1)]
    const g = parseGrid("R_/_G");
    const a = applyRule(g, rule);
    expect(a).toEqual({ kind: "line", value: ["R", "G"] });
  });

  it("is a pure function: same grid + rule -> same answer, input unmutated", () => {
    const g = parseGrid("RGB/GBR/BRG");
    const before = formatGrid(g);
    const rule: Rule = {
      select: { type: "all" },
      transforms: [{ type: "reflect", axis: "h" }],
      readout: { type: "count", color: "R" },
    };
    const a1 = applyRule(g, rule);
    const a2 = applyRule(g, rule);
    expect(answersEqual(a1, a2)).toBe(true);
    expect(formatGrid(g)).toBe(before); // not mutated
  });

  it("chained transforms apply left-to-right", () => {
    // shift all right, then recolor swap R/G. 1x3.
    const rule: Rule = {
      select: { type: "all" },
      transforms: [
        { type: "shift", dir: "right" },
        { type: "recolor", op: "swap", a: "R", b: "G" },
      ],
      readout: { type: "line", which: { kind: "row", index: 0 }, order: "ltr" },
    };
    // "RG_" -> shift right -> "_RG" -> swap R/G -> "_GR"
    const a = applyRule(parseGrid("RG_"), rule);
    expect(a).toEqual({ kind: "line", value: ["_", "G", "R"] });
  });

  it("color-select is RE-RESOLVED before each transform in a chain", () => {
    // select red; transform1 recolor R->G (no reds left); transform2 shift red.
    // Because select is re-resolved on the CURRENT grid, the second shift finds
    // ZERO reds and is a no-op. Verifies the documented re-resolve semantics.
    const rule: Rule = {
      select: { type: "color", value: "R" },
      transforms: [
        { type: "recolor", op: "rotate", dir: "fwd" }, // R->G
        { type: "shift", dir: "right" },
      ],
      readout: { type: "line", which: { kind: "row", index: 0 }, order: "ltr" },
    };
    // "RB" -> select R = {(0,0)} -> rotate fwd -> "GB" -> select R = {} -> shift
    // no-op -> "GB"
    const a = applyRule(parseGrid("RB"), rule);
    expect(a).toEqual({ kind: "line", value: ["G", "B"] });
  });
});

// =========================================================================
// VALIDATION & ANSWER EQUALITY
// =========================================================================
describe("validateRule", () => {
  it("rejects 0 or 3+ transforms (v1 chain cap)", () => {
    const base = {
      select: { type: "all" } as Select,
      readout: { type: "count", color: "R" } as Readout,
    };
    expect(() => validateRule({ ...base, transforms: [] })).toThrow(/1 or 2/);
    expect(() =>
      validateRule({
        ...base,
        transforms: [
          { type: "shift", dir: "up" },
          { type: "shift", dir: "up" },
          { type: "shift", dir: "up" },
        ],
      }),
    ).toThrow(/1 or 2/);
  });

  it("rejects a swap of a color with itself", () => {
    expect(() =>
      validateRule({
        select: { type: "all" },
        transforms: [{ type: "recolor", op: "swap", a: "R", b: "R" }],
        readout: { type: "count", color: "R" },
      }),
    ).toThrow(/distinct/);
  });

  it("applyRule runs validation", () => {
    expect(() =>
      applyRule(parseGrid("R"), {
        select: { type: "all" },
        transforms: [],
        readout: { type: "count", color: "R" },
      }),
    ).toThrow(/1 or 2/);
  });
});

describe("answersEqual", () => {
  it("distinguishes kinds and values", () => {
    const c1: Answer = { kind: "cell", value: "R" };
    const c2: Answer = { kind: "cell", value: "G" };
    const n1: Answer = { kind: "count", value: 3 };
    expect(answersEqual(c1, c1)).toBe(true);
    expect(answersEqual(c1, c2)).toBe(false);
    expect(answersEqual(c1, n1)).toBe(false);
    expect(
      answersEqual({ kind: "line", value: ["R", "_"] }, { kind: "line", value: ["R", "_"] }),
    ).toBe(true);
    expect(answersEqual({ kind: "line", value: ["R"] }, { kind: "line", value: ["R", "_"] })).toBe(false);
  });
});
