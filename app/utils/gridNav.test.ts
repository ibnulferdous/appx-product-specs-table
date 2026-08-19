import { describe, it, expect } from "vitest";
import { resolveGridTarget, type GridColumn } from "./gridNav";
import type { EditorRow } from "./rows";

// --- fixture helpers ---------------------------------------------------------
// The resolver reads only `id` + `rowType`, so the fixtures carry just those —
// matching the `Pick<EditorRow, "id" | "rowType">` param. Kept minimal so each
// test asserts one navigation rule.

type RowStub = Pick<EditorRow, "id" | "rowType">;

const data = (id: string): RowStub => ({ id, rowType: "DATA" });
const section = (id: string): RowStub => ({ id, rowType: "SECTION_HEADER" });

const BOTH_COLUMNS: GridColumn[] = ["label", "value"];

describe("resolveGridTarget — vertical step", () => {
  it("Down from a middle data row lands on the next row, column echoed", () => {
    const rows = [data("a"), data("b"), data("c")];
    for (const column of BOTH_COLUMNS) {
      expect(resolveGridTarget(rows, "b", column, "down")).toEqual({
        rowId: "c",
        cell: column,
      });
    }
  });

  it("Up from a middle data row lands on the previous row, column echoed", () => {
    const rows = [data("a"), data("b"), data("c")];
    for (const column of BOTH_COLUMNS) {
      expect(resolveGridTarget(rows, "b", column, "up")).toEqual({
        rowId: "a",
        cell: column,
      });
    }
  });
});

describe("resolveGridTarget — first/last no-op", () => {
  it("Down from the last row returns null", () => {
    const rows = [data("a"), data("b")];
    expect(resolveGridTarget(rows, "b", "value", "down")).toBeNull();
  });

  it("Up from the first row returns null", () => {
    const rows = [data("a"), data("b")];
    expect(resolveGridTarget(rows, "a", "label", "up")).toBeNull();
  });

  it("a single-row array is a no-op in both directions", () => {
    const rows = [data("only")];
    expect(resolveGridTarget(rows, "only", "value", "down")).toBeNull();
    expect(resolveGridTarget(rows, "only", "value", "up")).toBeNull();
  });
});

describe("resolveGridTarget — bad input", () => {
  it("an unknown currentRowId returns null", () => {
    const rows = [data("a"), data("b")];
    expect(resolveGridTarget(rows, "ghost", "value", "down")).toBeNull();
  });

  it("an empty rows array returns null", () => {
    expect(resolveGridTarget([], "a", "value", "down")).toBeNull();
  });
});

describe("resolveGridTarget — section rows", () => {
  it("landing on a section row returns cell:'section' regardless of column", () => {
    const rows = [data("a"), section("s"), data("c")];
    for (const column of BOTH_COLUMNS) {
      expect(resolveGridTarget(rows, "a", column, "down")).toEqual({
        rowId: "s",
        cell: "section",
      });
    }
  });

  it("leaving a section row (Down) keeps the input column — no downgrade", () => {
    const rows = [data("a"), section("s"), data("c")];
    for (const column of BOTH_COLUMNS) {
      expect(resolveGridTarget(rows, "s", column, "down")).toEqual({
        rowId: "c",
        cell: column,
      });
    }
  });
});

describe("resolveGridTarget — data→section→data sticky-column chain (locked)", () => {
  // The two scenarios locked in the feature doc: pressing Ctrl/Cmd+Down through a
  // section row keeps the merchant's column. Step 2 feeds the SAME column on each
  // hop (its preferredColumn ref stays unchanged while on the section), so the
  // resolver must never lose it.
  const rows = [data("top"), section("mid"), data("bottom")];

  it("Scenario 2 (started in Value): top → section → Value", () => {
    const hop1 = resolveGridTarget(rows, "top", "value", "down");
    expect(hop1).toEqual({ rowId: "mid", cell: "section" });
    const hop2 = resolveGridTarget(rows, "mid", "value", "down");
    expect(hop2).toEqual({ rowId: "bottom", cell: "value" });
  });

  it("Scenario 1 (started in Label): top → section → Label", () => {
    const hop1 = resolveGridTarget(rows, "top", "label", "down");
    expect(hop1).toEqual({ rowId: "mid", cell: "section" });
    const hop2 = resolveGridTarget(rows, "mid", "label", "down");
    expect(hop2).toEqual({ rowId: "bottom", cell: "label" });
  });

  it("reverses symmetrically going Up", () => {
    const hopUp1 = resolveGridTarget(rows, "bottom", "value", "up");
    expect(hopUp1).toEqual({ rowId: "mid", cell: "section" });
    const hopUp2 = resolveGridTarget(rows, "mid", "value", "up");
    expect(hopUp2).toEqual({ rowId: "top", cell: "value" });
  });
});

describe("resolveGridTarget — purity", () => {
  it("does not mutate the input rows array", () => {
    const rows = [data("a"), section("s"), data("c")];
    const snapshot = JSON.parse(JSON.stringify(rows));
    resolveGridTarget(rows, "a", "value", "down");
    resolveGridTarget(rows, "s", "label", "up");
    expect(rows).toEqual(snapshot);
  });

  it("two consecutive section headers still step one at a time", () => {
    // Defensive: nothing forbids back-to-back sections. Down from the first
    // section lands on the second section (not skipped to a data row).
    const rows = [data("a"), section("s1"), section("s2"), data("d")];
    expect(resolveGridTarget(rows, "s1", "value", "down")).toEqual({
      rowId: "s2",
      cell: "section",
    });
  });
});
