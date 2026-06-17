/**
 * End-to-end smoke test of the live Tessera backend (enroll → login → verify).
 * Run with: node scripts/e2e-backend.mjs
 *
 * Uses the REAL deployed Edge Function + cloud DB. Computes the honest answer
 * locally with the same engine, then drives the four actions and asserts a PASS,
 * plus a wrong answer asserts a FAIL.
 */

import { gridAtTick, DEFAULT_PARAMS } from "../src/engine/clock.ts";
import { applyRule, answersEqual } from "../src/engine/rule.ts";
import { readoutShape } from "../src/engine/readout-shape.ts";
import { OptionBVerifier } from "../src/auth/option-b-verifier.ts";

const URL = "https://mpzoumtvokdpkftftdib.supabase.co/functions/v1/verify";
const ANON = process.env.ANON_KEY;
if (!ANON) throw new Error("set ANON_KEY env var");

const call = async (action, extra) => {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ action, ...extra }),
  });
  const body = await res.json();
  return { status: res.status, body };
};

const RULE = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};
const deviceId = "e2e-" + Math.random().toString(36).slice(2, 10);
const seed = "e2e-seed-" + deviceId;
const params = DEFAULT_PARAMS;

// 1. Enroll (phone computes its own credential — R never sent).
const verifier = new OptionBVerifier({ rows: params.rows, cols: params.cols, maxChain: 2 });
const credential = verifier.enroll(RULE);
const shape = readoutShape(RULE.readout, params.rows, params.cols);

let r = await call("enroll", { deviceId, credential, seed, params, readoutShape: shape });
console.log("enroll:", r.status, JSON.stringify(r.body));

// 2. Laptop starts a login.
r = await call("start-login", {});
console.log("start-login:", r.status, JSON.stringify(r.body));
const pairCode = r.body.pairCode;

// 3. Phone claims it → gets the challenge grid + tick.
r = await call("claim", { pairCode, deviceId });
console.log("claim:", r.status, "tick=" + r.body.tick);
const tick = r.body.tick;

// 4a. Submit the HONEST answer → expect PASS.
const grid = gridAtTick(seed, tick, params);
const answer = applyRule(grid, RULE);
r = await call("submit", { pairCode, answer });
console.log("submit (honest):", r.status, JSON.stringify(r.body), r.body.result === "pass" ? "✅" : "❌ EXPECTED PASS");

// 4b. New session, submit a WRONG answer → expect FAIL.
const s2 = await call("start-login", {});
await call("claim", { pairCode: s2.body.pairCode, deviceId });
const wrong = { kind: "count", value: (answer.value + 1) % (params.rows * params.cols + 1) };
r = await call("submit", { pairCode: s2.body.pairCode, answer: wrong });
console.log("submit (wrong):", r.status, JSON.stringify(r.body), r.body.result === "fail" ? "✅" : "❌ EXPECTED FAIL");

// 5. Rate limiting: a FRESH device hammers wrong answers; after the limit it
//    should be rate-limited rather than allowed to keep guessing.
const attacker = "atk-" + Math.random().toString(36).slice(2, 10);
const aSeed = "atk-seed-" + attacker;
const aVerifier = new OptionBVerifier({ rows: params.rows, cols: params.cols, maxChain: 2 });
await call("enroll", {
  deviceId: attacker,
  credential: aVerifier.enroll(RULE),
  seed: aSeed,
  params,
  readoutShape: shape,
});
let rateLimited = false;
for (let i = 0; i < 12; i++) {
  const s = await call("start-login", {});
  await call("claim", { pairCode: s.body.pairCode, deviceId: attacker });
  const guess = { kind: "count", value: i }; // sweep guesses
  const res = await call("submit", { pairCode: s.body.pairCode, answer: guess });
  if (res.body.reason === "rate-limited") {
    rateLimited = true;
    console.log(`rate limit kicked in after ${i} guesses ✅`);
    break;
  }
}
if (!rateLimited) console.log("❌ EXPECTED rate-limit to engage within 12 guesses");
void answersEqual;
