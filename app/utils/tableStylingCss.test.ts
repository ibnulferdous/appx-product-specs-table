import { describe, it, expect } from "vitest";
import {
  COLUMN_DIVIDER_STYLES,
  DEFAULT_STYLING_VALUES,
  DENSITIES,
  LABEL_CASES,
  LINE_HEIGHTS,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTION_HEADER_STYLES,
  SECTIONS_INITIAL_STATES,
  STYLING_FONT_SIZES,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
  TABLE_ALIGNMENTS,
  parseStylingValues,
  type StylingValues,
} from "./tableStyling";
import {
  FONT_SIZE_EM_SCALE,
  FONT_WEIGHT_SCALE,
  LABEL_CASE_TRANSFORMS,
  LINE_HEIGHT_SCALE,
  SPEC_TABLE_CSS_VARS,
  formatCssVarDeclarations,
  stylingToCssVars,
  stylingToModifierClasses,
} from "./tableStylingCss";

const COLOR_FIELDS = [
  "headerBgColor",
  "headerTextColor",
  "labelBgColor",
  "valueBgColor",
  "stripeBgColor",
  "borderColor",
  "labelTextColor",
  "valueTextColor",
] as const;

// Every field overridden away from its default — every nullable non-null, every
// knob off-default. Mirrors the Step 1 test fixture.
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

// Exact expected class list for all-default values, in STYLING_FIELD_NAMES
// order (collapsible absent — false is the default).
const DEFAULT_CLASSES = [
  "appx-spec-table--layout-two-column",
  "appx-spec-table--mobile-stacked",
  "appx-spec-table--section-banded",
  "appx-spec-table--dividers-lines",
  // NONE is the column divider's default, and it emits its class like every
  // other keyword knob — the rule set it selects is an explicit `none`, so a
  // table that has never touched the knob is unchanged.
  "appx-spec-table--column-divider-none",
  "appx-spec-table--density-default",
  // Alignment emits its default like every other keyword knob. The two
  // container PRESENCE flags (--outer-border / --outer-radius) are absent here
  // by design: null is their default, so an untouched table carries neither.
  "appx-spec-table--align-left",
];

describe("stylingToCssVars — all defaults", () => {
  it("emits no vars when every nullable is null", () => {
    expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).toEqual({});
  });
});

describe("stylingToModifierClasses — all defaults", () => {
  it("emits the exact default class array (defaults included, collapsible absent)", () => {
    expect(stylingToModifierClasses(DEFAULT_STYLING_VALUES)).toEqual(
      DEFAULT_CLASSES,
    );
  });
});

describe("stylingToCssVars — color matrix", () => {
  it("emits each color field's own property with the hex verbatim", () => {
    for (const field of COLOR_FIELDS) {
      const vars = stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        [field]: "#aAbBcC",
      });
      expect(vars).toEqual({ [SPEC_TABLE_CSS_VARS[field]]: "#aAbBcC" });
      // The other six stay ABSENT — no key, not an empty value.
      for (const other of COLOR_FIELDS) {
        if (other !== field) {
          expect(vars).not.toHaveProperty(SPEC_TABLE_CSS_VARS[other]);
        }
      }
    }
  });
});

describe("stylingToCssVars — gridMinColumnWidthPx (feature 85)", () => {
  it("emits the var with a px suffix when set, and no key when null", () => {
    expect(
      stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        gridMinColumnWidthPx: 320,
      }),
    ).toEqual({ [SPEC_TABLE_CSS_VARS.gridMinColumnWidthPx]: "320px" });
    // Null must leave the property ABSENT, so the stylesheet's own 240px
    // fallback is what a merchant who never touched the box actually gets.
    expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).not.toHaveProperty(
      SPEC_TABLE_CSS_VARS.gridMinColumnWidthPx,
    );
  });

  it("adds NO presence flag — the --layout-grid class is its own gate", () => {
    // Contrast --section-gap / --outer-border / --outer-radius, each of which
    // needs a class because its rule cannot be expressed as a value
    // substitution. Here the grid rules are already gated by the layout class
    // and the var has a literal fallback, so there is nothing for a flag to
    // switch on. A grid table's modifier list must therefore be the same LENGTH
    // as a two-column one's, whether or not the box is filled in.
    const twoColumn = stylingToModifierClasses(DEFAULT_STYLING_VALUES);
    const gridDefault = stylingToModifierClasses({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
    });
    const gridWithWidth = stylingToModifierClasses({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
      gridMinColumnWidthPx: 320,
    });
    expect(gridDefault).toHaveLength(twoColumn.length);
    expect(gridWithWidth).toEqual(gridDefault);
    expect(gridDefault).toContain("appx-spec-table--layout-grid");
  });
});

