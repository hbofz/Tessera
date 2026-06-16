import { describe, it, expect } from "vitest";
import {
  blindGuessResistance,
  observationsToCrack,
  strengthReport,
  answerKey,
} from "./strength.js";
import { gridAtTick, DEFAULT_PARAMS } from "./clock.js";
import type { Grid, Rule } from "./types.js";
import type { GridSampler } from "./strength.js";

// A deterministic sampler that walks the grid clock tick by tick — gives the
// meter a reproducible "public grid distribution" so these tests are stable.
function clockSampler(seed: string): GridSampler {
  let tick = 0;
  return () => gridAtTick(seed, tick++);
}

const ENUM = { rows: 4, cols: 4, maxChain: 1 };

describe("answerKey", () => {
  it("is stable and distinguishes kinds", () => {
    expect(answerKey({ kind: "cell", value: "R" })).toBe("c:R");
    expect(answerKey({ kind: "count", value: 3 })).toBe("n:3");
    expect(answerKey({ kind: "line", value: ["R", "_", "G"] })).toBe("l:R_G");
    expect(answerKey({ kind: "cell", value: "R" })).not.toBe(answerKey({ kind: "count", value: 3 }));
  });
});

describe("Metric 1 — blind-guess resistance (§7)", () => {
  it("a single-cell readout has LESS entropy than a line readout", () => {
    // Two independent samplers walking the same clock stream so each rule sees
    // the same grid distribution.
    const s1 = clockSampler("entropyA");
    const cellRule: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "right" }],
      readout: { type: "cell", target: { kind: "center" } },
    };
    const s2 = clockSampler("entropyA");
    const lineRule: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "right" }],
      readout: { type: "line", which: { kind: "row", index: 3 }, order: "ltr" },
    };
    const cell = blindGuessResistance(cellRule, s1, 2000);
    const line = blindGuessResistance(lineRule, s2, 2000);
    expect(line.bits).toBeGreaterThan(cell.bits);
  });

  it("effective entropy never exceeds the raw answer-space bound for one cell", () => {
    // one cell over {R,G,B,empty} ≤ log2(4) = 2 bits.
    const r: Rule = {
      select: { type: "all" },
      transforms: [{ type: "reflect", axis: "h" }],
      readout: { type: "cell", target: { kind: "corner", which: "tl" } },
    };
    const res = blindGuessResistance(r, clockSampler("bound"), 3000);
    expect(res.bits).toBeLessThanOrEqual(2 + 1e-9);
    expect(res.distinctAnswers).toBeLessThanOrEqual(4);
  });

  it("optimalGuessProb is the largest single-answer probability", () => {
    const r: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "up" }],
      readout: { type: "cell", target: { kind: "center" } },
    };
    const res = blindGuessResistance(r, clockSampler("p"), 2000);
    expect(res.optimalGuessProb).toBeGreaterThan(0);
    expect(res.optimalGuessProb).toBeLessThanOrEqual(1);
  });
});

describe("Metric 2 — observations-to-crack (§7)", () => {
  it("a RICHER readout (line) cracks the rule in FEWER observations than a sparse one (cell)", () => {
    // §7 tradeoff: a richer readout leaks more bits/observation → faster rule
    // inference. This is the load-bearing property of the scalar readout.
    const lineRule: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "right" }],
      readout: { type: "line", which: { kind: "row", index: 0 }, order: "ltr" },
    };
    const cellRule: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "right" }],
      readout: { type: "cell", target: { kind: "center" } },
    };
    const line = observationsToCrack(lineRule, ENUM, clockSampler("obsL"), { trials: 60 });
    const cell = observationsToCrack(cellRule, ENUM, clockSampler("obsC"), { trials: 60 });
    expect(line.median).toBeLessThanOrEqual(cell.median);
  });

  it("reports a low percentile no greater than the median", () => {
    const r: Rule = {
      select: { type: "color", value: "R" },
      transforms: [{ type: "shift", dir: "down" }],
      readout: { type: "count", color: "R" },
    };
    const res = observationsToCrack(r, ENUM, clockSampler("pct"), { trials: 80, lowPercentileP: 0.1 });
    expect(res.lowPercentile).toBeLessThanOrEqual(res.median);
    expect(res.ruleSpaceSize).toBe(18 * 11 * 24);
  });

  it("is deterministic given a deterministic sampler", () => {
    const r: Rule = {
      select: { type: "all" },
      transforms: [{ type: "reflect", axis: "v" }],
      readout: { type: "count", color: "G" },
    };
    const a = observationsToCrack(r, ENUM, clockSampler("det"), { trials: 30 });
    const b = observationsToCrack(r, ENUM, clockSampler("det"), { trials: 30 });
    expect(a.median).toBe(b.median);
    expect(a.lowPercentile).toBe(b.lowPercentile);
  });
});

describe("strengthReport (combined, §7/§8)", () => {
  it("returns both metrics and the approximate flag", () => {
    const r: Rule = {
      select: { type: "all" },
      transforms: [{ type: "shift", dir: "right" }],
      readout: { type: "count", color: "R" },
    };
    const rep = strengthReport(r, ENUM, clockSampler("rep"), { blindSamples: 1000, trials: 40 });
    expect(rep.approximate).toBe(true);
    expect(rep.blindGuess.bits).toBeGreaterThanOrEqual(0);
    expect(rep.observations.median).toBeGreaterThanOrEqual(1);
    expect(rep.ruleSpaceSize).toBeGreaterThan(0);
  });
});
