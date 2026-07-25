import { describe, it, expect } from "vitest";
import {
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
  mobileLayout: "SAME_AS_DESKTOP",
  sectionHeaderStyle: "TEXT_ONLY",
  sectionsCollapsible: true,
  sectionsInitialState: "ALL_CLOSED",
  rowDividerStyle: "STRIPES",
  density: "COMPACT",
  tableMaxWidthPx: 960,
  tableAlign: "CENTER",
  outerBorderWidthPx: 2,
  outerBorderRadiusPx: 12,
  headerBgColor: "#111111",
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

  it("emits the full class list (all six knobs + collapsible + both container flags)", () => {
    expect(stylingToModifierClasses(FULLY_OVERRIDDEN)).toEqual([
      "appx-spec-table--layout-stacked",
      "appx-spec-table--mobile-same-as-desktop",
      "appx-spec-table--section-text-only",
      "appx-spec-table--collapsible",
      "appx-spec-table--dividers-stripes",
      "appx-spec-table--density-compact",
      "appx-spec-table--align-center",
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
