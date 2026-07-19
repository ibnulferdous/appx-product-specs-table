import { describe, expect, it } from "vitest";
import {
  COLOR_KNOBS,
  CUSTOM_FONT_SIZE_CONTROL_VALUE,
  CUSTOM_FONT_SIZE_SEED_PX,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  INHERIT_CONTROL_VALUE,
  LABEL_CASE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  ROW_DIVIDER_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  fontSizeControlValue,
  fromColorControlValue,
  fromControlValue,
  fromLabelWidthControlValue,
  nextFontSizeForControl,
  parseCustomFontSizePx,
  rememberedCustomFontSizePx,
  showsCustomFontSizeInput,
  showsLabelWidthControl,
  showsMobileLayoutControl,
  showsSectionsInitialStateControl,
  toColorControlValue,
  toControlValue,
  toLabelWidthControlValue,
  type StylingOption,
} from "./stylingControls";
import {
  DEFAULT_STYLING_VALUES,
  DENSITIES,
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
  LABEL_CASES,
  LABEL_WIDTH_PCT_MAX,
  LABEL_WIDTH_PCT_MIN,
  LINE_HEIGHTS,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTIONS_INITIAL_STATES,
  SECTION_HEADER_STYLES,
  STYLING_FIELD_NAMES,
  STYLING_FONT_SIZES,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
  parseStylingValues,
  type StylingFontSize,
  type StylingValues,
} from "../../utils/tableStyling";

// Feature 57 Step 5 — the Style tab's option lists. The point of these tests is
// drift: a control that hand-types its values silently stops offering a new one
// the day the domain gains it, and nothing fails. These pin the derivation.

describe("ROW_DIVIDER_OPTIONS (feature 57 Step 5 — the Dividers control)", () => {
  it("offers exactly the domain's divider styles, in domain order", () => {
    expect(ROW_DIVIDER_OPTIONS.map((option) => option.value)).toEqual([
      ...ROW_DIVIDER_STYLES,
    ]);
  });

  it("leads with the default, so the control opens on the current look", () => {
    expect(ROW_DIVIDER_OPTIONS[0].value).toBe(
      DEFAULT_STYLING_VALUES.rowDividerStyle,
    );
  });

  it("gives every option merchant-facing prose", () => {
    for (const option of ROW_DIVIDER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.helpText.length).toBeGreaterThan(0);
      // The label is prose, never the raw constant leaking into the UI.
      expect(option.label).not.toBe(option.value);
    }
  });

  it("has a distinct label per option", () => {
    const labels = ROW_DIVIDER_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// --- Step 8 -----------------------------------------------------------------

// Table-driven over the four knobs this step adds. Each case asserts against the
// DOMAIN CONSTANT, never a hard-coded count or list: the failure this guards is
// someone adding a value to `tableStyling.ts` and the control quietly continuing
// to offer the old set.
const KEYWORD_KNOB_LISTS: ReadonlyArray<{
  name: string;
  options: ReadonlyArray<StylingOption<string>>;
  domain: ReadonlyArray<string>;
  defaultValue: string;
}> = [
  {
    name: "ROW_LAYOUT_OPTIONS",
    options: ROW_LAYOUT_OPTIONS,
    domain: ROW_LAYOUTS,
    defaultValue: DEFAULT_STYLING_VALUES.rowLayout,
  },
  {
    name: "MOBILE_LAYOUT_OPTIONS",
    options: MOBILE_LAYOUT_OPTIONS,
    domain: MOBILE_LAYOUTS,
    defaultValue: DEFAULT_STYLING_VALUES.mobileLayout,
  },
  {
    name: "SECTION_HEADER_OPTIONS",
    options: SECTION_HEADER_OPTIONS,
    domain: SECTION_HEADER_STYLES,
    defaultValue: DEFAULT_STYLING_VALUES.sectionHeaderStyle,
  },
  {
    name: "DENSITY_OPTIONS",
    options: DENSITY_OPTIONS,
    domain: DENSITIES,
    defaultValue: DEFAULT_STYLING_VALUES.density,
  },
  // Step 9b — the same five assertions apply unchanged, which is the point:
  // a new option list satisfies the existing contract or it is shaped wrong.
  {
    name: "SECTIONS_INITIAL_STATE_OPTIONS",
    options: SECTIONS_INITIAL_STATE_OPTIONS,
    domain: SECTIONS_INITIAL_STATES,
    defaultValue: DEFAULT_STYLING_VALUES.sectionsInitialState,
  },
];

describe.each(KEYWORD_KNOB_LISTS)(
  "$name (feature 57 Steps 8/9b — the keyword-knob option lists)",
  ({ options, domain, defaultValue }) => {
    it("offers exactly the domain's values, in domain order", () => {
      expect(options.map((option) => option.value)).toEqual([...domain]);
    });

    it("is derived from the domain constant, not hand-typed", () => {
      // Length against the constant rather than a literal, so a new domain value
      // fails here instead of silently shrinking the control.
      expect(options.length).toBe(domain.length);
    });

    it("leads with the default, so the control opens on the current look", () => {
      expect(options[0].value).toBe(defaultValue);
    });

    it("gives every option merchant-facing prose", () => {
      for (const option of options) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.helpText.length).toBeGreaterThan(0);
        // Prose, never the raw constant leaking into the UI.
        expect(option.label).not.toBe(option.value);
      }
    });

    it("has a distinct label per option", () => {
      const labels = options.map((option) => option.label);
      expect(new Set(labels).size).toBe(labels.length);
    });
  },
);

describe("showsMobileLayoutControl (feature 57 Step 8)", () => {
  it("hides the control for a stacked table, where both options are the same", () => {
    expect(
      showsMobileLayoutControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "STACKED",
      }),
    ).toBe(false);
  });

  it("shows the control for a two-column table", () => {
    expect(
      showsMobileLayoutControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "TWO_COLUMN",
      }),
    ).toBe(true);
  });

  it("does not touch the stored value — hiding is not clearing", () => {
    // The data-loss bug this guards: a merchant picks a mobile layout, tries
    // Stacked, changes their mind, and finds their choice silently reset.
    let styling: StylingValues = {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "TWO_COLUMN",
      mobileLayout: "SAME_AS_DESKTOP",
    };

    styling = { ...styling, rowLayout: "STACKED" };
    expect(showsMobileLayoutControl(styling)).toBe(false);
    expect(styling.mobileLayout).toBe("SAME_AS_DESKTOP");

    styling = { ...styling, rowLayout: "TWO_COLUMN" };
    expect(showsMobileLayoutControl(styling)).toBe(true);
    expect(styling.mobileLayout).toBe("SAME_AS_DESKTOP");
  });
});