describe("stylingToCssVars — fontSize union", () => {
  it("maps each keyword to its em value from FONT_SIZE_EM_SCALE", () => {
    for (const keyword of STYLING_FONT_SIZES) {
      const vars = stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        fontSize: keyword,
      });
      expect(vars[SPEC_TABLE_CSS_VARS.fontSize]).toBe(
        FONT_SIZE_EM_SCALE[keyword],
      );
      expect(vars[SPEC_TABLE_CSS_VARS.fontSize]).toMatch(/em$/);
    }
  });

  it("maps a px number to an absolute px string", () => {
    const vars = stylingToCssVars({ ...DEFAULT_STYLING_VALUES, fontSize: 18 });
    expect(vars[SPEC_TABLE_CSS_VARS.fontSize]).toBe("18px");
    expect(vars[SPEC_TABLE_CSS_VARS.fontSize]).toMatch(/^\d+px$/);
  });

  it("emits no key for null", () => {
    expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).not.toHaveProperty(
      SPEC_TABLE_CSS_VARS.fontSize,
    );
  });
});

describe("stylingToCssVars — typography scales", () => {
  it("maps every fontWeight member to its documented literal", () => {
    for (const weight of STYLING_FONT_WEIGHTS) {
      const vars = stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        fontWeight: weight,
      });
      expect(vars[SPEC_TABLE_CSS_VARS.fontWeight]).toBe(
        FONT_WEIGHT_SCALE[weight],
      );
    }
    expect(FONT_WEIGHT_SCALE).toEqual({
      REGULAR: "400",
      MEDIUM: "500",
      BOLD: "700",
    });
  });

  it("maps every fontStyle member to its documented literal", () => {
    expect(
      stylingToCssVars({ ...DEFAULT_STYLING_VALUES, fontStyle: "NORMAL" })[
        SPEC_TABLE_CSS_VARS.fontStyle
      ],
    ).toBe("normal");
    expect(
      stylingToCssVars({ ...DEFAULT_STYLING_VALUES, fontStyle: "ITALIC" })[
        SPEC_TABLE_CSS_VARS.fontStyle
      ],
    ).toBe("italic");
    // Totality over the Step 1 array, not just the two literals above.
    expect(STYLING_FONT_STYLES).toEqual(["NORMAL", "ITALIC"]);
  });

  it("maps every lineHeight member to a unitless ratio", () => {
    for (const lineHeight of LINE_HEIGHTS) {
      const vars = stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        lineHeight,
      });
      const value = vars[SPEC_TABLE_CSS_VARS.lineHeight];
      expect(value).toBe(LINE_HEIGHT_SCALE[lineHeight]);
      // Unitless — inherits as a ratio, not a frozen length.
      expect(value).toMatch(/^\d+(\.\d+)?$/);
      expect(value).not.toMatch(/px|em|%/);
    }
    expect(LINE_HEIGHT_SCALE).toEqual({
      TIGHT: "1.25",
      NORMAL: "1.5",
      LOOSE: "1.8",
    });
  });

  it("maps every labelCase member to its transform", () => {
    for (const labelCase of LABEL_CASES) {
      const vars = stylingToCssVars({
        ...DEFAULT_STYLING_VALUES,
        labelCase,
      });
      expect(vars[SPEC_TABLE_CSS_VARS.labelCase]).toBe(
        LABEL_CASE_TRANSFORMS[labelCase],
      );
    }
    expect(LABEL_CASE_TRANSFORMS).toEqual({
      DEFAULT: "none",
      UPPERCASE: "uppercase",
    });
  });

  it("emits no key for any null typography field", () => {
    const vars = stylingToCssVars(DEFAULT_STYLING_VALUES);
    for (const field of [
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "labelCase",
    ] as const) {
      expect(vars).not.toHaveProperty(SPEC_TABLE_CSS_VARS[field]);
    }
  });
});

