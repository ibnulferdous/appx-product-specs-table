import { describe, it, expect } from "vitest";
import {
  COLUMN_DIVIDER_STYLES,
  DEFAULT_STYLING_VALUES,
  DENSITIES,
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
  GRID_MIN_COLUMN_WIDTH_PX_MAX,
  GRID_MIN_COLUMN_WIDTH_PX_MIN,
  HEADER_PADDING_BLOCK_PX_MAX,
  HEADER_PADDING_BLOCK_PX_MIN,
  LABEL_CASES,
  LABEL_WIDTH_PCT_MAX,
  LABEL_WIDTH_PCT_MIN,
  LINE_HEIGHTS,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTION_GAP_PX_MAX,
  SECTION_GAP_PX_MIN,
  SECTION_HEADER_STYLES,
  SECTIONS_INITIAL_STATES,
  STYLING_FIELD_NAMES,
  STYLING_FONT_SIZES,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
  parseStylingValues,
  serializeStylingOverrides,
  stylingEquals,
  type StylingValues,
} from "./tableStyling";

// Every color field shares one parser; iterate rather than repeat. Kept in
// `STYLING_FIELD_NAMES` order. (`outerBorderColor` was missing here until
// feature 81 added its neighbour and the omission became visible — it parses
// through the same `parseColor`, so it belongs in the same sweep.)
const COLOR_FIELDS = [
  "headerBgColor",
  "headerUnderlineColor",
  "headerTextColor",
  "labelBgColor",
  "valueBgColor",
  "stripeBgColor",
  "borderColor",
  "outerBorderColor",
  "labelTextColor",
  "valueTextColor",
] as const;

// A value with every field overridden away from its default — used by the
// serialize + round-trip laws.
const FULLY_OVERRIDDEN: StylingValues = {
  rowLayout: "STACKED",
  gridMinColumnWidthPx: 320,
  mobileLayout: "SAME_AS_DESKTOP",
  sectionHeaderStyle: "TEXT_ONLY",
  headerFontSizePx: 22,
  headerFontWeight: "REGULAR",
  headerCase: "UPPERCASE",
  headerPaddingBlockPx: 20,
  sectionsCollapsible: true,
  sectionsInitialState: "ALL_CLOSED",
  sectionGapPx: 12,
  rowDividerStyle: "STRIPES",
  columnDividerStyle: "LINE",
  density: "COMPACT",
  tableMaxWidthPx: 960,
  tableAlign: "CENTER",
  outerBorderWidthPx: 2,
  outerBorderRadiusPx: 12,
  headerBgColor: "#111111",
  headerUnderlineColor: "#151515",
  headerTextColor: "#1a1a1a",
  labelBgColor: "#222222",
  valueBgColor: "#333333",
  stripeBgColor: "#444444",
  borderColor: "#555555",
  outerBorderColor: "#5a5a5a",
  labelTextColor: "#666666",
  valueTextColor: "#777777",
  fontSize: "LARGE",
  fontWeight: "BOLD",
  fontStyle: "ITALIC",
  lineHeight: "LOOSE",
  labelCase: "UPPERCASE",
  labelWidthPct: 45,
};