// --- Step 9b ----------------------------------------------------------------

describe("showsSectionsInitialStateControl (feature 57 Step 9b)", () => {
  it("hides the control while sections are not collapsible", () => {
    expect(
      showsSectionsInitialStateControl({
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: false,
      }),
    ).toBe(false);
  });

  it("shows the control once sections are collapsible", () => {
    expect(
      showsSectionsInitialStateControl({
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: true,
      }),
    ).toBe(true);
  });

  it("does not touch the stored value — hiding is not clearing", () => {
    // The SECOND instance of the Step 8 data-loss trap: a merchant picks an
    // initial state, turns collapsing off, turns it back on, and must find
    // their own choice rather than the default.
    let styling: StylingValues = {
      ...DEFAULT_STYLING_VALUES,
      sectionsCollapsible: true,
      sectionsInitialState: "ALL_CLOSED",
    };

    styling = { ...styling, sectionsCollapsible: false };
    expect(showsSectionsInitialStateControl(styling)).toBe(false);
    expect(styling.sectionsInitialState).toBe("ALL_CLOSED");

    styling = { ...styling, sectionsCollapsible: true };
    expect(showsSectionsInitialStateControl(styling)).toBe(true);
    expect(styling.sectionsInitialState).toBe("ALL_CLOSED");
    // ...and it is NOT the domain default, or the assertion above proves nothing.
    expect(styling.sectionsInitialState).not.toBe(
      DEFAULT_STYLING_VALUES.sectionsInitialState,
    );
  });
});

// --- Step 10a · the null vocabulary + the seven color swatches ---------------