// --- Feature 81 · section header typography + spacing ------------------------
describe("stylingToCssVars — section header typography", () => {
  const base = DEFAULT_STYLING_VALUES;

  it("emits nothing while all five are null", () => {
    const vars = stylingToCssVars(base);
    for (const name of [
      SPEC_TABLE_CSS_VARS.headerTextColor,
      SPEC_TABLE_CSS_VARS.headerFontSizePx,
      SPEC_TABLE_CSS_VARS.headerFontWeight,
      SPEC_TABLE_CSS_VARS.headerCase,
      SPEC_TABLE_CSS_VARS.headerPaddingBlockPx,
    ]) {
      expect(vars, name).not.toHaveProperty(name);
    }
  });

  it("suffixes px on the two integers", () => {
    expect(
      stylingToCssVars({ ...base, headerFontSizePx: 22 })[
        SPEC_TABLE_CSS_VARS.headerFontSizePx
      ],
    ).toBe("22px");
    expect(
      stylingToCssVars({ ...base, headerPaddingBlockPx: 20 })[
        SPEC_TABLE_CSS_VARS.headerPaddingBlockPx
      ],
    ).toBe("20px");
  });

  it("emits `0px` for a stored 0 padding rather than omitting the var", () => {
    // THE case this knob's 0 floor turns on. The loop guard is `!== null`, not
    // falsiness — a truthiness check would drop 0, the var would be absent, and
    // the stylesheet's own 0.75rem fallback would silently win. The merchant
    // asked for no padding and would get the default instead.
    const vars = stylingToCssVars({ ...base, headerPaddingBlockPx: 0 });
    expect(vars[SPEC_TABLE_CSS_VARS.headerPaddingBlockPx]).toBe("0px");
  });

  it("reuses the label knobs' scales, so Bold means one number everywhere", () => {
    const bold = stylingToCssVars({
      ...base,
      fontWeight: "BOLD",
      headerFontWeight: "BOLD",
    });
    expect(bold[SPEC_TABLE_CSS_VARS.headerFontWeight]).toBe(
      bold[SPEC_TABLE_CSS_VARS.fontWeight],
    );

    const upper = stylingToCssVars({
      ...base,
      labelCase: "UPPERCASE",
      headerCase: "UPPERCASE",
    });
    expect(upper[SPEC_TABLE_CSS_VARS.headerCase]).toBe(
      upper[SPEC_TABLE_CSS_VARS.labelCase],
    );
    expect(upper[SPEC_TABLE_CSS_VARS.headerCase]).toBe("uppercase");
  });

  it("passes a validated hex through verbatim", () => {
    expect(
      stylingToCssVars({ ...base, headerTextColor: "#1a2b3c" })[
        SPEC_TABLE_CSS_VARS.headerTextColor
      ],
    ).toBe("#1a2b3c");
  });

  it("adds NO modifier class — the whole feature is custom properties", () => {
    // The locked Step 2 rule: nullable -> var, non-null knob -> class. If any
    // of these five ever grows a class, a presence flag crept in and the
    // no-repaint guarantee needs re-deriving.
    expect(
      stylingToModifierClasses({
        ...base,
        headerTextColor: "#123456",
        headerFontSizePx: 22,
        headerFontWeight: "BOLD",
        headerCase: "UPPERCASE",
        headerPaddingBlockPx: 0,
      }),
    ).toEqual(stylingToModifierClasses(base));
  });
});

describe("stylingToCssVars — labelWidthPct", () => {
  it("maps an integer to a percent string", () => {
    const vars = stylingToCssVars({
      ...DEFAULT_STYLING_VALUES,
      labelWidthPct: 35,
    });
    expect(vars[SPEC_TABLE_CSS_VARS.labelWidthPct]).toBe("35%");
    expect(vars[SPEC_TABLE_CSS_VARS.labelWidthPct]).toMatch(/^\d+%$/);
  });

  it("emits no key for null", () => {
    expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).not.toHaveProperty(
      SPEC_TABLE_CSS_VARS.labelWidthPct,
    );
  });
});

describe("stylingToModifierClasses — class matrix", () => {
  const KNOBS = [
    {
      field: "rowLayout",
      allowed: ROW_LAYOUTS,
      classes: {
        TWO_COLUMN: "appx-spec-table--layout-two-column",
        STACKED: "appx-spec-table--layout-stacked",
        GRID: "appx-spec-table--layout-grid",
      },
    },
    {
      field: "mobileLayout",
      allowed: MOBILE_LAYOUTS,
      classes: {
        STACKED: "appx-spec-table--mobile-stacked",
        SAME_AS_DESKTOP: "appx-spec-table--mobile-same-as-desktop",
      },
    },
    {
      field: "sectionHeaderStyle",
      allowed: SECTION_HEADER_STYLES,
      classes: {
        BANDED: "appx-spec-table--section-banded",
        TEXT_ONLY: "appx-spec-table--section-text-only",
      },
    },
    {
      field: "rowDividerStyle",
      allowed: ROW_DIVIDER_STYLES,
      classes: {
        LINES: "appx-spec-table--dividers-lines",
        STRIPES: "appx-spec-table--dividers-stripes",
        NONE: "appx-spec-table--dividers-none",
      },
    },
    {
      field: "columnDividerStyle",
      allowed: COLUMN_DIVIDER_STYLES,
      classes: {
        NONE: "appx-spec-table--column-divider-none",
        LINE: "appx-spec-table--column-divider-line",
      },
    },
    {
      field: "density",
      allowed: DENSITIES,
      classes: {
        DEFAULT: "appx-spec-table--density-default",
        COMPACT: "appx-spec-table--density-compact",
        SPACIOUS: "appx-spec-table--density-spacious",
      },
    },
    {
      field: "tableAlign",
      allowed: TABLE_ALIGNMENTS,
      classes: {
        LEFT: "appx-spec-table--align-left",
        CENTER: "appx-spec-table--align-center",
        RIGHT: "appx-spec-table--align-right",
      },
    },
  ] as const;

  for (const { field, allowed, classes } of KNOBS) {
    it(`${field}: every member yields its documented class, list length constant`, () => {
      for (const value of allowed) {
        const list = stylingToModifierClasses({
          ...DEFAULT_STYLING_VALUES,
          [field]: value,
        });
        expect(list).toContain(classes[value as keyof typeof classes]);
        // One class per knob — no member silently maps to nothing.
        expect(list).toHaveLength(DEFAULT_CLASSES.length);
      }
    });
  }
});

