// @vitest-environment jsdom
//
// DOM glue for clipboard-table parsing needs a real DOMParser, so this file opts
// into jsdom (per the vitest.config.ts note). It pins the one behaviour the pure
// tests can't reach: how the outer `<table>` is walked.

import { describe, it, expect } from "vitest";
import { extractHtmlTableGrid } from "./clipboardTableDom";

describe("extractHtmlTableGrid", () => {
  it("extracts a simple table into a 2-D grid", () => {
    const grid = extractHtmlTableGrid(
      "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>",
    );
    expect(grid).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("renders a <br> inside a cell as a newline", () => {
    const grid = extractHtmlTableGrid(
      "<table><tr><td>a<br>b</td></tr></table>",
    );
    expect(grid).toEqual([["a\nb"]]);
  });

  it("excludes a nested table's rows and cells from the outer grid", () => {
    // The middle cell of the second column holds a whole nested table. Its rows
    // and cells must NOT leak into the outer grid — the result stays 2x2.
    const grid = extractHtmlTableGrid(
      "<table>" +
        "<tr><td>A1</td><td>B1</td></tr>" +
        "<tr><td>A2</td><td><table><tr><td>x</td><td>y</td></tr></table></td></tr>" +
        "</table>",
    );
    expect(grid).toEqual([
      ["A1", "B1"],
      // The nested table is flattened to text inside its host cell, not split
      // into extra rows/columns.
      ["A2", "xy"],
    ]);
  });

  it("returns null when there is no table", () => {
    expect(extractHtmlTableGrid("<p>no table here</p>")).toBeNull();
  });
});
