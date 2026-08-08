import { describe, it, expect } from "vitest";
import {
  cellCount,
  gridToPastedRows,
  hasMultipleColumns,
  normalizeGrid,
  parseClipboardTable,
  parseDelimitedText,
} from "./clipboardTable";

describe("parseDelimitedText", () => {
  it("parses a single cell", () => {
    expect(parseDelimitedText("a")).toEqual([["a"]]);
  });

  it("parses one row with many columns", () => {
    expect(parseDelimitedText("a\tb\tc")).toEqual([["a", "b", "c"]]);
  });

  it("parses many rows", () => {
    expect(parseDelimitedText("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("treats a \\r\\n pair as one row break", () => {
    expect(parseDelimitedText("a\tb\r\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("splits on a lone \\r", () => {
    expect(parseDelimitedText("a\rb")).toEqual([["a"], ["b"]]);
  });

  it("keeps a newline inside a quoted cell (one cell)", () => {
    expect(parseDelimitedText('"a\nb"\tc')).toEqual([["a\nb", "c"]]);
  });

  it("keeps a tab inside a quoted cell (one cell)", () => {
    expect(parseDelimitedText('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
  });

  it("un-escapes a doubled quote inside a quoted cell", () => {
    expect(parseDelimitedText('"a""b"')).toEqual([['a"b']]);
  });

  it("produces a trailing empty row for a trailing newline (un-normalized)", () => {
    expect(parseDelimitedText("a\tb\n")).toEqual([["a", "b"], [""]]);
  });

  it("returns a single empty cell for empty input", () => {
    expect(parseDelimitedText("")).toEqual([[""]]);
  });
});

describe("normalizeGrid", () => {
  it("trims each cell's leading/trailing whitespace", () => {
    expect(normalizeGrid([[" a ", "b\t"]])).toEqual([["a", "b"]]);
  });

  it("preserves an embedded newline inside a cell (not collapsed)", () => {
    expect(normalizeGrid([["a\nb"]])).toEqual([["a\nb"]]);
  });

  it("drops wholly-empty rows", () => {
    expect(normalizeGrid([["a"], ["", ""], ["b"]])).toEqual([["a"], ["b"]]);
  });

  it("returns [] when every row is empty", () => {
    expect(normalizeGrid([["", ""], [""]])).toEqual([]);
  });

  it("keeps ragged rows as-is (no padding)", () => {
    expect(normalizeGrid([["a", "b", "c"], ["d"]])).toEqual([
      ["a", "b", "c"],
      ["d"],
    ]);
  });

  it("is pure — returns a fresh grid and does not mutate the input", () => {
    const input = [[" a ", "b"]];
    const output = normalizeGrid(input);
    expect(input).toEqual([[" a ", "b"]]); // unchanged
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
  });
});

describe("parseClipboardTable", () => {
  it("prefers a usable (>1-cell) HTML grid over the text", () => {
    expect(
      parseClipboardTable({ htmlGrid: [["a", "b"]], text: "x\ty" }),
    ).toEqual([["a", "b"]]);
  });

  it("falls back to TSV when the HTML grid is null", () => {
    expect(parseClipboardTable({ htmlGrid: null, text: "a\tb\nc\td" })).toEqual(
      [
        ["a", "b"],
        ["c", "d"],
      ],
    );
  });

  it("falls back to TSV when the HTML grid is empty", () => {
    expect(parseClipboardTable({ htmlGrid: [], text: "a\tb" })).toEqual([
      ["a", "b"],
    ]);
  });

  it("falls back to TSV when the HTML grid is a degenerate 1×1", () => {
    expect(
      parseClipboardTable({
        htmlGrid: [["one blob"]],
        text: "a\tb\nc\td",
      }),
    ).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("normalizes the chosen source (trim + drop empty trailing row)", () => {
    expect(parseClipboardTable({ htmlGrid: null, text: " a \tb\n" })).toEqual([
      ["a", "b"],
    ]);
  });

  it("returns [] when both sources are empty", () => {
    expect(parseClipboardTable({ htmlGrid: null, text: "" })).toEqual([]);
    expect(parseClipboardTable({ htmlGrid: null, text: null })).toEqual([]);
  });
});

describe("cellCount", () => {
  it("counts the total cells across all rows", () => {
    expect(cellCount([])).toBe(0);
    expect(cellCount([["a"]])).toBe(1);
    expect(cellCount([["a", "b"]])).toBe(2);
    expect(cellCount([["a"], ["b"]])).toBe(2);
    expect(cellCount([["a", "b", "c"], ["d"]])).toBe(4);
  });
});

describe("hasMultipleColumns", () => {
  it("is false for an empty or degenerate grid", () => {
    expect(hasMultipleColumns([])).toBe(false);
    expect(hasMultipleColumns([[]])).toBe(false);
  });

  it("is false for a lone cell", () => {
    expect(hasMultipleColumns([["a"]])).toBe(false);
  });

  // The case feature 115 exists for: plain multi-line text pasted into a value
  // cell is a single COLUMN, so it must NOT be treated as a table (it becomes one
  // multiline value). `cellCount` says 3 here — that is the old, wrong signal.
  it("is false for a single column of many rows (multi-line text)", () => {
    const grid = [["Waterproof"], ["Bluetooth 5.0"], ["34 min flight"]];
    expect(hasMultipleColumns(grid)).toBe(false);
    expect(cellCount(grid)).toBe(3); // the predicate the value cell no longer uses
  });

  it("is true for one row with two columns", () => {
    expect(hasMultipleColumns([["a", "b"]])).toBe(true);
  });

  it("is true for a full 2-D table", () => {
    expect(
      hasMultipleColumns([
        ["RAM", "16 GB"],
        ["Weight", "249 g"],
      ]),
    ).toBe(true);
  });

  it("is true when ANY row has more than one column (ragged grid)", () => {
    expect(hasMultipleColumns([["a"], ["b", "c"]])).toBe(true);
  });
});

describe("gridToPastedRows", () => {
  it("maps a 2-column row to label + a single TEXT value", () => {
    expect(gridToPastedRows([["RAM", "16 GB"]])).toEqual([
      { label: "RAM", valueParts: [{ type: "TEXT", text: "16 GB" }] },
    ]);
  });

  it("maps a 1-column row to a label + a single empty TEXT (no value)", () => {
    expect(gridToPastedRows([["Display"]])).toEqual([
      { label: "Display", valueParts: [{ type: "TEXT", text: "" }] },
    ]);
  });

  it("joins 3+ remaining columns with a LINE_BREAK between each", () => {
    expect(gridToPastedRows([["Ports", "USB-C", "HDMI"]])).toEqual([
      {
        label: "Ports",
        valueParts: [
          { type: "TEXT", text: "USB-C" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: "HDMI" },
        ],
      },
    ]);
  });

  it("treats an embedded newline in a cell the same as a column boundary", () => {
    expect(gridToPastedRows([["Ports", "USB-C\nHDMI"]])).toEqual(
      gridToPastedRows([["Ports", "USB-C", "HDMI"]]),
    );
    expect(gridToPastedRows([["Ports", "USB-C\nHDMI"]])).toEqual([
      {
        label: "Ports",
        valueParts: [
          { type: "TEXT", text: "USB-C" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: "HDMI" },
        ],
      },
    ]);
  });

  it("maps each ragged row independently, without padding", () => {
    expect(gridToPastedRows([["A", "1", "2"], ["B"], ["C", "3"]])).toEqual([
      {
        label: "A",
        valueParts: [
          { type: "TEXT", text: "1" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: "2" },
        ],
      },
      { label: "B", valueParts: [{ type: "TEXT", text: "" }] },
      { label: "C", valueParts: [{ type: "TEXT", text: "3" }] },
    ]);
  });

  it("returns normalized valueParts (≥1 TEXT, line breaks kept, never two adjacent TEXT)", () => {
    const [row] = gridToPastedRows([["L", "a\nb", "c"]]);
    expect(row.valueParts).toEqual([
      { type: "TEXT", text: "a" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "b" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "c" },
    ]);
    row.valueParts.forEach((part, index) => {
      if (index > 0 && part.type === "TEXT") {
        expect(row.valueParts[index - 1].type).not.toBe("TEXT");
      }
    });
  });

  it("keeps a blank middle column as a blank line (faithful — the merchant edits post-paste)", () => {
    expect(gridToPastedRows([["L", "a", "", "c"]])).toEqual([
      {
        label: "L",
        valueParts: [
          { type: "TEXT", text: "a" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: "" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: "c" },
        ],
      },
    ]);
  });

  it("maps a value-only row (empty first column) to an empty-label data row", () => {
    expect(gridToPastedRows([["", "value"]])).toEqual([
      { label: "", valueParts: [{ type: "TEXT", text: "value" }] },
    ]);
  });

  it("returns [] for an empty grid", () => {
    expect(gridToPastedRows([])).toEqual([]);
  });

  it("is pure — does not mutate the input grid", () => {
    const grid = [["A", "1"]];
    gridToPastedRows(grid);
    expect(grid).toEqual([["A", "1"]]);
  });
});
