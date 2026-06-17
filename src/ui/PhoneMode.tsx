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
import { enrollDevice, claimSession, submitAnswer, getDeviceId, seedForDevice, friendlyError } from "./backend.js";
import { Card, Button, Spinner, Banner, CodeInput } from "./components/index.js";

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
      const verifier = new OptionBVerifier({ rows: params.rows, cols: params.cols, maxChain: 2 });
      const credential = verifier.enroll(rule);
      const shape = readoutShape(rule.readout, params.rows, params.cols);
      await enrollDevice({ deviceId, credential, seed, params, readoutShape: shape });
      localStorage.setItem(ENROLLED_KEY, JSON.stringify({ readoutShape: shape } satisfies EnrolledMarker));
      setEnrolled({ readoutShape: shape });
    } catch (e) {
      setError(friendlyError(e));
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
      <div className="w-full flex flex-col items-center gap-4">
        <p className="text-text-muted max-w-[380px] text-center leading-relaxed m-0">
          This device is your authenticator. Build your secret move — it's the only time you'll see it,
          and it never leaves this device.
        </p>
        {busy && (
          <p className="flex items-center gap-2 text-text-muted m-0">
            <Spinner size={16} /> Saving your move…
          </p>
        )}
        {error && (
          <div className="w-full max-w-[380px]">
            <Banner tone="error" role="alert">
              {error}
            </Banner>
          </div>
        )}
        <Builder onComplete={enroll} />
      </div>
    );
  }

  return <Challenge deviceId={deviceId} shape={enrolled.readoutShape} onForget={forget} />;
}

// ── the challenge responder ───────────────────────────────────────────────────

type Phase =
  | { kind: "code" }
  | { kind: "loading"; what: string }
  | { kind: "answer"; pairCode: string; grid: Grid }
  | { kind: "result"; pass: boolean };

function Challenge({
  deviceId,
  shape,
  onForget,
}: {
  deviceId: string;
  shape: ReadoutShape;
  onForget: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "code" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);

  const claim = async () => {
    setError(null);
    setPhase({ kind: "loading", what: "Connecting…" });
    try {
      const pair = code.trim().toUpperCase();
      const res = await claimSession(pair, deviceId);
      setPhase({ kind: "answer", pairCode: pair, grid: res.grid });
    } catch (e) {
      setError(friendlyError(e));
      setPhase({ kind: "code" });
    }
  };

  const submit = async (answer: Answer, pairCode: string) => {
    setPhase({ kind: "loading", what: "Checking your move…" });
    try {
      const res = await submitAnswer(pairCode, answer);
      setPhase({ kind: "result", pass: res.result === "pass" });
    } catch (e) {
      setError(friendlyError(e));
      setPhase({ kind: "code" });
    }
  };

  return (
    <Card lifted className="w-full max-w-[400px] flex flex-col items-center gap-4 text-center">
      <h2 className="m-0 text-xl font-semibold">Authenticate</h2>

      {phase.kind === "code" && (
        <>
          <p className="text-text-muted m-0">Enter the code shown on the device you're logging in on.</p>
          {error && (
            <Banner tone="error" role="alert">
              {error}
            </Banner>
          )}
          <CodeInput
            value={code}
            onChange={setCode}
            length={6}
            label="pair code"
            hint="6 characters — letters and numbers"
          />
          <Button onClick={claim} disabled={code.trim().length < 6} size="lg">
            Continue
          </Button>
        </>
      )}

      {phase.kind === "loading" && (
        <p className="flex items-center gap-2 text-text-muted m-0">
          <Spinner size={18} /> {phase.what}
        </p>
      )}

      {phase.kind === "answer" && (
        <>
          <p className="text-text-muted m-0">Perform your move in your head, then tap the answer.</p>
          <div className="w-full max-w-[280px]">
            <GridView grid={phase.grid} ariaLabel="challenge grid" />
          </div>
          <AnswerInput shape={shape} onSubmit={(a) => submit(a, phase.pairCode)} />
        </>
      )}

      {phase.kind === "result" && (
        <>
          <p className={"text-2xl font-bold m-0 " + (phase.pass ? "text-success" : "text-danger")}>
            {phase.pass ? "Approved ✓" : "Denied ✗"}
          </p>
          <p className="text-text-muted m-0">
            {phase.pass ? "The other device is now logged in." : "That didn't match. Try again."}
          </p>
          <Button
            onClick={() => {
              setCode("");
              setError(null);
              setPhase({ kind: "code" });
            }}
          >
            Done
          </Button>
        </>
      )}

      {confirmForget ? (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-sm text-text-muted m-0">Forget your move? You'll have to build a new one.</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={onForget}>
              Yes, forget it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmForget(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="link" size="sm" onClick={() => setConfirmForget(true)}>
          Forget this move &amp; re-enroll
        </Button>
      )}
    </Card>
  );
}
