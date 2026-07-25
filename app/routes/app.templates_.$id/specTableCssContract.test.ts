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
  // The three presence flags. Any non-null value produces the flag, so the
  // specific numbers are irrelevant here — only that the flag is emitted.
  variant({ sectionGapPx: 1 }),
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
    // dividers + 3 densities + 3 alignments + the collapsible flag + the three
    // presence flags (--section-gap, --outer-border, --outer-radius). If a knob
    // gains a member, this count and the selector assertions below both move
    // together.
    expect(producibleClasses.size).toBe(21);
  });

  // --- Section separation + gap (feature 80) ---------------------------------
  //
  // Both rules are INVISIBLE when broken: the previews and the storefront share
  // this file, so a break ships to both at once and reads as a design choice.
  // The class-presence assertion above only proves `--section-gap` appears
  // somewhere; these pin what each rule actually says.
  describe("section separation", () => {
    const SEPARATOR_SELECTOR =
      ".appx-spec-table--collapsible.appx-spec-table--section-banded:not(\n" +
      "    .appx-spec-table--section-gap\n" +
      "  )\n" +
      "  .appx-spec-table__section-group:not([open])\n" +
      "  + .appx-spec-table__section-group\n" +
      "  > .appx-spec-table__section-summary {";

    it("draws a hairline from the shared border color between two closed bands", () => {
      // Same swatch as the row rules and the column divider, so the separator
      // matches them by construction rather than by a second color knob.
      const start = css.indexOf(SEPARATOR_SELECTOR);
      expect(start, "the feature 80 separator rule is missing").toBeGreaterThan(
        -1,
      );
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain(
        "border-block-start: 1px solid\n" +
          "    var(--appx-spec-border-color, rgba(0, 0, 0, 0.1));",
      );
    });

    it("claims border-block-START, the side the banded rule does not own", () => {
      // The banded summary rule sets `border-block-end: none` on this very
      // element. Opposite sides means the two never contest a property — no
      // specificity tie, no source-order dependency, no importance override.
      // Flip this to -end and the separator becomes a fight it loses silently.
      const start = css.indexOf(SEPARATOR_SELECTOR);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).not.toContain("border-block-end");
    });

    it("only fires when the PRECEDING section is closed (the no-repaint scope)", () => {
      // ALL_OPEN is the default initial state. Drop `:not([open])` and every
      // collapsible banded table already on a storefront gains a second
      // hairline above every band — a repaint nobody asked for.
      expect(css).toContain(
        ".appx-spec-table__section-group:not([open])\n" +
          "  + .appx-spec-table__section-group",
      );
    });

    it("stands down when a gap is set", () => {
      // With whitespace between the bands the hairline is a stray line across
      // the top of every band but the first. This is the ONLY reason the
      // --section-gap presence flag exists.
      expect(SEPARATOR_SELECTOR).toContain(
        ":not(\n    .appx-spec-table--section-gap\n  )",
      );
    });
  });

  describe("section gap", () => {
    const GAP_RULE =
      ".appx-spec-table--section-gap\n" +
      "  .appx-spec-table__section-group:not(:first-child) {";

    it("spaces every section but the first, from the presence-flagged var", () => {
      const start = css.indexOf(GAP_RULE);
      expect(start, "the feature 80 gap rule is missing").toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain(
        "margin-block-start: var(--appx-spec-section-gap, 0);",
      );
    });

    it("is gated on the presence class, never declared for every table", () => {
      // An unconditional `margin-block-start: var(--…, 0)` would beat a theme's
      // own element-level `details` margin from a two-class selector, silently
      // restyling tables whose merchant never touched this knob. So the whole
      // file may declare this property EXACTLY ONCE, inside the flagged rule.
      // (Anchored on the declaration form — two-space indent plus colon — so
      // the prose above the rule is not mistaken for a second one.)
      const declarations = css.match(/\n {2}margin-block-start:/g) ?? [];
      expect(declarations).toHaveLength(1);
      const start = css.indexOf(GAP_RULE);
      const declaredAt = css.indexOf("\n  margin-block-start:");
      expect(declaredAt).toBeGreaterThan(start);
      expect(declaredAt).toBeLessThan(css.indexOf("}", start));
    });

    it("uses :not(:first-child), not the adjacent-sibling combinator", () => {
      // Rows before the first section header render in a leading bare table,
      // and `details + details` would skip that one boundary while still
      // never adding a leading gap. This form covers both.
      expect(css).toContain(
        ".appx-spec-table__section-group:not(:first-child)",
      );
    });
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
