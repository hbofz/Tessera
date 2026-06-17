/**
 * Browser client for the Tessera backend (Supabase).
 *
 * Wraps the four verify Edge Function actions + the Realtime subscription the
 * laptop uses to learn its login result live. Everything here uses the PUBLIC
 * anon key; real security lives in RLS + the Edge Function (DESIGN.md §6).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Answer, Rule } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import type { ReadoutShape } from "../engine/readout-shape.js";
import type { Credential } from "../auth/verifier.js";
import type { Grid } from "../engine/types.js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Is the Supabase backend configured? The two-device flow needs `.env`; the solo
 * sandbox does NOT. Importing this module must therefore NEVER throw when env is
 * missing — otherwise solo mode (and the whole app) crashes on a fresh checkout.
 * The UI calls this to gate the two-device modes instead of crashing.
 */
export function isBackendConfigured(): boolean {
  return Boolean(URL && ANON && !URL.includes("YOUR-PROJECT-REF"));
}

// The client is created LAZILY on first use (not at module load), so a missing
// `.env` can't crash import-time. Solo mode never calls anything that touches it.
let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!isBackendConfigured()) {
    throw new BackendNotConfiguredError();
  }
  if (!_client) _client = createClient(URL!, ANON!);
  return _client;
}

/** Back-compat export: a lazy proxy so existing `supabase.channel(...)` calls
 *  keep working, but the underlying client is still created on first access. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? v.bind(c) : v;
  },
});

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("The two-device flow needs the Supabase backend. Copy .env.example to .env and add your project's URL + anon key.");
    this.name = "BackendNotConfiguredError";
  }
}

/** Map a raw error into a calm, user-facing message (details still logged). */
export function friendlyError(e: unknown): string {
  if (e instanceof BackendNotConfiguredError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/rate.?limit/i.test(raw)) return "Too many attempts — wait a moment and try again.";
  if (/not found|404/i.test(raw)) return "That code wasn't found. Double-check it and try again.";
  if (/expired/i.test(raw)) return "This login expired. Start a new one.";
  return raw;
}

async function callFn<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  if (!isBackendConfigured()) throw new BackendNotConfiguredError();
  const res = await fetch(`${URL}/functions/v1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON!, Authorization: `Bearer ${ANON!}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `request failed (${res.status})`);
  return body as T;
}

// --- enroll (phone) ---
export interface EnrollArgs {
  deviceId: string;
  credential: Credential;
  seed: string;
  params: GridParams;
  readoutShape: ReadoutShape;
}
export function enrollDevice(args: EnrollArgs): Promise<{ ok: true }> {
  return callFn("enroll", args as unknown as Record<string, unknown>);
}

// --- start-login (laptop) ---
export function startLogin(): Promise<{ sessionId: string; pairCode: string }> {
  return callFn("start-login", {});
}

// --- claim (phone) ---
export interface ClaimResult {
  grid: Grid;
  readoutShape: ReadoutShape;
  tick: number;
}
export function claimSession(pairCode: string, deviceId: string): Promise<ClaimResult> {
  return callFn("claim", { pairCode, deviceId });
}

// --- submit (phone) ---
export function submitAnswer(pairCode: string, answer: Answer): Promise<{ result: "pass" | "fail"; reason?: string }> {
  return callFn("submit", { pairCode, answer });
}

// --- Realtime: laptop watches its session row for the result ---
export type SessionStatus = "pending" | "claimed" | "passed" | "failed" | "expired";

export function watchSession(sessionId: string, onStatus: (status: SessionStatus) => void): () => void {
  const sb = client();
  const channel = sb
    .channel(`session-${sessionId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "login_sessions", filter: `id=eq.${sessionId}` },
      (payload) => {
        const status = (payload.new as { status: SessionStatus }).status;
        onStatus(status);
      },
    )
    .subscribe();
  return () => void sb.removeChannel(channel);
}

// --- a stable per-device id (the phone is "this browser/device") ---
const DEVICE_KEY = "tessera.deviceId";

/**
 * A random id that works in INSECURE contexts too. crypto.randomUUID() is only
 * available on secure origins (https / localhost) — on a phone hitting the dev
 * server over plain http://<ip> it's undefined and throws, crashing the page.
 * We fall back to getRandomValues, then to a time+counter scheme; uniqueness is
 * all we need here (this id isn't a secret). */
function randomId(): string {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "dev-" + randomId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** The grid seed for a device — stable per device, public (§10). */
export function seedForDevice(deviceId: string): string {
  return `tessera-seed-${deviceId}`;
}
