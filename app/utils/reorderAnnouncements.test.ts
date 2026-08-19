import { describe, it, expect } from "vitest";
import type { DataRow, EditorRow, SectionHeaderRow } from "./rows";
import {
  announceReorderCancel,
  announceReorderEnd,
  announceReorderOver,
  announceReorderStart,
  describeRow,
} from "./reorderAnnouncements";

function dataRow(id: string, label: string): DataRow {
  return {
    id,
    key: label || id,
    rowType: "DATA",
    label,
    valueParts: [{ type: "TEXT", text: "" }],
    hideWhenEmpty: true,
  };
}

function sectionRow(id: string, label: string): SectionHeaderRow {
  return {
    id,
    key: label || id,
    rowType: "SECTION_HEADER",
    label,
    hideWhenEmpty: false,
  };
}

// A small mixed template: a section, then three data rows.
const rows: EditorRow[] = [
  sectionRow("s1", "Display"),
  dataRow("r1", "Size"),
  dataRow("r2", "Battery Life"),
  dataRow("r3", ""), // blank-label data row at index 3
];

describe("describeRow", () => {
  it("describes a labelled data row as '<label> row'", () => {
    expect(describeRow(dataRow("r1", "Battery Life"), 2)).toBe(
      "Battery Life row",
    );
  });

  it("describes a labelled section as '<label> section'", () => {
    expect(describeRow(sectionRow("s1", "Display"), 0)).toBe("Display section");
  });

  it("falls back to a 1-based positional name for a blank data row", () => {
    expect(describeRow(dataRow("r3", ""), 3)).toBe("row 4");
  });

  it("falls back to a 1-based positional name for a blank section", () => {
    expect(describeRow(sectionRow("s9", "   "), 5)).toBe("section 6");
  });

  it("trims surrounding whitespace from the label", () => {
    expect(describeRow(dataRow("r1", "  Size  "), 1)).toBe("Size row");
  });
});

describe("announceReorderStart", () => {
  it("names the picked-up row and gives keyboard instructions", () => {
    expect(announceReorderStart(rows, "r2")).toBe(
      "Picked up Battery Life row. Use the arrow keys to move it, then press space or enter to drop it, or escape to cancel.",
    );
  });

  it("uses the section descriptor for a section row", () => {
    expect(announceReorderStart(rows, "s1")).toContain(
      "Picked up Display section.",
    );
  });
});

describe("announceReorderOver", () => {
  it("announces the 1-based target position and total", () => {
    // r2 hovering over s1 (index 0) -> position 1 of 4
    expect(announceReorderOver(rows, "r2", "s1")).toBe(
      "Battery Life row is now over position 1 of 4.",
    );
  });

  it("announces the last position correctly", () => {
    // s1 hovering over r3 (index 3) -> position 4 of 4
    expect(announceReorderOver(rows, "s1", "r3")).toBe(
      "Display section is now over position 4 of 4.",
    );
  });

  it("capitalizes a positional fallback descriptor at the sentence start", () => {
    // blank r3 (index 3 -> "row 4") hovering over r1 (index 1 -> position 2)
    expect(announceReorderOver(rows, "r3", "r1")).toBe(
      "Row 4 is now over position 2 of 4.",
    );
  });

  it("degrades gracefully when there is no drop target", () => {
    expect(announceReorderOver(rows, "r2", null)).toBe(
      "Battery Life row is no longer over a drop position.",
    );
  });

  it("degrades gracefully when the over id is unknown", () => {
    expect(announceReorderOver(rows, "r2", "nope")).toBe(
      "Battery Life row is no longer over a drop position.",
    );
  });
});

describe("announceReorderEnd", () => {
  it("announces the final 1-based position and total", () => {
    expect(announceReorderEnd(rows, "r2", "s1")).toBe(
      "Battery Life row was dropped at position 1 of 4.",
    );
  });

  it("drops without a position when there is no target", () => {
    expect(announceReorderEnd(rows, "r2", null)).toBe(
      "Battery Life row was dropped.",
    );
  });
});

describe("announceReorderCancel", () => {
  it("names the row and says it returned to its original position", () => {
    expect(announceReorderCancel(rows, "r2")).toBe(
      "Reordering cancelled. Battery Life row returned to its original position.",
    );
  });

  it("works with a section row", () => {
    expect(announceReorderCancel(rows, "s1")).toBe(
      "Reordering cancelled. Display section returned to its original position.",
    );
  });
});

describe("mixed-case labels keep their casing across every announcement", () => {
  // A user label like "iPhone" carries meaningful lowercase-first casing. The
  // sentence-start transform must NOT force it to "IPhone", or the same row
  // would be announced inconsistently (describeRow already preserves it).
  const mixed: EditorRow[] = [dataRow("a", "iPhone"), dataRow("b", "Charger")];

  it("preserves the label at a sentence start in over / end / cancel", () => {
    expect(announceReorderOver(mixed, "a", "b")).toBe(
      "iPhone row is now over position 2 of 2.",
    );
    expect(announceReorderEnd(mixed, "a", "b")).toBe(
      "iPhone row was dropped at position 2 of 2.",
    );
    expect(announceReorderEnd(mixed, "a", null)).toBe(
      "iPhone row was dropped.",
    );
    expect(announceReorderCancel(mixed, "a")).toBe(
      "Reordering cancelled. iPhone row returned to its original position.",
    );
    expect(announceReorderOver(mixed, "a", null)).toBe(
      "iPhone row is no longer over a drop position.",
    );
  });
});
