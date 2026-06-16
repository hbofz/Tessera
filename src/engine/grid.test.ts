import { describe, it, expect } from "vitest";
import { makeGrid, parseGrid, formatGrid, gridsEqual, cellAt, inBounds } from "./grid.js";
import type { Cell } from "./types.js";

describe("grid construction & parsing", () => {
  it("parses a compact grid with / and newline separators", () => {
    const a = parseGrid("R_/_G");
    const b = parseGrid("R_\n_G");
    expect(gridsEqual(a, b)).toBe(true);
    expect(a.rows).toBe(2);
    expect(a.cols).toBe(2);
  });

  it("treats _ and . as empty (interior spaces too)", () => {
    // Note: per-line .trim() means a *leading/trailing* space is not a cell;
    // use _ or . at the ends. Interior spaces are honored as empty.
    const g = parseGrid("R./_G");
    expect(cellAt(g, 0, 1)).toBe("_");
    expect(cellAt(g, 1, 0)).toBe("_");
    const h = parseGrid("R B"); // interior space = empty middle cell
    expect(cellAt(h, 0, 1)).toBe("_");
  });

  it("round-trips through formatGrid (empties render as .)", () => {
    const g = parseGrid("RG_/_BR");
    expect(formatGrid(g)).toBe("RG./.BR");
  });

  it("rejects ragged grids", () => {
    expect(() => makeGrid([["R", "G"], ["B"]] as Cell[][])).toThrow(/same length/);
  });

  it("rejects unknown chars", () => {
    expect(() => parseGrid("RX")).toThrow(/unrecognized/);
  });

  it("is immutable to source mutation", () => {
    const src: Cell[][] = [["R", "_"]];
    const g = makeGrid(src);
    src[0]![0] = "B";
    expect(cellAt(g, 0, 0)).toBe("R");
  });

  it("bounds checks", () => {
    const g = parseGrid("R_/_G");
    expect(inBounds(g, 1, 1)).toBe(true);
    expect(inBounds(g, 2, 0)).toBe(false);
    expect(() => cellAt(g, 2, 0)).toThrow(/out of bounds/);
  });
});
