import { describe, it, expect } from "vitest";
import {
  createInitialRows,
  INITIAL_DATA_ROW_COUNT,
  isAtomicPart,
  isPristineScaffold,
  MAX_TEMPLATE_ROWS,
  newRowId,
  normalizeValueParts,
  rowsReducer,
  slugifyKey,
  uniqueKey,
  type DataRow,
  type EditorRow,
  type SectionHeaderRow,
  type ValuePart,
} from "./rows";

// --- fixture helpers — keep each test focused on the one thing it asserts ----

function dataRow(
  id: string,
  key: string,
  valueParts: ValuePart[] = [{ type: "TEXT", text: "" }],
): DataRow {
  return {
    id,
    key,
    rowType: "DATA",
    label: "",
    valueParts,
    hideWhenEmpty: true,
  };
}

function sectionRow(id: string, key: string): SectionHeaderRow {
  return {
    id,
    key,
    rowType: "SECTION_HEADER",
    label: "",
    hideWhenEmpty: false,
  };
}

const metafield: ValuePart = {
  type: "METAFIELD",
  namespace: "custom",
  key: "battery_life",
};

const lineBreak: ValuePart = { type: "LINE_BREAK" };

// ---------------------------------------------------------------------------
// Pure key/label helpers
// ---------------------------------------------------------------------------

describe("slugifyKey", () => {
  it("converts a label to snake_case", () => {
    expect(slugifyKey("Screen Size")).toBe("screen_size");
  });

  it("collapses runs of non-alphanumerics and trims the edges", () => {
    expect(slugifyKey("  Up to / Max  ")).toBe("up_to_max");
  });

  it("strips accents via NFKD normalization", () => {
    expect(slugifyKey("Café")).toBe("cafe");
  });

  it("falls back to 'row' when nothing usable remains", () => {
    expect(slugifyKey("")).toBe("row");
    expect(slugifyKey("!!!")).toBe("row");
  });
});

describe("uniqueKey", () => {
  it("returns the base unchanged when it is not yet in use", () => {
    expect(uniqueKey("vendor", new Set())).toBe("vendor");
  });

  it("suffixes _2, _3, … to step past collisions", () => {
    expect(uniqueKey("row", new Set(["row"]))).toBe("row_2");
    expect(uniqueKey("row", new Set(["row", "row_2"]))).toBe("row_3");
  });
});

// ---------------------------------------------------------------------------
// Atomic-part predicate (Step 4)
// ---------------------------------------------------------------------------

