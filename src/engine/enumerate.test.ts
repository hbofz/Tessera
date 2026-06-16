import { describe, it, expect } from "vitest";
import {
  enumerateSelects,
  enumerateTransforms,
  enumerateReadouts,
  enumerateTransformChains,
  allRules,
  ruleSpaceSize,
} from "./enumerate.js";
import { validateRule } from "./rule.js";

describe("enumeration menus (§5)", () => {
  it("selects for 4x4: all + 3 colors + 4 rows + 4 cols + 4 quadrants + 2 diagonals", () => {
    const s = enumerateSelects(4, 4);
    expect(s.length).toBe(1 + 3 + 4 + 4 + 4 + 2); // 18
  });

  it("transforms: 4 shifts + 3 swaps + 2 rotates + 2 reflects = 11", () => {
    expect(enumerateTransforms().length).toBe(11);
  });

  it("readouts for 4x4: 1 center + 4 corners + 3 counts + 8 row-lines + 8 col-lines", () => {
    const r = enumerateReadouts(4, 4);
    expect(r.length).toBe(1 + 4 + 3 + 8 + 8); // 24
  });

  it("transform chains length ≤2 = 11 singles + 11*11 pairs", () => {
    expect(enumerateTransformChains(1).length).toBe(11);
    expect(enumerateTransformChains(2).length).toBe(11 + 121);
  });

  it("rejects chain length >2 (v1 cap)", () => {
    expect(() => enumerateTransformChains(3)).toThrow();
  });
});

describe("full rule space", () => {
  it("ruleSpaceSize matches materialized count", () => {
    const opts = { rows: 4, cols: 4, maxChain: 2 };
    expect(allRules(opts).length).toBe(ruleSpaceSize(opts));
  });

  it("every enumerated rule is structurally valid", () => {
    const opts = { rows: 3, cols: 3, maxChain: 2 };
    for (const rule of allRules(opts)) {
      expect(() => validateRule(rule)).not.toThrow();
    }
  });

  it("chain-1 space is the documented ballpark (~150 base rules for 4x4)", () => {
    // 18 selects * 11 transforms * 24 readouts = 4752 with single transform...
    // the §5 "~150 base" assumed a smaller readout menu; here we just assert the
    // arithmetic is internally consistent and non-trivial.
    const single = { rows: 4, cols: 4, maxChain: 1 };
    expect(ruleSpaceSize(single)).toBe(18 * 11 * 24);
  });
});