describe("the null sentinel (feature 57 Step 10)", () => {
  // The bug this guards is invisible in the editor: a stray `""` written into
  // styling state is coerced back to null by `parseStylingValues` on the way to
  // the database, so it would only ever surface as a wrong metaobject. Both
  // directions are pinned here rather than trusted to the call sites.
  it("maps null to the empty string and back", () => {
    expect(toControlValue(null)).toBe(INHERIT_CONTROL_VALUE);
    expect(fromControlValue(INHERIT_CONTROL_VALUE, ROW_LAYOUTS)).toBeNull();
  });

  it("round-trips every domain member in both directions", () => {
    for (const value of SECTIONS_INITIAL_STATES) {
      expect(toControlValue(value)).toBe(value);
      expect(fromControlValue(value, SECTIONS_INITIAL_STATES)).toBe(value);
    }
  });

  it("degrades an unknown string to null rather than casting it through", () => {
    expect(fromControlValue("NOT_A_MEMBER", ROW_LAYOUTS)).toBeNull();
  });
});

describe("COLOR_KNOBS (feature 57 Step 10a)", () => {
  it("covers exactly the fields the domain accepts a color for", () => {
    // Derived from `parseStylingValues` rather than hand-typed: an eighth color
    // added to `StylingValues` fails here instead of silently having no swatch.
    const hexAccepting = STYLING_FIELD_NAMES.filter(
      (field) =>
        parseStylingValues({ [field]: "#123456" })[field] === "#123456",
    );
    expect(COLOR_KNOBS.map((knob) => knob.field)).toEqual(hexAccepting);
  });

  it("enables alpha on the five surface colors and disables it on the two text colors", () => {
    // The 2026-07-19 lock: the stylesheet's own defaults are translucent, so an
    // opaque-only surface picker could not reproduce the default look, while
    // translucent body text is a contrast bug rather than a design choice.
    const alphaOn = COLOR_KNOBS.filter((knob) => knob.alpha).map(
      (k) => k.field,
    );
    expect(alphaOn).toEqual([
      "headerBgColor",
      "labelBgColor",
      "valueBgColor",
      "stripeBgColor",
      "borderColor",
    ]);
    expect(
      COLOR_KNOBS.filter((knob) => !knob.alpha).map((k) => k.field),
    ).toEqual(["labelTextColor", "valueTextColor"]);
  });

  it("gives every swatch distinct merchant-facing prose", () => {
    for (const knob of COLOR_KNOBS) {
      expect(knob.label.length).toBeGreaterThan(0);
      expect(knob.helpText.length).toBeGreaterThan(0);
      expect(knob.label).not.toBe(knob.field);
    }
    const labels = COLOR_KNOBS.map((knob) => knob.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("starts every swatch in the Theme state, since colors default to inherit", () => {
    for (const knob of COLOR_KNOBS) {
      expect(DEFAULT_STYLING_VALUES[knob.field]).toBeNull();
      expect(toColorControlValue(DEFAULT_STYLING_VALUES[knob.field])).toBe(
        INHERIT_CONTROL_VALUE,
      );
    }
  });
});

describe("fromColorControlValue (feature 57 Step 10a)", () => {
  it("treats an empty field as Theme, which is the way back to inherit", () => {
    expect(fromColorControlValue("")).toBeNull();
    expect(fromColorControlValue("   ")).toBeNull();
  });

  it("keeps every hex shape the domain accepts, alpha included", () => {
    expect(fromColorControlValue("#abc")).toBe("#abc");
    expect(fromColorControlValue("#0f172a")).toBe("#0f172a");
    // The 8-digit shape is what the alpha-enabled surface swatches emit.
    expect(fromColorControlValue("#0f172a80")).toBe("#0f172a80");
  });

  it("agrees with the domain whitelist, so a bad value can never reach a style attribute", () => {
    // These values are interpolated into an inline `style` on a live storefront,
    // so the control boundary must reject exactly what the server rejects.
    for (const bad of ["#fff;background:url(x)", "red", "rgb(0,0,0)", "#12"]) {
      expect(fromColorControlValue(bad)).toBe(
        parseStylingValues({ headerBgColor: bad }).headerBgColor,
      );
      expect(fromColorControlValue(bad)).toBeNull();
    }
  });
});

// --- Step 10b · typography + label width -------------------------------------

// The four NULLABLE keyword lists get their own table with an ADAPTED contract,
// rather than joining the Step 8/9b table with its assertions loosened. Two of
// the five change meaning here — "exactly the domain's values" becomes "Inherit
// plus the domain's values", and "leads with the default" becomes "leads with
// Inherit, whose value is the null sentinel" — and loosening the original table
// to fit would stop it catching a regression in the seven non-nullable lists.
const NULLABLE_KEYWORD_KNOB_LISTS: ReadonlyArray<{
  name: string;
  options: ReadonlyArray<StylingOption<string>>;
  domain: ReadonlyArray<string>;
}> = [
  {
    name: "FONT_WEIGHT_OPTIONS",
    options: FONT_WEIGHT_OPTIONS,
    domain: STYLING_FONT_WEIGHTS,
  },
  {
    name: "FONT_STYLE_OPTIONS",
    options: FONT_STYLE_OPTIONS,
    domain: STYLING_FONT_STYLES,
  },
  {
    name: "LINE_HEIGHT_OPTIONS",
    options: LINE_HEIGHT_OPTIONS,
    domain: LINE_HEIGHTS,
  },
  {
    name: "LABEL_CASE_OPTIONS",
    options: LABEL_CASE_OPTIONS,
    domain: LABEL_CASES,
  },
];

describe.each(NULLABLE_KEYWORD_KNOB_LISTS)(
  "$name (feature 57 Step 10b — the nullable keyword lists)",
  ({ options, domain }) => {
    it("offers Inherit plus exactly the domain's values, in domain order", () => {
      expect(options.map((option) => option.value)).toEqual([
        INHERIT_CONTROL_VALUE,
        ...domain,
      ]);
    });

    it("is derived from the domain constant, not hand-typed", () => {
      expect(options.length).toBe(domain.length + 1);
    });

    it("leads with Inherit, whose value is the null sentinel", () => {
      expect(options[0].value).toBe(INHERIT_CONTROL_VALUE);
      expect(fromControlValue(options[0].value, domain)).toBeNull();
    });

    it("gives every option merchant-facing prose", () => {
      for (const option of options) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.helpText.length).toBeGreaterThan(0);
        expect(option.label).not.toBe(option.value);
      }
    });

    it("has a distinct label per option", () => {
      const labels = options.map((option) => option.label);
      expect(new Set(labels).size).toBe(labels.length);
    });
  },
);

describe("FONT_SIZE_OPTIONS (feature 57 Step 10b — the three-shaped knob)", () => {
  it("offers Inherit, the domain's presets, and Custom last", () => {
    expect(FONT_SIZE_OPTIONS.map((option) => option.value)).toEqual([
      INHERIT_CONTROL_VALUE,
      ...STYLING_FONT_SIZES,
      CUSTOM_FONT_SIZE_CONTROL_VALUE,
    ]);
  });

  it("keeps the Custom mode marker out of the domain, so it cannot be stored", () => {
    // If a keyword named CUSTOM were ever added to the domain, the select would
    // have two options with the same value and one of them would be unreachable.
    expect([...STYLING_FONT_SIZES]).not.toContain(
      CUSTOM_FONT_SIZE_CONTROL_VALUE,
    );
    expect(
      fromControlValue(CUSTOM_FONT_SIZE_CONTROL_VALUE, STYLING_FONT_SIZES),
    ).toBeNull();
  });
});

describe("the fontSize tri-state (feature 57 Step 10b)", () => {
  it("selects the right option for each of the three shapes", () => {
    expect(fontSizeControlValue(null)).toBe(INHERIT_CONTROL_VALUE);
    expect(fontSizeControlValue("SMALL")).toBe("SMALL");
    expect(fontSizeControlValue(24)).toBe(CUSTOM_FONT_SIZE_CONTROL_VALUE);
  });

  it("stores null for Inherit and the keyword for a preset", () => {
    expect(
      nextFontSizeForControl(INHERIT_CONTROL_VALUE, CUSTOM_FONT_SIZE_SEED_PX),
    ).toBeNull();
    for (const keyword of STYLING_FONT_SIZES) {
      expect(nextFontSizeForControl(keyword, CUSTOM_FONT_SIZE_SEED_PX)).toBe(
        keyword,
      );
    }
  });

  it("seeds Custom at 16 — the web default, not the accessibility floor", () => {
    expect(CUSTOM_FONT_SIZE_SEED_PX).toBe(16);
    // Seeding at the floor would shrink the table to its smallest legal size the
    // instant a merchant clicked Custom, leaving them to type their way back up.
    expect(CUSTOM_FONT_SIZE_SEED_PX).not.toBe(FONT_SIZE_PX_MIN);
    expect(
      nextFontSizeForControl(
        CUSTOM_FONT_SIZE_CONTROL_VALUE,
        CUSTOM_FONT_SIZE_SEED_PX,
      ),
    ).toBe(CUSTOM_FONT_SIZE_SEED_PX);
  });

  it("returns the merchant's px on re-entering Custom, not the seed", () => {
    // The round trip the spec names: S -> Custom -> S -> Custom.
    let fontSize: StylingFontSize = "SMALL";
    let remembered = CUSTOM_FONT_SIZE_SEED_PX;

    fontSize = nextFontSizeForControl(
      CUSTOM_FONT_SIZE_CONTROL_VALUE,
      remembered,
    );
    fontSize = 31; // the merchant types a size
    remembered = rememberedCustomFontSizePx(fontSize, remembered);

    fontSize = nextFontSizeForControl("SMALL", remembered);
    expect(fontSize).toBe("SMALL");
    // Leaving Custom must not disturb the memory.
    remembered = rememberedCustomFontSizePx(fontSize, remembered);
    expect(remembered).toBe(31);

    fontSize = nextFontSizeForControl(
      CUSTOM_FONT_SIZE_CONTROL_VALUE,
      remembered,
    );
    expect(fontSize).toBe(31);
    expect(fontSize).not.toBe(CUSTOM_FONT_SIZE_SEED_PX);
  });
});

describe("the bounded numeric inputs (feature 57 Step 10b)", () => {
  // Probes DERIVED from the constants, never literals: the px ceiling moved
  // 40 -> 184 on 2026-07-19, and a hard-coded probe is exactly what went stale.
  it("clamps a custom px into the domain's bounds rather than rejecting it", () => {
    expect(parseCustomFontSizePx(String(FONT_SIZE_PX_MIN - 1))).toBe(
      FONT_SIZE_PX_MIN,
    );
    expect(parseCustomFontSizePx(String(FONT_SIZE_PX_MAX + 1))).toBe(
      FONT_SIZE_PX_MAX,
    );
    expect(parseCustomFontSizePx("24")).toBe(24);
    expect(parseCustomFontSizePx("24.6")).toBe(25);
  });

  it("ignores an unusable px entry rather than flipping the mode to Inherit", () => {
    // Inherit is its own option on the select, so an emptied box must not
    // silently become one. Null here means "no change", and the panel skips it.
    expect(parseCustomFontSizePx("")).toBeNull();
    expect(parseCustomFontSizePx("abc")).toBeNull();
  });

  it("clamps a label width into the domain's bounds", () => {
    expect(fromLabelWidthControlValue(String(LABEL_WIDTH_PCT_MIN - 1))).toBe(
      LABEL_WIDTH_PCT_MIN,
    );
    expect(fromLabelWidthControlValue(String(LABEL_WIDTH_PCT_MAX + 1))).toBe(
      LABEL_WIDTH_PCT_MAX,
    );
    expect(fromLabelWidthControlValue("40")).toBe(40);
  });

  it("treats an emptied label-width box as Theme — its only way back", () => {
    // Unlike the px box, this control has no separate Inherit option, so
    // clearing it IS the merchant's route back to the default column split.
    expect(fromLabelWidthControlValue("")).toBeNull();
    expect(toLabelWidthControlValue(null)).toBe(INHERIT_CONTROL_VALUE);
    expect(toLabelWidthControlValue(35)).toBe("35");
  });

  it("keeps every clamped value acceptable to the domain parser", () => {
    // The clamp at the control boundary and the clamp at the trust boundary
    // must agree, or a value would round-trip differently once saved.
    for (const raw of [
      String(FONT_SIZE_PX_MIN - 1),
      String(FONT_SIZE_PX_MAX + 1),
      "24",
    ]) {
      const px = parseCustomFontSizePx(raw);
      expect(parseStylingValues({ fontSize: px }).fontSize).toBe(px);
    }
    for (const raw of [
      String(LABEL_WIDTH_PCT_MIN - 1),
      String(LABEL_WIDTH_PCT_MAX + 1),
      "40",
    ]) {
      const pct = fromLabelWidthControlValue(raw);
      expect(parseStylingValues({ labelWidthPct: pct }).labelWidthPct).toBe(
        pct,
      );
    }
  });
});

describe("showsLabelWidthControl (feature 57 Step 10b)", () => {
  it("shows for a two-column table and hides for a stacked one", () => {
    expect(
      showsLabelWidthControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "TWO_COLUMN",
      }),
    ).toBe(true);
    expect(
      showsLabelWidthControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "STACKED",
      }),
    ).toBe(false);
  });
});

