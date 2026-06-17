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
import { Button } from "./components/Button.js";

export interface BuilderProps {
  readonly params?: GridParams;
  /** Seed used to generate SAMPLE grids for previews (public; not the user's
   *  real enrollment seed). */
  readonly sampleSeed?: string;
  /** Called with the finished rule once the dry-run gate is passed. */
  readonly onComplete: (rule: Rule) => void;
}

type Step = "select" | "transform" | "readout" | "review" | "dryrun";
const ORDER: Step[] = ["select", "transform", "readout", "review", "dryrun"];

export function Builder({ params = DEFAULT_PARAMS, sampleSeed = "builder-samples", onComplete }: BuilderProps) {
  const [step, setStep] = useState<Step>("select");
  const [select, setSelect] = useState<Select | null>(null);
  const [transforms, setTransforms] = useState<Transform[]>([]);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [sampleTick, setSampleTick] = useState(1);

  const sample = useMemo(
    () => gridAtTick(sampleSeed, sampleTick, params),
    [sampleSeed, sampleTick, params],
  );
  const nextSample = () => setSampleTick((t) => t + 1);

  const selOpts = useMemo(() => selectOptions(params.rows, params.cols), [params.rows, params.cols]);
  const txOpts = useMemo(() => transformOptions(), []);
  const roOpts = useMemo(() => readoutOptions(params.rows, params.cols), [params.rows, params.cols]);

  const completeRule: Rule | null =
    select && transforms.length >= 1 && readout ? { select, transforms, readout } : null;

  return (
    <section className="w-full max-w-[520px] mx-auto flex flex-col gap-5">
      <StepHeader step={step} />

      {step === "select" && (
        <SelectStep
          options={selOpts}
          selected={select}
          sample={sample}
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
          onConfirm={() => setStep("dryrun")}
        />
      )}

      {step === "dryrun" && completeRule && (
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
  onPick,
  onAnother,
  onNext,
}: {
  options: Option<Select>[];
  selected: Select | null;
  sample: Grid;
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
      <Preview>
        <div className="w-full max-w-[300px] mx-auto">
          <GridView grid={sample} highlight={highlight} ariaLabel="sample grid with your selection glowing" />
        </div>
        <ShowAnother onClick={onAnother} locked={selected !== null} />
      </Preview>
      <OptionList
        ariaLabel="which cells"
        options={options}
        isSelected={(o) => sameOption(o, selected)}
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
  // Is the optional second slot revealed? It opens EMPTY (no pre-filled move) so
  // the user must choose — pre-filling it with options[0] ("Slide up") silently
  // undid a "Slide down" move 1, making the preview look like nothing changed.
  const [secondOpen, setSecondOpen] = useState(transforms.length === 2);

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

  const removeSecond = () => {
    onSet(transforms.slice(0, 1));
    setSecondOpen(false);
  };

  return (
    <>
      <Preview>
        <BeforeAfter before={sample} after={after} />
        <ShowAnother onClick={onAnother} locked={transforms.length >= 1} />
      </Preview>

      <div className="flex flex-col gap-3">
        <SlotPicker label="Move 1" options={options} value={transforms[0] ?? null} onPick={(t) => setSlot(0, t)} />
        {secondOpen ? (
          <SlotPicker
            label="Move 2"
            options={options}
            value={transforms[1] ?? null}
            onPick={(t) => setSlot(1, t)}
            onRemove={removeSecond}
          />
        ) : (
          <button
            type="button"
            onClick={() => setSecondOpen(true)}
            className="self-center text-sm px-3.5 py-2 rounded-lg border border-dashed border-border text-text-muted hover:text-text hover:border-text-faint transition"
          >
            + add a second move
          </button>
        )}
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
    if (!positions) return new Set<string>();
    return new Set(positions.map((p) => posKey(p.row, p.col)));
  }, [readout, params.rows, params.cols]);

  const answer: Answer | null = useMemo(() => {
    if (!readout) return null;
    return applyRule(sample, { select, transforms, readout });
  }, [readout, sample, select, transforms]);

  return (
    <>
      <p className="text-sm text-text-muted m-0 text-center">
        This is the grid after your move. Pick what to report from it.
      </p>
      <Preview>
        <div className="w-full max-w-[300px] mx-auto">
          <GridView grid={after} highlight={highlight} ariaLabel="grid after your move; readout target glowing" />
        </div>
        <ShowAnother onClick={onAnother} locked={readout !== null} />
      </Preview>

      {answer && (
        <div className="text-center flex flex-col items-center gap-1.5">
          <span className="text-sm text-text-muted">For this grid you'd tap:</span>
          <AnswerDisplay answer={answer} />
        </div>
      )}

      <OptionList
        ariaLabel="what to report"
        options={options}
        isSelected={(o) => sameOption(o, readout)}
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
      <p className="text-sm text-text-muted m-0 text-center">
        Here's how strong your move is. Higher is harder to guess and harder for a watcher to learn.
      </p>
      <StrengthVerdict rule={rule} params={params} sampleSeed={sampleSeed} />
      <p className="text-sm text-text-muted italic m-0 text-center leading-relaxed">
        Next you'll prove you can do it from memory — no hints. After that, your move goes dark: the
        app will never show it again.
      </p>
      <NavRow onBack={onBack} onNext={onConfirm} nextLabel="I'm ready — practice it" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** Structural equality for option values — order-independent, unlike the old
 *  JSON.stringify compare which depended on key insertion order. */
function sameOption<T>(a: T, b: T | null): boolean {
  if (b === null) return false;
  return stableKey(a) === stableKey(b);
}
function stableKey(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const o = v as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(o)
      .sort()
      .map((k) => [k, stableKey(o[k])]),
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2/50 border border-border p-4">
      {children}
    </div>
  );
}

function StepHeader({ step }: { step: Step }) {
  const titles: Record<Step, string> = {
    select: "1 · Which cells?",
    transform: "2 · What do you do?",
    readout: "3 · What do you report?",
    review: "Review your move",
    dryrun: "Prove you've got it",
  };
  const idx = ORDER.indexOf(step);
  return (
    <div className="flex flex-col items-center gap-3">
      <h2 className="m-0 text-xl font-semibold text-center">{titles[step]}</h2>
      <div className="flex gap-1.5" aria-hidden="true">
        {ORDER.map((s, i) => (
          <span
            key={s}
            className={
              "h-1 rounded-pill transition-all " +
              (i === idx ? "w-6 bg-ink" : i < idx ? "w-3 bg-text-faint" : "w-3 bg-surface-2 border border-border")
            }
          />
        ))}
      </div>
    </div>
  );
}

function BeforeAfter({ before, after }: { before: Grid; after: Grid }) {
  return (
    <div className="flex gap-2 items-center justify-center w-full">
      <Labeled label="before">
        <div className="w-full max-w-[168px]">
          <GridView grid={before} ariaLabel="grid before your move" />
        </div>
      </Labeled>
      <span aria-hidden="true" className="shrink-0 text-2xl text-text-faint">
        →
      </span>
      <Labeled label="after">
        <div className="w-full max-w-[168px]">
          <GridView grid={after} ariaLabel="grid after your move" />
        </div>
      </Labeled>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
      {children}
      <small className="text-text-faint">{label}</small>
    </div>
  );
}

/** Re-roll the sample grid. LOCKED once the user has made their choice on this
 *  step — otherwise the grid would shift out from under them while they reason
 *  about a specific one (and a recolor/select they just picked would re-apply to
 *  a different grid, looking like a glitch). They can still re-roll while
 *  exploring, before committing to a choice. */
function ShowAnother({ onClick, locked }: { onClick: () => void; locked?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onClick} disabled={locked}>
        ↻ Show another grid
      </Button>
      {locked && <span className="text-xs text-text-faint">Locked to this grid while you decide</span>}
    </div>
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
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2 justify-center">
      {options.map((o) => {
        const sel = isSelected(o.value);
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onPick(o.value)}
            className={
              "px-3.5 py-2 rounded-pill text-sm transition active:scale-95 border " +
              (sel
                ? "bg-ink text-ink-contrast border-ink"
                : "bg-surface text-text border-border hover:bg-surface-2")
            }
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
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <strong className="text-sm">{label}</strong>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-text-muted hover:text-danger underline underline-offset-2">
            remove
          </button>
        )}
      </div>
      <OptionList ariaLabel={label} options={options} isSelected={(o) => sameOption(o, value)} onPick={onPick} />
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
    <div className="flex justify-between items-center gap-3 mt-1">
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={!onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
