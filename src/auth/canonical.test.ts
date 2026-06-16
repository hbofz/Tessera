import { describe, it, expect } from "vitest";
import { canonicalRule } from "./canonical.js";
import type { Rule } from "../engine/types.js";

describe("canonicalRule", () => {
  it("is stable regardless of key insertion order", () => {
    // Two rules with the same content but different object literal key order.
    const a: Rule = {
      select: { type: "color", value: "R" },
      transforms: [{ type: "shift", dir: "down" }],
      readout: { type: "count", color: "R" },
    };
    const b: Rule = {
      readout: { color: "R", type: "count" },
      transforms: [{ dir: "down", type: "shift" }],
      select: { value: "R", type: "color" },
    } as Rule;
    expect(canonicalRule(a)).toBe(canonicalRule(b));
  });

  it("distinguishes different rules", () => {
    const a: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "up" }],
      readout: { type: "count", color: "R" },
    };
    const b: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "down" }],
      readout: { type: "count", color: "R" },
    };
    expect(canonicalRule(a)).not.toBe(canonicalRule(b));
  });

  it("preserves transform-chain ORDER (arrays aren't sorted)", () => {
    const ab: Rule = {
      select: { type: "all" },
      transforms: [
        { type: "shift", dir: "up" },
        { type: "reflect", axis: "h" },
      ],
      readout: { type: "count", color: "R" },
    };
    const ba: Rule = {
      select: { type: "all" },
      transforms: [
        { type: "reflect", axis: "h" },
        { type: "shift", dir: "up" },
      ],
      readout: { type: "count", color: "R" },
    };
    expect(canonicalRule(ab)).not.toBe(canonicalRule(ba));
  });
});