describe("stylingToModifierClasses — sectionsCollapsible", () => {
  it("true adds --collapsible in field order; false changes nothing", () => {
    const on = stylingToModifierClasses({
      ...DEFAULT_STYLING_VALUES,
      sectionsCollapsible: true,
    });
    expect(on).toEqual([
      "appx-spec-table--layout-two-column",
      "appx-spec-table--mobile-stacked",
      "appx-spec-table--section-banded",
      "appx-spec-table--collapsible",
      "appx-spec-table--dividers-lines",
      "appx-spec-table--column-divider-none",
      "appx-spec-table--density-default",
      "appx-spec-table--align-left",
    ]);
    expect(
      stylingToModifierClasses({
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: false,
      }),
    ).toEqual(DEFAULT_CLASSES);
  });
});

describe("sectionsInitialState leaks into neither output", () => {
  it("all three members produce identical classes and vars", () => {
    const outputs = SECTIONS_INITIAL_STATES.map((sectionsInitialState) => ({
      classes: stylingToModifierClasses({
        ...FULLY_OVERRIDDEN,
        sectionsInitialState,
      }),
      vars: stylingToCssVars({ ...FULLY_OVERRIDDEN, sectionsInitialState }),
    }));
    for (const output of outputs.slice(1)) {
      expect(output.classes).toEqual(outputs[0].classes);
      expect(output.vars).toEqual(outputs[0].vars);
    }
    // And no class ever mentions the knob.
    for (const cls of outputs[0].classes) {
      expect(cls).not.toMatch(/open|closed|initial/i);
    }
  });
});

describe("determinism / stability", () => {
  it("repeated calls produce deep-equal output in the same order", () => {
    const vars1 = stylingToCssVars(FULLY_OVERRIDDEN);
    const vars2 = stylingToCssVars(FULLY_OVERRIDDEN);
    expect(vars1).toEqual(vars2);
    expect(Object.keys(vars1)).toEqual(Object.keys(vars2));

    const classes1 = stylingToModifierClasses(FULLY_OVERRIDDEN);
    const classes2 = stylingToModifierClasses(FULLY_OVERRIDDEN);
    expect(classes1).toEqual(classes2); // toEqual on arrays is order-sensitive
  });
});

