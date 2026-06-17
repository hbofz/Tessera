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
import { startLogin, watchSession, friendlyError, type SessionStatus } from "./backend.js";
import { Card, Button, Spinner, Banner } from "./components/index.js";

type Phase =
  | { kind: "idle" }
  | { kind: "waiting"; pairCode: string; sessionId: string; status: SessionStatus; slow: boolean }
  | { kind: "in" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export function LaptopMode() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const unsubRef = useRef<(() => void) | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      unsubRef.current?.();
      if (slowTimer.current) clearTimeout(slowTimer.current);
    },
    [],
  );

  const begin = async () => {
    setPhase({ kind: "idle" });
    try {
      const { sessionId, pairCode } = await startLogin();
      setPhase({ kind: "waiting", pairCode, sessionId, status: "pending", slow: false });
      // After ~20s with no progress, surface a gentle "taking a while" hint.
      if (slowTimer.current) clearTimeout(slowTimer.current);
      slowTimer.current = setTimeout(() => {
        setPhase((p) => (p.kind === "waiting" ? { ...p, slow: true } : p));
      }, 20000);
      unsubRef.current?.();
      unsubRef.current = watchSession(sessionId, (status) => {
        if (status === "passed") setPhase({ kind: "in" });
        else if (status === "failed" || status === "expired") setPhase({ kind: "denied" });
        else setPhase((p) => (p.kind === "waiting" ? { ...p, status } : p));
      });
    } catch (e) {
      setPhase({ kind: "error", message: friendlyError(e) });
    }
  };

  const reset = () => {
    unsubRef.current?.();
    unsubRef.current = null;
    if (slowTimer.current) clearTimeout(slowTimer.current);
    setPhase({ kind: "idle" });
  };

  return (
    <Card lifted className="w-full max-w-[380px] flex flex-col items-center gap-4 text-center">
      <div className="text-xs text-text-faint tracking-widest uppercase">Demo App</div>
      <h2 className="m-0 text-2xl font-semibold flex items-center gap-2">
        <span aria-hidden="true">🔐</span> MyVault
      </h2>

      {phase.kind === "idle" && (
        <>
          <p className="text-text-muted m-0">Sign in to continue.</p>
          <Button onClick={begin} size="lg">
            Log in with Tessera
          </Button>
        </>
      )}

      {phase.kind === "waiting" && (
        <>
          <p className="text-text-muted m-0">
            On your Tessera device, choose <strong className="text-text">Authenticate</strong> and enter
            this code:
          </p>
          <div className="font-mono text-4xl font-bold tracking-[0.3em] indent-[0.3em] px-5 py-3 rounded-xl bg-surface-2 border border-border select-all">
            {phase.pairCode}
          </div>
          <p className="text-sm text-text-muted m-0 flex items-center gap-2">
            <Spinner size={16} />
            {phase.status === "claimed" ? "Device connected — waiting for your move…" : "Waiting for your device…"}
          </p>
          {phase.slow && (
            <Banner tone="muted">
              Taking a while? Make sure your phone opened <strong>Authenticate</strong> and typed this exact
              code. You can cancel and start a fresh one.
            </Banner>
          )}
          <Button variant="link" size="sm" onClick={reset}>
            Cancel
          </Button>
        </>
      )}

      {phase.kind === "in" && (
        <>
          <p className="text-2xl font-bold text-success m-0">Welcome! ✓</p>
          <p className="text-text-muted m-0">You're signed in to MyVault.</p>
          <Button onClick={reset}>Log out</Button>
        </>
      )}

      {phase.kind === "denied" && (
        <>
          <p className="text-xl font-bold text-danger m-0">Login denied ✗</p>
          <p className="text-text-muted m-0">The move didn't match (or the code expired).</p>
          <Button onClick={begin}>Try again</Button>
        </>
      )}

      {phase.kind === "error" && (
        <>
          <Banner tone="error" role="alert">
            {phase.message}
          </Banner>
          <Button onClick={begin}>Retry</Button>
        </>
      )}
    </Card>
  );
}