describe("isAtomicPart", () => {
  it("is false for TEXT and true for every non-TEXT part", () => {
    expect(isAtomicPart({ type: "TEXT", text: "x" })).toBe(false);
    expect(isAtomicPart(metafield)).toBe(true);
    expect(isAtomicPart({ type: "SHOPIFY_FIELD", field: "vendor" })).toBe(true);
    expect(isAtomicPart(lineBreak)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Value-part normalization
// ---------------------------------------------------------------------------

describe("normalizeValueParts", () => {
  it("merges adjacent TEXT parts into one", () => {
    expect(
      normalizeValueParts([
        { type: "TEXT", text: "Up to " },
        { type: "TEXT", text: "10" },
      ]),
    ).toEqual([{ type: "TEXT", text: "Up to 10" }]);
  });

  it("leaves a pill sitting between two TEXT parts intact", () => {
    const parts: ValuePart[] = [
      { type: "TEXT", text: "Up to " },
      metafield,
      { type: "TEXT", text: " hours" },
    ];
    expect(normalizeValueParts(parts)).toEqual(parts);
  });

  it("always keeps at least one TEXT part so the cell stays editable", () => {
    expect(normalizeValueParts([])).toEqual([{ type: "TEXT", text: "" }]);
    expect(normalizeValueParts([metafield])).toEqual([
      metafield,
      { type: "TEXT", text: "" },
    ]);
  });

  it("treats LINE_BREAK as a merge boundary so the two lines stay separate", () => {
    const parts: ValuePart[] = [
      { type: "TEXT", text: "line one" },
      lineBreak,
      { type: "TEXT", text: "line two" },
    ];
    expect(normalizeValueParts(parts)).toEqual(parts);
  });

  it("keeps the ≥1-TEXT guarantee for a TEXT + LINE_BREAK value", () => {
    // A value that is only TEXT and LINE_BREAK is never treated as empty.
    const parts: ValuePart[] = [
      { type: "TEXT", text: "" },
      lineBreak,
      { type: "TEXT", text: "" },
    ];
    expect(normalizeValueParts(parts)).toEqual(parts);
    expect(normalizeValueParts([lineBreak])).toEqual([
      lineBreak,
      { type: "TEXT", text: "" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Small factories
// ---------------------------------------------------------------------------

describe("newRowId", () => {
  it("returns a fresh UUID on every call", () => {
    const a = newRowId();
    const b = newRowId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// The reducer — one block per action
// ---------------------------------------------------------------------------

describe("rowsReducer", () => {
  describe("ADD_ROW", () => {
    it("appends a blank DATA row with a provisional 'row' key and one TEXT part", () => {
      expect(rowsReducer([], { type: "ADD_ROW", id: "r1" })).toEqual([
        {
          id: "r1",
          key: "row",
          rowType: "DATA",
          label: "",
          valueParts: [{ type: "TEXT", text: "" }],
          hideWhenEmpty: true,
        },
      ]);
    });

    it("gives each new row a unique key (row, row_2, …)", () => {
      const one = rowsReducer([], { type: "ADD_ROW", id: "r1" });
      const two = rowsReducer(one, { type: "ADD_ROW", id: "r2" });
      expect(two.map((r) => r.key)).toEqual(["row", "row_2"]);
    });

    it("inserts directly below the active row when afterId is given", () => {
      const rows = [dataRow("a", "a"), dataRow("b", "b")];
      const result = rowsReducer(rows, {
        type: "ADD_ROW",
        id: "new",
        afterId: "a",
      });
      expect(result.map((r) => r.id)).toEqual(["a", "new", "b"]);
    });

    it("appends when afterId is missing or refers to a row that is gone", () => {
      const rows = [dataRow("a", "a")];
      expect(
        rowsReducer(rows, { type: "ADD_ROW", id: "n", afterId: "ghost" }).map(
          (r) => r.id,
        ),
      ).toEqual(["a", "n"]);
    });

    it("does not mutate the input array (the reducer is pure)", () => {
      const rows: EditorRow[] = [dataRow("a", "a")];
      rowsReducer(rows, { type: "ADD_ROW", id: "n" });
      expect(rows).toHaveLength(1);
    });
  });

  describe("ADD_SECTION", () => {
    it("appends a SECTION_HEADER with a 'section' key and no valueParts", () => {
      expect(rowsReducer([], { type: "ADD_SECTION", id: "s1" })).toEqual([
        {
          id: "s1",
          key: "section",
          rowType: "SECTION_HEADER",
          label: "",
          hideWhenEmpty: false,
        },
      ]);
    });
  });

  describe("DUPLICATE_ROW", () => {
    it("inserts a copy right after the source with a fresh id and a fresh unique key", () => {
      const rows = [dataRow("a", "screen_size")];
      const result = rowsReducer(rows, {
        type: "DUPLICATE_ROW",
        id: "a",
        newId: "a-copy",
      });
      expect(result.map((r) => r.id)).toEqual(["a", "a-copy"]);
      expect(result[1].key).toBe("screen_size_2");
    });

    it("gives the copy its own valueParts array (no shared mutation with the source)", () => {
      const source = dataRow("a", "a", [{ type: "TEXT", text: "x" }]);
      const result = rowsReducer([source], {
        type: "DUPLICATE_ROW",
        id: "a",
        newId: "copy",
      });
      const copy = result[1] as DataRow;
      copy.valueParts.push({ type: "TEXT", text: "added" });
      expect(source.valueParts).toHaveLength(1);
    });

    it("no-ops when the id is not found", () => {
      const rows = [dataRow("a", "a")];
      expect(
        rowsReducer(rows, { type: "DUPLICATE_ROW", id: "ghost", newId: "x" }),
      ).toBe(rows);
    });
  });

  describe("DELETE_ROW", () => {
    it("removes the row with the matching id", () => {
      const rows = [dataRow("a", "a"), dataRow("b", "b")];
      expect(
        rowsReducer(rows, { type: "DELETE_ROW", id: "a" }).map((r) => r.id),
      ).toEqual(["b"]);
    });
  });

  describe("DELETE_ROWS (bulk delete)", () => {
    it("deletes exactly the listed ids and preserves the order of the rest", () => {
      const rows = [
        dataRow("a", "a"),
        dataRow("b", "b"),
        dataRow("c", "c"),
        dataRow("d", "d"),
      ];
      expect(
        rowsReducer(rows, { type: "DELETE_ROWS", ids: ["b", "d"] }).map(
          (r) => r.id,
        ),
      ).toEqual(["a", "c"]);
    });

    it("returns the SAME array reference for an empty id list (no dirty flip)", () => {
      const rows = [dataRow("a", "a")];
      expect(rowsReducer(rows, { type: "DELETE_ROWS", ids: [] })).toBe(rows);
    });

    it("returns the SAME array reference when every id is foreign/stale (no dirty flip)", () => {
      const rows = [dataRow("a", "a"), dataRow("b", "b")];
      expect(
        rowsReducer(rows, { type: "DELETE_ROWS", ids: ["ghost", "missing"] }),
      ).toBe(rows);
    });

    it("deletes all rows when every id is listed (Select all → Delete leaves [])", () => {
      const rows = [
        dataRow("a", "a"),
        sectionRow("s", "section"),
        dataRow("b", "b"),
      ];
      expect(
        rowsReducer(rows, { type: "DELETE_ROWS", ids: ["a", "s", "b"] }),
      ).toEqual([]);
    });

    it("deletes only the live ids when the set mixes live and foreign ids", () => {
      const rows = [dataRow("a", "a"), dataRow("b", "b"), dataRow("c", "c")];
      expect(
        rowsReducer(rows, {
          type: "DELETE_ROWS",
          ids: ["b", "ghost"],
        }).map((r) => r.id),
      ).toEqual(["a", "c"]);
    });

    it("never touches the key or id of the surviving rows", () => {
      const rows: EditorRow[] = [
        dataRow("a", "battery_life"),
        sectionRow("s", "performance"),
        dataRow("c", "chipset"),
      ];
      const result = rowsReducer(rows, { type: "DELETE_ROWS", ids: ["s"] });
      expect(result.map((r) => [r.id, r.key])).toEqual([
        ["a", "battery_life"],
        ["c", "chipset"],
      ]);
    });

    it("does not mutate the input array (the reducer is pure)", () => {
      const rows: EditorRow[] = [dataRow("a", "a"), dataRow("b", "b")];
      const result = rowsReducer(rows, { type: "DELETE_ROWS", ids: ["a"] });
      expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
      expect(result).not.toBe(rows);
    });
  });

  describe("RESTORE_ROWS (bulk-delete undo)", () => {
    it("returns exactly the provided snapshot array (content, order, id and key)", () => {
      const snapshot: EditorRow[] = [
        dataRow("a", "battery_life", [{ type: "TEXT", text: "10h" }]),
        sectionRow("s", "performance"),
        dataRow("c", "chipset", [{ type: "TEXT", text: "M5" }]),
      ];
      const result = rowsReducer([], { type: "RESTORE_ROWS", rows: snapshot });
      // Same reference and same content — a verbatim restore, no remint.
      expect(result).toBe(snapshot);
      expect(result.map((r) => [r.id, r.key])).toEqual([
        ["a", "battery_life"],
        ["s", "performance"],
        ["c", "chipset"],
      ]);
    });

    it("round-trips DELETE_ROWS → RESTORE_ROWS back to the original rows", () => {
      const original: EditorRow[] = [
        dataRow("a", "a", [{ type: "TEXT", text: "one" }]),
        dataRow("b", "b", [{ type: "TEXT", text: "two" }]),
        sectionRow("s", "section"),
        dataRow("c", "c", [{ type: "TEXT", text: "three" }]),
      ];
      const afterDelete = rowsReducer(original, {
        type: "DELETE_ROWS",
        ids: ["b", "s"],
      });
      expect(afterDelete.map((r) => r.id)).toEqual(["a", "c"]);
      // Undo restores the captured pre-delete snapshot verbatim.
      const restored = rowsReducer(afterDelete, {
        type: "RESTORE_ROWS",
        rows: original,
      });
      expect(restored).toEqual(original);
    });

    it("restores an empty snapshot to [] (Select all → Delete → Undo path is coherent)", () => {
      const current = [dataRow("x", "x")];
      expect(rowsReducer(current, { type: "RESTORE_ROWS", rows: [] })).toEqual(
        [],
      );
    });
  });

  describe("SET_LABEL", () => {
    it("updates the label but never the key (data-model invariant)", () => {
      const rows = [dataRow("a", "screen_size")];
      const result = rowsReducer(rows, {
        type: "SET_LABEL",
        id: "a",
        label: "Display Size",
      });
      expect(result[0].label).toBe("Display Size");
      expect(result[0].key).toBe("screen_size");
    });
  });

  describe("SET_VALUE_PARTS (whole-value replacement from the textarea)", () => {
    it("replaces a DATA row's valueParts wholesale", () => {
      const rows = [
        dataRow("a", "a", [{ type: "TEXT", text: "old" }]),
        dataRow("b", "b", [{ type: "TEXT", text: "keep" }]),
      ];
      const next: ValuePart[] = [
        { type: "TEXT", text: "Up to " },
        metafield,
        { type: "TEXT", text: " hours" },
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PARTS",
        id: "a",
        valueParts: next,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual(next);
      // Other rows are untouched (same reference).
      expect(result[1]).toBe(rows[1]);
    });

    it("normalizes the incoming array (merges adjacent TEXT)", () => {
      const rows = [dataRow("a", "a")];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PARTS",
        id: "a",
        valueParts: [
          { type: "TEXT", text: "a" },
          { type: "TEXT", text: "b" },
        ],
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([{ type: "TEXT", text: "ab" }]);
    });

    it("normalizes an empty array to the always-editable TEXT seed", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "x" }])];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PARTS",
        id: "a",
        valueParts: [],
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([{ type: "TEXT", text: "" }]);
    });

    it("keeps LINE_BREAK parts and the TEXT runs they separate", () => {
      const rows = [dataRow("a", "a")];
      const next: ValuePart[] = [
        { type: "TEXT", text: "line one" },
        lineBreak,
        { type: "TEXT", text: "line two" },
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PARTS",
        id: "a",
        valueParts: next,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual(next);
    });

    it("no-ops (same reference) on a SECTION_HEADER id", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "SET_VALUE_PARTS",
          id: "s",
          valueParts: [{ type: "TEXT", text: "x" }],
        }),
      ).toEqual(rows);
    });

    it("no-ops (same reference) on an unknown id — never flips dirty", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "x" }])];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PARTS",
        id: "missing",
        valueParts: [{ type: "TEXT", text: "y" }],
      });
      expect(result[0]).toBe(rows[0]);
    });
  });

  describe("SET_VALUE_TEXT", () => {
    it("edits only the targeted TEXT segment, leaving pills untouched", () => {
      const rows = [
        dataRow("a", "a", [
          { type: "TEXT", text: "Up to " },
          metafield,
          { type: "TEXT", text: " hours" },
        ]),
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_TEXT",
        id: "a",
        partIndex: 0,
        text: "Max ",
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "Max " },
        metafield,
        { type: "TEXT", text: " hours" },
      ]);
    });

    it("ignores a partIndex that points at a non-TEXT part", () => {
      const rows = [
        dataRow("a", "a", [{ type: "TEXT", text: "x" }, metafield]),
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_TEXT",
        id: "a",
        partIndex: 1,
        text: "nope",
      }) as DataRow[];
      expect(result[0].valueParts[1]).toEqual(metafield);
    });

    it("does nothing to SECTION_HEADER rows (they have no value cell)", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "SET_VALUE_TEXT",
          id: "s",
          partIndex: 0,
          text: "x",
        }),
      ).toEqual(rows);
    });
  });

  describe("REMOVE_VALUE_PART", () => {
    it("drops the part and merges the surrounding TEXT back together", () => {
      const rows = [
        dataRow("a", "a", [
          { type: "TEXT", text: "Up to " },
          metafield,
          { type: "TEXT", text: " hours" },
        ]),
      ];
      const result = rowsReducer(rows, {
        type: "REMOVE_VALUE_PART",
        id: "a",
        partIndex: 1,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "Up to  hours" },
      ]);
    });

    it("does nothing to SECTION_HEADER rows (they have no value cell)", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "REMOVE_VALUE_PART",
          id: "s",
          partIndex: 0,
        }),
      ).toEqual(rows);
    });
  });

  describe("SET_VALUE_PART (in-place pill swap)", () => {
    const vendor: ValuePart = { type: "SHOPIFY_FIELD", field: "vendor" };
    const price: ValuePart = { type: "SHOPIFY_FIELD", field: "price" };

    it("replaces the atomic part in place, leaving length and neighbours untouched", () => {
      const rows = [
        dataRow("a", "a", [
          { type: "TEXT", text: "Up to " },
          vendor,
          { type: "TEXT", text: " hours" },
        ]),
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PART",
        id: "a",
        partIndex: 1,
        part: price,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "Up to " },
        price,
        { type: "TEXT", text: " hours" },
      ]);
    });

    it("converts a METAFIELD token to a SHOPIFY_FIELD in place (Step 6: native list only)", () => {
      const rows = [
        dataRow("a", "a", [
          { type: "TEXT", text: "" },
          metafield,
          { type: "TEXT", text: "" },
        ]),
      ];
      const result = rowsReducer(rows, {
        type: "SET_VALUE_PART",
        id: "a",
        partIndex: 1,
        part: vendor,
      }) as DataRow[];
      expect(result[0].valueParts[1]).toEqual(vendor);
    });

    it("no-ops on an out-of-range partIndex", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "x" }])];
      expect(
        rowsReducer(rows, {
          type: "SET_VALUE_PART",
          id: "a",
          partIndex: 5,
          part: vendor,
        }),
      ).toEqual(rows);
    });

    it("no-ops when the id is not found", () => {
      const rows = [dataRow("a", "a")];
      expect(
        rowsReducer(rows, {
          type: "SET_VALUE_PART",
          id: "ghost",
          partIndex: 0,
          part: vendor,
        }),
      ).toEqual(rows);
    });

    it("does nothing to SECTION_HEADER rows (they have no value cell)", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "SET_VALUE_PART",
          id: "s",
          partIndex: 0,
          part: vendor,
        }),
      ).toEqual(rows);
    });
  });

  describe("INSERT_VALUE_PART_AT (caret-aware insert/split)", () => {
    it("splits the TEXT run at the offset and drops the part between the halves", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "abcd" }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 2,
        part: lineBreak,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "ab" },
        lineBreak,
        { type: "TEXT", text: "cd" },
      ]);
    });

    it("inserts a LINE_BREAK at the caret between two existing TEXT lines", () => {
      // "1000 nits…" + Enter at the end → break then an empty trailing line.
      const rows = [
        dataRow("a", "a", [{ type: "TEXT", text: "1000 nits max" }]),
      ];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 13,
        part: lineBreak,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "1000 nits max" },
        lineBreak,
        { type: "TEXT", text: "" },
      ]);
    });

    it("keeps an empty leading TEXT when splitting at offset 0", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "hours" }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 0,
        part: metafield,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "" },
        metafield,
        { type: "TEXT", text: "hours" },
      ]);
    });

    it("splices the part in (no split) when the target index is an atomic part", () => {
      const rows = [
        dataRow("a", "a", [
          { type: "TEXT", text: "x" },
          metafield,
          { type: "TEXT", text: "y" },
        ]),
      ];
      // partIndex 1 is the metafield token → splice the break before it.
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 1,
        offset: 0,
        part: lineBreak,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "x" },
        lineBreak,
        metafield,
        { type: "TEXT", text: "y" },
      ]);
    });

    it("splices at the end when partIndex is past the last part (defensive)", () => {
      // Not reachable from a padded editor caret (linearToPartOffset resolves the
      // end into the trailing TEXT), but the reducer must still handle it: a
      // bare splice leaves no trailing TEXT because normalize only adds one when
      // the value has no TEXT at all.
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "x" }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 1,
        offset: 0,
        part: metafield,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "x" },
        metafield,
      ]);
    });

    it("does nothing to SECTION_HEADER rows (they have no value cell)", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "INSERT_VALUE_PART_AT",
          id: "s",
          partIndex: 0,
          offset: 0,
          part: lineBreak,
        }),
      ).toEqual(rows);
    });

    it("spaceAfter drops a trailing space, merged into the following TEXT (smart-pill UX)", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "Intel" }])];
      // Caret at the end of "Intel" → pill + space, with the space merged into
      // the (empty) trailing half so the cell ends with "Intel" + pill + " ".
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 5,
        part: metafield,
        spaceAfter: true,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "Intel" },
        metafield,
        { type: "TEXT", text: " " },
      ]);
    });

    it("spaceAfter prefixes the space onto the right half when splitting mid-text", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "ab" }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 1,
        part: metafield,
        spaceAfter: true,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "a" },
        metafield,
        { type: "TEXT", text: " b" },
      ]);
    });

    it("omitting spaceAfter inserts no space (LINE_BREAK path unchanged)", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "ab" }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART_AT",
        id: "a",
        partIndex: 0,
        offset: 1,
        part: metafield,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "a" },
        metafield,
        { type: "TEXT", text: "b" },
      ]);
    });
  });

  describe("MOVE_ROW (drag reorder)", () => {
    const four = (): EditorRow[] => [
      dataRow("a", "a"),
      dataRow("b", "b"),
      dataRow("c", "c"),
      dataRow("d", "d"),
    ];

    it("moves a row down (drop the first row onto the last)", () => {
      expect(
        rowsReducer(four(), {
          type: "MOVE_ROW",
          activeId: "a",
          overId: "d",
        }).map((r) => r.id),
      ).toEqual(["b", "c", "d", "a"]);
    });

    it("moves a row up (drop the last row onto the first)", () => {
      expect(
        rowsReducer(four(), {
          type: "MOVE_ROW",
          activeId: "d",
          overId: "a",
        }).map((r) => r.id),
      ).toEqual(["d", "a", "b", "c"]);
    });

    it("swaps with an adjacent neighbour", () => {
      expect(
        rowsReducer(four(), {
          type: "MOVE_ROW",
          activeId: "b",
          overId: "c",
        }).map((r) => r.id),
      ).toEqual(["a", "c", "b", "d"]);
    });

    it("moves a middle row to the first position", () => {
      expect(
        rowsReducer(four(), {
          type: "MOVE_ROW",
          activeId: "c",
          overId: "a",
        }).map((r) => r.id),
      ).toEqual(["c", "a", "b", "d"]);
    });

    it("moves a middle row to the last position", () => {
      expect(
        rowsReducer(four(), {
          type: "MOVE_ROW",
          activeId: "b",
          overId: "d",
        }).map((r) => r.id),
      ).toEqual(["a", "c", "d", "b"]);
    });

    it("no-ops (same reference) when dropped back onto itself", () => {
      const rows = four();
      expect(
        rowsReducer(rows, { type: "MOVE_ROW", activeId: "b", overId: "b" }),
      ).toBe(rows);
    });

    it("no-ops (same reference) when the active id is unknown", () => {
      const rows = four();
      expect(
        rowsReducer(rows, { type: "MOVE_ROW", activeId: "ghost", overId: "a" }),
      ).toBe(rows);
    });

    it("no-ops (same reference) when the over id is unknown", () => {
      const rows = four();
      expect(
        rowsReducer(rows, { type: "MOVE_ROW", activeId: "a", overId: "ghost" }),
      ).toBe(rows);
    });

    it("moves a SECTION_HEADER row like any other row (sections are not groups)", () => {
      const rows: EditorRow[] = [
        sectionRow("s", "display"),
        dataRow("a", "a"),
        dataRow("b", "b"),
      ];
      // Drag the section header down below the two data rows.
      expect(
        rowsReducer(rows, { type: "MOVE_ROW", activeId: "s", overId: "b" }).map(
          (r) => r.id,
        ),
      ).toEqual(["a", "b", "s"]);
    });

    it("moves a data row past a section without absorbing it (the section stays put)", () => {
      const rows: EditorRow[] = [
        dataRow("a", "a"),
        sectionRow("s", "display"),
        dataRow("b", "b"),
      ];
      // Drag 'b' above the section; only 'b' moves, the section is untouched.
      const result = rowsReducer(rows, {
        type: "MOVE_ROW",
        activeId: "b",
        overId: "s",
      });
      expect(result.map((r) => r.id)).toEqual(["a", "b", "s"]);
      expect(result.find((r) => r.id === "s")?.rowType).toBe("SECTION_HEADER");
    });

    it("never changes any row's id or key (reorder is not re-keying — data-model §12)", () => {
      const rows: EditorRow[] = [
        dataRow("a", "battery_life"),
        sectionRow("s", "performance"),
        dataRow("c", "chipset"),
      ];
      const result = rowsReducer(rows, {
        type: "MOVE_ROW",
        activeId: "c",
        overId: "a",
      });
      // The same id↔key pairing survives the move, just reordered.
      expect(result.map((r) => [r.id, r.key])).toEqual([
        ["c", "chipset"],
        ["a", "battery_life"],
        ["s", "performance"],
      ]);
    });

    it("does not mutate the input array (the reducer is pure)", () => {
      const rows = four();
      const result = rowsReducer(rows, {
        type: "MOVE_ROW",
        activeId: "a",
        overId: "d",
      });
      expect(rows.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
      expect(result).not.toBe(rows);
    });
  });

  describe("PASTE_ROWS (bulk insert from paste)", () => {
    const pastedRow = (
      id: string,
      label: string,
      valueParts: ValuePart[] = [{ type: "TEXT", text: "" }],
    ) => ({ id, label, valueParts });

    it("appends the pasted rows in order as DATA rows with hideWhenEmpty", () => {
      const result = rowsReducer([], {
        type: "PASTE_ROWS",
        rows: [
          pastedRow("p1", "RAM", [{ type: "TEXT", text: "16 GB" }]),
          pastedRow("p2", "Storage", [{ type: "TEXT", text: "1 TB" }]),
        ],
      });
      expect(result).toEqual([
        {
          id: "p1",
          key: "row",
          rowType: "DATA",
          label: "RAM",
          valueParts: [{ type: "TEXT", text: "16 GB" }],
          hideWhenEmpty: true,
        },
        {
          id: "p2",
          key: "row_2",
          rowType: "DATA",
          label: "Storage",
          valueParts: [{ type: "TEXT", text: "1 TB" }],
          hideWhenEmpty: true,
        },
      ]);
    });

    it("preserves the action's row ids verbatim", () => {
      const result = rowsReducer([], {
        type: "PASTE_ROWS",
        rows: [pastedRow("uuid-1", "A"), pastedRow("uuid-2", "B")],
      });
      expect(result.map((r) => r.id)).toEqual(["uuid-1", "uuid-2"]);
    });

    it("inserts the batch immediately after `afterId`, preserving order and pushing later rows down (file 22)", () => {
      const existing = [
        dataRow("a", "row"),
        dataRow("b", "row_2"),
        dataRow("c", "row_3"),
      ];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "A"), pastedRow("p2", "B")],
        afterId: "a",
      });
      // The block lands between `a` and `b`, in order; `b`/`c` slide down.
      expect(result.map((r) => r.id)).toEqual(["a", "p1", "p2", "b", "c"]);
    });

    it("appends when `afterId` is null (the fallback)", () => {
      const existing = [dataRow("a", "row"), dataRow("b", "row_2")];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "A")],
        afterId: null,
      });
      expect(result.map((r) => r.id)).toEqual(["a", "b", "p1"]);
    });

    it("appends when `afterId` points at a row that is gone (unknown id → fallback)", () => {
      const existing = [dataRow("a", "row"), dataRow("b", "row_2")];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "A")],
        afterId: "ghost",
      });
      expect(result.map((r) => r.id)).toEqual(["a", "b", "p1"]);
    });

    it("inserts the DATA rows directly after a SECTION_HEADER `afterId`", () => {
      const existing = [sectionRow("s", "section"), dataRow("a", "row")];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "A"), pastedRow("p2", "B")],
        afterId: "s",
      });
      expect(result.map((r) => r.id)).toEqual(["s", "p1", "p2", "a"]);
      // They land as DATA rows (a grid never creates a section), reading as the
      // section's rows.
      expect(result.slice(1, 3).every((r) => r.rowType === "DATA")).toBe(true);
    });

    it("seeds provisional keys unique against ALL existing rows after a mid-table splice (position is irrelevant to uniqueness)", () => {
      const existing = [
        dataRow("a", "row"),
        dataRow("b", "row_2"),
        dataRow("c", "ram"),
      ];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "X"), pastedRow("p2", "Y")],
        afterId: "a",
      });
      // Spliced between `a` and `b`, the new keys still step past the existing
      // `row`/`row_2` AND each other — no collision despite the mid-table position.
      const pasted = result.filter((r) => r.id === "p1" || r.id === "p2");
      expect(pasted.map((r) => r.key)).toEqual(["row_3", "row_4"]);
    });

    it("seeds provisional keys (row, row_2, …) — not label slugs — unique against existing rows and within the batch", () => {
      const existing = [dataRow("a", "row"), dataRow("b", "ram")];
      const result = rowsReducer(existing, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "RAM"), pastedRow("p2", "Storage")],
      });
      // The new keys step past the existing `row`/`ram` AND each other; they are
      // NOT slugged from the labels (RAM would slug to `ram`, which already exists).
      expect(result.slice(2).map((r) => r.key)).toEqual(["row_2", "row_3"]);
    });

    it("normalizes each pasted row's valueParts (merges adjacent TEXT, keeps line breaks)", () => {
      const result = rowsReducer([], {
        type: "PASTE_ROWS",
        rows: [
          pastedRow("p1", "L", [
            { type: "TEXT", text: "a" },
            { type: "TEXT", text: "b" },
          ]),
          pastedRow("p2", "M", [
            { type: "TEXT", text: "x" },
            lineBreak,
            { type: "TEXT", text: "y" },
          ]),
        ],
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([{ type: "TEXT", text: "ab" }]);
      expect(result[1].valueParts).toEqual([
        { type: "TEXT", text: "x" },
        lineBreak,
        { type: "TEXT", text: "y" },
      ]);
    });

    it("truncates to the room remaining under the cap", () => {
      const almost: EditorRow[] = Array.from(
        { length: MAX_TEMPLATE_ROWS - 2 },
        (_, i) => dataRow(String(i), `row_${i}`),
      );
      const result = rowsReducer(almost, {
        type: "PASTE_ROWS",
        rows: [
          pastedRow("p1", "A"),
          pastedRow("p2", "B"),
          pastedRow("p3", "C"), // over the cap — dropped
        ],
      });
      expect(result).toHaveLength(MAX_TEMPLATE_ROWS);
      expect(result.slice(-2).map((r) => r.id)).toEqual(["p1", "p2"]);
    });

    it("truncates to the room remaining even when splicing after a mid-table `afterId`", () => {
      const almost: EditorRow[] = Array.from(
        { length: MAX_TEMPLATE_ROWS - 2 },
        (_, i) => dataRow(String(i), `row_${i}`),
      );
      const result = rowsReducer(almost, {
        type: "PASTE_ROWS",
        rows: [
          pastedRow("p1", "A"),
          pastedRow("p2", "B"),
          pastedRow("p3", "C"),
        ],
        afterId: "0",
      });
      expect(result).toHaveLength(MAX_TEMPLATE_ROWS);
      // Only the first two fit (room = 2); they land right after row id "0".
      expect(result.slice(0, 3).map((r) => r.id)).toEqual(["0", "p1", "p2"]);
      expect(result.some((r) => r.id === "p3")).toBe(false);
    });

    it("returns the SAME array reference at the cap (nothing fits → never dirty)", () => {
      const full: EditorRow[] = Array.from(
        { length: MAX_TEMPLATE_ROWS },
        (_, i) => dataRow(String(i), `row_${i}`),
      );
      expect(
        rowsReducer(full, { type: "PASTE_ROWS", rows: [pastedRow("p1", "A")] }),
      ).toBe(full);
    });

    it("returns the SAME array reference for an empty paste", () => {
      const rows = [dataRow("a", "a")];
      expect(rowsReducer(rows, { type: "PASTE_ROWS", rows: [] })).toBe(rows);
    });

    it("does not mutate the input array (the reducer is pure)", () => {
      const rows: EditorRow[] = [dataRow("a", "a")];
      const result = rowsReducer(rows, {
        type: "PASTE_ROWS",
        rows: [pastedRow("p1", "A")],
      });
      expect(rows).toHaveLength(1);
      expect(result).not.toBe(rows);
    });

    describe("replace mode (file 23 — new-template scaffold swap)", () => {
      it("replaces the whole array with the pasted rows (the scaffold goes)", () => {
        const scaffold = createInitialRows(() => newRowId());
        const result = rowsReducer(scaffold, {
          type: "PASTE_ROWS",
          rows: [
            pastedRow("p1", "Processor", [{ type: "TEXT", text: "M5" }]),
            pastedRow("p2", "RAM", [{ type: "TEXT", text: "16 GB" }]),
          ],
          replace: true,
        });
        // Only the pasted rows remain — no leftover section or blank DATA rows.
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.id)).toEqual(["p1", "p2"]);
        expect(result.every((r) => r.rowType === "DATA")).toBe(true);
        expect(result.map((r) => r.label)).toEqual(["Processor", "RAM"]);
      });

      it("seeds provisional keys from empty (row, row_2, …), unique within the batch", () => {
        const scaffold = createInitialRows(() => newRowId());
        const result = rowsReducer(scaffold, {
          type: "PASTE_ROWS",
          rows: [
            pastedRow("p1", "A"),
            pastedRow("p2", "B"),
            pastedRow("p3", "C"),
          ],
          replace: true,
        });
        // Keys start clean at `row` (the scaffold's `section`/`row` keys are gone).
        expect(result.map((r) => r.key)).toEqual(["row", "row_2", "row_3"]);
        expect(new Set(result.map((r) => r.key)).size).toBe(result.length);
      });

      it("ignores afterId on the replace path (rows become the whole array)", () => {
        const scaffold = createInitialRows(() => newRowId());
        const result = rowsReducer(scaffold, {
          type: "PASTE_ROWS",
          rows: [pastedRow("p1", "A")],
          // A stray afterId must not splice — replace bases on [].
          afterId: scaffold[0].id,
          replace: true,
        });
        expect(result.map((r) => r.id)).toEqual(["p1"]);
      });

      it("cap-truncates to MAX_TEMPLATE_ROWS (a full table fits from empty)", () => {
        const scaffold = createInitialRows(() => newRowId());
        const many = Array.from({ length: MAX_TEMPLATE_ROWS + 5 }, (_, i) =>
          pastedRow(`p${i}`, `L${i}`),
        );
        const result = rowsReducer(scaffold, {
          type: "PASTE_ROWS",
          rows: many,
          replace: true,
        });
        expect(result).toHaveLength(MAX_TEMPLATE_ROWS);
        // The first MAX rows are kept; the overflow is dropped.
        expect(result[0].id).toBe("p0");
        expect(result.some((r) => r.id === `p${MAX_TEMPLATE_ROWS}`)).toBe(
          false,
        );
      });

      it("returns the SAME array reference for an empty replace (never wipes the scaffold)", () => {
        const scaffold = createInitialRows(() => newRowId());
        expect(
          rowsReducer(scaffold, {
            type: "PASTE_ROWS",
            rows: [],
            replace: true,
          }),
        ).toBe(scaffold);
      });

      it("does not mutate the source rows array (the reducer is pure)", () => {
        const scaffold = createInitialRows(() => newRowId());
        const before = scaffold.length;
        rowsReducer(scaffold, {
          type: "PASTE_ROWS",
          rows: [pastedRow("p1", "A")],
          replace: true,
        });
        expect(scaffold).toHaveLength(before);
      });
    });
  });

  describe("the 200-row cap", () => {
    it("refuses ADD_ROW / ADD_SECTION / DUPLICATE_ROW at the cap (the reducer is the real gate, not the disabled button)", () => {
      const full: EditorRow[] = Array.from(
        { length: MAX_TEMPLATE_ROWS },
        (_, i) => dataRow(String(i), `row_${i}`),
      );
      expect(rowsReducer(full, { type: "ADD_ROW", id: "x" })).toBe(full);
      expect(rowsReducer(full, { type: "ADD_SECTION", id: "x" })).toBe(full);
      expect(
        rowsReducer(full, { type: "DUPLICATE_ROW", id: "0", newId: "x" }),
      ).toBe(full);
    });

    it("still allows adding the row that lands exactly on the cap", () => {
      const almost: EditorRow[] = Array.from(
        { length: MAX_TEMPLATE_ROWS - 1 },
        (_, i) => dataRow(String(i), `row_${i}`),
      );
      expect(rowsReducer(almost, { type: "ADD_ROW", id: "last" })).toHaveLength(
        MAX_TEMPLATE_ROWS,
      );
    });
  });

  describe("unknown actions", () => {
    it("returns the same array reference for an unrecognized action", () => {
      const rows = [dataRow("a", "a")];
      // @ts-expect-error — exercising the reducer's defensive default branch
      expect(rowsReducer(rows, { type: "NOPE" })).toBe(rows);
    });
  });
});

