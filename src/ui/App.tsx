/**
 * App — temporary harness for the §11 "smallest thing" visual loop.
 *
 * Tabs between the live grid clock and a working PRACTICE mode (§6) drilling a
 * fixed demo rule. The builder wizard (§8) will replace the hard-coded rule
 * with a user-built one and add an enrollment step.
 */

import { useMemo, useState } from "react";
import { GridView } from "./GridView.js";
import { Practice } from "./Practice.js";
import { useGridClock } from "./useGridClock.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import { OptionAVerifier } from "../auth/verifier.js";
import type { Rule } from "../engine/types.js";

const DEMO_SEED = "tessera-demo-seed";

// A demo move (NOT shown to the user in practice — only used to verify). When
// the builder lands, this comes from enrollment instead.
const DEMO_RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

type Tab = "clock" | "practice";

export function App() {
  const [tab, setTab] = useState<Tab>("clock");
  const verifier = useMemo(() => new OptionAVerifier(), []);
  const credential = useMemo(() => verifier.enroll(DEMO_RULE), [verifier]);

  return (
    <main
      style={{
        margin: "auto",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <h1 style={{ fontWeight: 600, fontSize: 24, margin: 0 }}>Tessera</h1>

      <nav style={{ display: "flex", gap: 8 }}>
        <TabButton active={tab === "clock"} onClick={() => setTab("clock")}>
          Grid
        </TabButton>
        <TabButton active={tab === "practice"} onClick={() => setTab("practice")}>
          Practice
        </TabButton>
      </nav>

      {tab === "clock" ? (
        <ClockView />
      ) : (
        <Practice rule={DEMO_RULE} credential={credential} verifier={verifier} seed={DEMO_SEED} />
      )}
    </main>
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
        <div
          style={{
            width: `${(1 - progress) * 100}%`,
            height: "100%",
            background: "#0072B2",
            transition: "width 250ms linear",
          }}
        />
      </div>
      <small style={{ color: "#999" }}>tick #{tick}</small>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
