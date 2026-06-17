/**
 * App — Tessera wired end to end on the OPTION B verifier (§6): the persisted
 * credential stores only slow_hash(canonical(R)) — NEVER the rule. After the
 * builder's dry-run gate closes, the move exists nowhere on this device (§9.1,
 * §2 row 1).
 *
 * Home is SOLO-FIRST: a fresh visitor's way in is "build & practice a move" on
 * one device (no network). The two-device flow is presented as an advanced step
 * and, when the Supabase backend isn't configured, shows a calm setup note
 * instead of crashing (the old build crashed at import if .env was absent).
 */

import { useMemo, useState } from "react";
import { GridView } from "./GridView.js";
import { Builder } from "./Builder.js";
import { Practice } from "./Practice.js";
import { LaptopMode } from "./LaptopMode.js";
import { PhoneMode } from "./PhoneMode.js";
import { useGridClock } from "./useGridClock.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import { OptionBVerifier } from "../auth/option-b-verifier.js";
import { saveEnrollment, loadEnrollment, clearEnrollment } from "../auth/persistence.js";
import { readoutShape } from "../engine/readout-shape.js";
import { isBackendConfigured } from "./backend.js";
import type { Enrollment } from "../auth/login.js";
import type { EnumerateOptions } from "../engine/enumerate.js";
import type { Rule } from "../engine/types.js";
import { Button, Card, SegmentedTabs, Banner, ProgressBar, ThemeToggle } from "./components/index.js";

// Stable seed for this user's challenge grids (§10). One device, one user for
// v1; a real deployment would derive this per-account at enrollment.
const USER_SEED = "tessera-user-seed";

const enumerateFor = (params: { rows: number; cols: number }): EnumerateOptions => ({
  rows: params.rows,
  cols: params.cols,
  maxChain: 2,
});

type Tab = "clock" | "build" | "practice";
type Mode = "home" | "solo" | "laptop" | "phone";

export function App() {
  const [mode, setMode] = useState<Mode>("home");

  return (
    <div className="w-full flex flex-col items-center">
      <AppHeader showBack={mode !== "home"} onBack={() => setMode("home")} />
      <main className="w-full max-w-[560px] px-5 sm:px-6 pb-16 flex flex-col items-center gap-6">
        {mode === "home" && <Home onPick={setMode} />}
        {mode === "solo" && <SoloMode />}
        {mode === "laptop" && <LaptopMode />}
        {mode === "phone" && <PhoneMode />}
      </main>
    </div>
  );
}

function AppHeader({ showBack, onBack }: { showBack: boolean; onBack: () => void }) {
  return (
    <header className="w-full max-w-[560px] px-5 sm:px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {showBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to start">
            ← Back
          </Button>
        ) : (
          <span className="font-semibold tracking-tight text-lg select-none">Tessera</span>
        )}
      </div>
      <ThemeToggle />
    </header>
  );
}

function Home({ onPick }: { onPick: (m: Mode) => void }) {
  const backendReady = isBackendConfigured();
  return (
    <div className="w-full flex flex-col gap-8 animate-[tessera-rise_300ms_ease]">
      <div className="text-center flex flex-col gap-2 pt-2">
        <h1 className="text-[2rem] sm:text-4xl font-semibold tracking-tight m-0">
          A secret you <span className="text-accent">perform</span>, not type.
        </h1>
        <p className="text-text-muted max-w-[42ch] mx-auto m-0 leading-relaxed">
          Tessera is a second factor where the secret is a small move you do in your head on a
          grid that changes every login. Build one, then practice it.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Start here</SectionLabel>
        <ModeCard
          emoji="🧩"
          title="Build & practice a move"
          desc="Create your secret move and drill it on this device. No second device, no network."
          primary
          onClick={() => onPick("solo")}
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Advanced · the real two-device flow</SectionLabel>
        {!backendReady && (
          <Banner tone="muted">
            These need the Supabase backend. Copy <code className="font-mono">.env.example</code> to{" "}
            <code className="font-mono">.env</code>, add your project's URL + anon key, then reload.
          </Banner>
        )}
        <ModeCard
          emoji="📱"
          title="Be the authenticator"
          desc="This device holds your move (your phone). Enroll once, then approve logins."
          disabled={!backendReady}
          onClick={() => onPick("phone")}
        />
        <ModeCard
          emoji="🔐"
          title="Log in to the demo app"
          desc="This device is the app you sign into (your laptop). Shows a code your phone approves."
          disabled={!backendReady}
          onClick={() => onPick("laptop")}
        />
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wider text-text-faint px-1">
      {children}
    </span>
  );
}

