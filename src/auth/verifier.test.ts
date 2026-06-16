import { describe, it, expect } from "vitest";
import { OptionAVerifier, OPTION_A_KIND } from "./verifier.js";
import { gridAtTick } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

describe("OptionAVerifier", () => {
  it("stamps its kind on enrolled credentials", () => {
    const v = new OptionAVerifier();
    const cred = v.enroll(RULE);
    expect(cred.kind).toBe(OPTION_A_KIND);
  });

  it("verifies the correct answer for a grid and rejects a wrong one", () => {
    const v = new OptionAVerifier();
    const cred = v.enroll(RULE);
    const grid = gridAtTick("seed", 0);
    const correct = applyRule(grid, RULE);

    expect(v.verify(cred, grid, correct, 0)).toBe(true);

    const wrong = { kind: "count", value: correct.kind === "count" ? correct.value + 1 : 99 } as const;
    expect(v.verify(cred, grid, wrong, 0)).toBe(false);
  });

  it("returns only a boolean — never the expected answer or R (§9.1)", () => {
    const v = new OptionAVerifier();
    const cred = v.enroll(RULE);
    const grid = gridAtTick("seed", 3);
    const out = v.verify(cred, grid, { kind: "count", value: 0 }, 3);
    expect(typeof out).toBe("boolean");
  });

  it("throws on a credential kind it doesn't own", () => {
    const v = new OptionAVerifier();
    const foreign = { kind: "option-b-future", payload: {} };
    expect(() => v.verify(foreign, gridAtTick("s", 0), { kind: "count", value: 0 }, 0)).toThrow(
      /cannot verify/,
    );
  });
});
