/**
 * Practice mode (DESIGN.md §6, §10 PRACTICE MODE).
 *
 * "same grid clock + same R, client-only, instant right/wrong feedback, streak
 * tracker. NEVER shows R or the transformed grid — only correct/incorrect."
 *
 * INVARIANT GUARD (§9.1): this component receives the rule's READOUT shape (to
 * size the input) but verifies through a Verifier, which returns only a boolean.
 * It NEVER renders R, a before→after preview, or "the answer was X". A wrong
 * attempt shows only "not quite" — the user must recall the move, not read it.
 *
 * Each answer (right OR wrong) advances to a fresh practice grid — this is a
 * tested regression guard (Practice.test.tsx "grid was frozen"): practice is
 * about drilling on NEW puzzles, and a frozen grid would let the user brute the
 * same one. The fresh grid animates in so the change is obvious. Practice grids
 * are public, so a per-attempt stream leaks nothing.
 */

import { useMemo, useState } from "react";
import type { Answer } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { DEFAULT_PARAMS, gridAtTick } from "../engine/clock.js";
import type { ReadoutShape } from "../engine/readout-shape.js";
import type { Verifier, Credential } from "../auth/verifier.js";
import { GridView } from "./GridView.js";
import { AnswerInput } from "./AnswerInput.js";

export interface PracticeProps {
  readonly shape: ReadoutShape;
  readonly credential: Credential;
  readonly verifier: Verifier;
  readonly seed: string;
  readonly params?: GridParams;
}

type Feedback = { kind: "correct" } | { kind: "wrong" } | null;

const BEST_KEY = "tessera.practice.best";

function loadBest(): number {
  try {
    const n = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
function saveBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // best-effort
  }
}

export function Practice({ shape, credential, verifier, seed, params = DEFAULT_PARAMS }: PracticeProps) {
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => loadBest());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [round, setRound] = useState(0);

  const grid = useMemo(
    () => gridAtTick(`${seed}#practice`, round, params),
    [seed, round, params],
  );

  const check = (answer: Answer) => {
    const matched = verifier.verify(credential, grid, answer, round);
    if (matched) {
      setStreak((s) => {
        const ns = s + 1;
        setBest((b) => {
          const nb = Math.max(b, ns);
          if (nb !== b) saveBest(nb);
          return nb;
        });
        return ns;
      });
      setFeedback({ kind: "correct" });
    } else {
      setStreak(0);
      setFeedback({ kind: "wrong" });
    }
    setRound((r) => r + 1);
  };

  return (
    <section className="flex flex-col items-center gap-5 w-full">
      <header className="text-center">
        <h2 className="m-0 text-xl font-semibold">Practice</h2>
        <p className="mt-1 mb-0 text-text-muted text-sm">
          Perform your move in your head, then tap the answer.
        </p>
      </header>

      <StreakBadge streak={streak} best={best} />

      <div className="w-full max-w-[300px]">
        <GridView grid={grid} ariaLabel="practice challenge grid" />
      </div>

      <AnswerInput key={round} shape={shape} onSubmit={check} />

      <FeedbackBanner feedback={feedback} />
    </section>
  );
}

function StreakBadge({ streak, best }: { streak: number; best: number }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-2 border border-border">
        <span aria-hidden="true">🔥</span>
        <span className="text-text-muted">
          streak: <strong className="text-text tabular-nums">{streak}</strong>
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-2 border border-border text-text-muted">
        best: <strong className="text-text tabular-nums">{best}</strong>
      </span>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return <div className="min-h-7" aria-live="assertive" />;
  const correct = feedback.kind === "correct";
  return (
    <div
      role="status"
      data-testid="feedback"
      aria-live="assertive"
      className={"min-h-7 text-base font-semibold " + (correct ? "text-success" : "text-danger")}
    >
      {/* Only PASS/FAIL — never the expected answer (§9.1). */}
      {correct ? "Correct ✓" : "Not quite — try the next grid"}
    </div>
  );
}
