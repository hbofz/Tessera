/**
 * Builder wizard (DESIGN.md §8) — the ONLY place the move is ever visible.
 *
 * Three concrete-first steps, each with a live before→after preview so the user
 * learns by watching (§8):
 *   1. Which cells?  (SELECT) — selected cells glow on a live sample.
 *   2. What do you do? (TRANSFORM) — before→after; "+ add a second move".
 *   3. What do you report? (READOUT) — target highlighted; shows the answer.
 * Then a review screen with the strength verdict (§7), then the MANDATORY
 * DRY-RUN GATE (§8): perform the move on fresh grids with NO preview/hint
 * (2 of 3 correct). This gate is the seam where the move goes dark (§9.1) —
 * after enrollment the app never shows R, a preview, or the answer again.
 *
 * "Show another grid" re-runs on fresh samples — SAFE, samples are public grids,
 * over-fitting to them leaks nothing (§8).
 */

import { useMemo, useState } from "react";
import type { Answer, Rule, Select, Transform, Readout, Grid } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { DEFAULT_PARAMS, gridAtTick } from "../engine/clock.js";
import { applyRule, applyTransform, resolveSelect } from "../engine/rule.js";
import { readoutPositions } from "../engine/readout-positions.js";
import { GridView, posKey } from "./GridView.js";
import { AnswerDisplay } from "./AnswerDisplay.js";
import { selectOptions, transformOptions, readoutOptions, type Option } from "./builder-options.js";
import { StrengthVerdict } from "./StrengthVerdict.js";
import { DryRunGate } from "./DryRunGate.js";

export interface BuilderProps {
  readonly params?: GridParams;
  /** Seed used to generate SAMPLE grids for previews (public; not the user's
   *  real enrollment seed). */
  readonly sampleSeed?: string;
  /** Called with the finished rule once the dry-run gate is passed. */
  readonly onComplete: (rule: Rule) => void;
}

type Step = "select" | "transform" | "readout" | "review" | "drymun";

