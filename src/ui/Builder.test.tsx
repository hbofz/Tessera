import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Builder } from "./Builder.js";
import { gridAtTick, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

const SAMPLE_SEED = "builder-test";

// The rule the test will assemble through the wizard.
const TARGET: Rule = {
  select: { type: "all" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

function honestDryRunCount(roundIndex: number): number {
  const g = gridAtTick(`${SAMPLE_SEED}#dryrun`, 1000 + roundIndex, DEFAULT_PARAMS);
  const a = applyRule(g, TARGET);
  if (a.kind !== "count") throw new Error("expected count");
  return a.value;
}

describe("Builder wizard (§8)", () => {
  it("walks SELECT → TRANSFORM → READOUT → review → dry-run and enrolls the rule", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn<(r: Rule) => void>();
    render(<Builder sampleSeed={SAMPLE_SEED} onComplete={onComplete} />);

    // Step 1: SELECT → "All cells"
    expect(screen.getByText("1 · Which cells?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "All cells" }));
    await user.click(screen.getByRole("button", { name: /Next: the move/ }));

    // Step 2: TRANSFORM → "Slide down"
    expect(screen.getByText("2 · What do you do?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Slide down" }));
    await user.click(screen.getByRole("button", { name: /Next: the answer/ }));

    // Step 3: READOUT → "Count of red"
    expect(screen.getByText("3 · What do you report?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Count of red" }));
    await user.click(screen.getByRole("button", { name: /Review/ }));

    // Step 4: review (strength verdict renders async) → confirm
    expect(screen.getByText("Review your move")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /I'm ready/ }));

    // Step 5: dry-run gate — answer all 3 rounds correctly.
    expect(screen.getByText("Prove you've got it")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      const n = honestDryRunCount(i);
      for (let k = 0; k < n; k++) {
        await user.click(screen.getByRole("button", { name: "increase" }));
      }
      await user.click(screen.getByRole("button", { name: "Check" }));
      await new Promise((r) => setTimeout(r, 800));
    }

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(onComplete).toHaveBeenCalledWith(TARGET);
  }, 15000);

  it("a failed dry-run returns to review instead of enrolling", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Builder sampleSeed={SAMPLE_SEED} onComplete={onComplete} />);

    await user.click(screen.getByRole("radio", { name: "All cells" }));
    await user.click(screen.getByRole("button", { name: /Next: the move/ }));
    await user.click(screen.getByRole("radio", { name: "Slide down" }));
    await user.click(screen.getByRole("button", { name: /Next: the answer/ }));
    await user.click(screen.getByRole("radio", { name: "Count of red" }));
    await user.click(screen.getByRole("button", { name: /Review/ }));
    await user.click(screen.getByRole("button", { name: /I'm ready/ }));

    // Answer all 3 rounds WRONG.
    const max = DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols;
    for (let i = 0; i < 3; i++) {
      const wrong = honestDryRunCount(i) === max ? max - 1 : honestDryRunCount(i) + 1;
      for (let k = 0; k < wrong; k++) {
        await user.click(screen.getByRole("button", { name: "increase" }));
      }
      await user.click(screen.getByRole("button", { name: "Check" }));
      await new Promise((r) => setTimeout(r, 800));
    }

    await waitFor(() => expect(screen.getByText("Review your move")).toBeInTheDocument(), { timeout: 3000 });
    expect(onComplete).not.toHaveBeenCalled();
  }, 15000);
});
