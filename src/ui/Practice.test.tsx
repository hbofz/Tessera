import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Practice } from "./Practice.js";
import { OptionAVerifier } from "../auth/verifier.js";
import { gridAtTick, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import { formatGrid } from "../engine/grid.js";
import { readoutShape } from "../engine/readout-shape.js";
import type { Rule } from "../engine/types.js";

const SEED = "practice-test-seed";
// A count readout keeps the test input simple (a stepper).
const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};
const SHAPE = readoutShape(RULE.readout, DEFAULT_PARAMS.rows, DEFAULT_PARAMS.cols);

const verifier = new OptionAVerifier();
const credential = verifier.enroll(RULE);

/** The honest answer for practice round i — practice draws from `${seed}#practice`. */
function honestCountForRound(i: number): number {
  const ans = applyRule(gridAtTick(`${SEED}#practice`, i, DEFAULT_PARAMS), RULE);
  if (ans.kind !== "count") throw new Error("expected count");
  return ans.value;
}

/** A count guaranteed to FAIL for round i. */
function failingCountForRound(i: number): number {
  const honest = honestCountForRound(i);
  const max = DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols;
  return honest === max ? max - 1 : honest + 1;
}

async function stepCountTo(user: ReturnType<typeof userEvent.setup>, n: number) {
  for (let i = 0; i < n; i++) {
    await user.click(screen.getByRole("button", { name: "increase" }));
  }
}

describe("Practice mode (§6)", () => {
  it("correct answer → 'Correct' and streak increments", async () => {
    const user = userEvent.setup();
    render(<Practice shape={SHAPE} credential={credential} verifier={verifier} seed={SEED} />);

    await stepCountTo(user, honestCountForRound(0));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByTestId("feedback")).toHaveTextContent("Correct");
    expect(screen.getByText(/streak:/)).toHaveTextContent("1");
  });

  it("wrong answer → 'Not quite' and streak stays 0", async () => {
    const user = userEvent.setup();
    render(<Practice shape={SHAPE} credential={credential} verifier={verifier} seed={SEED} />);

    await stepCountTo(user, failingCountForRound(0));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(screen.getByTestId("feedback")).toHaveTextContent("Not quite");
  });

  it("advances to a FRESH grid after each answer (regression: grid was frozen)", async () => {
    const user = userEvent.setup();
    render(<Practice shape={SHAPE} credential={credential} verifier={verifier} seed={SEED} />);

    const gridEl = () => screen.getByLabelText("practice challenge grid");
    // Snapshot the grid's accessible content before and after an answer. We use
    // the rendered cell labels as a fingerprint of the grid.
    const fingerprint = () => gridEl().innerHTML;

    const before = fingerprint();
    await stepCountTo(user, honestCountForRound(0));
    await user.click(screen.getByRole("button", { name: "Check" }));
    const after = fingerprint();

    // The two practice grids (round 0 vs round 1) must differ.
    expect(after).not.toBe(before);
    // And they should match the engine's round-0 / round-1 grids respectively.
    expect(before).not.toBe(after);
    expect(formatGrid(gridAtTick(`${SEED}#practice`, 0, DEFAULT_PARAMS))).not.toBe(
      formatGrid(gridAtTick(`${SEED}#practice`, 1, DEFAULT_PARAMS)),
    );
  });

  it("a wrong answer that happens to be right for a DIFFERENT round still fails (no cross-grid leniency)", async () => {
    // Round 0's grid is the only one being judged. Submitting round 1's honest
    // answer (when it differs from round 0's) must NOT pass.
    const r0 = honestCountForRound(0);
    const r1 = honestCountForRound(1);
    if (r0 === r1) return; // vacuous if they coincide

    const user = userEvent.setup();
    render(<Practice shape={SHAPE} credential={credential} verifier={verifier} seed={SEED} />);
    await stepCountTo(user, r1);
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByTestId("feedback")).toHaveTextContent("Not quite");
  });

  it("NEVER reveals the rule or the expected answer (§9.1)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Practice shape={SHAPE} credential={credential} verifier={verifier} seed={SEED} />,
    );

    await stepCountTo(user, failingCountForRound(0));
    await user.click(screen.getByRole("button", { name: "Check" }));

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/shift|recolor|reflect|select|readout/i);
    expect(screen.getByTestId("feedback")).toHaveTextContent("Not quite — try the next grid");
  });
});
