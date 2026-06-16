import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";
import { loadEnrollment } from "../auth/persistence.js";

beforeEach(() => {
  localStorage.clear();
});

/** Drive the builder to enroll the rule All→Slide down→Count of red. */
async function enrollAMove(user: ReturnType<typeof userEvent.setup>) {
  // Need the honest dry-run answers; recompute via the same seed the App uses.
  const { gridAtTick, DEFAULT_PARAMS } = await import("../engine/clock.js");
  const { applyRule } = await import("../engine/rule.js");
  const rule = {
    select: { type: "all" as const },
    transforms: [{ type: "shift" as const, dir: "down" as const }],
    readout: { type: "count" as const, color: "R" as const },
  };
  const honest = (i: number) => {
    const a = applyRule(gridAtTick("builder-samples#dryrun", 1000 + i, DEFAULT_PARAMS), rule);
    if (a.kind !== "count") throw new Error("expected count");
    return a.value;
  };

  await user.click(screen.getByRole("button", { name: "Build a move" }));
  await user.click(screen.getByRole("radio", { name: "All cells" }));
  await user.click(screen.getByRole("button", { name: /Next: the move/ }));
  await user.click(screen.getByRole("radio", { name: "Slide down" }));
  await user.click(screen.getByRole("button", { name: /Next: the answer/ }));
  await user.click(screen.getByRole("radio", { name: "Count of red" }));
  await user.click(screen.getByRole("button", { name: /Review/ }));
  await user.click(screen.getByRole("button", { name: /I'm ready/ }));
  for (let i = 0; i < 3; i++) {
    const n = honest(i);
    for (let k = 0; k < n; k++) await user.click(screen.getByRole("button", { name: "increase" }));
    await user.click(screen.getByRole("button", { name: "Check" }));
    await new Promise((r) => setTimeout(r, 800));
  }
}

describe("App — enrollment persistence", () => {
  it("a fresh visitor starts with no move and is prompted to build one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Practice" }));
    expect(screen.getByText(/haven't set a move yet/i)).toBeInTheDocument();
  });

  it("enrolling persists the move to storage", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enrollAMove(user);
    await waitFor(() => expect(loadEnrollment()).not.toBeNull(), { timeout: 3000 });
  }, 15000);

  it("a returning visitor (persisted move) boots straight into practice", async () => {
    // First session enrolls.
    const user = userEvent.setup();
    const first = render(<App />);
    await enrollAMove(user);
    await waitFor(() => expect(loadEnrollment()).not.toBeNull(), { timeout: 3000 });
    first.unmount();

    // Second session: a fresh App, same storage → no "build first" prompt.
    render(<App />);
    expect(screen.queryByText(/haven't set a move yet/i)).toBeNull();
    // The practice grid is present (we're in practice, not the builder) — proof
    // the move restored and we booted past the "build first" prompt.
    expect(screen.getByLabelText("practice challenge grid")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
  }, 20000);

  it("'forget this move' clears storage and returns to building", async () => {
    const user = userEvent.setup();
    render(<App />);
    await enrollAMove(user);
    await waitFor(() => expect(loadEnrollment()).not.toBeNull(), { timeout: 3000 });

    await user.click(screen.getByRole("button", { name: /Forget this move/ }));
    expect(loadEnrollment()).toBeNull();
  }, 15000);
});