describe("DEFAULT_STYLING_VALUES", () => {
  it("resolves every layout knob to a concrete default", () => {
    expect(DEFAULT_STYLING_VALUES.rowLayout).toBe("TWO_COLUMN");
    expect(DEFAULT_STYLING_VALUES.mobileLayout).toBe("STACKED");
    expect(DEFAULT_STYLING_VALUES.sectionHeaderStyle).toBe("BANDED");
    expect(DEFAULT_STYLING_VALUES.sectionsCollapsible).toBe(false);
    expect(DEFAULT_STYLING_VALUES.sectionsInitialState).toBe("ALL_OPEN");
    expect(DEFAULT_STYLING_VALUES.rowDividerStyle).toBe("LINES");
    expect(DEFAULT_STYLING_VALUES.density).toBe("DEFAULT");
  });

  it("leaves colors, typography and label width null (= inherit)", () => {
    for (const field of COLOR_FIELDS) {
      expect(DEFAULT_STYLING_VALUES[field]).toBeNull();
    }
    expect(DEFAULT_STYLING_VALUES.fontSize).toBeNull();
    expect(DEFAULT_STYLING_VALUES.fontWeight).toBeNull();
    expect(DEFAULT_STYLING_VALUES.fontStyle).toBeNull();
    expect(DEFAULT_STYLING_VALUES.lineHeight).toBeNull();
    expect(DEFAULT_STYLING_VALUES.labelCase).toBeNull();
    expect(DEFAULT_STYLING_VALUES.labelWidthPct).toBeNull();
  });

  it("serializes to an empty overrides object", () => {
    expect(serializeStylingOverrides(DEFAULT_STYLING_VALUES)).toEqual({});
  });

  it("names every field of the shape in STYLING_FIELD_NAMES", () => {
    expect([...STYLING_FIELD_NAMES].sort()).toEqual(
      Object.keys(DEFAULT_STYLING_VALUES).sort(),
    );
  });
});

describe("parseStylingValues — shape tolerance", () => {
  it("returns all defaults for non-object input and never throws", () => {
    for (const input of [undefined, null, 42, "x", [], true, () => {}]) {
      expect(parseStylingValues(input)).toEqual(DEFAULT_STYLING_VALUES);
    }
  });

  it("ignores unknown keys", () => {
    const parsed = parseStylingValues({ nope: "x", density: "COMPACT" });
    expect(parsed.density).toBe("COMPACT");
    expect(parsed).not.toHaveProperty("nope");
  });

  it("parse({}) equals DEFAULT_STYLING_VALUES", () => {
    expect(parseStylingValues({})).toEqual(DEFAULT_STYLING_VALUES);
  });
});

describe("parseStylingValues — per-knob matrix", () => {
  const KNOBS = [
    { field: "rowLayout", allowed: ROW_LAYOUTS },
    { field: "mobileLayout", allowed: MOBILE_LAYOUTS },
    { field: "sectionHeaderStyle", allowed: SECTION_HEADER_STYLES },
    { field: "sectionsInitialState", allowed: SECTIONS_INITIAL_STATES },
    { field: "rowDividerStyle", allowed: ROW_DIVIDER_STYLES },
    { field: "columnDividerStyle", allowed: COLUMN_DIVIDER_STYLES },
    { field: "density", allowed: DENSITIES },
  ] as const;

  for (const { field, allowed } of KNOBS) {
    it(`${field}: every allowed value parses through unchanged`, () => {
      for (const value of allowed) {
        expect(parseStylingValues({ [field]: value })[field]).toBe(value);
      }
    });

    it(`${field}: out-of-list and wrong-typed input fall back to the default`, () => {
      for (const bad of ["NOPE", "two_column", 1, null, {}, []]) {
        const parsed = parseStylingValues({ [field]: bad });
        expect(parsed[field]).toBe(DEFAULT_STYLING_VALUES[field]);
        // A bad field degrades alone — everything else stays default.
        expect(parsed).toEqual(DEFAULT_STYLING_VALUES);
      }
    });
  }

  const NULLABLE_KEYWORDS = [
    { field: "fontWeight", allowed: STYLING_FONT_WEIGHTS },
    { field: "fontStyle", allowed: STYLING_FONT_STYLES },
    { field: "lineHeight", allowed: LINE_HEIGHTS },
    { field: "labelCase", allowed: LABEL_CASES },
  ] as const;

  for (const { field, allowed } of NULLABLE_KEYWORDS) {
    it(`${field}: allowed values kept, anything else → null`, () => {
      for (const value of allowed) {
        expect(parseStylingValues({ [field]: value })[field]).toBe(value);
      }
      for (const bad of ["NOPE", "bold", 700, null, {}]) {
        expect(parseStylingValues({ [field]: bad })[field]).toBeNull();
      }
    });
  }
});

