/**
 * App — the §11 "smallest thing" wired end to end.
 *
 * Flow: build a move (§8 Builder, ending at the dry-run gate) → then practice it
 * (§6). Before enrolling, there's no move to practice, so Practice prompts you to
 * build one first. Once built, the move goes dark — only the builder ever showed
 * it (§9.1), and we keep it in memory just to drive the verifier.
 */

import { useMemo, useState } from "react";
import { GridView } from "./GridView.js";
import { Builder } from "./Builder.js";
import { Practice } from "./Practice.js";
import { useGridClock } from "./useGridClock.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import { OptionAVerifier } from "../auth/verifier.js";
import type { Rule } from "../engine/types.js";
import type { Credential } from "../auth/verifier.js";

const DEMO_SEED = "tessera-demo-seed";

type Tab = "clock" | "build" | "practice";

export function App() {
  const [tab, setTab] = useState<Tab>("clock");
  // The enrolled move. Held in memory only to drive the verifier — never shown
  // again after the builder (§9.1).
  const [rule, setRule] = useState<Rule | null>(null);

  const verifier = useMemo(() => new OptionAVerifier(), []);
  const credential: Credential | null = useMemo(
    () => (rule ? verifier.enroll(rule) : null),
    [rule, verifier],
  );

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
          {rule ? "Move ✓" : "Build a move"}
        </TabButton>
        <TabButton active={tab === "practice"} onClick={() => setTab("practice")}>
          Practice
        </TabButton>
      </nav>

      {tab === "clock" && <ClockView />}

      {tab === "build" && (
        <Builder
          onComplete={(r) => {
            setRule(r);
            setTab("practice");
          }}
        />
      )}

      {tab === "practice" &&
        (rule && credential ? (
          <Practice rule={rule} credential={credential} verifier={verifier} seed={DEMO_SEED} />
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

function ClockView() {
  const { grid, tick, progress } = useGridClock(DEMO_SEED, DEFAULT_PARAMS);
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
