import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GridView, posKey } from "./GridView.js";
import { parseGrid } from "../engine/grid.js";

describe("GridView", () => {
  it("renders one accessible cell per grid position with color+shape labels", () => {
    const grid = parseGrid("RG/B_"); // R G / B empty
    render(<GridView grid={grid} />);

    // Each cell exposes a colorblind-safe label (color name + shape), and empty
    // cells are labeled too (empty is part of the picture, §4b).
    expect(screen.getByLabelText("red circle")).toBeInTheDocument();
    expect(screen.getByLabelText("green triangle")).toBeInTheDocument();
    expect(screen.getByLabelText("blue square")).toBeInTheDocument();
    expect(screen.getByLabelText("empty")).toBeInTheDocument();
  });

  it("exposes the whole grid as a labeled image region", () => {
    const grid = parseGrid("RG/B_");
    render(<GridView grid={grid} ariaLabel="practice grid" />);
    expect(screen.getByRole("img", { name: "practice grid" })).toBeInTheDocument();
  });

  it("marks highlighted cells in their accessible label", () => {
    const grid = parseGrid("RG/B_");
    const highlight = new Set([posKey(0, 0)]); // highlight the R
    render(<GridView grid={grid} highlight={highlight} />);
    expect(screen.getByLabelText("red circle, highlighted")).toBeInTheDocument();
    // A non-highlighted cell keeps its plain label.
    expect(screen.getByLabelText("green triangle")).toBeInTheDocument();
  });

  it("does not render a shape inside empty cells (color-independent encoding)", () => {
    // The empty cell's label has no shape word; colored cells always do.
    const grid = parseGrid("_R");
    render(<GridView grid={grid} />);
    const empty = screen.getByLabelText("empty");
    expect(empty.querySelector("svg")).toBeNull();
    const red = screen.getByLabelText("red circle");
    expect(red.querySelector("svg")).not.toBeNull();
  });
});
