/**
 * Phone mode — Tessera as the authenticator device (DESIGN.md §10, §13 two-device).
 *
 * Two jobs:
 *   1. Enroll: build a move (existing Builder) → send the VERIFIER to the backend
 *      (never the rule). The move goes dark; only the answer-shape is kept so the
 *      challenge screen can render the right input.
 *   2. Respond to a challenge: enter the laptop's pair code → claim the session →
 *      see the grid → do the move in your head → tap the answer → PASS/FAIL.
 *
 * The move never leaves the device (§2): enrollment sends only the hash-based
 * credential, and the challenge answer is a scalar (§4). The phone holds no rule.
 */

import { useMemo, useState } from "react";
import { Builder } from "./Builder.js";
import { GridView } from "./GridView.js";
import { AnswerInput } from "./AnswerInput.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import { readoutShape, type ReadoutShape } from "../engine/readout-shape.js";
import { OptionBVerifier } from "../auth/option-b-verifier.js";
import type { Answer, Grid, Rule } from "../engine/types.js";
import {
  enrollDevice,
  claimSession,
  submitAnswer,
  getDeviceId,
  seedForDevice,
} from "./backend.js";

const ENROLLED_KEY = "tessera.phone.enrolled"; // stores {shape} only, not the rule

type EnrolledMarker = { readoutShape: ReadoutShape };

function loadEnrolled(): EnrolledMarker | null {
  const raw = localStorage.getItem(ENROLLED_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EnrolledMarker;
  } catch {
    return null;
  }
}

export function PhoneMode() {
  const [enrolled, setEnrolled] = useState<EnrolledMarker | null>(() => loadEnrolled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceId = useMemo(() => getDeviceId(), []);
  const seed = useMemo(() => seedForDevice(deviceId), [deviceId]);
  const params = DEFAULT_PARAMS;

  const enroll = async (rule: Rule) => {
    setBusy(true);
    setError(null);
    try {
      // Phone computes its own verifier — R never sent (§2).
      const verifier = new OptionBVerifier({ rows: params.rows, cols: params.cols, maxChain: 2 });
      const credential = verifier.enroll(rule);
      const shape = readoutShape(rule.readout, params.rows, params.cols);
      await enrollDevice({ deviceId, credential, seed, params, readoutShape: shape });
      localStorage.setItem(ENROLLED_KEY, JSON.stringify({ readoutShape: shape } satisfies EnrolledMarker));
      setEnrolled({ readoutShape: shape });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    localStorage.removeItem(ENROLLED_KEY);
    setEnrolled(null);
  };

  if (!enrolled) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <p style={{ color: "#666", maxWidth: 360, textAlign: "center" }}>
          This device is your authenticator. Build your secret move — it's the only time you'll see it,
          and it never leaves this device.
        </p>
        {busy && <p>Enrolling…</p>}
        {error && <p style={{ color: "#D55E00" }}>{error}</p>}
        <Builder onComplete={enroll} />
      </div>
    );
  }

  return (
    <Challenge
      deviceId={deviceId}
      seed={seed}
      shape={enrolled.readoutShape}
      onForget={forget}
    />
  );
}

// ── the challenge responder ───────────────────────────────────────────────────

type Phase =
  | { kind: "code" }
  | { kind: "loading" }
  | { kind: "answer"; pairCode: string; grid: Grid }
  | { kind: "result"; pass: boolean };

function Challenge({
  deviceId,
  shape,
  onForget,
}: {
  deviceId: string;
  seed: string;
  shape: ReadoutShape;
  onForget: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "code" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    setError(null);
    setPhase({ kind: "loading" });
    try {
      const res = await claimSession(code.trim().toUpperCase(), deviceId);
      setPhase({ kind: "answer", pairCode: code.trim().toUpperCase(), grid: res.grid });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ kind: "code" });
    }
  };

  const submit = async (answer: Answer, pairCode: string) => {
    setPhase({ kind: "loading" });
    try {
      const res = await submitAnswer(pairCode, answer);
      setPhase({ kind: "result", pass: res.result === "pass" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase({ kind: "code" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 380 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>Authenticate</h2>

      {phase.kind === "code" && (
        <>
          <p style={{ color: "#666", textAlign: "center" }}>
            Enter the code shown on the device you're logging in on.
          </p>
          {error && <p style={{ color: "#D55E00" }}>{error}</p>}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            aria-label="pair code"
            maxLength={6}
            style={{
              fontSize: 28,
              letterSpacing: 6,
              textAlign: "center",
              width: 200,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px solid #ccc",
              textTransform: "uppercase",
            }}
          />
          <button type="button" onClick={claim} disabled={code.trim().length < 6} style={primaryBtn(code.trim().length >= 6)}>
            Continue
          </button>
        </>
      )}

      {phase.kind === "loading" && <p>Working…</p>}

      {phase.kind === "answer" && (
        <>
          <p style={{ color: "#666", textAlign: "center" }}>Perform your move in your head, then tap the answer.</p>
          <GridView grid={phase.grid} cellSize={56} ariaLabel="challenge grid" />
          <AnswerInput shape={shape} onSubmit={(a) => submit(a, phase.pairCode)} />
        </>
      )}

      {phase.kind === "result" && (
        <>
          <p style={{ fontSize: 22, fontWeight: 700, color: phase.pass ? "#009E73" : "#D55E00" }}>
            {phase.pass ? "Approved ✓" : "Denied ✗"}
          </p>
          <p style={{ color: "#666", textAlign: "center" }}>
            {phase.pass ? "The other device is now logged in." : "That didn't match. Try again."}
          </p>
          <button type="button" onClick={() => { setCode(""); setPhase({ kind: "code" }); }} style={primaryBtn(true)}>
            Done
          </button>
        </>
      )}

      <button type="button" onClick={onForget} style={linkBtn}>
        Forget this move &amp; re-enroll
      </button>
    </div>
  );
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    padding: "12px 28px",
    borderRadius: 999,
    border: "none",
    background: enabled ? "#111" : "#ccc",
    color: "#fff",
    fontSize: 16,
    cursor: enabled ? "pointer" : "default",
  };
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0072B2",
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "underline",
  marginTop: 8,
};
