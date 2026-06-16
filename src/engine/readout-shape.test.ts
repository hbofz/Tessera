import { describe, it, expect } from "vitest";
import { readoutShape } from "./readout-shape.js";

describe("readoutShape", () => {
  it("cell → kind cell", () => {
    expect(readoutShape({ type: "cell", target: { kind: "center" } }, 4, 4)).toEqual({ kind: "cell" });
  });

  it("count → max = total cells", () => {
    expect(readoutShape({ type: "count", color: "R" }, 4, 4)).toEqual({ kind: "count", max: 16 });
    expect(readoutShape({ type: "count", color: "G" }, 5, 3)).toEqual({ kind: "count", max: 15 });
  });

  it("row line → length = cols; col line → length = rows", () => {
    expect(readoutShape({ type: "line", which: { kind: "row", index: 0 }, order: "ltr" }, 5, 3)).toEqual({
      kind: "line",
      length: 3,
    });
    expect(readoutShape({ type: "line", which: { kind: "col", index: 0 }, order: "ttb" }, 5, 3)).toEqual({
      kind: "line",
      length: 5,
    });
  });
});
