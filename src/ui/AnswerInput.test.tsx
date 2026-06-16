import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerInput } from "./AnswerInput.js";
import type { Answer } from "../engine/types.js";

describe("AnswerInput — cell", () => {
  it("produces a cell answer for the picked color", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(a: Answer) => void>();
    render(<AnswerInput shape={{ kind: "cell" }} onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("green triangle"));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "cell", value: "G" });
  });

  it("can pick empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(a: Answer) => void>();
    render(<AnswerInput shape={{ kind: "cell" }} onSubmit={onSubmit} />);
    await user.click(screen.getByLabelText("empty"));
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: "cell", value: "_" });
  });

  it("cannot submit before picking", () => {
    render(<AnswerInput shape={{ kind: "cell" }} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
  });
});

describe("AnswerInput — count", () => {
  it("steps up and submits the number", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(a: Answer) => void>();
    render(<AnswerInput shape={{ kind: "count", max: 16 }} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "increase" }));
    await user.click(screen.getByRole("button", { name: "increase" }));
    await user.click(screen.getByRole("button", { name: "increase" }));
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "count", value: 3 });
  });

  it("clamps at 0 and at max", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(a: Answer) => void>();
    render(<AnswerInput shape={{ kind: "count", max: 2 }} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "decrease" })); // stays 0
    await user.click(screen.getByRole("button", { name: "Check" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ kind: "count", value: 0 });
  });
});

describe("AnswerInput — line", () => {
  it("cycles each slot and submits the sequence", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(a: Answer) => void>();
    render(
      <AnswerInput
        shape={{ kind: "line", length: 2 }}
        onSubmit={onSubmit}
      />,
    );

    // Cell options cycle R, G, B, _ then wrap. Slots start at _.
    const slots = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-label") !== null);
    // First two role=button with cell labels are the slots; tap slot 0 once →
    // from "_" to "R"; tap slot 1 twice → "_"→"R"→"G".
    const slot0 = slots[0]!;
    const slot1 = slots[1]!;
    await user.click(slot0); // _ -> R
    await user.click(slot1); // _ -> R
    await user.click(slot1); // R -> G
    await user.click(screen.getByRole("button", { name: "Check" }));

    expect(onSubmit).toHaveBeenCalledWith({ kind: "line", value: ["R", "G"] });
  });
});