describe("parseStylingValues — sectionsCollapsible", () => {
  it("accepts literal true only", () => {
    expect(
      parseStylingValues({ sectionsCollapsible: true }).sectionsCollapsible,
    ).toBe(true);
    for (const bad of ["true", 1, null, undefined, {}, "yes"]) {
      expect(
        parseStylingValues({ sectionsCollapsible: bad }).sectionsCollapsible,
      ).toBe(false);
    }
  });
});

describe("parseStylingValues — colors", () => {
  it("accepts #rgb / #rrggbb / #rrggbbaa, case-insensitively", () => {
    for (const field of COLOR_FIELDS) {
      for (const value of ["#abc", "#AABBCC", "#aabbccdd", "#FFF"]) {
        expect(parseStylingValues({ [field]: value })[field]).toBe(value);
      }
    }
  });

  it("rejects non-hex and CSS-injection strings", () => {
    const rejected = [
      "red",
      "#ab",
      "#zzz",
      "#abcd0",
      "url(x)",
      "#fff;background:url(x)",
      "rgb(0,0,0)",
      " #fff",
      "#fff ",
      123,
      null,
      {},
    ];
    for (const field of COLOR_FIELDS) {
      for (const bad of rejected) {
        expect(parseStylingValues({ [field]: bad })[field]).toBeNull();
      }
    }
  });
});

describe("parseStylingValues — labelWidthPct", () => {
  it("keeps in-range integers, including the boundaries", () => {
    for (const value of [LABEL_WIDTH_PCT_MIN, 33, LABEL_WIDTH_PCT_MAX]) {
      expect(parseStylingValues({ labelWidthPct: value }).labelWidthPct).toBe(
        value,
      );
    }
  });

  it("clamps out-of-range integers", () => {
    expect(parseStylingValues({ labelWidthPct: 19 }).labelWidthPct).toBe(
      LABEL_WIDTH_PCT_MIN,
    );
    expect(parseStylingValues({ labelWidthPct: -5 }).labelWidthPct).toBe(
      LABEL_WIDTH_PCT_MIN,
    );
    expect(parseStylingValues({ labelWidthPct: 100 }).labelWidthPct).toBe(
      LABEL_WIDTH_PCT_MAX,
    );
  });

  it("rejects non-integers, strings and non-finite numbers", () => {
    for (const bad of [33.5, "33", NaN, Infinity, -Infinity, null, true, {}]) {
      expect(
        parseStylingValues({ labelWidthPct: bad }).labelWidthPct,
      ).toBeNull();
    }
  });
});

// Feature 80. The gap is nullable with null = OFF (the container knobs' law,
// not the colors' "inherit"), so these probes are about the boundary between a
// stored number and no gap at all — the UI-side "0 means off" translation lives
// at the control boundary and is tested in stylingControls.test.ts.
describe("parseStylingValues — sectionGapPx", () => {
  it("defaults to null, so a table nobody has touched has no gap", () => {
    expect(parseStylingValues({}).sectionGapPx).toBeNull();
    expect(DEFAULT_STYLING_VALUES.sectionGapPx).toBeNull();
  });

  it("keeps in-range integers, including both boundaries", () => {
    for (const value of [SECTION_GAP_PX_MIN, 12, SECTION_GAP_PX_MAX]) {
      expect(parseStylingValues({ sectionGapPx: value }).sectionGapPx).toBe(
        value,
      );
    }
  });

  it("clamps out-of-range integers, both probes derived from the bounds", () => {
    // Derived, never hard-coded: a literal here would silently become an
    // in-range value if the ceiling ever moves, and the test would keep its
    // name while asserting nothing (the lesson FONT_SIZE_PX_MAX taught).
    expect(
      parseStylingValues({ sectionGapPx: SECTION_GAP_PX_MIN - 1 }).sectionGapPx,
    ).toBe(SECTION_GAP_PX_MIN);
    expect(
      parseStylingValues({ sectionGapPx: SECTION_GAP_PX_MAX + 1 }).sectionGapPx,
    ).toBe(SECTION_GAP_PX_MAX);
  });

  it("clamps a 0 up to the minimum rather than reading it as off", () => {
    // Deliberate, and it is the CONTROL boundary that maps 0 to null (see
    // `fromSectionGapControlValue`), never this one — same split the outline
    // width takes. So 0 is unreachable from the UI, and a hand-edited 0 in the
    // metaobject degrades to the smallest real gap instead of silently
    // becoming a second spelling of off. What matters is only that a stored 0
    // never exists: it would emit the --section-gap presence class, adding no
    // space AND standing the banded separator down.
    expect(parseStylingValues({ sectionGapPx: 0 }).sectionGapPx).toBe(
      SECTION_GAP_PX_MIN,
    );
  });

  it("writes no override while it is off", () => {
    expect(serializeStylingOverrides(parseStylingValues({}))).toEqual({});
    expect(
      serializeStylingOverrides(parseStylingValues({ sectionGapPx: 12 })),
    ).toEqual({ sectionGapPx: 12 });
  });

  it("rejects non-integers, strings and non-finite numbers", () => {
    for (const bad of [12.5, "12", NaN, Infinity, -Infinity, null, true, {}]) {
      expect(parseStylingValues({ sectionGapPx: bad }).sectionGapPx).toBeNull();
    }
  });
});

