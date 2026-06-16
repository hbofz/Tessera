import { describe, it, expect } from "vitest";
import { Prng, hashSeed } from "./prng.js";

describe("Prng determinism", () => {
  it("same seed+tick produces the identical stream", () => {
    const a = Prng.fromSeed("seed-A", 7);
    const b = Prng.fromSeed("seed-A", 7);
    const seqA = Array.from({ length: 20 }, () => a.nextInt(1000));
    const seqB = Array.from({ length: 20 }, () => b.nextInt(1000));
    expect(seqA).toEqual(seqB);
  });

  it("different tick diverges", () => {
    const a = Prng.fromSeed("seed-A", 7);
    const b = Prng.fromSeed("seed-A", 8);
    const seqA = Array.from({ length: 10 }, () => a.nextInt(1000));
    const seqB = Array.from({ length: 10 }, () => b.nextInt(1000));
    expect(seqA).not.toEqual(seqB);
  });

  it("different seed diverges", () => {
    const a = Prng.fromSeed("seed-A", 7);
    const b = Prng.fromSeed("seed-B", 7);
    expect(a.nextInt(1_000_000)).not.toBe(b.nextInt(1_000_000));
  });

  it("hashSeed folds seed and tick distinctly", () => {
    expect(hashSeed("x", 1)).not.toBe(hashSeed("x", 2));
    expect(hashSeed("x", 1)).not.toBe(hashSeed("y", 1));
    expect(hashSeed("x", 1)).toBe(hashSeed("x", 1));
  });
});

describe("Prng distribution sanity", () => {
  it("nextInt stays in range and covers the range", () => {
    const p = Prng.fromSeed("dist", 0);
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) {
      const v = p.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      counts[v]++;
    }
    // Each bucket should be roughly 1000 (±40%); just a smoke test for gross bias.
    for (const c of counts) {
      expect(c).toBeGreaterThan(600);
      expect(c).toBeLessThan(1400);
    }
  });

  it("nextFloat in [0,1)", () => {
    const p = Prng.fromSeed("f", 0);
    for (let i = 0; i < 1000; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt rejects bad bounds", () => {
    const p = Prng.fromSeed("b", 0);
    expect(() => p.nextInt(0)).toThrow();
    expect(() => p.nextInt(-1)).toThrow();
    expect(() => p.nextInt(1.5)).toThrow();
  });
});
