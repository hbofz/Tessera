/**
 * App — the §11 "smallest thing" wired end to end.
 *
 * Flow: build a move (§8 Builder, ending at the dry-run gate) → then practice it
 * (§6). The enrollment (credential + seed + params) is PERSISTED to localStorage
 * so the move survives a refresh; on boot a returning user skips the builder and
 * lands in practice. Once built, the move goes dark — only the builder/peek ever
 * show it (§9.1); the credential drives the verifier.
 *
 * ⚠️ Under Option A the persisted credential embeds the raw rule (the §6 Option
 * A tradeoff, localized to the browser). See persistence.ts.
 */

import { useMemo, useState } from "react";
import { GridView } from "./GridView.js";
import { Builder } from "./Builder.js";
import { Practice } from "./Practice.js";
import { useGridClock } from "./useGridClock.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import { OptionAVerifier, recoverOptionARule } from "../auth/verifier.js";
import { saveEnrollment, loadEnrollment, clearEnrollment } from "../auth/persistence.js";
import type { Enrollment } from "../auth/login.js";
import type { Rule } from "../engine/types.js";

// Stable seed for this user's challenge grids (§10). One device, one user for
// v1; a real deployment would derive this per-account at enrollment.
const USER_SEED = "tessera-user-seed";

type Tab = "clock" | "build" | "practice";

export function App() {
  const verifier = useMemo(() => new OptionAVerifier(), []);

  // Restore a persisted enrollment on first render (lazy initializer runs once).
  const [enrollment, setEnrollment] = useState<Enrollment | null>(() => loadEnrollment());
  const [tab, setTab] = useState<Tab>(() => (loadEnrollment() ? "practice" : "clock"));

  // The rule, recovered from the credential, drives previews + the peek reminder
  // (Option A only — under Option B there'd be no rule to recover, and no peek).
  const rule: Rule | null = useMemo(
    () => (enrollment ? recoverOptionARule(enrollment.credential) : null),
    [enrollment],
  );

  const enroll = (r: Rule) => {
    const e: Enrollment = {
      credential: verifier.enroll(r),
      seed: USER_SEED,
      params: DEFAULT_PARAMS,
    };
    saveEnrollment(e);
    setEnrollment(e);
    setTab("practice");
  };

  const forget = () => {
    clearEnrollment();
    setEnrollment(null);
    setTab("build");
  };

  return (
    <main
      style={{ margin: "auto", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}
    >
      <h1 style={{ fontWeight: 600, fontSize: 24, margin: 0 }}>Tessera</h1>

      <nav style={{ display: "flex", gap: 8 }}>
        <TabButton active={tab === "clock"} onClick={() => setTab("clock")}>
          Grid
        </TabButton>
        <TabButton active={tab === "build"} onClick={() => setTab("build")}>
          {enrollment ? "Move ✓" : "Build a move"}
        </TabButton>
        <TabButton active={tab === "practice"} onClick={() => setTab("practice")}>
          Practice
        </TabButton>
      </nav>

      {tab === "clock" && <ClockView />}

      {tab === "build" && (
        <>
          {enrollment && <AlreadyEnrolledNote onForget={forget} />}
          <Builder onComplete={enroll} />
        </>
      )}

      {tab === "practice" &&
        (enrollment && rule ? (
          <>
            <Practice rule={rule} credential={enrollment.credential} verifier={verifier} seed={enrollment.seed} />
            <ForgetMove onForget={forget} />
          </>
        ) : (
          <NeedAMove onBuild={() => setTab("build")} />
        ))}
    </main>
  );
}

function NeedAMove({ onBuild }: { onBuild: () => void }) {
  return (
    <div style={{ textAlign: "center", color: "#666", maxWidth: 320 }}>
      <p>You haven't set a move yet. Build one first — it's the only time you'll see it.</p>
      <button
        type="button"
        onClick={onBuild}
        style={{ padding: "10px 22px", borderRadius: 999, border: "none", background: "#111", color: "#fff", cursor: "pointer" }}
      >
        Build a move
      </button>
    </div>
  );
}

function AlreadyEnrolledNote({ onForget }: { onForget: () => void }) {
  return (
    <div style={{ textAlign: "center", color: "#666", maxWidth: 360, fontSize: 14 }}>
      <p style={{ margin: 0 }}>
        You already have a move. Building a new one will <strong>replace</strong> it.
      </p>
      <button type="button" onClick={onForget} style={linkBtn}>
        or forget the current move
      </button>
    </div>
  );
}

function ForgetMove({ onForget }: { onForget: () => void }) {
  return (
    <button type="button" onClick={onForget} style={linkBtn}>
      Forget this move &amp; start over
    </button>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0072B2",
  cursor: "pointer",
  fontSize: 13,
  textDecoration: "underline",
  padding: 4,
};

function ClockView() {
  const { grid, tick, progress } = useGridClock(USER_SEED, DEFAULT_PARAMS);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <p style={{ margin: 0, color: "#666", maxWidth: 360, textAlign: "center" }}>
        The challenge grid rolls every {DEFAULT_PARAMS.periodSeconds}s. Your secret move lives only in
        your head.
      </p>
      <GridView grid={grid} cellSize={56} ariaLabel="current challenge grid" />
      <div
        aria-hidden="true"
        style={{ width: 200, height: 6, background: "#eee", borderRadius: 999, overflow: "hidden" }}
      >
        <div style={{ width: `${(1 - progress) * 100}%`, height: "100%", background: "#0072B2", transition: "width 250ms linear" }} />
      </div>
      <small style={{ color: "#999" }}>tick #{tick}</small>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "8px 18px",
        borderRadius: 999,
        border: "1px solid " + (active ? "#111" : "#ddd"),
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#333",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}
