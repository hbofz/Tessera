import { describe, it, expect } from "vitest";
import { readoutPositions } from "./readout-positions.js";

describe("readoutPositions", () => {
  it("cell center → the floored-mid cell", () => {
    expect(readoutPositions({ type: "cell", target: { kind: "center" } }, 4, 4)).toEqual([
      { row: 2, col: 2 },
    ]);
  });

  it("cell corners", () => {
    expect(readoutPositions({ type: "cell", target: { kind: "corner", which: "tl" } }, 4, 4)).toEqual([
      { row: 0, col: 0 },
    ]);
    expect(readoutPositions({ type: "cell", target: { kind: "corner", which: "br" } }, 4, 4)).toEqual([
      { row: 3, col: 3 },
    ]);
  });

  it("count → null (whole-grid scan, no single target)", () => {
    expect(readoutPositions({ type: "count", color: "R" }, 4, 4)).toBeNull();
  });

  it("row line → the whole row; col line → the whole column", () => {
    expect(readoutPositions({ type: "line", which: { kind: "row", index: 1 }, order: "ltr" }, 3, 4)).toEqual([
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);
    expect(readoutPositions({ type: "line", which: { kind: "col", index: 2 }, order: "ttb" }, 3, 4)).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
    ]);
  });
});