export function Builder({ params = DEFAULT_PARAMS, sampleSeed = "builder-samples", onComplete }: BuilderProps) {
  const [step, setStep] = useState<Step>("select");
  const [select, setSelect] = useState<Select | null>(null);
  const [transforms, setTransforms] = useState<Transform[]>([]);
  const [readout, setReadout] = useState<Readout | null>(null);
  // A nonce that bumps to draw a fresh sample grid ("show another grid").
  const [sampleTick, setSampleTick] = useState(1);

  const sample = useMemo(
    () => gridAtTick(sampleSeed, sampleTick, params),
    [sampleSeed, sampleTick, params],
  );
  const nextSample = () => setSampleTick((t) => t + 1);

  const selOpts = useMemo(() => selectOptions(params.rows, params.cols), [params.rows, params.cols]);
  const txOpts = useMemo(() => transformOptions(), []);
  const roOpts = useMemo(() => readoutOptions(params.rows, params.cols), [params.rows, params.cols]);

  // The (partial) rule assembled so far, when complete enough to run.
  const completeRule: Rule | null =
    select && transforms.length >= 1 && readout ? { select, transforms, readout } : null;

  return (
    <section style={{ maxWidth: 460, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <StepHeader step={step} />

      {step === "select" && (
        <SelectStep
          options={selOpts}
          selected={select}
          sample={sample}
          params={params}
          onPick={setSelect}
          onAnother={nextSample}
          onNext={() => setStep("transform")}
        />
      )}

      {step === "transform" && select && (
        <TransformStep
          options={txOpts}
          select={select}
          transforms={transforms}
          sample={sample}
          onSet={setTransforms}
          onAnother={nextSample}
          onBack={() => setStep("select")}
          onNext={() => setStep("readout")}
        />
      )}

      {step === "readout" && completeRulePrefix(select, transforms) && (
        <ReadoutStep
          options={roOpts}
          select={select!}
          transforms={transforms}
          readout={readout}
          sample={sample}
          params={params}
          onPick={setReadout}
          onAnother={nextSample}
          onBack={() => setStep("transform")}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && completeRule && (
        <ReviewStep
          rule={completeRule}
          params={params}
          sampleSeed={sampleSeed}
          onBack={() => setStep("readout")}
          onConfirm={() => setStep("drymun")}
        />
      )}

      {step === "drymun" && completeRule && (
        <DryRunGate
          rule={completeRule}
          params={params}
          sampleSeed={sampleSeed}
          onPass={() => onComplete(completeRule)}
          onFail={() => setStep("review")}
        />
      )}
    </section>
  );
}

function completeRulePrefix(select: Select | null, transforms: Transform[]): boolean {
  return select !== null && transforms.length >= 1;
}

// ---------------------------------------------------------------------------
// Step 1 — SELECT
// ---------------------------------------------------------------------------

function SelectStep({
  options,
  selected,
  sample,
  params,
  onPick,
  onAnother,
  onNext,
}: {
  options: Option<Select>[];
  selected: Select | null;
  sample: Grid;
  params: GridParams;
  onPick: (s: Select) => void;
  onAnother: () => void;
  onNext: () => void;
}) {
  const highlight = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(resolveSelect(sample, selected).map((p) => posKey(p.row, p.col)));
  }, [selected, sample]);

  return (
    <>
      <GridView grid={sample} highlight={highlight} ariaLabel="sample grid with your selection glowing" />
      <ShowAnother onClick={onAnother} />
      <OptionList
        ariaLabel="which cells"
        options={options}
        isSelected={(o) => JSON.stringify(o) === JSON.stringify(selected)}
        onPick={onPick}
      />
      <NavRow onNext={selected ? onNext : undefined} nextLabel="Next: the move" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — TRANSFORM (chain up to 2)
// ---------------------------------------------------------------------------

function TransformStep({
  options,
  select,
  transforms,
  sample,
  onSet,
  onAnother,
  onBack,
  onNext,
}: {
  options: Option<Transform>[];
  select: Select;
  transforms: Transform[];
  sample: Grid;
  onSet: (t: Transform[]) => void;
  onAnother: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Preview the chain so far (before = sample, after = sample with transforms).
  const after = useMemo(() => {
    let g = sample;
    for (const t of transforms) {
      g = applyTransform(g, t, resolveSelect(g, select));
    }
    return g;
  }, [sample, transforms, select]);

  const setSlot = (i: number, t: Transform) => {
    const next = transforms.slice();
    next[i] = t;
    onSet(next);
  };

  return (
    <>
      <BeforeAfter before={sample} after={after} />
      <ShowAnother onClick={onAnother} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SlotPicker
          label="Move 1"
          options={options}
          value={transforms[0] ?? null}
          onPick={(t) => setSlot(0, t)}
        />
        {transforms.length >= 1 &&
          (transforms.length === 2 ? (
            <SlotPicker
              label="Move 2"
              options={options}
              value={transforms[1] ?? null}
              onPick={(t) => setSlot(1, t)}
              onRemove={() => onSet(transforms.slice(0, 1))}
            />
          ) : (
            <button type="button" onClick={() => onSet([...transforms, options[0]!.value])} style={ghostBtn}>
              + add a second move
            </button>
          ))}
      </div>

      <NavRow onBack={onBack} onNext={transforms.length >= 1 ? onNext : undefined} nextLabel="Next: the answer" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — READOUT
// ---------------------------------------------------------------------------

function ReadoutStep({
  options,
  select,
  transforms,
  readout,
  sample,
  params,
  onPick,
  onAnother,
  onBack,
  onNext,
}: {
  options: Option<Readout>[];
  select: Select;
  transforms: Transform[];
  readout: Readout | null;
  sample: Grid;
  params: GridParams;
  onPick: (r: Readout) => void;
  onAnother: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const after = useMemo(() => {
    let g = sample;
    for (const t of transforms) g = applyTransform(g, t, resolveSelect(g, select));
    return g;
  }, [sample, transforms, select]);

  const highlight = useMemo(() => {
    if (!readout) return new Set<string>();
    const positions = readoutPositions(readout, params.rows, params.cols);
    if (!positions) return new Set<string>(); // count: whole-grid, nothing single
    return new Set(positions.map((p) => posKey(p.row, p.col)));
  }, [readout, params.rows, params.cols]);

  const answer: Answer | null = useMemo(() => {
    if (!readout) return null;
    return applyRule(sample, { select, transforms, readout });
  }, [readout, sample, select, transforms]);

  return (
    <>
      <p style={muted}>This is the grid after your move. Pick what to report from it.</p>
      <GridView grid={after} highlight={highlight} ariaLabel="grid after your move; readout target glowing" />
      <ShowAnother onClick={onAnother} />

      {answer && (
        <div style={{ textAlign: "center" }}>
          <span style={muted}>For this grid you'd tap:</span>
          <div style={{ marginTop: 6 }}>
            <AnswerDisplay answer={answer} />
          </div>
        </div>
      )}

      <OptionList
        ariaLabel="what to report"
        options={options}
        isSelected={(o) => JSON.stringify(o) === JSON.stringify(readout)}
        onPick={onPick}
      />
      <NavRow onBack={onBack} onNext={readout ? onNext : undefined} nextLabel="Review" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — REVIEW (strength verdict at commit, §7/§8)
// ---------------------------------------------------------------------------

function ReviewStep({
  rule,
  params,
  sampleSeed,
  onBack,
  onConfirm,
}: {
  rule: Rule;
  params: GridParams;
  sampleSeed: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <p style={muted}>
        Here's how strong your move is. Higher is harder to guess and harder for a watcher to learn.
      </p>
      <StrengthVerdict rule={rule} params={params} sampleSeed={sampleSeed} />
      <p style={{ ...muted, fontStyle: "italic" }}>
        Next you'll prove you can do it from memory — no hints. After that, your move goes dark: the app
        will never show it again.
      </p>
      <NavRow onBack={onBack} onNext={onConfirm} nextLabel="I'm ready — practice it" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const muted: React.CSSProperties = { color: "#666", fontSize: 14, margin: 0, textAlign: "center" };
const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed #aaa",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

function StepHeader({ step }: { step: Step }) {
  const titles: Record<Step, string> = {
    select: "1 · Which cells?",
    transform: "2 · What do you do?",
    readout: "3 · What do you report?",
    review: "Review your move",
    drymun: "Prove you've got it",
  };
  return <h2 style={{ margin: 0, fontSize: 20, textAlign: "center" }}>{titles[step]}</h2>;
}

function BeforeAfter({ before, after }: { before: Grid; after: Grid }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center" }}>
      <Labeled label="before">
        <GridView grid={before} cellSize={40} ariaLabel="grid before your move" />
      </Labeled>
      <span aria-hidden="true" style={{ fontSize: 24, color: "#999" }}>
        →
      </span>
      <Labeled label="after">
        <GridView grid={after} cellSize={40} ariaLabel="grid after your move" />
      </Labeled>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {children}
      <small style={{ color: "#999" }}>{label}</small>
    </div>
  );
}

function ShowAnother({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...ghostBtn, alignSelf: "center" }}>
      ↻ Show another grid
    </button>
  );
}

function OptionList<T>({
  options,
  isSelected,
  onPick,
  ariaLabel,
}: {
  options: Option<T>[];
  isSelected: (value: T) => boolean;
  onPick: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}
    >
      {options.map((o) => {
        const sel = isSelected(o.value);
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onPick(o.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid " + (sel ? "#111" : "#ddd"),
              background: sel ? "#111" : "#fff",
              color: sel ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SlotPicker({
  label,
  options,
  value,
  onPick,
  onRemove,
}: {
  label: string;
  options: Option<Transform>[];
  value: Transform | null;
  onPick: (t: Transform) => void;
  onRemove?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>{label}</strong>
        {onRemove && (
          <button type="button" onClick={onRemove} style={{ ...ghostBtn, padding: "2px 8px", fontSize: 12 }}>
            remove
          </button>
        )}
      </div>
      <OptionList ariaLabel={label} options={options} isSelected={(o) => JSON.stringify(o) === JSON.stringify(value)} onPick={onPick} />
    </div>
  );
}

function NavRow({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack?: () => void;
  onNext?: (() => void) | undefined;
  nextLabel: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
      {onBack ? (
        <button type="button" onClick={onBack} style={ghostBtn}>
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={!onNext}
        style={{
          padding: "10px 22px",
          borderRadius: 999,
          border: "none",
          background: onNext ? "#111" : "#ccc",
          color: "#fff",
          cursor: onNext ? "pointer" : "default",
          fontSize: 15,
        }}
      >
        {nextLabel}
      </button>
    </div>
  );
}
