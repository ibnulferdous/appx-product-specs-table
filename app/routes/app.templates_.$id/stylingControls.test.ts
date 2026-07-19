import { describe, expect, it } from "vitest";
import { ROW_DIVIDER_OPTIONS } from "./stylingControls";
import {
  DEFAULT_STYLING_VALUES,
  ROW_DIVIDER_STYLES,
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
