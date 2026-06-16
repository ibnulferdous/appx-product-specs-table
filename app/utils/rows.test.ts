import { describe, it, expect } from "vitest";
import {
  isAtomicPart,
  MAX_TEMPLATE_ROWS,
  newRowId,
  normalizeRows,
  normalizeValueParts,
  placeholderMetafieldPart,
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
  return { id, key, rowType: "DATA", label: "", valueParts, hideWhenEmpty: true };
}

function sectionRow(id: string, key: string): SectionHeaderRow {
  return { id, key, rowType: "SECTION_HEADER", label: "", hideWhenEmpty: false };
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
// Loaded-rows normalization
// ---------------------------------------------------------------------------

describe("normalizeRows", () => {
  it("passes an array through unchanged", () => {
    const rows = [dataRow("1", "row")];
    expect(normalizeRows(rows)).toBe(rows);
  });

  it("returns [] for any non-array input", () => {
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows(undefined)).toEqual([]);
    expect(normalizeRows("not-an-array")).toEqual([]);
    expect(normalizeRows({})).toEqual([]);
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

describe("placeholderMetafieldPart", () => {
  it("is a keyless custom METAFIELD that the field picker fills in later", () => {
    expect(placeholderMetafieldPart()).toEqual({
      type: "METAFIELD",
      namespace: "custom",
      key: "",
    });
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

  describe("INSERT_VALUE_PART", () => {
    it("appends the part plus a trailing empty TEXT so typing can continue after it", () => {
      const rows = [dataRow("a", "a", [{ type: "TEXT", text: "Up to " }])];
      const result = rowsReducer(rows, {
        type: "INSERT_VALUE_PART",
        id: "a",
        part: metafield,
      }) as DataRow[];
      expect(result[0].valueParts).toEqual([
        { type: "TEXT", text: "Up to " },
        metafield,
        { type: "TEXT", text: "" },
      ]);
    });

    it("does nothing to SECTION_HEADER rows (they have no value cell)", () => {
      const rows = [sectionRow("s", "section")];
      expect(
        rowsReducer(rows, {
          type: "INSERT_VALUE_PART",
          id: "s",
          part: metafield,
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
      expect(result[0].valueParts).toEqual([{ type: "TEXT", text: "x" }, metafield]);
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
      expect(
        rowsReducer(almost, { type: "ADD_ROW", id: "last" }),
      ).toHaveLength(MAX_TEMPLATE_ROWS);
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
