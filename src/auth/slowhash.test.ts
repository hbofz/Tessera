import { describe, it, expect } from "vitest";
import { ScryptSlowHash, digestsEqual } from "./slowhash.js";

describe("ScryptSlowHash", () => {
  it("is deterministic for the same input + salt", () => {
    const h = new ScryptSlowHash();
    const salt = "00112233445566778899aabbccddeeff";
    expect(h.hash("hello", salt)).toBe(h.hash("hello", salt));
  });

  it("differs for different input or different salt", () => {
    const h = new ScryptSlowHash();
    const s1 = "00112233445566778899aabbccddeeff";
    const s2 = "ffeeddccbbaa99887766554433221100";
    expect(h.hash("a", s1)).not.toBe(h.hash("b", s1));
    expect(h.hash("a", s1)).not.toBe(h.hash("a", s2));
  });

  it("newSalt yields distinct hex salts", () => {
    const h = new ScryptSlowHash();
    const a = h.newSalt();
    const b = h.newSalt();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
});

describe("digestsEqual", () => {
  it("true for identical hex, false for different", () => {
    expect(digestsEqual("deadbeef", "deadbeef")).toBe(true);
    expect(digestsEqual("deadbeef", "deadbee0")).toBe(false);
  });

  it("false on length mismatch", () => {
    expect(digestsEqual("dead", "deadbeef")).toBe(false);
  });

  it("rejects non-hex input instead of silently matching (fail closed)", () => {
    // The danger: Buffer.from(non-hex, 'hex') drops invalid chars. These two
    // distinct non-hex strings must NOT be considered equal.
    expect(digestsEqual("zz", "qq")).toBe(false);
    expect(digestsEqual("h:salt:ruleA", "h:salt:ruleB")).toBe(false);
    // Even an identical non-hex string is rejected (not a valid digest).
    expect(digestsEqual("nothex!!", "nothex!!")).toBe(false);
  });

  it("rejects odd-length hex", () => {
    expect(digestsEqual("abc", "abc")).toBe(false);
  });
});
