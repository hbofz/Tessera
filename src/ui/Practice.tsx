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
 * Forgiveness (§3, §9.5): a tap is checked against the grace window (t-1,t,t+1)
 * so a slip across a rollover isn't punished — forgiveness in the time domain,
 * never fuzzy answer matching.
 */

import { useMemo, useState } from "react";
import type { Answer } from "../engine/types.js";
import type { GridParams } from "../engine/clock.js";
import { DEFAULT_PARAMS, gridAtTick } from "../engine/clock.js";
import type { ReadoutShape } from "../engine/readout-shape.js";
import type { Verifier } from "../auth/verifier.js";
import { GridView } from "./GridView.js";
import { AnswerInput } from "./AnswerInput.js";
import type { Credential } from "../auth/verifier.js";

export interface PracticeProps {
  /** The answer SHAPE the UI must render (cell/count/line). NOT the rule — under
   *  Option B the client doesn't have the rule at all; verification goes through
   *  the verifier. The shape is the minimum the input needs (§9.1). */
  readonly shape: ReadoutShape;
  readonly credential: Credential;
  readonly verifier: Verifier;
  readonly seed: string;
  readonly params?: GridParams;
}

type Feedback = { kind: "correct" } | { kind: "wrong" } | null;

export function Practice({ shape, credential, verifier, seed, params = DEFAULT_PARAMS }: PracticeProps) {
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Each round draws a FRESH practice grid. Practice is about drilling the move
  // on new puzzles, so the grid advances per attempt — independent of the wall
  // clock (the clock only rolls every period, which would freeze practice on one
  // grid between rollovers). Practice grids are public, so this leaks nothing.
  const [round, setRound] = useState(0);

  const practiceTick = round; // a dedicated, non-clock stream of sample grids
  const grid = useMemo(
    () => gridAtTick(`${seed}#practice`, practiceTick, params),
    [seed, practiceTick, params],
  );

  const check = (answer: Answer) => {
    // Check against THIS round's grid directly. No clock grace window is needed:
    // the practice grid doesn't roll out from under the user mid-attempt.
    const matched = verifier.verify(credential, grid, answer, practiceTick);

    if (matched) {
      setStreak((s) => {
        const ns = s + 1;
        setBest((b) => Math.max(b, ns));
        return ns;
      });
      setFeedback({ kind: "correct" });
    } else {
      setStreak(0);
      setFeedback({ kind: "wrong" });
    }
    // Advance to a fresh grid for the next attempt.
    setRound((r) => r + 1);
  };

  return (
    <section
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 16 }}
    >
      <header style={{ textAlign: "center" }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Practice</h2>
        <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>
          Perform your move in your head, then tap the answer.
        </p>
      </header>

      <StreakBadge streak={streak} best={best} />

      <GridView grid={grid} cellSize={56} ariaLabel="practice challenge grid" />

      <AnswerInput key={round} shape={shape} onSubmit={check} />

      <FeedbackBanner feedback={feedback} />
    </section>
  );
}

function StreakBadge({ streak, best }: { streak: number; best: number }) {
  // Not a live region — the feedback banner is the single announced status, so
  // queries for role="status" resolve unambiguously to the PASS/FAIL message.
  return (
    <div style={{ display: "flex", gap: 16, fontSize: 14, color: "#444" }}>
      <span>
        🔥 streak: <strong>{streak}</strong>
      </span>
      <span>
        best: <strong>{best}</strong>
      </span>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  if (!feedback) return <div style={{ minHeight: 28 }} aria-live="assertive" />;
  const correct = feedback.kind === "correct";
  return (
    <div
      role="status"
      data-testid="feedback"
      aria-live="assertive"
      style={{
        minHeight: 28,
        fontSize: 16,
        fontWeight: 600,
        color: correct ? "#009E73" : "#D55E00",
      }}
    >
      {/* Only PASS/FAIL — never the expected answer (§9.1). */}
      {correct ? "Correct ✓" : "Not quite — try the next grid"}
    </div>
  );
}

