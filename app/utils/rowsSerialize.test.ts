import { describe, it, expect } from "vitest";
import {
  finalizeRowKeys,
  parseRows,
  reconcileRowKeys,
} from "./rowsSerialize";
import type { DataRow, EditorRow, SectionHeaderRow } from "./rows";

// --- fixtures ---------------------------------------------------------------

function dataRow(
  id: string,
  key: string,
  label = "",
  valueParts: DataRow["valueParts"] = [{ type: "TEXT", text: "" }],
): DataRow {
  return { id, key, rowType: "DATA", label, valueParts, hideWhenEmpty: true };
}

function sectionRow(id: string, key: string, label = ""): SectionHeaderRow {
  return { id, key, rowType: "SECTION_HEADER", label, hideWhenEmpty: false };
}

// ---------------------------------------------------------------------------
// parseRows — narrow unknown -> EditorRow[]
// ---------------------------------------------------------------------------

describe("parseRows", () => {
  it("returns [] for any non-array input", () => {
    expect(parseRows(null)).toEqual([]);
    expect(parseRows(undefined)).toEqual([]);
    expect(parseRows("nope")).toEqual([]);
    expect(parseRows({})).toEqual([]);
  });

  it("narrows a valid DATA row with every ValuePart variant", () => {
    const result = parseRows([
      {
        id: "r1",
        key: "battery_life",
        rowType: "DATA",
        label: "Battery Life",
        hideWhenEmpty: true,
        valueParts: [
          { type: "TEXT", text: "Up to " },
          { type: "METAFIELD", namespace: "custom", key: "battery_life" },
          { type: "SHOPIFY_FIELD", field: "vendor" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: " hours" },
        ],
      },
    ]);
    expect(result).toEqual([
      {
        id: "r1",
        key: "battery_life",
        rowType: "DATA",
        label: "Battery Life",
        hideWhenEmpty: true,
        valueParts: [
          { type: "TEXT", text: "Up to " },
          { type: "METAFIELD", namespace: "custom", key: "battery_life" },
          { type: "SHOPIFY_FIELD", field: "vendor" },
          { type: "LINE_BREAK" },
          { type: "TEXT", text: " hours" },
        ],
      },
    ]);
  });

  it("narrows a valid SECTION_HEADER row", () => {
    expect(
      parseRows([
        {
          id: "s1",
          key: "display",
          rowType: "SECTION_HEADER",
          label: "Display",
          hideWhenEmpty: false,
        },
      ]),
    ).toEqual([sectionRow("s1", "display", "Display")]);
  });

  it("drops rows with no id (cannot be aligned) and unknown rowType", () => {
    const result = parseRows([
      { key: "x", rowType: "DATA", label: "no id" },
      { id: "r2", rowType: "MYSTERY", label: "bad type" },
      { id: "r3", key: "ok", rowType: "DATA", label: "Good" },
    ]);
    expect(result.map((r) => r.id)).toEqual(["r3"]);
  });

  it("drops a malformed value part but keeps the row (≥1 TEXT guaranteed)", () => {
    const [row] = parseRows([
      {
        id: "r1",
        key: "k",
        rowType: "DATA",
        label: "L",
        valueParts: [
          { type: "METAFIELD", namespace: "custom" }, // missing key -> dropped
          { type: "SHOPIFY_FIELD" }, // missing field -> dropped
          { type: "WUT" }, // unknown -> dropped
        ],
      },
    ]) as DataRow[];
    expect(row.valueParts).toEqual([{ type: "TEXT", text: "" }]);
  });

  it("repairs an empty key from the label", () => {
    const [row] = parseRows([
      { id: "r1", key: "", rowType: "DATA", label: "Screen Size" },
    ]);
    expect(row.key).toBe("screen_size");
  });

  it("defaults hideWhenEmpty to true for data rows when absent", () => {
    const [row] = parseRows([
      { id: "r1", key: "k", rowType: "DATA", label: "L" },
    ]) as DataRow[];
    expect(row.hideWhenEmpty).toBe(true);
  });

  it("does not mutate the source array", () => {
    const source = [{ id: "r1", key: "k", rowType: "DATA", label: "L" }];
    const snapshot = JSON.stringify(source);
    parseRows(source);
    expect(JSON.stringify(source)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// finalizeRowKeys — slug only provisional rows, never re-derive a finalized key
// ---------------------------------------------------------------------------

describe("finalizeRowKeys", () => {
  it("slugs the key of a provisional row from its label", () => {
    const rows = [dataRow("r1", "row", "Battery Life")];
    const result = finalizeRowKeys(rows, new Set(["r1"]));
    expect(result[0].key).toBe("battery_life");
  });

  it("leaves a non-provisional row's key untouched even when its label changed", () => {
    // The classic data-model §12 hazard: key was finalized to `battery_life`,
    // label later changed to "Cell Life". A finalized key must NOT be re-derived.
    const rows = [dataRow("r1", "battery_life", "Cell Life")];
    const result = finalizeRowKeys(rows, new Set()); // r1 is not provisional
    expect(result[0].key).toBe("battery_life");
  });

  it("does not re-derive a finalized key whose string looks provisional ('Row' -> 'row')", () => {
    // A merchant legitimately labelled a row "Row"; its finalized key is `row`.
    // Because finalization is decided by the id-set (not a string pattern), a
    // later relabel does not move it.
    const rows = [dataRow("r1", "row", "Row 2")];
    const result = finalizeRowKeys(rows, new Set()); // not provisional
    expect(result[0].key).toBe("row");
  });

  it("makes a freshly slugged key unique against existing and sibling keys", () => {
    const rows = [
      dataRow("r1", "size", "Size"), // finalized, key taken
      dataRow("r2", "row", "Size"), // provisional, label collides -> size_2
      dataRow("r3", "row_2", "Size"), // provisional, label collides -> size_3
    ];
    const result = finalizeRowKeys(rows, new Set(["r2", "r3"]));
    expect(result.map((r) => r.key)).toEqual(["size", "size_2", "size_3"]);
  });

  it("returns a fresh array and does not mutate the source", () => {
    const rows = [dataRow("r1", "row", "Label")];
    const result = finalizeRowKeys(rows, new Set(["r1"]));
    expect(result).not.toBe(rows);
    expect(rows[0].key).toBe("row");
  });
});

// ---------------------------------------------------------------------------
// reconcileRowKeys — server-authoritative finalization vs persisted state
// ---------------------------------------------------------------------------

describe("reconcileRowKeys", () => {
  it("finalizes brand-new rows (not in persisted) from their label", () => {
    const incoming: EditorRow[] = [dataRow("new", "row", "Chipset")];
    const result = reconcileRowKeys(incoming, []);
    expect(result[0].key).toBe("chipset");
  });

  it("restores the persisted key for an existing row, ignoring a stale client key and a changed label", () => {
    const persisted: EditorRow[] = [dataRow("r1", "battery_life", "Battery Life")];
    // Client still carries the pre-finalization provisional key AND a new label.
    const incoming: EditorRow[] = [dataRow("r1", "row", "Cell Life")];
    const result = reconcileRowKeys(incoming, persisted);
    expect(result[0].key).toBe("battery_life");
  });

  it("keeps new keys unique against restored persisted keys", () => {
    const persisted: EditorRow[] = [dataRow("r1", "size", "Size")];
    const incoming: EditorRow[] = [
      dataRow("r1", "size", "Size"), // existing -> keeps `size`
      dataRow("new", "row", "Size"), // new, collides -> size_2
    ];
    const result = reconcileRowKeys(incoming, persisted);
    expect(result.map((r) => r.key)).toEqual(["size", "size_2"]);
  });

  it("does not mutate either argument", () => {
    const persisted: EditorRow[] = [dataRow("r1", "battery_life", "Battery")];
    const incoming: EditorRow[] = [dataRow("r1", "row", "Battery")];
    reconcileRowKeys(incoming, persisted);
    expect(incoming[0].key).toBe("row");
    expect(persisted[0].key).toBe("battery_life");
  });
});
