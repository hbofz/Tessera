import { describe, it, expect } from "vitest";
import {
  gridAtTick,
  gridAtTime,
  tickForTime,
  graceTicks,
  defaultAccept,
  DEFAULT_PARAMS,
  type GridParams,
} from "./clock.js";
import { formatGrid } from "./grid.js";
import { EMPTY, type Color } from "./types.js";

describe("grid clock determinism (phone == server)", () => {
  it("same seed+tick+params yields byte-identical grids", () => {
    const phone = gridAtTick("shared-seed", 42);
    const server = gridAtTick("shared-seed", 42);
    expect(formatGrid(phone)).toBe(formatGrid(server));
  });

  it("consecutive ticks differ (the grid actually rolls)", () => {
    const a = formatGrid(gridAtTick("s", 100));
    const b = formatGrid(gridAtTick("s", 101));
    expect(a).not.toBe(b);
  });

  it("different seeds yield different grids at the same tick", () => {
    const a = formatGrid(gridAtTick("seed-1", 0));
    const b = formatGrid(gridAtTick("seed-2", 0));
    expect(a).not.toBe(b);
  });

  it("respects requested dimensions", () => {
    const params: GridParams = { rows: 5, cols: 3, periodSeconds: 30, emptyDensity: 0.3 };
    const g = gridAtTick("s", 0, params);
    expect(g.rows).toBe(5);
    expect(g.cols).toBe(3);
  });
});

describe("degenerate-grid rejection (§12)", () => {
  it("default acceptance produces grids with ≥2 colors and not all-empty", () => {
    // Sweep many ticks; every produced grid must pass the structural checks.
    const accept = defaultAccept(DEFAULT_PARAMS);
    for (let t = 0; t < 200; t++) {
      const g = gridAtTick("variety", t);
      expect(accept(g)).toBe(true);
      const colors = new Set<Color>();
      let empties = 0;
      for (const row of g.cells) {
        for (const cell of row) {
          if (cell === EMPTY) empties++;
          else colors.add(cell);
        }
      }
      expect(colors.size).toBeGreaterThanOrEqual(2);
      expect(empties).toBeLessThan(DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols);
    }
  });

  it("a custom rule-aware predicate is honored", () => {
    // Pretend a predicate rejects any grid whose top-left is empty. The clock
    // must return a grid satisfying it (when satisfiable).
    const accept = (g: ReturnType<typeof gridAtTick>) => g.cells[0]![0] !== EMPTY;
    for (let t = 0; t < 50; t++) {
      const g = gridAtTick("custom", t, DEFAULT_PARAMS, accept);
      expect(g.cells[0]![0]).not.toBe(EMPTY);
    }
  });

  it("acceptance is deterministic: same inputs converge on the same accepted grid", () => {
    const accept = (g: ReturnType<typeof gridAtTick>) => g.cells[0]![0] !== EMPTY;
    const a = formatGrid(gridAtTick("conv", 5, DEFAULT_PARAMS, accept));
    const b = formatGrid(gridAtTick("conv", 5, DEFAULT_PARAMS, accept));
    expect(a).toBe(b);
  });

  it("returns best-effort grid when predicate is unsatisfiable instead of hanging", () => {
    const never = () => false;
    const g = gridAtTick("nope", 0, DEFAULT_PARAMS, never, 8);
    expect(g.rows).toBe(DEFAULT_PARAMS.rows); // got *a* grid, no infinite loop
  });
});

describe("ticking & grace window", () => {
  it("tickForTime floors by period", () => {
    const params: GridParams = { ...DEFAULT_PARAMS, periodSeconds: 30 };
    expect(tickForTime(0, params)).toBe(0);
    expect(tickForTime(29_999, params)).toBe(0);
    expect(tickForTime(30_000, params)).toBe(1);
    expect(tickForTime(61_000, params)).toBe(2);
  });

  it("gridAtTime matches gridAtTick at the floored tick", () => {
    const params: GridParams = { ...DEFAULT_PARAMS, periodSeconds: 30 };
    const t = tickForTime(95_000, params); // -> 3
    expect(formatGrid(gridAtTime("s", 95_000, params))).toBe(formatGrid(gridAtTick("s", t, params)));
  });

  it("graceTicks gives [t-1, t, t+1]", () => {
    expect(graceTicks(10)).toEqual([9, 10, 11]);
  });
});