// --- Feature 85 · multi-column row flow --------------------------------------
describe("ROW_LAYOUTS — GRID joins as a third member (feature 85)", () => {
  it("keeps TWO_COLUMN first, so no table that exists today repaints", () => {
    // THE no-repaint pin. GRID was APPENDED, never inserted: the first member
    // is the default, so a reorder here would silently relayout every table
    // whose merchant never touched the knob.
    expect(ROW_LAYOUTS[0]).toBe("TWO_COLUMN");
    expect(DEFAULT_STYLING_VALUES.rowLayout).toBe("TWO_COLUMN");
    expect([...ROW_LAYOUTS]).toEqual(["TWO_COLUMN", "STACKED", "GRID"]);
  });

  it("parses and round-trips through the wire shape", () => {
    expect(parseStylingValues({ rowLayout: "GRID" }).rowLayout).toBe("GRID");
    expect(
      serializeStylingOverrides(parseStylingValues({ rowLayout: "GRID" })),
    ).toEqual({ rowLayout: "GRID" });
  });
});

describe("parseStylingValues — gridMinColumnWidthPx", () => {
  it("defaults to null, which means the stylesheet's own 240px", () => {
    // Not "off" — a grid always has a minimum, so there is no off state to
    // spell. This is the headerPaddingBlockPx vocabulary, not the container
    // knobs'.
    expect(parseStylingValues({}).gridMinColumnWidthPx).toBeNull();
    expect(DEFAULT_STYLING_VALUES.gridMinColumnWidthPx).toBeNull();
  });

  it("keeps in-range integers, including both boundaries", () => {
    for (const value of [
      GRID_MIN_COLUMN_WIDTH_PX_MIN,
      320,
      GRID_MIN_COLUMN_WIDTH_PX_MAX,
    ]) {
      expect(
        parseStylingValues({ gridMinColumnWidthPx: value })
          .gridMinColumnWidthPx,
      ).toBe(value);
    }
  });

  it("clamps out-of-range integers, both probes derived from the bounds", () => {
    expect(
      parseStylingValues({
        gridMinColumnWidthPx: GRID_MIN_COLUMN_WIDTH_PX_MIN - 1,
      }).gridMinColumnWidthPx,
    ).toBe(GRID_MIN_COLUMN_WIDTH_PX_MIN);
    expect(
      parseStylingValues({
        gridMinColumnWidthPx: GRID_MIN_COLUMN_WIDTH_PX_MAX + 1,
      }).gridMinColumnWidthPx,
    ).toBe(GRID_MIN_COLUMN_WIDTH_PX_MAX);
  });

  it("clamps a 0 up to the floor — it is not a spelling of anything", () => {
    // A 0 minimum would mean an unbounded track count, which is exactly the
    // unreadable case the floor exists to prevent.
    expect(
      parseStylingValues({ gridMinColumnWidthPx: 0 }).gridMinColumnWidthPx,
    ).toBe(GRID_MIN_COLUMN_WIDTH_PX_MIN);
  });

  it("rejects non-integers, strings and non-finite numbers", () => {
    for (const bad of [
      240.5,
      "240",
      NaN,
      Infinity,
      -Infinity,
      null,
      true,
      {},
    ]) {
      expect(
        parseStylingValues({ gridMinColumnWidthPx: bad }).gridMinColumnWidthPx,
      ).toBeNull();
    }
  });

  it("writes no override while it is null", () => {
    expect(serializeStylingOverrides(parseStylingValues({}))).toEqual({});
    expect(
      serializeStylingOverrides(
        parseStylingValues({ gridMinColumnWidthPx: 320 }),
      ),
    ).toEqual({ gridMinColumnWidthPx: 320 });
  });
});

