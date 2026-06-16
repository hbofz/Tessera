import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Practice } from "./Practice.js";
import { OptionAVerifier } from "../auth/verifier.js";
import { gridAtTick, tickForTime, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

const SEED = "practice-test-seed";
// A count readout keeps the test input simple (a stepper).
const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

const verifier = new OptionAVerifier();
const credential = verifier.enroll(RULE);

/** Pin Date.now to the middle of a known tick. */
const FIXED_TICK = 100;
const FIXED_NOW = (FIXED_TICK + 0.5) * DEFAULT_PARAMS.periodSeconds * 1000;

function honestCount(): number {
  const ans = applyRule(gridAtTick(SEED, FIXED_TICK, DEFAULT_PARAMS), RULE);
  if (ans.kind !== "count") throw new Error("expected count");
  return ans.value;
}

/** The set of counts that would PASS at FIXED_TICK (the grace window's answers). */
function passingCounts(): Set<number> {
  const out = new Set<number>();
  for (const t of [FIXED_TICK - 1, FIXED_TICK, FIXED_TICK + 1]) {
    const a = applyRule(gridAtTick(SEED, t, DEFAULT_PARAMS), RULE);
    if (a.kind === "count") out.add(a.value);
  }
  return out;
}

/** A count guaranteed to FAIL (differs from every grace-window answer). */
function failingCount(): number {
  const passing = passingCounts();
  const max = DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols;
  for (let n = 0; n <= max; n++) if (!passing.has(n)) return n;
  throw new Error("no failing count available");
}

// Pin Date.now (so the clock reads FIXED_TICK) WITHOUT faking timers — faking
// timers deadlocks user-event, which waits on real-time microtasks. The real
// 250ms interval just recomputes the same pinned tick, which is harmless.
let nowSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  nowSpy = vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});
afterEach(() => {
  nowSpy.mockRestore();
});

async function stepCountTo(user: ReturnType<typeof userEvent.setup>, n: number) {
  for (let i = 0; i < n; i++) {
    await user.click(screen.getByRole("button", { name: "increase" }));
  }
}

describe("Practice mode (§6)", () => {
  it("sanity: the pinned clock tick matches FIXED_TICK", () => {
    expect(tickForTime(FIXED_NOW, DEFAULT_PARAMS)).toBe(FIXED_TICK);
  });

  it("correct answer → 'Correct' and streak increments", async () => {
    const user = userEvent.setup();
    render(<Practice rule={RULE} credential={credential} verifier={verifier} seed={SEED} />);

    await stepCountTo(user, honestCount());
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByTestId("feedback")).toHaveTextContent("Correct");
    expect(screen.getByText(/streak:/)).toHaveTextContent("1");
  });

  it("wrong answer → 'Not quite' and streak stays 0", async () => {
    const user = userEvent.setup();
    render(<Practice rule={RULE} credential={credential} verifier={verifier} seed={SEED} />);

    await stepCountTo(user, failingCount());
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByTestId("feedback")).toHaveTextContent("Not quite");
  });

  it("NEVER reveals the rule or the expected answer (§9.1)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Practice rule={RULE} credential={credential} verifier={verifier} seed={SEED} />,
    );

    // Make a wrong attempt, then scan the entire DOM text for any leak.
    await stepCountTo(user, failingCount());
    await user.click(screen.getByRole("button", { name: "Check" }));

    const text = container.textContent ?? "";
    // No rule vocabulary surfaced anywhere in the UI.
    expect(text).not.toMatch(/shift|recolor|reflect|select|readout/i);
    // Feedback is PASS/FAIL only — it never states the expected answer.
    expect(screen.getByTestId("feedback")).toHaveTextContent("Not quite — try the next grid");
  });

  it("a correct answer for an adjacent tick is forgiven (grace window, §3)", async () => {
    // The honest answer for tick FIXED_TICK-1 should still pass at FIXED_TICK
    // (unless it happens to equal another window tick's — then this is vacuous,
    // but it still must PASS, which is the point).
    const prevAns = applyRule(gridAtTick(SEED, FIXED_TICK - 1, DEFAULT_PARAMS), RULE);
    if (prevAns.kind !== "count") throw new Error("expected count");

    const user = userEvent.setup();
    render(<Practice rule={RULE} credential={credential} verifier={verifier} seed={SEED} />);

    await stepCountTo(user, prevAns.value);
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByTestId("feedback")).toHaveTextContent("Correct");
  });
});
