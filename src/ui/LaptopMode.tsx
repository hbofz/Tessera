/**
 * Laptop mode — the "app you log into" (a demo of a relying party).
 *
 * Flow: click "Log in with Tessera" → backend opens a login session → we show a
 * pair code and WAIT. The phone claims the code and answers its challenge; the
 * Edge Function marks the session passed/failed; Supabase Realtime pushes that to
 * us live → "Welcome!" or "Denied".
 *
 * This side never sees the move or the grid — it only knows pass/fail (§9.1).
 */

import { useEffect, useRef, useState } from "react";
import { startLogin, watchSession, type SessionStatus } from "./backend.js";

type Phase =
  | { kind: "idle" }
  | { kind: "waiting"; pairCode: string; sessionId: string; status: SessionStatus }
  | { kind: "in" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export function LaptopMode() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => () => unsubRef.current?.(), []);

  const begin = async () => {
    setPhase({ kind: "idle" });
    try {
      const { sessionId, pairCode } = await startLogin();
      setPhase({ kind: "waiting", pairCode, sessionId, status: "pending" });
      unsubRef.current?.();
      unsubRef.current = watchSession(sessionId, (status) => {
        if (status === "passed") setPhase({ kind: "in" });
        else if (status === "failed" || status === "expired") setPhase({ kind: "denied" });
        else setPhase((p) => (p.kind === "waiting" ? { ...p, status } : p));
      });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const reset = () => {
    unsubRef.current?.();
    unsubRef.current = null;
    setPhase({ kind: "idle" });
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#999", letterSpacing: 1, textTransform: "uppercase" }}>Demo App</div>
      <h2 style={{ margin: "4px 0 16px", fontSize: 22 }}>🔐 MyVault</h2>

      {phase.kind === "idle" && (
        <>
          <p style={{ color: "#666", textAlign: "center" }}>Sign in to continue.</p>
          <button type="button" onClick={begin} style={primaryBtn}>
            Log in with Tessera
          </button>
        </>
      )}

      {phase.kind === "waiting" && (
        <>
          <p style={{ color: "#666", textAlign: "center", margin: 0 }}>
            On your Tessera device, choose <strong>Authenticate</strong> and enter this code:
          </p>
          <div style={codeBox}>{phase.pairCode}</div>
          <p style={{ color: "#999", fontSize: 14 }}>
            {phase.status === "claimed" ? "Device connected — waiting for your move…" : "Waiting for your device…"}
          </p>
          <Spinner />
          <button type="button" onClick={reset} style={linkBtn}>
            Cancel
          </button>
        </>
      )}

      {phase.kind === "in" && (
        <>
          <p style={{ fontSize: 26, fontWeight: 700, color: "#009E73" }}>Welcome! ✓</p>
          <p style={{ color: "#666", textAlign: "center" }}>You're signed in to MyVault.</p>
          <button type="button" onClick={reset} style={primaryBtn}>
            Log out
          </button>
        </>
      )}

      {phase.kind === "denied" && (
        <>
          <p style={{ fontSize: 22, fontWeight: 700, color: "#D55E00" }}>Login denied ✗</p>
          <p style={{ color: "#666", textAlign: "center" }}>The move didn't match (or the code expired).</p>
          <button type="button" onClick={begin} style={primaryBtn}>
            Try again
          </button>
        </>
      )}

      {phase.kind === "error" && (
        <>
          <p style={{ color: "#D55E00" }}>Something went wrong: {phase.message}</p>
          <button type="button" onClick={begin} style={primaryBtn}>
            Retry
          </button>
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 24,
        height: 24,
        border: "3px solid #eee",
        borderTopColor: "#0072B2",
        borderRadius: "50%",
        animation: "tessera-spin 0.8s linear infinite",
      }}
    />
  );
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 14,
  padding: 32,
  border: "1px solid #eee",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
  minWidth: 300,
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 28px",
  borderRadius: 999,
  border: "none",
  background: "#111",
  color: "#fff",
  fontSize: 16,
  cursor: "pointer",
};

const codeBox: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 700,
  letterSpacing: 10,
  padding: "12px 20px",
  background: "#F5F5F5",
  borderRadius: 12,
  fontFamily: "ui-monospace, monospace",
};

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0072B2",
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "underline",
};