// --- Feature 81 · section header typography + spacing ------------------------
describe("parseStylingValues — section header typography", () => {
  it("defaults all five to null, so an untouched table is unchanged", () => {
    const parsed = parseStylingValues({});
    for (const field of [
      "headerTextColor",
      "headerFontSizePx",
      "headerFontWeight",
      "headerCase",
      "headerPaddingBlockPx",
    ] as const) {
      expect(parsed[field], field).toBeNull();
      expect(DEFAULT_STYLING_VALUES[field], field).toBeNull();
    }
  });

  it("reuses the table font-size bounds for the title size", () => {
    for (const value of [FONT_SIZE_PX_MIN, 22, FONT_SIZE_PX_MAX]) {
      expect(
        parseStylingValues({ headerFontSizePx: value }).headerFontSizePx,
      ).toBe(value);
    }
    expect(
      parseStylingValues({ headerFontSizePx: FONT_SIZE_PX_MIN - 1 })
        .headerFontSizePx,
    ).toBe(FONT_SIZE_PX_MIN);
    expect(
      parseStylingValues({ headerFontSizePx: FONT_SIZE_PX_MAX + 1 })
        .headerFontSizePx,
    ).toBe(FONT_SIZE_PX_MAX);
  });

  it("accepts a STORED 0 for the padding — the one integer knob that may", () => {
    // The feature 78 minimum-of-1 law governs knobs where null already means
    // off; here null means the stylesheet's 0.75rem, so 0 is a FIRST spelling
    // of a genuinely different render. Contrast `sectionGapPx` directly above,
    // where a 0 clamps up to 1 because it would trip a presence flag while
    // painting nothing. Nothing keys a flag on this field, so 0 is safe — and
    // it must survive the parse, or the merchant's "no padding" silently
    // becomes "default padding" on the next read-back.
    expect(
      parseStylingValues({ headerPaddingBlockPx: 0 }).headerPaddingBlockPx,
    ).toBe(0);
    expect(HEADER_PADDING_BLOCK_PX_MIN).toBe(0);
  });

  it("serializes a stored 0 padding as a real override, not an absence", () => {
    // `serializeStylingOverrides` compares against the default (null), so 0
    // must survive to the wire. If it were folded away, the metaobject would
    // carry no override and the storefront would repaint at 0.75rem.
    expect(
      serializeStylingOverrides(
        parseStylingValues({ headerPaddingBlockPx: 0 }),
      ),
    ).toEqual({ headerPaddingBlockPx: 0 });
  });

  it("clamps the padding at both ends and rejects junk", () => {
    expect(
      parseStylingValues({
        headerPaddingBlockPx: HEADER_PADDING_BLOCK_PX_MIN - 1,
      }).headerPaddingBlockPx,
    ).toBe(HEADER_PADDING_BLOCK_PX_MIN);
    expect(
      parseStylingValues({
        headerPaddingBlockPx: HEADER_PADDING_BLOCK_PX_MAX + 1,
      }).headerPaddingBlockPx,
    ).toBe(HEADER_PADDING_BLOCK_PX_MAX);
    for (const bad of [12.5, "12", NaN, Infinity, null, true, {}]) {
      expect(
        parseStylingValues({ headerPaddingBlockPx: bad }).headerPaddingBlockPx,
      ).toBeNull();
      expect(
        parseStylingValues({ headerFontSizePx: bad }).headerFontSizePx,
      ).toBeNull();
    }
  });

  it("takes the label knobs' keyword domains and rejects anything else", () => {
    for (const value of STYLING_FONT_WEIGHTS) {
      expect(
        parseStylingValues({ headerFontWeight: value }).headerFontWeight,
      ).toBe(value);
    }
    for (const value of LABEL_CASES) {
      expect(parseStylingValues({ headerCase: value }).headerCase).toBe(value);
    }
    for (const bad of ["LIGHTER", "bold", "", 700, null, {}]) {
      expect(
        parseStylingValues({ headerFontWeight: bad }).headerFontWeight,
      ).toBeNull();
      expect(parseStylingValues({ headerCase: bad }).headerCase).toBeNull();
    }
  });

  it("writes no overrides while all five are untouched", () => {
    expect(serializeStylingOverrides(parseStylingValues({}))).toEqual({});
  });
});

