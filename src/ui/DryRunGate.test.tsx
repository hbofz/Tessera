import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DryRunGate } from "./DryRunGate.js";
import { gridAtTick, DEFAULT_PARAMS } from "../engine/clock.js";
import { applyRule } from "../engine/rule.js";
import type { Rule } from "../engine/types.js";

const SEED = "gate-test";
const RULE: Rule = {
  select: { type: "all" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

/** The honest count for round i (the gate uses `${seed}#dryrun`, 1000 + i). */
function honestCountForRound(i: number): number {
  const g = gridAtTick(`${SEED}#dryrun`, 1000 + i, DEFAULT_PARAMS);
  const a = applyRule(g, RULE);
  if (a.kind !== "count") throw new Error("expected count");
  return a.value;
}

async function answerCount(user: ReturnType<typeof userEvent.setup>, n: number) {
  for (let i = 0; i < n; i++) {
    await user.click(screen.getByRole("button", { name: "increase" }));
  }
  await user.click(screen.getByRole("button", { name: "Check" }));
}

describe("DryRunGate (§8)", () => {
  it("passes (onPass) when ≥ needed rounds are correct", async () => {
    const user = userEvent.setup();
    const onPass = vi.fn();
    const onFail = vi.fn();
    render(
      <DryRunGate rule={RULE} params={DEFAULT_PARAMS} sampleSeed={SEED} onPass={onPass} onFail={onFail} />,
    );

    // Answer all 3 rounds correctly.
    for (let i = 0; i < 3; i++) {
      await answerCount(user, honestCountForRound(i));
      // wait for the transition to the next round / completion
      await waitFor(() => {}, { timeout: 50 }).catch(() => {});
      // small real delay for the 700ms timeout
      await new Promise((r) => setTimeout(r, 800));
    }

    await waitFor(() => expect(onPass).toHaveBeenCalledTimes(1));
    expect(onFail).not.toHaveBeenCalled();
  }, 10000);

  it("fails (onFail) when fewer than needed are correct", async () => {
    const user = userEvent.setup();
    const onPass = vi.fn();
    const onFail = vi.fn();
    render(
      <DryRunGate rule={RULE} params={DEFAULT_PARAMS} sampleSeed={SEED} onPass={onPass} onFail={onFail} />,
    );

    // Answer all 3 rounds WRONG (honest + 1, clamped).
    const max = DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols;
    for (let i = 0; i < 3; i++) {
      const wrong = honestCountForRound(i) === max ? max - 1 : honestCountForRound(i) + 1;
      await answerCount(user, wrong);
      await new Promise((r) => setTimeout(r, 800));
    }

    await waitFor(() => expect(onFail).toHaveBeenCalledTimes(1));
    expect(onPass).not.toHaveBeenCalled();
  }, 10000);

  it("shows only PASS/FAIL, never the expected answer (§9.1)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DryRunGate rule={RULE} params={DEFAULT_PARAMS} sampleSeed={SEED} onPass={vi.fn()} onFail={vi.fn()} />,
    );

    // Make one wrong attempt and inspect the feedback.
    const max = DEFAULT_PARAMS.rows * DEFAULT_PARAMS.cols;
    const wrong = honestCountForRound(0) === max ? max - 1 : honestCountForRound(0) + 1;
    await answerCount(user, wrong);

    const feedback = await screen.findByTestId("dryrun-feedback");
    expect(feedback).toHaveTextContent("Not that one");
    // No rule vocabulary anywhere.
    expect(container.textContent ?? "").not.toMatch(/shift|recolor|reflect|select|readout/i);
  });
});