describe("totality — fully overridden", () => {
  it("emits one var per nullable field (every SPEC_TABLE_CSS_VARS key)", () => {
    const vars = stylingToCssVars(FULLY_OVERRIDDEN);
    expect(Object.keys(vars).sort()).toEqual(
      Object.values(SPEC_TABLE_CSS_VARS).sort(),
    );
  });

  it("emits the full class list (all seven knobs + collapsible + all three presence flags)", () => {
    expect(stylingToModifierClasses(FULLY_OVERRIDDEN)).toEqual([
      "appx-spec-table--layout-stacked",
      "appx-spec-table--mobile-same-as-desktop",
      "appx-spec-table--section-text-only",
      "appx-spec-table--collapsible",
      "appx-spec-table--dividers-stripes",
      "appx-spec-table--column-divider-line",
      "appx-spec-table--density-compact",
      "appx-spec-table--align-center",
      "appx-spec-table--section-gap",
      "appx-spec-table--outer-border",
      "appx-spec-table--outer-radius",
    ]);
  });

  it("emits neither container flag when its knob is null, independently", () => {
    // The two flags are separate opt-ins: a radius with no border is a legal
    // (if unusual) combination, and each must gate only its own rule.
    const borderOnly = stylingToModifierClasses({
      ...DEFAULT_STYLING_VALUES,
      outerBorderWidthPx: 1,
    });
    expect(borderOnly).toContain("appx-spec-table--outer-border");
    expect(borderOnly).not.toContain("appx-spec-table--outer-radius");

    const radiusOnly = stylingToModifierClasses({
      ...DEFAULT_STYLING_VALUES,
      outerBorderRadiusPx: 8,
    });
    expect(radiusOnly).toContain("appx-spec-table--outer-radius");
    expect(radiusOnly).not.toContain("appx-spec-table--outer-border");
  });

  // Feature 80. The third presence flag, and the one that carries a rule for
  // ANOTHER feature: it is what tells the banded section separator to stand
  // down, so "emitted iff non-null" is the whole contract on both sides.
  describe("section gap", () => {
    it("emits the flag and the px var together, and only when the knob is set", () => {
      const gapped = { ...DEFAULT_STYLING_VALUES, sectionGapPx: 12 };
      expect(stylingToModifierClasses(gapped)).toContain(
        "appx-spec-table--section-gap",
      );
      expect(stylingToCssVars(gapped)).toMatchObject({
        "--appx-spec-section-gap": "12px",
      });
    });

    it("emits neither while it is off — an untouched table declares no margin at all", () => {
      expect(stylingToModifierClasses(DEFAULT_STYLING_VALUES)).not.toContain(
        "appx-spec-table--section-gap",
      );
      expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).not.toHaveProperty(
        "--appx-spec-section-gap",
      );
    });

    it("is independent of collapsing — the CSS, not the mapping, decides where it applies", () => {
      // The rail hides the control while collapsing is off, but the value is
      // PRESERVED (the hide-when-irrelevant law), so the mapping must keep
      // emitting it. The flat shape simply has no section-group element for
      // the rule to land on.
      const flatWithGap = {
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: false,
        sectionGapPx: 12,
      };
      expect(stylingToModifierClasses(flatWithGap)).toContain(
        "appx-spec-table--section-gap",
      );
    });
  });
});

describe("injection shape guard", () => {
  // Everything this module emits reaches a live storefront (mostly an inline
  // `style` attribute, Step 7). Assert the emitted strings can only take the
  // documented shapes — a future loosening of parseStylingValues cannot
  // quietly become a CSS-injection vector here.
  const VALUE_SHAPE =
    /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|\d+px|\d+%|\d+(\.\d+)?em|\d+(\.\d+)?|400|500|700|normal|italic|none|uppercase)$/;

  it("every emitted var value matches the strict shape whitelist", () => {
    const cases = [
      FULLY_OVERRIDDEN,
      { ...DEFAULT_STYLING_VALUES, fontSize: 40 as const },
      { ...FULLY_OVERRIDDEN, fontSize: 10 },
    ];
    for (const values of cases) {
      for (const [name, value] of Object.entries(stylingToCssVars(values))) {
        expect(name).toMatch(/^--appx-spec-[a-z-]+$/);
        expect(value).toMatch(VALUE_SHAPE);
        for (const forbidden of [";", "{", "}", "<", "url(", "\n"]) {
          expect(value).not.toContain(forbidden);
        }
      }
    }
  });

  it("every emitted class matches the BEM modifier shape", () => {
    for (const cls of stylingToModifierClasses(FULLY_OVERRIDDEN)) {
      expect(cls).toMatch(/^appx-spec-table--[a-z-]+$/);
    }
  });
});

describe("formatCssVarDeclarations", () => {
  it("formats {} to an empty string", () => {
    expect(formatCssVarDeclarations({})).toBe("");
  });

  it("formats one entry as `--k: v;`", () => {
    expect(formatCssVarDeclarations({ "--k": "v" })).toBe("--k: v;");
  });

  it("preserves input order across multiple entries", () => {
    expect(
      formatCssVarDeclarations({
        "--a": "1",
        "--b": "2",
        "--c": "3",
      }),
    ).toBe("--a: 1; --b: 2; --c: 3;");
  });

  it("round-trips the Step 1 → Step 2 chain into a stable string", () => {
    const overrides = {
      borderColor: "#abc",
      fontSize: 18,
      labelWidthPct: 30,
    };
    const format = () =>
      formatCssVarDeclarations(stylingToCssVars(parseStylingValues(overrides)));
    expect(format()).toBe(
      "--appx-spec-border-color: #abc; --appx-spec-font-size: 18px; --appx-spec-label-width: 30%;",
    );
    expect(format()).toBe(format());
  });
});