describe("showsCustomFontSizeInput (feature 57 Step 10b)", () => {
  it("shows only while fontSize is a px number", () => {
    expect(
      showsCustomFontSizeInput({ ...DEFAULT_STYLING_VALUES, fontSize: 24 }),
    ).toBe(true);
    expect(
      showsCustomFontSizeInput({
        ...DEFAULT_STYLING_VALUES,
        fontSize: "SMALL",
      }),
    ).toBe(false);
    expect(
      showsCustomFontSizeInput({ ...DEFAULT_STYLING_VALUES, fontSize: null }),
    ).toBe(false);
  });
});

// --- The preserve-on-hide law, generalised (feature 57 Step 10 §4) ------------
//
// Four hide rules now exist, and the 2026-07-19 lock was to keep the four
// PREDICATES independent (they read genuinely different fields, so merging them
// into a record would buy indirection, not safety) and generalise the LAW
// instead. The value in this pattern was never the predicate — it was the rule
// that HIDING IS A READ, NEVER A WRITE. The real risk is not "someone wrote a
// similar one-liner again", it is "someone adds a fifth control and forgets the
// law", and only a shared test catches that. A fifth knob inherits the law by
// adding one row below.
const VISIBILITY_PREDICATES: ReadonlyArray<{
  name: string;
  predicate: (styling: StylingValues) => boolean;
  // A value the control is VISIBLE for, and the edit that hides it. The hidden
  // variant deliberately carries a non-default value in the hidden field, so
  // "the value survived" is a real assertion rather than a tautology.
  visible: StylingValues;
  hide: (styling: StylingValues) => StylingValues;
  // The field the control edits, which hiding must not disturb. Null for
  // `fontSize`, whose hide-edit IS a write to the guarded field — its
  // remember-the-px behaviour is UI memory and is covered by the tri-state
  // round-trip test above rather than by the predicate.
  preservedField: keyof StylingValues | null;
}> = [
  {
    name: "showsMobileLayoutControl",
    predicate: showsMobileLayoutControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "TWO_COLUMN",
      mobileLayout: "SAME_AS_DESKTOP",
    },
    hide: (styling) => ({ ...styling, rowLayout: "STACKED" }),
    preservedField: "mobileLayout",
  },
  {
    name: "showsSectionsInitialStateControl",
    predicate: showsSectionsInitialStateControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      sectionsCollapsible: true,
      sectionsInitialState: "ALL_CLOSED",
    },
    hide: (styling) => ({ ...styling, sectionsCollapsible: false }),
    preservedField: "sectionsInitialState",
  },
  {
    name: "showsLabelWidthControl",
    predicate: showsLabelWidthControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "TWO_COLUMN",
      labelWidthPct: 35,
    },
    hide: (styling) => ({ ...styling, rowLayout: "STACKED" }),
    preservedField: "labelWidthPct",
  },
  {
    name: "showsCustomFontSizeInput",
    predicate: showsCustomFontSizeInput,
    visible: { ...DEFAULT_STYLING_VALUES, fontSize: 31 },
    hide: (styling) => ({ ...styling, fontSize: "SMALL" }),
    preservedField: null,
  },
];

describe.each(VISIBILITY_PREDICATES)(
  "$name — the preserve-on-hide law (feature 57 Step 10 §4)",
  ({ predicate, visible, hide, preservedField }) => {
    it("agrees that the control is visible for the shown value", () => {
      expect(predicate(visible)).toBe(true);
    });

    it("hides once the irrelevant-making edit is made", () => {
      expect(predicate(hide(visible))).toBe(false);
    });

    it("never writes — the styling it is handed comes back untouched", () => {
      // THE LAW. A predicate that cleared the field it guards would be silent
      // data loss, and a frozen input turns any attempt into a throw.
      const frozen = Object.freeze({ ...visible });
      const before = JSON.stringify(frozen);
      predicate(frozen);
      predicate(hide(frozen));
      expect(JSON.stringify(frozen)).toBe(before);
    });

    it("leaves the merchant's own value intact while hidden", () => {
      if (preservedField === null) return;
      const hidden = hide(visible);
      expect(hidden[preservedField]).toBe(visible[preservedField]);
      // ...and it is NOT the default, or the assertion above proves nothing.
      expect(hidden[preservedField]).not.toBe(
        DEFAULT_STYLING_VALUES[preservedField],
      );
    });
  },
);
