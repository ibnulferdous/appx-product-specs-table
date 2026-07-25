// Feature 57 · Step 3 — the name-agreement contract between the Step 2
// presentation vocabulary (TypeScript) and the storefront stylesheet (CSS).
//
// CSS cannot import TypeScript, so this test is what pins the two together:
// every custom property in SPEC_TABLE_CSS_VARS and every modifier class
// `stylingToModifierClasses` can produce must appear in the REAL extension
// file — except the two documented Step 3 exemptions, which are asserted as
// KNOWN-absent so the exemption list shrinks deliberately (Step 9 adds the
// collapsible rules) instead of being forgotten.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  COLUMN_DIVIDER_STYLES,
  DEFAULT_STYLING_VALUES,
  DENSITIES,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTION_HEADER_STYLES,
  TABLE_ALIGNMENTS,
} from "../../utils/tableStyling";
import type { StylingValues } from "../../utils/tableStyling";
import {
  SPEC_TABLE_CSS_VARS,
  stylingToModifierClasses,
} from "../../utils/tableStylingCss";

const css = readFileSync(
  fileURLToPath(
    new URL(
      "../../../extensions/product-specs-table/assets/spec-table.css",
      import.meta.url,
    ),
  ),
  "utf8",
);

function variant(overrides: Partial<StylingValues>): StylingValues {
  return { ...DEFAULT_STYLING_VALUES, ...overrides };
}

// Every class the Step 2 mapping can ever emit: one variant per member of
// every knob's allowed-value array, plus the collapsible presence flag.
const producibleClasses = new Set<string>();
for (const values of [
  ...ROW_LAYOUTS.map((rowLayout) => variant({ rowLayout })),
  ...MOBILE_LAYOUTS.map((mobileLayout) => variant({ mobileLayout })),
  ...SECTION_HEADER_STYLES.map((sectionHeaderStyle) =>
    variant({ sectionHeaderStyle }),
  ),
  ...ROW_DIVIDER_STYLES.map((rowDividerStyle) => variant({ rowDividerStyle })),
  ...COLUMN_DIVIDER_STYLES.map((columnDividerStyle) =>
    variant({ columnDividerStyle }),
  ),
  ...DENSITIES.map((density) => variant({ density })),
  ...TABLE_ALIGNMENTS.map((tableAlign) => variant({ tableAlign })),
  variant({ sectionsCollapsible: true }),
  // The two container presence flags. Any non-null value produces the flag, so
  // the specific numbers are irrelevant here — only that the flag is emitted.
  variant({ outerBorderWidthPx: 1 }),
  variant({ outerBorderRadiusPx: 1 }),
]) {
  for (const cls of stylingToModifierClasses(values)) {
    producibleClasses.add(cls);
  }
}

// The remaining Step 3 exemption (locked in the feature doc):
// - mobile-same-as-desktop is DELIBERATELY rule-less — "same as desktop"
//   means no mobile override exists, so the stylesheet never mentions it.
//
// `appx-spec-table--collapsible` LEFT this list in Step 9a, exactly as Step 3
// intended: its <details> markup now exists, so its rules are asserted like
// every other knob's rather than going unchecked.
const KNOWN_ABSENT_SELECTORS = ["appx-spec-table--mobile-same-as-desktop"];

describe("spec-table.css ↔ styling vocabulary contract (feature 57 Step 3)", () => {
  it("contains every custom property in SPEC_TABLE_CSS_VARS", () => {
    for (const varName of Object.values(SPEC_TABLE_CSS_VARS)) {
      expect(css).toContain(varName);
    }
  });

  it("covers the full producible class list (sanity: the loop above found every knob)", () => {
    // 2 layouts + 2 mobile + 2 section styles + 3 row dividers + 2 column
    // dividers + 3 densities + 3 alignments + the collapsible flag + the two
    // container presence flags (--outer-border, --outer-radius). If a knob
    // gains a member, this count and the selector assertions below both move
    // together.
    expect(producibleClasses.size).toBe(20);
  });

  // --- Column divider (feature 79) -------------------------------------------
  //
  // The class-presence assertions above prove both members have a selector.
  // These three pin the parts a selector check cannot see, and each guards a
  // failure that would be INVISIBLE in the editor: the previews and the
  // storefront share this file, so a break here ships to both at once and looks
  // like a design choice rather than a bug.
  describe("column divider", () => {
    it("draws a 1px rule from the shared border color, with no knob of its own", () => {
      // The merchant decision (2026-07-26) was a fixed hairline that always
      // matches the row rules — no width knob, no dedicated swatch. Pinning the
      // literal is what stops that being quietly parameterised later.
      expect(css).toContain(
        ".appx-spec-table--column-divider-line .appx-spec-table__label {\n" +
          "  border-inline-end: 1px solid var(--appx-spec-border-color, rgba(0, 0, 0, 0.1));\n" +
          "}",
      );
    });

    // Each stacked label selector appears TWICE: once inside the grouped
    // `display: block` selector list (followed by a comma) and once as its own
    // rule (followed by ` {`). Anchoring on the brace is what picks the second
    // — matching the bare selector would silently measure the wrong block.
    const STACKED_LABEL_RULES = [
      ".appx-spec-table--layout-stacked .appx-spec-table__label {",
      ".appx-spec-table--mobile-stacked .appx-spec-table__label {",
    ];

    it("is dropped in BOTH stacked shapes — a block label has no label/value seam", () => {
      // Desktop stacked, and two-column-on-desktop/stacked-on-mobile. Miss
      // either and the rule paints as a stray vertical stub down the right edge.
      for (const rule of STACKED_LABEL_RULES) {
        const start = css.indexOf(rule);
        expect(start, `missing rule for ${rule}`).toBeGreaterThan(-1);
        const block = css.slice(start, css.indexOf("}", start));
        expect(block, `${rule} must drop the column rule`).toContain(
          "border-inline-end: none",
        );
      }
    });

    it("declares the ON rule BEFORE both stacked rules that undo it", () => {
      // Every one of these selectors is two classes, so specificity is a TIE
      // and source order is the only thing deciding the winner. Reorder the
      // file and the stacked layouts silently regain the stub — with no
      // importance override anywhere to make the dependency obvious.
      const on = css.indexOf(".appx-spec-table--column-divider-line");
      expect(on).toBeGreaterThan(-1);
      for (const rule of STACKED_LABEL_RULES) {
        expect(css.indexOf(rule), `${rule} must follow`).toBeGreaterThan(on);
      }
    });
  });

  it("has a selector for every producible modifier class except the documented exemptions", () => {
    for (const cls of producibleClasses) {
      if (KNOWN_ABSENT_SELECTORS.includes(cls)) continue;
      expect(css, `missing selector for .${cls}`).toContain(`.${cls}`);
    }
  });

  it("keeps the exempt classes producible but selector-free (the list must shrink consciously)", () => {
    for (const cls of KNOWN_ABSENT_SELECTORS) {
      // Still emitted by Step 2 — the exemption is about the CSS only.
      expect(producibleClasses.has(cls), `${cls} is no longer producible`).toBe(
        true,
      );
      // Absent as a SELECTOR. Comments mention these names without the
      // leading dot precisely so this assertion stays meaningful.
      expect(css).not.toContain(`.${cls}`);
    }
  });

  it("contains no !important (equal-specificity modifiers are the design)", () => {
    expect(css).not.toContain("!important");
  });
});