describe("parseStylingValues — fontSize union", () => {
  it("keeps every theme-relative keyword", () => {
    for (const value of STYLING_FONT_SIZES) {
      expect(parseStylingValues({ fontSize: value }).fontSize).toBe(value);
    }
  });

  it("accepts a px number and the DB digit-string shape, both as a number", () => {
    expect(parseStylingValues({ fontSize: 16 }).fontSize).toBe(16);
    expect(parseStylingValues({ fontSize: "18" }).fontSize).toBe(18);
    expect(parseStylingValues({ fontSize: FONT_SIZE_PX_MIN }).fontSize).toBe(
      FONT_SIZE_PX_MIN,
    );
    expect(parseStylingValues({ fontSize: FONT_SIZE_PX_MAX }).fontSize).toBe(
      FONT_SIZE_PX_MAX,
    );
  });

  it("clamps out-of-range px values (number and string shapes alike)", () => {
    // Both out-of-range probes are DERIVED from the bounds, never hard-coded:
    // the ceiling moved 40 → 184 in 2026-07-19, and a literal `100` here would
    // have silently become an IN-range value that no longer clamps — the test
    // would still pass its name while asserting nothing.
    const below = FONT_SIZE_PX_MIN - 1;
    const above = FONT_SIZE_PX_MAX + 1;
    expect(parseStylingValues({ fontSize: below }).fontSize).toBe(
      FONT_SIZE_PX_MIN,
    );
    expect(parseStylingValues({ fontSize: above }).fontSize).toBe(
      FONT_SIZE_PX_MAX,
    );
    expect(parseStylingValues({ fontSize: String(below) }).fontSize).toBe(
      FONT_SIZE_PX_MIN,
    );
    expect(parseStylingValues({ fontSize: String(above) }).fontSize).toBe(
      FONT_SIZE_PX_MAX,
    );
  });

  it("rejects anything else", () => {
    for (const bad of [
      16.5,
      "16px",
      "small",
      "1e2",
      "-5",
      true,
      null,
      {},
      NaN,
    ]) {
      expect(parseStylingValues({ fontSize: bad }).fontSize).toBeNull();
    }
  });
});

