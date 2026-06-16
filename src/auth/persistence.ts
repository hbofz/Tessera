/**
 * Enrollment persistence (so a move survives a page refresh).
 *
 * Stores the Enrollment (credential + seed + params) in localStorage. The
 * Credential is opaque and JSON-serializable by design (the §6 seam), so this
 * needs no knowledge of which verifier produced it — Option A or a future
 * Option B persist identically through this module.
 *
 * ⚠️ OPTION A CAVEAT (DESIGN.md §6): under the Option A verifier the credential
 * embeds the RAW rule, so persisting it writes the move to localStorage in the
 * clear. This is the Option A tradeoff ("a server breach leaks the move"),
 * localized to the browser — a labeled v1 shortcut, NOT the destination. When
 * the Option B verifier lands, its credential stores slow_hash(R, salt) instead,
 * and this same module persists that safely with no change here.
 */

import type { Enrollment } from "./login.js";

const STORAGE_KEY = "tessera.enrollment.v1";

/** Versioned envelope so the schema can evolve without misreading old data. */
interface StoredEnvelope {
  readonly version: 1;
  readonly enrollment: Enrollment;
}

/** Minimal storage interface — defaults to window.localStorage but injectable
 *  for tests / non-browser contexts. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // localStorage can throw in some privacy modes — treat as unavailable.
  }
  return null;
}

export function saveEnrollment(enrollment: Enrollment, store: KeyValueStore | null = defaultStore()): void {
  if (!store) return; // no storage available — silently degrade to in-memory
  const envelope: StoredEnvelope = { version: 1, enrollment };
  store.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

/** Load a previously saved enrollment, or null if none / unreadable. */
export function loadEnrollment(store: KeyValueStore | null = defaultStore()): Enrollment | null {
  if (!store) return null;
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed.version !== 1 || !parsed.enrollment) return null;
    return parsed.enrollment;
  } catch {
    return null; // corrupt entry — treat as no enrollment
  }
}

export function clearEnrollment(store: KeyValueStore | null = defaultStore()): void {
  store?.removeItem(STORAGE_KEY);
}
