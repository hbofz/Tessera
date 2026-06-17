/**
 * Tessera backend — the verify Edge Function (DESIGN.md §6, §10).
 *
 * Runs server-side in Deno. One function, routed by `action`:
 *   - enroll      : phone stores its Option B verifier (never the rule, §9.2)
 *   - start-login : laptop opens a login session, gets a pair code
 *   - claim       : phone claims a session by pair code, gets the challenge grid
 *   - submit      : phone sends the answer; we VERIFY here and mark the session
 *                   passed/failed. This is the only place the verify decision is
 *                   made — clients can't self-pass.
 *
 * NO PEPPER (decided): the phone computes its own hash and the rule R NEVER
 * touches the server — the purest form of the promise (§2). The hash here must
 * therefore match the phone's: plain SHA-256, no server-side key. The tradeoff
 * (a stolen DB is brute-forceable) is accepted and mitigated by rate-limiting +
 * the rule-space size (§6 "cost of B"). A peppered variant would require R in
 * server RAM at enroll (Option B2) — see git history for that fork.
 *
 * Verification uses the SAME engine as the app (synced into _shared/engine via
 * `npm run sync:edge`), so there is exactly one rule engine, never two.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { gridAtTick, type GridParams } from "../_shared/engine/clock.ts";
import { OptionBVerifier } from "../_shared/engine/option-b-verifier.ts";
import { Sha256VerifyHash } from "../_shared/engine/verifyhash.ts";
import type { EnumerateOptions } from "../_shared/engine/enumerate.ts";
import type { Answer } from "../_shared/engine/types.ts";
import type { Credential } from "../_shared/engine/verifier.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Service-role client: bypasses RLS so we can read the verifier + write the
// verify decision. The service key never leaves the function.
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const enumerateFor = (params: { rows: number; cols: number }): EnumerateOptions => ({
  rows: params.rows,
  cols: params.cols,
  maxChain: 2,
});

/** A short, human-typeable pair code (6 chars, no ambiguous 0/O/1/I/L). */
function pairCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const action = body.action as string;

  try {
    switch (action) {
      case "enroll":
        return await enroll(body);
      case "start-login":
        return await startLogin();
      case "claim":
        return await claim(body);
      case "submit":
        return await submit(body);
      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

// ── enroll ───────────────────────────────────────────────────────────────────
async function enroll(body: Record<string, unknown>): Promise<Response> {
  const { deviceId, credential, seed, params, readoutShape } = body as {
    deviceId: string;
    credential: Credential;
    seed: string;
    params: GridParams;
    readoutShape: unknown;
  };
  if (!deviceId || !credential || !seed || !params) return json({ error: "missing fields" }, 400);

  const { error } = await admin.from("enrollments").upsert({
    device_id: deviceId,
    credential,
    seed,
    params,
    readout_shape: readoutShape,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}

// ── start-login (laptop) ──────────────────────────────────────────────────────
async function startLogin(): Promise<Response> {
  const code = pairCode();
  const { data, error } = await admin
    .from("login_sessions")
    .insert({ pair_code: code, status: "pending" })
    .select("id, pair_code")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ sessionId: data.id, pairCode: data.pair_code });
}

// ── claim (phone) ─────────────────────────────────────────────────────────────
async function claim(body: Record<string, unknown>): Promise<Response> {
  const { pairCode: code, deviceId } = body as { pairCode: string; deviceId: string };
  if (!code || !deviceId) return json({ error: "missing fields" }, 400);

  // The challenge tick is "now" on the server clock — both sides derive the grid
  // from (seed, tick), so the phone renders the same grid we verify against.
  const enr = await admin.from("enrollments").select("seed, params, readout_shape").eq("device_id", deviceId).single();
  if (enr.error || !enr.data) return json({ error: "device not enrolled" }, 404);

  const params = enr.data.params as GridParams;
  const tick = Math.floor(Date.now() / 1000 / params.periodSeconds);

  const upd = await admin
    .from("login_sessions")
    .update({ device_id: deviceId, status: "claimed", tick })
    .eq("pair_code", code)
    .eq("status", "pending")
    .select("id")
    .single();
  if (upd.error || !upd.data) return json({ error: "session not found or already claimed" }, 404);

  const grid = gridAtTick(enr.data.seed, tick, params);
  return json({ grid, readoutShape: enr.data.readout_shape, tick });
}

// ── submit (phone) — THE VERIFY ───────────────────────────────────────────────
async function submit(body: Record<string, unknown>): Promise<Response> {
  const { pairCode: code, answer } = body as { pairCode: string; answer: Answer };
  if (!code || !answer) return json({ error: "missing fields" }, 400);

  const sess = await admin
    .from("login_sessions")
    .select("id, device_id, tick, status, expires_at")
    .eq("pair_code", code)
    .single();
  if (sess.error || !sess.data) return json({ error: "session not found" }, 404);
  if (sess.data.status !== "claimed") return json({ error: "session not claimed" }, 409);
  if (new Date(sess.data.expires_at).getTime() < Date.now()) {
    await admin.from("login_sessions").update({ status: "expired" }).eq("id", sess.data.id);
    return json({ result: "fail", reason: "expired" });
  }

  const deviceId = sess.data.device_id as string;

  // Rate limit BEFORE verifying (§6): the answer space is small, so an attacker
  // could otherwise spin up sessions and guess until one matches. Count recent
  // attempts for this device; refuse once the window is full. Throttling here
  // (not just per-session) is what closes cross-session brute force.
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await admin
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", windowStart);
  if ((recent.count ?? 0) >= RATE_MAX_ATTEMPTS) {
    await admin.from("login_sessions").update({ status: "failed" }).eq("id", sess.data.id);
    return json({ result: "fail", reason: "rate-limited" });
  }

  const enr = await admin
    .from("enrollments")
    .select("credential, seed, params")
    .eq("device_id", deviceId)
    .single();
  if (enr.error || !enr.data) return json({ error: "enrollment missing" }, 404);

  const params = enr.data.params as GridParams;
  const tick = Number(sess.data.tick);
  const grid = gridAtTick(enr.data.seed, tick, params);

  // Plain SHA-256 (no pepper) so this matches the hash the phone computed at
  // enroll — R never reached the server, so we can't re-key it here.
  const verifier = new OptionBVerifier(enumerateFor(params), new Sha256VerifyHash());
  const pass = verifier.verify(enr.data.credential as Credential, grid, answer, tick);

  // Record the attempt (for the rate limiter) and resolve the session. Only the
  // server writes 'passed'/'failed' — a client can't self-authenticate.
  await admin.from("auth_attempts").insert({ device_id: deviceId, ok: pass });
  await admin.from("login_sessions").update({ status: pass ? "passed" : "failed" }).eq("id", sess.data.id);
  return json({ result: pass ? "pass" : "fail" });
}

// Rate-limit window: a human needs only a handful of tries; this is brutal for a
// bruteforcer against the small answer space (§6).
const RATE_MAX_ATTEMPTS = 8;
const RATE_WINDOW_MS = 60_000;
