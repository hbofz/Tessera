/**
 * App — temporary harness to SEE the visual loop (the §11 "smallest thing"
 * spirit). Right now it just shows the live rolling grid C(t) with a period
 * countdown, proving the grid clock + renderer work together. The builder
 * wizard (§8) and practice mode (§6) will mount here next.
 */

import { GridView } from "./GridView.js";
import { useGridClock } from "./useGridClock.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";

// A fixed demo seed for now. In the real app this comes from enrollment (§10).
const DEMO_SEED = "tessera-demo-seed";

export function App() {
  const { grid, tick, progress } = useGridClock(DEMO_SEED, DEFAULT_PARAMS);

  return (
    <main
      style={{
        margin: "auto",
        padding: 24,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <h1 style={{ fontWeight: 600, fontSize: 24, margin: 0 }}>Tessera</h1>
      <p style={{ margin: 0, color: "#666", maxWidth: 360 }}>
        The challenge grid rolls every {DEFAULT_PARAMS.periodSeconds}s. Your secret move lives only in
        your head.
      </p>

      <GridView grid={grid} cellSize={56} ariaLabel="current challenge grid" />

      <Countdown progress={progress} />
      <small style={{ color: "#999" }}>tick #{tick}</small>
    </main>
  );
}

function Countdown({ progress }: { progress: number }) {
  const remaining = 1 - progress;
  return (
    <div
      aria-hidden="true"
      style={{ width: 200, height: 6, background: "#eee", borderRadius: 999, overflow: "hidden" }}
    >
      <div
        style={{
          width: `${remaining * 100}%`,
          height: "100%",
          background: "#0072B2",
          transition: "width 250ms linear",
        }}
      />
    </div>
  );
}
