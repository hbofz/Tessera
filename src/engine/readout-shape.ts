/**
 * Readout shape introspection (DESIGN.md §5 READOUT).
 *
 * Given a readout and the grid dimensions, report the SHAPE of the answer the
 * user must produce — without ever computing the answer itself. The answer
 * input (AnswerInput) uses this to size its controls (how many line slots, the
 * max for a count) while staying ignorant of the expected value (§9.1).
 */

import type { Readout } from "./types.js";

export type ReadoutShape =
  | { readonly kind: "cell" }
  | { readonly kind: "count"; readonly max: number }
  | { readonly kind: "line"; readonly length: number };

export function readoutShape(readout: Readout, rows: number, cols: number): ReadoutShape {
  switch (readout.type) {
    case "cell":
      return { kind: "cell" };
    case "count":
      // A color can appear in at most every cell.
      return { kind: "count", max: rows * cols };
    case "line": {
      const length = readout.which.kind === "row" ? cols : rows;
      return { kind: "line", length };
    }
  }
}