describe("serializeStylingOverrides", () => {
  it("emits exactly one key for a single non-default knob", () => {
    const values = { ...DEFAULT_STYLING_VALUES, density: "SPACIOUS" as const };
    expect(serializeStylingOverrides(values)).toEqual({ density: "SPACIOUS" });
  });

  it("emits sectionsCollapsible only when true", () => {
    expect(
      serializeStylingOverrides({
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: false,
      }),
    ).toEqual({});
    expect(
      serializeStylingOverrides({
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: true,
      }),
    ).toEqual({ sectionsCollapsible: true });
  });

  it("emits nullables only when non-null", () => {
    expect(
      serializeStylingOverrides({
        ...DEFAULT_STYLING_VALUES,
        borderColor: "#abc",
        labelWidthPct: 40,
      }),
    ).toEqual({ borderColor: "#abc", labelWidthPct: 40 });
  });

  it("emits a px fontSize as a JSON number", () => {
    const overrides = serializeStylingOverrides({
      ...DEFAULT_STYLING_VALUES,
      fontSize: 18,
    });
    expect(overrides).toEqual({ fontSize: 18 });
    expect(typeof overrides.fontSize).toBe("number");
  });

  it("emits every field for a fully-overridden value", () => {
    const overrides = serializeStylingOverrides(FULLY_OVERRIDDEN);
    expect(Object.keys(overrides).sort()).toEqual(
      [...STYLING_FIELD_NAMES].sort(),
    );
    expect(overrides).toEqual(FULLY_OVERRIDDEN);
  });
});

describe("round-trip law: parse(serialize(v)) deep-equals v", () => {
  const cases: [string, StylingValues][] = [
    ["defaults", DEFAULT_STYLING_VALUES],
    ["single override", { ...DEFAULT_STYLING_VALUES, rowDividerStyle: "NONE" }],
    ["px fontSize", { ...DEFAULT_STYLING_VALUES, fontSize: 18 }],
    ["fully overridden", FULLY_OVERRIDDEN],
  ];

  for (const [name, value] of cases) {
    it(name, () => {
      expect(parseStylingValues(serializeStylingOverrides(value))).toEqual(
        value,
      );
    });
  }
});

describe("stylingEquals", () => {
  it("is true for identical values", () => {
    expect(
      stylingEquals(DEFAULT_STYLING_VALUES, { ...DEFAULT_STYLING_VALUES }),
    ).toBe(true);
    expect(stylingEquals(FULLY_OVERRIDDEN, { ...FULLY_OVERRIDDEN })).toBe(true);
  });

  it("is false when any single field differs", () => {
    for (const field of STYLING_FIELD_NAMES) {
      const flipped = {
        ...DEFAULT_STYLING_VALUES,
        [field]: FULLY_OVERRIDDEN[field],
      } as StylingValues;
      expect(stylingEquals(DEFAULT_STYLING_VALUES, flipped)).toBe(false);
      expect(stylingEquals(flipped, DEFAULT_STYLING_VALUES)).toBe(false);
    }
  });

  it("treats parse({}) as equal to the defaults", () => {
    expect(stylingEquals(parseStylingValues({}), DEFAULT_STYLING_VALUES)).toBe(
      true,
    );
  });
});

describe("parseStylingValues — Prisma row shape", () => {
  it("ignores relational extras and resolves column nulls to defaults", () => {
    const row = {
      id: "cly000000000000000000000",
      templateId: "clt000000000000000000000",
      rowLayout: null,
      mobileLayout: null,
      sectionHeaderStyle: "TEXT_ONLY",
      sectionsCollapsible: true,
      sectionsInitialState: "FIRST_OPEN",
      rowDividerStyle: null,
      density: "COMPACT",
      headerBgColor: null,
      labelBgColor: "#eeeeee",
      valueBgColor: null,
      stripeBgColor: null,
      borderColor: null,
      labelTextColor: null,
      valueTextColor: null,
      // The DB stores a px fontSize as an all-digit string.
      fontSize: "18",
      fontWeight: "MEDIUM",
      fontStyle: null,
      lineHeight: null,
      labelCase: "UPPERCASE",
      labelWidthPct: 35,
      basedOnPreset: "classic",
      extraStyles: {},
    };

    expect(parseStylingValues(row)).toEqual({
      ...DEFAULT_STYLING_VALUES,
      sectionHeaderStyle: "TEXT_ONLY",
      sectionsCollapsible: true,
      sectionsInitialState: "FIRST_OPEN",
      density: "COMPACT",
      labelBgColor: "#eeeeee",
      fontSize: 18,
      fontWeight: "MEDIUM",
      labelCase: "UPPERCASE",
      labelWidthPct: 35,
    });
  });
});
