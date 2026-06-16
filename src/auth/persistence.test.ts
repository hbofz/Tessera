import { describe, it, expect } from "vitest";
import { saveEnrollment, loadEnrollment, clearEnrollment, type KeyValueStore } from "./persistence.js";
import { OptionAVerifier, recoverOptionARule } from "./verifier.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import type { Enrollment } from "./login.js";
import type { Rule } from "../engine/types.js";

const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

/** A simple in-memory KeyValueStore for tests. */
function memStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function makeEnrollment(): Enrollment {
  return {
    credential: new OptionAVerifier().enroll(RULE),
    seed: "s",
    params: DEFAULT_PARAMS,
    readoutShape: { kind: "count", max: 16 },
  };
}

describe("enrollment persistence", () => {
  it("round-trips an enrollment through the store", () => {
    const store = memStore();
    const e = makeEnrollment();
    saveEnrollment(e, store);
    const loaded = loadEnrollment(store);
    expect(loaded).toEqual(e);
  });

  it("returns null when nothing is stored", () => {
    expect(loadEnrollment(memStore())).toBeNull();
  });

  it("clear removes the enrollment", () => {
    const store = memStore();
    saveEnrollment(makeEnrollment(), store);
    clearEnrollment(store);
    expect(loadEnrollment(store)).toBeNull();
  });

  it("ignores a corrupt entry", () => {
    const store = memStore();
    store.setItem("tessera.enrollment.v1", "{not json");
    expect(loadEnrollment(store)).toBeNull();
  });

  it("ignores an unknown version", () => {
    const store = memStore();
    store.setItem("tessera.enrollment.v1", JSON.stringify({ version: 99, enrollment: makeEnrollment() }));
    expect(loadEnrollment(store)).toBeNull();
  });

  it("degrades silently when no store is available", () => {
    expect(() => saveEnrollment(makeEnrollment(), null)).not.toThrow();
    expect(loadEnrollment(null)).toBeNull();
  });

  it("a restored Option A credential still yields the original rule", () => {
    const store = memStore();
    const e = makeEnrollment();
    saveEnrollment(e, store);
    const loaded = loadEnrollment(store)!;
    expect(recoverOptionARule(loaded.credential)).toEqual(RULE);
  });

  it("recoverOptionARule returns null for a non-Option-A credential", () => {
    expect(recoverOptionARule({ kind: "option-b-future", payload: {} })).toBeNull();
  });
});
