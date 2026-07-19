import { describe, expect, it } from "vitest";
import {
  DENSITY_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  ROW_DIVIDER_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  showsMobileLayoutControl,
  showsSectionsInitialStateControl,
  type StylingOption,
} from "./stylingControls";
import {
  DEFAULT_STYLING_VALUES,
  DENSITIES,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTIONS_INITIAL_STATES,
  SECTION_HEADER_STYLES,
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
