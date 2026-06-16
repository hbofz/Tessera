/**
 * Canonical serialization of a Rule (DESIGN.md §6).
 *
 * The Option B verifier hashes the rule, so the SAME rule must always produce
 * the SAME bytes — independent of object key order or how it was constructed.
 * JSON.stringify does NOT guarantee key order, so we serialize with sorted keys.
 *
 * This canonical form is also what makes the enumerable menu (§9.4) comparable:
 * two encodings are the same rule iff their canonical strings match.
 */

import type { Rule } from "../engine/types.js";

/** Deterministic JSON with recursively sorted object keys. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}

/**
 * The canonical string form of a rule — the input to the slow hash (§6).
 *
 * SOUNDNESS NOTE: collision-freedom here relies on Rule fields being enums,
 * fixed keys, and numbers (never free-form user strings). Values are emitted via
 * JSON.stringify (correct escaping), and keys are fixed identifiers, so two
 * different rules cannot canonicalize to the same string. If the rule vocabulary
 * ever gains an arbitrary-string field, revisit this — a value containing the
 * structural delimiters could otherwise create an ambiguous encoding. (The §9.4
 * finite-menu invariant keeps fields enumerable, which is what protects this.)
 */
export function canonicalRule(rule: Rule): string {
  return canonicalJson(rule);
}
