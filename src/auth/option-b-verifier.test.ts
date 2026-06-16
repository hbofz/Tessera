import { describe, it, expect } from "vitest";
import { OptionBVerifier, OPTION_B_KIND } from "./option-b-verifier.js";
import { canonicalRule } from "./canonical.js";
import type { SlowHash } from "./slowhash.js";
import { ScryptSlowHash } from "./slowhash.js";
import { gridAtTick, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { EnumerateOptions } from "../engine/enumerate.js";
import type { Answer, Rule } from "../engine/types.js";
import {
  attemptLogin,
  newLoginState,
  type Enrollment,
} from "./login.js";

// A FAST, deterministic stand-in for the slow hash so tests don't pay scrypt
// cost. It must honor the SlowHash contract: deterministic given (input, salt)
// AND return a fixed-length HEX digest (digestsEqual compares hex). We use a
// simple FNV-1a folded to 32 hex chars — collision-resistant enough for tests.
function fastHash(): SlowHash {
  const fnvHex = (s: string): string => {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // 8 hex chars from the 32-bit hash, repeated to a stable 32-char digest.
    const eight = h.toString(16).padStart(8, "0");
    return (eight + eight + eight + eight).slice(0, 32);
  };
  return {
    hash: (input, salt) => fnvHex(`${salt}|${input}`),
    newSalt: () => "fixedsalt00000000",
  };
}

const ENUM: EnumerateOptions = { rows: 4, cols: 4, maxChain: 1 };

const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

describe("OptionBVerifier — never stores R (§9.2)", () => {
  it("the credential contains a hash + salt but NOT the rule", () => {
    const v = new OptionBVerifier(ENUM, fastHash());
    const cred = v.enroll(RULE);
    expect(cred.kind).toBe(OPTION_B_KIND);
    const serialized = JSON.stringify(cred);
    // The canonical rule string must not appear anywhere in what's stored.
    expect(serialized).not.toContain(canonicalRule(RULE));
    // And there's no `rule` field.
    expect(serialized).not.toMatch(/"rule"/);
    // Spot-check the raw select value isn't leaked as a stored field.
    const payload = cred.payload as { hash: string; salt: string };
    expect(payload.hash).toBeTruthy();
    expect(payload.salt).toBeTruthy();
  });
});

describe("OptionBVerifier — verification", () => {
  it("accepts the correct answer and rejects a wrong one", () => {
    const v = new OptionBVerifier(ENUM, fastHash());
    const cred = v.enroll(RULE);
    const grid = gridAtTick("s", 0);
    const correct = applyRule(grid, RULE);

    expect(v.verify(cred, grid, correct, 0)).toBe(true);

    const wrong: Answer = {
      kind: "count",
      value: correct.kind === "count" ? correct.value + 1 : 99,
    };
    expect(v.verify(cred, grid, wrong, 0)).toBe(false);
  });

  it("throws on a credential kind it doesn't own", () => {
    const v = new OptionBVerifier(ENUM, fastHash());
    expect(() => v.verify({ kind: "option-a", payload: {} }, gridAtTick("s", 0), { kind: "count", value: 0 }, 0)).toThrow(
      /cannot verify/,
    );
  });

  it("zero-knowledge property: the enrolled rule passes via enumeration without the verifier holding R", () => {
    // The verifier only has the hash; it re-derives candidates from the public
    // menu + grid and confirms one hashes to the stored value. We assert it
    // passes for the true rule across several fresh grids.
    const v = new OptionBVerifier(ENUM, fastHash());
    const cred = v.enroll(RULE);
    for (let t = 0; t < 5; t++) {
      const grid = gridAtTick("zk", t);
      const a = applyRule(grid, RULE);
      expect(v.verify(cred, grid, a, t)).toBe(true);
    }
  });
});

describe("OptionBVerifier — drop-in for the login flow (§6 seam)", () => {
  it("attemptLogin works unchanged with the Option B verifier", () => {
    const v = new OptionBVerifier(ENUM, fastHash());
    const enrollment: Enrollment = {
      credential: v.enroll(RULE),
      seed: "login-b",
      params: DEFAULT_PARAMS,
    };
    const state = newLoginState();

    // Honest answer for the tick the clock will floor to.
    const periodMs = DEFAULT_PARAMS.periodSeconds * 1000;
    const tick = 12;
    const now = (tick + 0.5) * periodMs;
    const grid = gridAtTick("login-b", tick, DEFAULT_PARAMS);
    const answer = applyRule(grid, RULE);

    const out = attemptLogin(enrollment, state, v, answer, now);
    expect(out.result).toBe("pass");
  });
});

describe("OptionBVerifier — real scrypt smoke test", () => {
  it("enrolls and verifies with the actual slow hash", () => {
    // One real-scrypt round-trip to prove the default path works end to end.
    const v = new OptionBVerifier(ENUM, new ScryptSlowHash());
    const cred = v.enroll(RULE);
    const grid = gridAtTick("scrypt", 3);
    const a = applyRule(grid, RULE);
    expect(v.verify(cred, grid, a, 3)).toBe(true);
  }, 20000);
});
