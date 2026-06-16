import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MovePeek } from "./MovePeek.js";
import { DEFAULT_PARAMS } from "../engine/clock.js";
import type { Rule } from "../engine/types.js";

const RULE: Rule = {
  select: { type: "color", value: "R" },
  transforms: [{ type: "shift", dir: "down" }],
  readout: { type: "count", color: "R" },
};

describe("MovePeek (§9.1 — opt-in, never passive)", () => {
  it("shows nothing about the move until explicitly requested", () => {
    const { container } = render(<MovePeek rule={RULE} params={DEFAULT_PARAMS} peekSeed="p" />);
    // Only the trigger button is present; no answer, no preview.
    expect(screen.getByRole("button", { name: /Remind me my move/ })).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/you'd tap/i);
  });

  it("requires a confirm before revealing (two-step)", async () => {
    const user = userEvent.setup();
    render(<MovePeek rule={RULE} params={DEFAULT_PARAMS} peekSeed="p" />);

    await user.click(screen.getByRole("button", { name: /Remind me my move/ }));
    // Confirm step warns it shows the secret, and still hasn't revealed it.
    expect(screen.getByText(/secret move/i)).toBeInTheDocument();
    expect(screen.queryByText(/you'd tap/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show my move/ }));
    // Now the move is shown (this is intended — user chose to reveal it).
    expect(screen.getByText(/you'd tap/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "your move" })).toBeInTheDocument();
  });

  it("can be hidden again, returning to the trigger button", async () => {
    const user = userEvent.setup();
    render(<MovePeek rule={RULE} params={DEFAULT_PARAMS} peekSeed="p" />);
    await user.click(screen.getByRole("button", { name: /Remind me my move/ }));
    await user.click(screen.getByRole("button", { name: /Show my move/ }));
    await user.click(screen.getByRole("button", { name: /Hide my move/ }));
    expect(screen.getByRole("button", { name: /Remind me my move/ })).toBeInTheDocument();
    expect(screen.queryByText(/you'd tap/i)).toBeNull();
  });

  it("canceling the confirm reveals nothing", async () => {
    const user = userEvent.setup();
    render(<MovePeek rule={RULE} params={DEFAULT_PARAMS} peekSeed="p" />);
    await user.click(screen.getByRole("button", { name: /Remind me my move/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/you'd tap/i)).toBeNull();
    expect(screen.getByRole("button", { name: /Remind me my move/ })).toBeInTheDocument();
  });
});
