import { describe, expect, it } from "vitest";
import {
  COLOR_KNOBS,
  CUSTOM_FONT_SIZE_CONTROL_VALUE,
  CUSTOM_FONT_SIZE_SEED_PX,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HEADER_CASE_OPTIONS,
  HEADER_FONT_WEIGHT_OPTIONS,
  INHERIT_CONTROL_VALUE,
  LABEL_CASE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  COLUMN_DIVIDER_OPTIONS,
  ROW_DIVIDER_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  STYLE_GROUP_HEADINGS,
  fontSizeControlValue,
  fromColorControlValue,
  fromControlValue,
  fromHeaderFontSizeControlValue,
  fromHeaderPaddingBlockControlValue,
  fromLabelWidthControlValue,
  fromOuterBorderRadiusControlValue,
  fromOuterBorderWidthControlValue,
  fromSectionGapControlValue,
  fromGridMinColumnWidthControlValue,
  ZERO_MEANS_OFF_CONTROL_MIN,
  nextFontSizeForControl,
  parseCustomFontSizePx,
  rememberedCustomFontSizePx,
  rowDividerOptionsFor,
  showsCustomFontSizeInput,
  showsGridMinColumnWidthControl,
  showsHeaderBackgroundControl,
  showsLabelWidthControl,
  showsMobileLayoutControl,
  showsSectionGapControl,
  showsSectionsInitialStateControl,
  showsStripeBackgroundControl,
  showsTableAlignControl,
  toColorControlValue,
  toControlValue,
  toBoundedIntControlValue,
  toGridMinColumnWidthControlValue,
  toHeaderFontSizeControlValue,
  toHeaderPaddingBlockControlValue,
  toLabelWidthControlValue,
  toZeroMeansOffControlValue,
  type StyleGroupId,
  type StylingOption,
} from "./stylingControls";
import {
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
  OUTER_BORDER_RADIUS_PX_MAX,
  OUTER_BORDER_RADIUS_PX_MIN,
  OUTER_BORDER_WIDTH_PX_MAX,
  OUTER_BORDER_WIDTH_PX_MIN,
  COLUMN_DIVIDER_STYLES,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTIONS_INITIAL_STATES,
  SECTION_GAP_PX_MAX,
  SECTION_GAP_PX_MIN,
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
    // One of only two lists where feature 86 kept EVERY gloss, and it survives
    // the help-text cull on merit: `Lines` / `Stripes` / `None` name a
    // mechanism, not an outcome, so each has to say what a shopper will see.
    // Written `?? 0` rather than `!` because absence is now representable and a
    // non-null assertion would report it as a crash instead of a failure.
    for (const option of ROW_DIVIDER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.helpText?.length ?? 0).toBeGreaterThan(0);
      // The label is prose, never the raw constant leaking into the UI.
      expect(option.label).not.toBe(option.value);
    }
  });

  it("has a distinct label per option", () => {
    const labels = ROW_DIVIDER_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("COLUMN_DIVIDER_OPTIONS (feature 79 — the Column divider control)", () => {
  it("offers exactly the domain's column-divider styles, in domain order", () => {
    expect(COLUMN_DIVIDER_OPTIONS.map((option) => option.value)).toEqual([
      ...COLUMN_DIVIDER_STYLES,
    ]);
  });

  it("leads with the default, so the control opens on the current look", () => {
    expect(COLUMN_DIVIDER_OPTIONS[0].value).toBe(
      DEFAULT_STYLING_VALUES.columnDividerStyle,
    );
  });

  it("gives every option merchant-facing prose", () => {
    // The other list feature 86 left whole. `LINE` carries a composition caveat
    // that a test below pins as a shipped requirement, and `NONE` has to say
    // WHICH rule is absent — there are two dividers and this knob owns one.
    for (const option of COLUMN_DIVIDER_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.helpText?.length ?? 0).toBeGreaterThan(0);
      expect(option.label).not.toBe(option.value);
    }
  });

  it("has a distinct label per option", () => {
    const labels = COLUMN_DIVIDER_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  // The control is deliberately NOT hidden on stacked layouts (merchant call
  // 2026-07-26), where the stylesheet suppresses the rule. That makes the help
  // text the ONLY place a merchant learns why picking Line changed nothing —
  // so the caveat is a shipped requirement, not prose, and is pinned here.
  it("warns on the LINE option that it applies to two-column layouts only", () => {
    const line = COLUMN_DIVIDER_OPTIONS.find(
      (option) => option.value === "LINE",
    );
    expect(line?.helpText).toMatch(/two-column/i);
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

    it("gives every option a merchant-facing label", () => {
      for (const option of options) {
        expect(option.label.length).toBeGreaterThan(0);
        // Prose, never the raw constant leaking into the UI.
        expect(option.label).not.toBe(option.value);
      }
    });

    it("carries either real help text or none, never an empty string", () => {
      // Feature 86 made `helpText` optional and cut most of these lists' glosses
      // — a label like `Compact` explains itself. What must not happen is a
      // gloss deleted to `""`: `selectedHelpText` maps that to `undefined`, but
      // if it ever stopped doing so an empty string would paint a blank subdued
      // line and the control would hold the space of a description it lacks.
      for (const option of options) {
        expect(option.helpText ?? "absent").not.toBe("");
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

  it("hides for GRID too — a grid is already responsive (feature 85)", () => {
    // The predicate went from `!== "STACKED"` to `=== "TWO_COLUMN"` here. A
    // grid reaches the same conclusion as a stacked table by a different route:
    // auto-fit fits exactly one track at a phone width, so there is no mobile
    // behaviour left to choose and neither option would do anything.
    expect(
      showsMobileLayoutControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "GRID",
      }),
    ).toBe(false);
  });
});

describe("showsGridMinColumnWidthControl (feature 85)", () => {
  it("shows only in Grid", () => {
    for (const layout of ROW_LAYOUTS) {
      expect(
        showsGridMinColumnWidthControl({
          ...DEFAULT_STYLING_VALUES,
          rowLayout: layout,
        }),
      ).toBe(layout === "GRID");
    }
  });
});

describe("rowDividerOptionsFor (feature 85 — the first per-option hide)", () => {
  it("offers all three outside Grid", () => {
    for (const layout of ["TWO_COLUMN", "STACKED"] as const) {
      const options = rowDividerOptionsFor({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: layout,
      });
      expect(options).toBe(ROW_DIVIDER_OPTIONS);
      expect(options.map((option) => option.value)).toEqual([
        "LINES",
        "STRIPES",
        "NONE",
      ]);
    }
  });

  it("drops Stripes in Grid for a merchant who has not chosen it", () => {
    // Zebra striping is DOM-order parity, which across several tracks paints a
    // checkerboard rather than alternating rows.
    const options = rowDividerOptionsFor({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
      rowDividerStyle: "LINES",
    });
    expect(options.map((option) => option.value)).toEqual(["LINES", "NONE"]);
  });

  it("keeps an ORPHANED Stripes visible and labelled rather than blanking the select", () => {
    // The case that makes this a derived list and not a `.filter()`: the select
    // stays on screen bound to `styling.rowDividerStyle`, so a stored value
    // missing from the option list renders blank with a blank help line.
    const options = rowDividerOptionsFor({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
      rowDividerStyle: "STRIPES",
    });
    expect(options.map((option) => option.value)).toEqual([
      "LINES",
      "NONE",
      "STRIPES",
    ]);
    const stripes = options.find((option) => option.value === "STRIPES");
    expect(stripes?.label).toBe("Stripes — not available in Grid");
    expect(stripes?.helpText).toBe(
      "Stripes do not apply in Grid layout. Pick Lines or None.",
    );
  });

  it("drops the orphan entry for good once another member is picked", () => {
    expect(
      rowDividerOptionsFor({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "GRID",
        rowDividerStyle: "NONE",
      }).map((option) => option.value),
    ).toEqual(["LINES", "NONE"]);
  });

  it("never mutates the styling it reads — no coercion on a layout change", () => {
    // 🚫 The rejected alternative was forcing STRIPES -> LINES when a merchant
    // picks Grid. That destroys a setting the preserve-on-hide law protects,
    // and makes a rowLayout change write a different field.
    const frozen = Object.freeze({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID" as const,
      rowDividerStyle: "STRIPES" as const,
    });
    rowDividerOptionsFor(frozen);
    expect(frozen.rowDividerStyle).toBe("STRIPES");
  });

  it("leaves the unfiltered base list untouched", () => {
    // The Grid path filters a copy; ROW_DIVIDER_OPTIONS is exported and shared.
    rowDividerOptionsFor({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
      rowDividerStyle: "STRIPES",
    });
    expect(ROW_DIVIDER_OPTIONS).toHaveLength(3);
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

  it("enables alpha on the six surface colors and disables it on the three text colors", () => {
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
      // The outer frame is a surface line like the row rules, and its own
      // fallback chain ends in a translucent literal, so alpha stays on.
      "outerBorderColor",
    ]);
    expect(
      COLOR_KNOBS.filter((knob) => !knob.alpha).map((k) => k.field),
    ).toEqual([
      // Feature 81's section-title color joins the text group, not the surface
      // group — the band it sits on is a surface and keeps its alpha.
      "headerTextColor",
      "labelTextColor",
      "valueTextColor",
    ]);
  });

  it("gives every swatch merchant-facing prose for BOTH of its states", () => {
    for (const knob of COLOR_KNOBS) {
      expect(knob.label.length).toBeGreaterThan(0);
      expect(knob.helpText.length).toBeGreaterThan(0);
      // Feature 86: a swatch describes itself when set AND when empty. Unlike
      // the option lists, neither is optional here — an empty swatch is the
      // DEFAULT state of all nine, so a missing gloss would leave every color
      // in the rail undescribed until a merchant touched it.
      expect(knob.emptyHelpText.length).toBeGreaterThan(0);
      expect(knob.helpText).not.toBe(knob.emptyHelpText);
      expect(knob.label).not.toBe(knob.field);
    }
  });

  it("has a distinct label WITHIN each group, not across the rail", () => {
    // Feature 86 weakened this from global uniqueness deliberately, and the
    // weakening is the design: `Labels` and `Values` each contain a swatch
    // called "Background" and one called "Text color", because the group
    // heading is what distinguishes them. That is only legitimate while every
    // group is a `role="group"` wired to its heading with `aria-labelledby`, so
    // the scope is announced and not merely seen — see `STYLE_GROUP_HEADINGS`.
    // Within one group two identical labels would be genuinely ambiguous, and
    // nothing would tell them apart.
    for (const group of Object.keys(STYLE_GROUP_HEADINGS) as StyleGroupId[]) {
      const labels = COLOR_KNOBS.filter((knob) => knob.group === group).map(
        (knob) => knob.label,
      );
      expect(new Set(labels).size, group).toBe(labels.length);
    }
  });

  it("files every swatch under a real group", () => {
    for (const knob of COLOR_KNOBS) {
      expect(Object.keys(STYLE_GROUP_HEADINGS)).toContain(knob.group);
    }
  });

  it("keeps the array in STYLING_FIELD_NAMES order, so groups select by filter", () => {
    // The rail renders a group's swatches with `.filter(…)`, never by
    // reordering, because `tableStyling.ts` documents the color block as
    // contiguous and the order test above derives from it. Pinned here as well
    // so the reason survives next to the code that depends on it: sorting
    // `COLOR_KNOBS` by group would read as tidying and would break that test
    // several files away.
    const positions = COLOR_KNOBS.map((knob) =>
      STYLING_FIELD_NAMES.indexOf(knob.field),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("promises a theme value only where the stylesheet actually has one", () => {
    // ⚠️ The claim the old group note got wrong. "Leave a swatch empty to
    // inherit that color from your theme" was true for five of the nine: the
    // band, the stripe and the row rules fall back to this app's own literals
    // (`rgba(0,0,0,0.06)` / `0.04` / `0.1`), and the outline falls back THROUGH
    // `borderColor` rather than to anything of the theme's. Per-swatch state
    // text is what let each say the truth, so pin which ones may say "theme".
    const inheritsFromTheme = COLOR_KNOBS.filter((knob) =>
      knob.emptyHelpText.toLowerCase().includes("theme"),
    ).map((knob) => knob.field);

    expect(inheritsFromTheme).toEqual([
      "headerTextColor",
      "labelBgColor",
      "valueBgColor",
      "labelTextColor",
      "valueTextColor",
    ]);
  });

  it("leaves every group at least one unconditional swatch (feature 95)", () => {
    // ⚠️ THE HAZARD `visibleWhen` INTRODUCED. `colorGrid(group)` renders an
    // `<s-grid>` unconditionally and fills it by filter, so a group whose every
    // swatch were gated would paint an EMPTY grid: dead space in the rail, and
    // a silent hole in `styleTabContract.test.ts`'s "no group collapses to a
    // bare heading" count, which treats `colorGrid(…)` as one control that
    // always renders and cannot see inside it.
    //
    // Derived from the data: gating a second swatch is fine, gating the last
    // one in its group fails here and names the group.
    const groups = [...new Set(COLOR_KNOBS.map((knob) => knob.group))];
    const allGated = groups.filter((group) =>
      COLOR_KNOBS.filter((knob) => knob.group === group).every(
        (knob) => knob.visibleWhen,
      ),
    );

    expect(allGated).toEqual([]);
    expect(groups.length).toBeGreaterThan(1); // guards the guard
  });

  it("keeps a gated swatch's help text free of the condition it is gated on", () => {
    // Feature 95's copy rule. A hidden control cannot be read, so prose telling
    // the merchant what to switch on describes a state they are never in while
    // looking at it — the caveat and the hide are two answers to one problem,
    // and shipping both leaves the weaker one visible. `Divider color`, which
    // is NOT gated, keeps its coupling text and must: that is what this asserts
    // is a property of gating rather than a blanket ban on caveats.
    for (const knob of COLOR_KNOBS.filter((k) => k.visibleWhen)) {
      expect(knob.helpText.toLowerCase(), knob.field).not.toContain("needs ");
    }
    expect(
      COLOR_KNOBS.find((knob) => knob.field === "borderColor")?.helpText,
    ).toContain("unless");
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

    it("gives every option a merchant-facing label", () => {
      for (const option of options) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.label).not.toBe(option.value);
      }
    });

    it("always explains Inherit, whatever else it drops", () => {
      // THE feature-86 asymmetry, and the reason `withInheritOption` takes the
      // inherit gloss as a required argument while the domain options' copy is
      // optional. `Bold` and `Uppercase` say what they do; `Inherit` is the one
      // option in the rail whose meaning cannot be read off the word — it has to
      // name what is inherited and from where. Cutting it would leave a merchant
      // unable to tell "inherit" from a fourth concrete value.
      expect(options[0].value).toBe(INHERIT_CONTROL_VALUE);
      expect(options[0].helpText?.length ?? 0).toBeGreaterThan(0);
    });

    it("carries either real help text or none, never an empty string", () => {
      for (const option of options) {
        expect(option.helpText ?? "absent").not.toBe("");
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

  // Outline width, Corner radius and Section gap share one contract, so they
  // are tested as one table rather than three times over: each shows `0` for
  // off, each reads anything at or below zero back as null, and NONE of them
  // may ever hand a 0 to the model.
  const ZERO_MEANS_OFF_BOXES = [
    {
      label: "outline width",
      from: fromOuterBorderWidthControlValue,
      min: OUTER_BORDER_WIDTH_PX_MIN,
      max: OUTER_BORDER_WIDTH_PX_MAX,
    },
    {
      label: "corner radius",
      from: fromOuterBorderRadiusControlValue,
      min: OUTER_BORDER_RADIUS_PX_MIN,
      max: OUTER_BORDER_RADIUS_PX_MAX,
    },
    {
      label: "section gap",
      from: fromSectionGapControlValue,
      min: SECTION_GAP_PX_MIN,
      max: SECTION_GAP_PX_MAX,
    },
  ];

  it.each(ZERO_MEANS_OFF_BOXES)(
    "clamps a $label into the domain's bounds",
    ({ from, min, max }) => {
      expect(from(String(max + 1))).toBe(max);
      expect(from(String(min + 2))).toBe(min + 2);
      // Rounds UP into the range rather than falling through to off below:
      // only a value that rounds to zero means off.
      expect(from("0.6")).toBe(min);
    },
  );

  it.each(ZERO_MEANS_OFF_BOXES)(
    "reads 0 in the $label box as off, never as a 0 px value",
    ({ from, min }) => {
      // These three converters do not clamp their floor. A stored 0 would be
      // non-null, so it would trip the knob's presence flag while painting
      // nothing: `--outer-border` drops the last row's bottom rule,
      // `--outer-radius` turns on `overflow: hidden`, and `--section-gap`
      // stands the banded section separator down. Off has exactly one stored
      // spelling and everything at or below zero reaches it.
      expect(from("0")).toBeNull();
      expect(from("0.4")).toBeNull();
      expect(from("-5")).toBeNull();
      // An emptied box lands on the same null by the shorter route, and
      // unusable text is still ignored.
      expect(from("")).toBeNull();
      expect(from("abc")).toBeNull();
      // The 0 the box shows must be one the stepper can walk down to, which is
      // why the control floor sits BELOW the domain's stored floor.
      expect(ZERO_MEANS_OFF_CONTROL_MIN).toBeLessThan(min);
      expect(from(String(ZERO_MEANS_OFF_CONTROL_MIN))).toBeNull();
      // The invariant the presence flags depend on: no input reaches the model
      // as a 0.
      for (const raw of ["0", "-0", "-5", "", "0.4", "abc"]) {
        expect(from(raw)).not.toBe(0);
      }
    },
  );

  it("shows an off value as a literal 0 rather than an empty box", () => {
    // Display and model disagree ON PURPOSE, in one direction only: off is
    // stored as null but shown as 0, because a blank box is a poor way to state
    // a px value. The round trip has to close at both ends, or the merchant
    // loses the ability to type their way back to off.
    expect(toZeroMeansOffControlValue(null)).toBe("0");
    expect(toZeroMeansOffControlValue(3)).toBe("3");
    for (const { from } of ZERO_MEANS_OFF_BOXES) {
      expect(from(toZeroMeansOffControlValue(null))).toBeNull();
    }
    // Maximum width deliberately does NOT join them — 0 is not a spelling of
    // "full width", so its box still goes blank.
    expect(toBoundedIntControlValue(null)).toBe(INHERIT_CONTROL_VALUE);
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
    // The zero-means-off boxes have to survive the trust boundary too: they
    // hand the parser a null, which is the default it already round-trips. If
    // either ever handed over a 0, the parser would clamp it back up to 1 and
    // the merchant's "off" would return as a hairline frame / a 1px round.
    for (const raw of ["0", "-5", String(OUTER_BORDER_WIDTH_PX_MAX + 1), "3"]) {
      const px = fromOuterBorderWidthControlValue(raw);
      expect(
        parseStylingValues({ outerBorderWidthPx: px }).outerBorderWidthPx,
      ).toBe(px);
    }
    for (const raw of [
      "0",
      "-5",
      String(OUTER_BORDER_RADIUS_PX_MAX + 1),
      "12",
    ]) {
      const px = fromOuterBorderRadiusControlValue(raw);
      expect(
        parseStylingValues({ outerBorderRadiusPx: px }).outerBorderRadiusPx,
      ).toBe(px);
    }
    for (const raw of ["0", "-5", String(SECTION_GAP_PX_MAX + 1), "12"]) {
      const px = fromSectionGapControlValue(raw);
      expect(parseStylingValues({ sectionGapPx: px }).sectionGapPx).toBe(px);
    }
    for (const raw of [
      String(GRID_MIN_COLUMN_WIDTH_PX_MIN - 1),
      String(GRID_MIN_COLUMN_WIDTH_PX_MAX + 1),
      "320",
    ]) {
      const px = fromGridMinColumnWidthControlValue(raw);
      expect(
        parseStylingValues({ gridMinColumnWidthPx: px }).gridMinColumnWidthPx,
      ).toBe(px);
    }
  });
});

describe("the minimum-column-width box (feature 85)", () => {
  it("is a BLANK box, not a zero-means-off one", () => {
    // Clearing it is the way back to the stylesheet's own 240px. `0` is not a
    // spelling of anything here — it would mean an unbounded track count, the
    // unreadable case the floor exists to prevent — so it clamps UP to the
    // floor rather than reading as "off". Contrast Outline width / Corner
    // radius, where null already means off and 0 is its display form.
    expect(toGridMinColumnWidthControlValue(null)).toBe(INHERIT_CONTROL_VALUE);
    expect(toGridMinColumnWidthControlValue(320)).toBe("320");
    expect(fromGridMinColumnWidthControlValue("")).toBeNull();
    expect(fromGridMinColumnWidthControlValue("   ")).toBeNull();
    expect(fromGridMinColumnWidthControlValue("0")).toBe(
      GRID_MIN_COLUMN_WIDTH_PX_MIN,
    );
    expect(fromGridMinColumnWidthControlValue("-40")).toBe(
      GRID_MIN_COLUMN_WIDTH_PX_MIN,
    );
  });

  it("clamps to the usability bounds and rounds", () => {
    expect(fromGridMinColumnWidthControlValue("100")).toBe(
      GRID_MIN_COLUMN_WIDTH_PX_MIN,
    );
    expect(fromGridMinColumnWidthControlValue("9000")).toBe(
      GRID_MIN_COLUMN_WIDTH_PX_MAX,
    );
    expect(fromGridMinColumnWidthControlValue("320.4")).toBe(320);
    expect(fromGridMinColumnWidthControlValue("abc")).toBeNull();
  });
});

describe("showsLabelWidthControl (feature 57 Step 10b)", () => {
  it("hides for GRID — free from `=== TWO_COLUMN`, but pinned (feature 85)", () => {
    // A grid item is a full-width block with its value underneath, so there is
    // no label COLUMN to size. This needed no code change when GRID joined
    // ROW_LAYOUTS; the assertion exists so that stays true deliberately rather
    // than by luck.
    expect(
      showsLabelWidthControl({
        ...DEFAULT_STYLING_VALUES,
        rowLayout: "GRID",
      }),
    ).toBe(false);
  });

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
// --- Feature 81 · the two section-header number boxes ------------------------
describe("section-header control converters (feature 81)", () => {
  describe("title size — the blank-box idiom", () => {
    it("round-trips a stored px", () => {
      expect(toHeaderFontSizeControlValue(22)).toBe("22");
      expect(fromHeaderFontSizeControlValue("22")).toBe(22);
    });

    it("shows an empty box for null and reads empty back as null", () => {
      expect(toHeaderFontSizeControlValue(null)).toBe("");
      expect(fromHeaderFontSizeControlValue("")).toBeNull();
      expect(fromHeaderFontSizeControlValue("   ")).toBeNull();
    });

    it("clamps rather than rejecting — Polaris min/max are display only", () => {
      expect(fromHeaderFontSizeControlValue("2")).toBe(FONT_SIZE_PX_MIN);
      expect(fromHeaderFontSizeControlValue("9999")).toBe(FONT_SIZE_PX_MAX);
      expect(fromHeaderFontSizeControlValue("21.6")).toBe(22);
    });

    it("degrades junk to null instead of guessing a size", () => {
      for (const bad of ["abc", "12px", "NaN"]) {
        expect(fromHeaderFontSizeControlValue(bad), bad).toBeNull();
      }
    });
  });

  describe("band padding — where 0 and empty differ", () => {
    it("distinguishes an EMPTY box from a typed 0", () => {
      // The one place in the rail where these two are not the same gesture.
      // Empty = inherit the stylesheet's 0.75rem; 0 = no padding at all. If
      // these ever collapse into one value, a merchant loses the ability to
      // express one of the two states and will not be told which.
      expect(fromHeaderPaddingBlockControlValue("")).toBeNull();
      expect(fromHeaderPaddingBlockControlValue("0")).toBe(0);
      expect(toHeaderPaddingBlockControlValue(null)).toBe("");
      expect(toHeaderPaddingBlockControlValue(0)).toBe("0");
    });

    it("clamps a negative to 0 rather than degrading it to null", () => {
      // Contrast the zero-means-off boxes, where anything at or below zero
      // reads as null. The floor is a REAL value here, so clamping to it is
      // the honest read of "less than none".
      expect(fromHeaderPaddingBlockControlValue("-5")).toBe(
        HEADER_PADDING_BLOCK_PX_MIN,
      );
    });

    it("clamps the ceiling and rounds", () => {
      expect(fromHeaderPaddingBlockControlValue("9999")).toBe(
        HEADER_PADDING_BLOCK_PX_MAX,
      );
      expect(fromHeaderPaddingBlockControlValue("19.6")).toBe(20);
    });
  });

  describe("the two selects", () => {
    it("lead with Inherit and then the domain in domain order", () => {
      expect(HEADER_FONT_WEIGHT_OPTIONS[0].value).toBe(INHERIT_CONTROL_VALUE);
      expect(HEADER_FONT_WEIGHT_OPTIONS.slice(1).map((o) => o.value)).toEqual([
        ...STYLING_FONT_WEIGHTS,
      ]);
      expect(HEADER_CASE_OPTIONS[0].value).toBe(INHERIT_CONTROL_VALUE);
      expect(HEADER_CASE_OPTIONS.slice(1).map((o) => o.value)).toEqual([
        ...LABEL_CASES,
      ]);
    });

    it("never says 'labels' — they are not the Labels-group twins", () => {
      // Same domains, different surfaces. Feature 86 cut the per-option prose on
      // both sides (it only restated the label), so these lists are now
      // IDENTICAL to their twins except for the Inherit gloss — which is exactly
      // why this guard has to stay. The two `Record`s are deliberately not
      // shared: collapse them and this test can no longer fail, because there
      // would be one list rather than two that can drift apart.
      for (const option of [
        ...HEADER_FONT_WEIGHT_OPTIONS,
        ...HEADER_CASE_OPTIONS,
      ]) {
        expect(
          option.helpText?.toLowerCase() ?? "",
          option.label,
        ).not.toContain("label");
      }
    });

    it("differs from its Labels-group twin by the Inherit gloss", () => {
      // The whole of the remaining difference, pinned so a future edit that
      // makes the two glosses agree has to be deliberate. `Keep the standard
      // bold section title.` vs `Use your theme's weight.` is not a wording
      // preference: there IS no theme value behind a section title's weight.
      expect(HEADER_FONT_WEIGHT_OPTIONS[0].helpText).not.toBe(
        FONT_WEIGHT_OPTIONS[0].helpText,
      );
      expect(HEADER_CASE_OPTIONS[0].helpText).not.toBe(
        LABEL_CASE_OPTIONS[0].helpText,
      );
    });

    it("does not promise a THEME value behind Inherit", () => {
      // There is none: the fallback is this app's own literal (700 / none), so
      // the four Typography lists' "Use your theme's …" gloss would be a lie a
      // merchant could catch by switching themes.
      expect(HEADER_FONT_WEIGHT_OPTIONS[0].helpText).not.toContain("theme");
      expect(HEADER_CASE_OPTIONS[0].helpText).not.toContain("theme");
    });
  });
});

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
  {
    // The fifth, inheriting the law by adding this row — which is the whole
    // point of generalising it. Clearing the max width sends the table back to
    // full width, where all three alignments look identical; the merchant's
    // choice has to survive so that re-capping the width restores it.
    name: "showsTableAlignControl",
    predicate: showsTableAlignControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      tableMaxWidthPx: 960,
      tableAlign: "CENTER",
    },
    hide: (styling) => ({ ...styling, tableMaxWidthPx: null }),
    preservedField: "tableAlign",
  },
  {
    // The sixth (feature 80), and the only one gated on TWO knobs (feature 94).
    // A gap is genuinely UNEXPRESSIBLE in a table formatting context — but that
    // is TWO_COLUMN alone, not the flat shape, which is what feature 80
    // assumed. `rowLayout` is pinned explicitly rather than left to the default
    // so this fixture keeps testing what it says even if the default moves.
    name: "showsSectionGapControl",
    predicate: showsSectionGapControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "TWO_COLUMN",
      sectionsCollapsible: true,
      sectionGapPx: 12,
    },
    hide: (styling) => ({ ...styling, sectionsCollapsible: false }),
    preservedField: "sectionGapPx",
  },
  {
    // The seventh (feature 85), warranted where feature 79 declined one: a
    // minimum-track-width box outside Grid is not a knob whose effect is merely
    // invisible, it is a knob with no referent at all.
    name: "showsGridMinColumnWidthControl",
    predicate: showsGridMinColumnWidthControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID",
      gridMinColumnWidthPx: 320,
    },
    hide: (styling) => ({ ...styling, rowLayout: "TWO_COLUMN" }),
    preservedField: "gridMinColumnWidthPx",
  },
  {
    // The eighth (feature 95), and the FIRST over a color — so it is also the
    // first entry in this registry whose control is not a hand-written line of
    // JSX but one row of a `.filter(…).map(…)`. It inherits the law here
    // regardless, which is the point of the law living over PREDICATES rather
    // than over markup.
    name: "showsStripeBackgroundControl",
    predicate: showsStripeBackgroundControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "TWO_COLUMN",
      rowDividerStyle: "STRIPES",
      stripeBgColor: "#f9b8b8",
    },
    hide: (styling) => ({ ...styling, rowDividerStyle: "LINES" }),
    preservedField: "stripeBgColor",
  },
  {
    // The ninth (feature 95), and the one that closes an open question standing
    // since feature 87's sign-off. Note the hiding edit is to `PLAIN` — the
    // member that landed LAST — so this fixture also stands as the check that a
    // newly-added header style inherits "no band" rather than only `TEXT_ONLY`
    // being handled.
    name: "showsHeaderBackgroundControl",
    predicate: showsHeaderBackgroundControl,
    visible: {
      ...DEFAULT_STYLING_VALUES,
      sectionHeaderStyle: "BANDED",
      headerBgColor: "#e6f4ea",
    },
    hide: (styling) => ({ ...styling, sectionHeaderStyle: "PLAIN" }),
    preservedField: "headerBgColor",
  },
];

describe("the hide-rule count (feature 95 took it from seven to nine)", () => {
  it("guards exactly nine controls", () => {
    // The five section-header knobs are visible in EVERY shape — they dress the
    // flat `th` and the collapsible `<summary>` alike — so unlike the section
    // gap none of them earns a predicate. Pinning the count is what turns "we
    // decided not to add one" into something a later change has to confront:
    // an eighth entry here means a new control gained a hide rule, and it must
    // inherit the preserve-on-hide law below rather than reimplement it.
    //
    // 6 -> 7 for feature 85's `showsGridMinColumnWidthControl`; 7 -> 9 for
    // feature 95's two COLOR gates, which also REVERSED written decisions
    // (feature 86 decision 4 kept the stripe swatch always visible, and
    // `headerBgColor` carried its own "a composition fact rather than a reason
    // to hide" comment), so the count moving is the trace of those reversals.
    //
    // Note what did NOT land here: feature 85 hides the Stripes OPTION in Grid
    // mode, and that is deliberately absent. This registry enforces
    // preserve-on-hide over whole CONTROLS — a hidden control cannot lie
    // because it is not rendered. The Row-dividers select stays on screen, so
    // the option filter is a different mechanism with a different failure mode
    // (the orphan value) and carries its own tests instead. Registering it
    // would assert a law it does not obey.
    expect(VISIBILITY_PREDICATES).toHaveLength(9);
    expect(VISIBILITY_PREDICATES.map((entry) => entry.name)).not.toContain(
      "rowDividerOptionsFor",
    );
  });

  it("routes every swatch predicate through COLOR_KNOBS.visibleWhen", () => {
    // The half of the count that is NOT a JSX guard. A predicate exported,
    // documented and registered here but never wired to a knob would pass every
    // assertion in this file while the swatch rendered unconditionally in the
    // rail — the failure mode that has no other detector, since
    // `styleTabContract.test.ts` counts `colorGrid(…)` as one control and
    // cannot see inside it.
    const wired = COLOR_KNOBS.filter((knob) => knob.visibleWhen).map(
      (knob) => knob.visibleWhen,
    );

    expect(wired).toContain(showsStripeBackgroundControl);
    expect(wired).toContain(showsHeaderBackgroundControl);
    expect(wired).toHaveLength(2);
  });

  it("gates exactly the two colors whose var has ONE live rule", () => {
    // The bar, asserted rather than left in prose, because "this control looks
    // useless right now" is a much lower bar than the one actually used and the
    // next swatch to be proposed for hiding will be argued on it.
    //
    // 🚫 `borderColor` is the standing counter-example and the reason this is a
    // list and not a count: it is a no-op under Row dividers = None too, and it
    // must NEVER join — it also dresses the column divider, the feature-80
    // section separator, and the outline whenever `outerBorderColor` is unset.
    expect(
      COLOR_KNOBS.filter((knob) => knob.visibleWhen).map((k) => k.field),
    ).toEqual(["headerBgColor", "stripeBgColor"]);
  });
});

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

describe("showsSectionGapControl — the OR (feature 94)", () => {
  // The registry above walks ONE hiding edit per predicate, which is all the
  // preserve-on-hide law needs. This predicate reads two knobs, so the
  // interesting cases are the combinations, and one of them is the whole
  // feature: a flat table in a block layout, with collapsing OFF.
  const at = (
    rowLayout: StylingValues["rowLayout"],
    sectionsCollapsible: boolean,
  ): StylingValues => ({
    ...DEFAULT_STYLING_VALUES,
    rowLayout,
    sectionsCollapsible,
  });

  it.each([
    // The feature. Both would fail against feature 80's `sectionsCollapsible`.
    ["STACKED", false, true],
    ["GRID", false, true],
    // Unchanged by feature 94 — the collapsible shape has a <details> per
    // section at ANY row layout, so this is the OR's left side carrying it.
    ["TWO_COLUMN", true, true],
    ["STACKED", true, true],
    ["GRID", true, true],
    // The one excluded state: a table formatting context with no disclosures.
    // A `!== "TWO_COLUMN"`-only predicate would fail HERE, which is what makes
    // this an OR rather than a replacement.
    ["TWO_COLUMN", false, false],
  ] as const)(
    "%s with collapsing %s → %s",
    (rowLayout, sectionsCollapsible, shown) => {
      expect(showsSectionGapControl(at(rowLayout, sectionsCollapsible))).toBe(
        shown,
      );
    },
  );

  it("excludes exactly one of the row layouts, and it is TWO_COLUMN", () => {
    // Derived from ROW_LAYOUTS rather than hand-listed, so a fourth member
    // added later has to confront this: the predicate says `!== "TWO_COLUMN"`
    // precisely so a new (necessarily block-ish) layout inherits the gap, and
    // if that is ever wrong this is where it surfaces.
    const excluded = ROW_LAYOUTS.filter(
      (rowLayout) => !showsSectionGapControl(at(rowLayout, false)),
    );
    expect(excluded).toEqual(["TWO_COLUMN"]);
  });

  it("survives the round trip through the newly-hiding edit", () => {
    // The preserve-on-hide law against feature 94's OWN hiding edit — the
    // registry above only walks the collapsible one. Switching to Two-column
    // must not clear the px value the merchant typed in Grid.
    const inGrid = Object.freeze({
      ...DEFAULT_STYLING_VALUES,
      rowLayout: "GRID" as const,
      sectionGapPx: 30,
    });
    expect(showsSectionGapControl(inGrid)).toBe(true);

    const inTwoColumn = { ...inGrid, rowLayout: "TWO_COLUMN" as const };
    expect(showsSectionGapControl(inTwoColumn)).toBe(false);
    expect(inTwoColumn.sectionGapPx).toBe(30);
    expect(inGrid.sectionGapPx).toBe(30);
  });
});

describe("showsHeaderBackgroundControl — derived from the members (feature 95)", () => {
  const at = (
    sectionHeaderStyle: StylingValues["sectionHeaderStyle"],
  ): StylingValues => ({ ...DEFAULT_STYLING_VALUES, sectionHeaderStyle });

  it("shows for exactly one header style, and it is BANDED", () => {
    // Derived from SECTION_HEADER_STYLES rather than hand-listed, which is the
    // assertion feature 87 would have wanted: a FOURTH member added later
    // defaults to hiding the swatch, and if that member paints a band it has to
    // come here and say so. Hand-listing `TEXT_ONLY` and `PLAIN` would let a new
    // member silently inherit whichever answer the author happened to write.
    const shown = SECTION_HEADER_STYLES.filter((style) =>
      showsHeaderBackgroundControl(at(style)),
    );
    expect(shown).toEqual(["BANDED"]);
  });

  it("is the DEFAULT state, so the swatch does not vanish unprompted", () => {
    // Why this hide is gentler than the stripe's. `BANDED` is
    // SECTION_HEADER_STYLES[0] and therefore the default, so a merchant sees
    // the swatch on an untouched template and only loses it by actively
    // choosing Underlined or Plain — the "I wanted to set the colour first"
    // objection needs an order of work nobody arrives in. Pinned because the
    // argument for the hide rests on it.
    expect(DEFAULT_STYLING_VALUES.sectionHeaderStyle).toBe("BANDED");
    expect(showsHeaderBackgroundControl(DEFAULT_STYLING_VALUES)).toBe(true);
  });

  it("ignores collapsing, because both shapes carry the same member rules", () => {
    // Feature 87's composition hazard, inverted into a guarantee. A member that
    // styled only the flat `th` would hand the band back the moment collapsing
    // was enabled, and the fix was to mirror every member rule onto the
    // `<summary>`. That mirroring is precisely what lets ONE predicate cover
    // both shapes — so if a future member is ever added to one shape only, this
    // is the assertion that should stop reading as obvious.
    for (const style of SECTION_HEADER_STYLES) {
      const flat = { ...at(style), sectionsCollapsible: false };
      const collapsible = { ...at(style), sectionsCollapsible: true };
      expect(showsHeaderBackgroundControl(flat), style).toBe(
        showsHeaderBackgroundControl(collapsible),
      );
    }
  });

  it("leaves Title color alone — it is not gated at all", () => {
    // The other half of the Section headers grid, and the thing that keeps the
    // group from ever painting an empty `<s-grid>`. `color:` on the base rule is
    // never overridden by a member, so a section title is coloured under all
    // three — the asymmetry inside this pair is a fact about the stylesheet.
    const titleColor = COLOR_KNOBS.find(
      (knob) => knob.field === "headerTextColor",
    );
    expect(titleColor?.group).toBe("sectionHeaders");
    expect(titleColor?.visibleWhen).toBeUndefined();
  });
});

describe("showsStripeBackgroundControl — the AND (feature 95)", () => {
  // The second two-knob predicate, and the interesting cases are again the
  // combinations rather than the single hiding edit the registry walks. The
  // one that matters is the ORPHAN: Grid + Stripes is unreachable from the
  // select (`rowDividerOptionsFor` drops the option) but reachable from stored
  // data, and the fill is `transparent` there — so the swatch must stay hidden
  // in the one state the rail is simultaneously labelling "not available".
  const at = (
    rowLayout: StylingValues["rowLayout"],
    rowDividerStyle: StylingValues["rowDividerStyle"],
  ): StylingValues => ({
    ...DEFAULT_STYLING_VALUES,
    rowLayout,
    rowDividerStyle,
  });

  it.each([
    // The only two states that paint a stripe.
    ["TWO_COLUMN", "STRIPES", true],
    ["STACKED", "STRIPES", true],
    // 🔴 The orphan. A naive `=== "STRIPES"` predicate would show the swatch
    // here, for a fill `spec-table.css` stands down to transparent in Grid.
    ["GRID", "STRIPES", false],
    // No stripe, no swatch — at any layout.
    ["TWO_COLUMN", "LINES", false],
    ["TWO_COLUMN", "NONE", false],
    ["STACKED", "LINES", false],
    ["GRID", "NONE", false],
  ] as const)("%s with dividers %s → %s", (rowLayout, dividers, shown) => {
    expect(showsStripeBackgroundControl(at(rowLayout, dividers))).toBe(shown);
  });

  it("shows for exactly one of the divider styles, and it is STRIPES", () => {
    // Derived from ROW_DIVIDER_STYLES rather than hand-listed: a fourth member
    // added later (a dotted rule, say) defaults to NOT showing the stripe
    // swatch, which is right — only STRIPES reads `--appx-spec-stripe-bg`.
    const shown = ROW_DIVIDER_STYLES.filter((style) =>
      showsStripeBackgroundControl(at("TWO_COLUMN", style)),
    );
    expect(shown).toEqual(["STRIPES"]);
  });

  it("agrees with the Row-dividers option list about Grid", () => {
    // The two mechanisms have to tell one story. Wherever the select refuses to
    // OFFER Stripes, the swatch must refuse to appear — otherwise the rail says
    // "not available in Grid" directly above a control for the thing it just
    // said is unavailable. Derived from `rowDividerOptionsFor` so the pair
    // cannot drift apart.
    const inGrid = at("GRID", "STRIPES");
    const offered = rowDividerOptionsFor(inGrid).filter(
      (option) =>
        option.value === "STRIPES" &&
        !option.helpText?.includes("do not apply"),
    );

    expect(offered).toEqual([]);
    expect(showsStripeBackgroundControl(inGrid)).toBe(false);
  });

  it("keeps the merchant's hex through Stripes → Lines → Stripes", () => {
    // Preserve-on-hide against feature 95's own edit, on a FROZEN input: a
    // merchant who tries Lines and comes back must find their color, not an
    // empty swatch that silently reset the table to the default grey.
    const striped = Object.freeze({
      ...DEFAULT_STYLING_VALUES,
      rowDividerStyle: "STRIPES" as const,
      stripeBgColor: "#f9b8b8",
    });
    expect(showsStripeBackgroundControl(striped)).toBe(true);

    const lined = { ...striped, rowDividerStyle: "LINES" as const };
    expect(showsStripeBackgroundControl(lined)).toBe(false);
    expect(lined.stripeBgColor).toBe("#f9b8b8");

    const back = { ...lined, rowDividerStyle: "STRIPES" as const };
    expect(showsStripeBackgroundControl(back)).toBe(true);
    expect(back.stripeBgColor).toBe("#f9b8b8");
  });
});