function ModeCard({
  emoji,
  title,
  desc,
  onClick,
  primary = false,
  disabled = false,
}: {
  emoji: string;
  title: string;
  desc: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "text-left p-5 rounded-xl border bg-surface transition w-full group " +
        "disabled:opacity-55 disabled:cursor-default " +
        (primary
          ? "border-accent/40 shadow-soft hover:shadow-lift hover:-translate-y-0.5"
          : "border-border hover:bg-surface-2 enabled:hover:-translate-y-0.5")
      }
    >
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="text-2xl leading-none mt-0.5">
          {emoji}
        </span>
        <div className="min-w-0">
          <div className="text-[1.05rem] font-semibold flex items-center gap-2">
            {title}
            {primary && (
              <span className="text-accent transition group-hover:translate-x-0.5">→</span>
            )}
          </div>
          <div className="text-sm text-text-muted mt-1 leading-relaxed">{desc}</div>
        </div>
      </div>
    </button>
  );
}

function SoloMode() {
  // Restore a persisted enrollment once (lazy initializer), then derive the tab.
  const [enrollment, setEnrollment] = useState<Enrollment | null>(() => loadEnrollment());
  const [tab, setTab] = useState<Tab>(() => (enrollment ? "practice" : "clock"));

  const verifier = useMemo(
    () => new OptionBVerifier(enumerateFor(enrollment?.params ?? DEFAULT_PARAMS)),
    [enrollment?.params],
  );

  const enroll = (r: Rule) => {
    const params = DEFAULT_PARAMS;
    const v = new OptionBVerifier(enumerateFor(params));
    const e: Enrollment = {
      credential: v.enroll(r),
      seed: USER_SEED,
      params,
      readoutShape: readoutShape(r.readout, params.rows, params.cols),
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
    <div className="w-full flex flex-col items-center gap-6">
      <SegmentedTabs
        ariaLabel="solo sandbox sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "clock", label: "Grid" },
          { id: "build", label: enrollment ? "Move ✓" : "Build" },
          { id: "practice", label: "Practice" },
        ]}
      />

      {tab === "clock" && <ClockView />}

      {tab === "build" && (
        <div className="w-full flex flex-col items-center gap-4">
          {enrollment && <AlreadyEnrolledNote onForget={forget} />}
          <Builder onComplete={enroll} />
        </div>
      )}

      {tab === "practice" &&
        (enrollment ? (
          <div className="w-full flex flex-col items-center gap-4">
            <Practice
              shape={enrollment.readoutShape}
              credential={enrollment.credential}
              verifier={verifier}
              seed={enrollment.seed}
              params={enrollment.params}
            />
            <Button variant="link" size="sm" onClick={forget}>
              Forget this move & start over
            </Button>
          </div>
        ) : (
          <NeedAMove onBuild={() => setTab("build")} />
        ))}
    </div>
  );
}

function NeedAMove({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="text-center text-text-muted max-w-[340px] flex flex-col items-center gap-4">
      <p className="m-0">You haven't set a move yet. Build one first — it's the only time you'll see it.</p>
      <Button onClick={onBuild}>Build a move</Button>
    </div>
  );
}

function AlreadyEnrolledNote({ onForget }: { onForget: () => void }) {
  return (
    <div className="w-full max-w-[420px]">
      <Banner tone="info">
        You already have a move — building a new one will <strong>replace</strong> it.{" "}
        <button type="button" onClick={onForget} className="text-accent underline underline-offset-2">
          Forget the current move
        </button>
      </Banner>
    </div>
  );
}

function ClockView() {
  const { grid, tick, progress } = useGridClock(USER_SEED, DEFAULT_PARAMS);
  return (
    <div className="flex flex-col items-center gap-5 w-full">
      <p className="m-0 text-text-muted max-w-[380px] text-center leading-relaxed">
        The challenge grid rolls every {DEFAULT_PARAMS.periodSeconds}s. Your secret move lives only
        in your head.
      </p>
      <div className="w-full max-w-[320px] flex flex-col items-center gap-3">
        <GridView grid={grid} ariaLabel="current challenge grid" />
        <ProgressBar value={1 - progress} className="w-[200px]" ariaLabel="time until the grid rolls" />
        <small className="text-text-faint tabular-nums">tick #{tick}</small>
      </div>
    </div>
  );
}