// ---------------------------------------------------------------------------
// createInitialRows — the starter scaffold for a brand-new template
// ---------------------------------------------------------------------------

describe("createInitialRows", () => {
  // Inject deterministic ids so the factory is reproducible under test (the only
  // non-deterministic input is the id, supplied by the caller — see the doc note).
  function sequentialIds() {
    let n = 0;
    return () => `id_${(n += 1)}`;
  }

  it("returns one SECTION_HEADER followed by INITIAL_DATA_ROW_COUNT DATA rows", () => {
    const rows = createInitialRows(sequentialIds());

    expect(rows).toHaveLength(1 + INITIAL_DATA_ROW_COUNT);
    expect(rows[0].rowType).toBe("SECTION_HEADER");
    expect(rows.slice(1).every((row) => row.rowType === "DATA")).toBe(true);
    // The section comes first, then exactly five data rows.
    expect(rows.filter((row) => row.rowType === "DATA")).toHaveLength(
      INITIAL_DATA_ROW_COUNT,
    );
  });

  it("seeds every row blank (no label, data rows hold one empty TEXT part)", () => {
    const rows = createInitialRows(sequentialIds());

    expect(rows.every((row) => row.label === "")).toBe(true);
    for (const row of rows) {
      if (row.rowType === "DATA") {
        expect(row.valueParts).toEqual([{ type: "TEXT", text: "" }]);
        expect(row.hideWhenEmpty).toBe(true);
      } else {
        expect(row.hideWhenEmpty).toBe(false);
      }
    }
  });

  it("assigns the documented provisional keys (section, row, row_2 … row_5)", () => {
    const rows = createInitialRows(sequentialIds());

    expect(rows.map((row) => row.key)).toEqual([
      "section",
      "row",
      "row_2",
      "row_3",
      "row_4",
      "row_5",
    ]);
  });

  it("gives every row a unique key and a unique id", () => {
    const rows = createInitialRows(sequentialIds());

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("is deterministic for the same injected id sequence", () => {
    expect(createInitialRows(sequentialIds())).toEqual(
      createInitialRows(sequentialIds()),
    );
  });

  it("uses the injected ids in order", () => {
    const rows = createInitialRows(sequentialIds());

    expect(rows.map((row) => row.id)).toEqual([
      "id_1",
      "id_2",
      "id_3",
      "id_4",
      "id_5",
      "id_6",
    ]);
  });

  it("defaults to newRowId (uuid) when no id factory is injected", () => {
    const rows = createInitialRows();

    expect(rows).toHaveLength(1 + INITIAL_DATA_ROW_COUNT);
    // Distinct, non-empty ids minted by the default newRowId.
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.every((row) => row.id.length > 0)).toBe(true);
  });

  it("never exceeds the row cap (the scaffold is well under it)", () => {
    expect(1 + INITIAL_DATA_ROW_COUNT).toBeLessThanOrEqual(MAX_TEMPLATE_ROWS);
  });
});

// ---------------------------------------------------------------------------
// isPristineScaffold — recognizing the untouched starter scaffold (file 23)
// ---------------------------------------------------------------------------

describe("isPristineScaffold", () => {
  // A fresh, never-edited scaffold for each case (real uuids — keys are not
  // inspected, only the merchant-visible blank shape).
  const fresh = (): EditorRow[] => createInitialRows(() => newRowId());

  it("is true for the freshly seeded scaffold (createInitialRows)", () => {
    expect(isPristineScaffold(fresh())).toBe(true);
  });

  it("is false once a DATA row's label is typed", () => {
    const scaffold = fresh();
    const edited = rowsReducer(scaffold, {
      type: "SET_LABEL",
      id: scaffold[1].id,
      label: "Processor",
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false once the SECTION_HEADER label is typed", () => {
    const scaffold = fresh();
    const edited = rowsReducer(scaffold, {
      type: "SET_LABEL",
      id: scaffold[0].id,
      label: "Display",
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false once a DATA row's value is non-empty", () => {
    const scaffold = fresh();
    const edited = rowsReducer(scaffold, {
      type: "SET_VALUE_TEXT",
      id: scaffold[1].id,
      partIndex: 0,
      text: "M5",
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false after a row is added (wrong length)", () => {
    const edited = rowsReducer(fresh(), { type: "ADD_ROW", id: "extra" });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false after a row is deleted (wrong length)", () => {
    const scaffold = fresh();
    const edited = rowsReducer(scaffold, {
      type: "DELETE_ROW",
      id: scaffold[1].id,
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false after a reorder that moves the section out of the lead position", () => {
    const scaffold = fresh();
    // Drag the section header down below the first data row → rows[0] is now DATA.
    const edited = rowsReducer(scaffold, {
      type: "MOVE_ROW",
      activeId: scaffold[0].id,
      overId: scaffold[1].id,
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false when the leading row is not a SECTION_HEADER", () => {
    // Six DATA rows: right length, wrong leading type.
    const rows: EditorRow[] = Array.from(
      { length: INITIAL_DATA_ROW_COUNT + 1 },
      (_, i) => dataRow(String(i), `row_${i}`),
    );
    expect(isPristineScaffold(rows)).toBe(false);
  });

  it("is false when a DATA row carries an atomic value part (not a lone empty TEXT)", () => {
    const scaffold = fresh();
    const edited = rowsReducer(scaffold, {
      type: "INSERT_VALUE_PART_AT",
      id: scaffold[1].id,
      partIndex: 0,
      offset: 0,
      part: metafield,
    });
    expect(isPristineScaffold(edited)).toBe(false);
  });

  it("is false for an empty array and other wrong lengths", () => {
    expect(isPristineScaffold([])).toBe(false);
    expect(isPristineScaffold([sectionRow("s", "section")])).toBe(false);
  });

  it("does not inspect keys — a scaffold with finalized keys is still pristine", () => {
    const scaffold = fresh();
    // Simulate Save-time key finalization (labels are blank, so slugs fall back to
    // `row`, but uniqueness would differ); force arbitrary keys to prove keys are
    // ignored. The blank merchant-visible shape is unchanged → still pristine.
    const rekeyed: EditorRow[] = scaffold.map((row, i) => ({
      ...row,
      key: `finalized_${i}`,
    }));
    expect(isPristineScaffold(rekeyed)).toBe(true);
  });
});
