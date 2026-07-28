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
    // 3 layouts + 2 mobile + 3 section styles + 3 row dividers + 2 column
    // dividers + 3 densities + 3 alignments + the collapsible flag + the three
    // presence flags (--section-gap, --outer-border, --outer-radius). If a knob
    // gains a member, this count and the selector assertions below both move
    // together. 21 -> 22 when GRID joined the row layouts (feature 85); note it
    // added NO fourth presence flag — the --layout-grid class is its own gate.
    // 22 -> 23 when PLAIN joined the section header styles (feature 87), which
    // likewise needed no flag: it is a modifier class like its two siblings.
    expect(producibleClasses.size).toBe(23);
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
    // ONE knob, TWO rules, because the two markup shapes have nothing in
    // common to hang a margin on: the collapsible shape has a <details> per
    // section, the flat shape has a <tr>. Feature 80 shipped the first;
    // feature 94 shipped the second once it was established that a flat
    // section header only refuses margin under TWO_COLUMN.
    const GAP_RULE_COLLAPSIBLE =
      ".appx-spec-table--section-gap\n" +
      "  .appx-spec-table__section-group:not(:first-child) {";

    const GAP_RULE_FLAT =
      ".appx-spec-table--section-gap.appx-spec-table--layout-stacked\n" +
      "  .appx-spec-table__section-row:not(:first-child),\n" +
      ".appx-spec-table--section-gap.appx-spec-table--layout-grid\n" +
      "  .appx-spec-table__section-row:not(:first-child) {";

    it.each([
      ["collapsible", GAP_RULE_COLLAPSIBLE],
      ["flat", GAP_RULE_FLAT],
    ])(
      "%s shape: spaces every section but the first, from the presence-flagged var",
      (_shape, rule) => {
        const start = css.indexOf(rule);
        expect(start, "the gap rule is missing").toBeGreaterThan(-1);
        const block = css.slice(start, css.indexOf("}", start));
        expect(block).toContain(
          "margin-block-start: var(--appx-spec-section-gap, 0);",
        );
      },
    );

    it("is gated on the presence class, never declared for every table", () => {
      // An unconditional `margin-block-start: var(--…, 0)` would beat a theme's
      // own element-level margin from a two-class selector, silently restyling
      // tables whose merchant never touched this knob.
      //
      // ⚠️ Feature 80 pinned this by COUNTING — the file could declare the
      // property exactly once. Feature 94 needed a second declaration, and a
      // count of 2 would be an arithmetic accident rather than the invariant.
      // So the check now states the actual law: wherever this property is
      // declared, the rule declaring it is gated on the presence class. That
      // is scale-free — a third shape inherits the guard for free, and it
      // catches the failure the count was really aiming at (an ungated
      // declaration) even when the total happens to be right.
      const declarations = [...css.matchAll(/\n {2}margin-block-start:/g)];
      expect(declarations.length).toBeGreaterThan(0);

      for (const match of declarations) {
        const at = match.index;
        // The selector of the block this declaration sits in: from whatever
        // closed the previous rule (or its comment) to the brace that opens
        // this one.
        const braceAt = css.lastIndexOf("{", at);
        const selector = css.slice(
          Math.max(
            css.lastIndexOf("}", braceAt),
            css.lastIndexOf("*/", braceAt),
          ) + 1,
          braceAt,
        );
        expect(
          selector,
          `an ungated margin-block-start in: ${selector.trim()}`,
        ).toContain("appx-spec-table--section-gap");
      }
    });

    it("the flat rule names both block layouts and never two-column", () => {
      // The layout modifier is what makes the flat rule honest. Without it the
      // selector would read as though it worked everywhere and quietly do
      // nothing under TWO_COLUMN, where the section row is a table-row and
      // margin does not apply to internal table boxes. Naming two-column here
      // would be worse than useless: a rule that cannot fire.
      expect(GAP_RULE_FLAT).toContain("appx-spec-table--layout-stacked");
      expect(GAP_RULE_FLAT).toContain("appx-spec-table--layout-grid");
      expect(css).toContain(GAP_RULE_FLAT);

      const start = css.indexOf(GAP_RULE_FLAT);
      const selector = css.slice(start, css.indexOf("{", start));
      expect(selector).not.toContain("layout-two-column");
    });

    it("both shapes use :not(:first-child), not adjacent-sibling", () => {
      // Rows before the first section header render ahead of the first
      // section, and an adjacent-sibling form would skip that one boundary
      // while still never adding a leading gap. This form covers both.
      //
      // Under STACKED it does a second job: the tbody is a block there, so a
      // first-child top margin would collapse out THROUGH it and push the
      // whole table down rather than separate anything.
      expect(css).toContain(
        ".appx-spec-table__section-group:not(:first-child)",
      );
      expect(css).toContain(".appx-spec-table__section-row:not(:first-child)");
    });
  });

  // --- Section header typography + spacing (feature 81) ----------------------
  //
  // Five nullable knobs that must land on BOTH section-header shapes — the flat
  // `th[colspan=2]` and the collapsible `<summary>` — because a merchant
  // toggling Collapsible must not see the band restyle itself. Two separate
  // rule blocks, so nothing but a test keeps them in agreement.
  describe("section header typography", () => {
    // Every fallback is the literal that shipped BEFORE this feature. Pinning
    // the fallbacks (not merely the var names) is what pins the no-repaint
    // claim: change one and every untouched table in the wild moves.
    const HEADER_DECLARATIONS = [
      "padding-block: var(--appx-spec-header-padding-block, 0.75rem);",
      "padding-inline: 0.75rem;",
      "font-size: var(--appx-spec-header-font-size, inherit);",
      "font-weight: var(--appx-spec-header-font-weight, 700);",
      "text-transform: var(--appx-spec-header-transform, none);",
      "color: var(--appx-spec-header-color, inherit);",
    ];

    // Anchored on `selector + " {"` — several of these selectors also appear
    // inside grouped lists further down the file (the trap features 79 and 80
    // both recorded).
    const SHAPES = {
      flat: ".appx-spec-table__section {",
      collapsible:
        ".appx-spec-table--collapsible .appx-spec-table__section-summary {",
    };

    for (const [shape, selector] of Object.entries(SHAPES)) {
      it(`carries all five knobs on the ${shape} shape, with the pre-feature literals as fallbacks`, () => {
        const start = css.indexOf(selector);
        expect(
          start,
          `the ${shape} section-header rule is missing`,
        ).toBeGreaterThan(-1);
        const block = css.slice(start, css.indexOf("}", start));
        for (const declaration of HEADER_DECLARATIONS) {
          expect(block, `${shape} is missing: ${declaration}`).toContain(
            declaration,
          );
        }
      });
    }

    it("keeps the inline padding a literal in both shapes", () => {
      // The knob is BLOCK-only on purpose: the section title and the label
      // column share one text edge at 0.75rem, and a four-side knob would break
      // that alignment the moment it was used. Two shapes, so exactly two
      // declarations of the literal.
      const declarations = css.match(/\n {2}padding-inline: 0\.75rem;/g) ?? [];
      expect(declarations).toHaveLength(2);
    });

    it("never puts a var inside a padding SHORTHAND", () => {
      // A shorthand containing a var is invalid-at-computed-value-time if that
      // var is ever malformed, and IACVT drops the WHOLE shorthand to its
      // initial value — zero padding on all four sides, not just one axis.
      // Longhands make that failure mode impossible rather than unlikely.
      expect(css).not.toMatch(/\n {2}padding: [^;]*var\(/);
    });

    it("emits no modifier class for any of the five", () => {
      // The whole feature rides the Step 2 rule "nullable -> custom property",
      // so `stylingToModifierClasses` must be blind to it. If this fails,
      // something reached for a presence flag and the design drifted.
      const withAll = variant({
        headerTextColor: "#123456",
        headerFontSizePx: 22,
        headerFontWeight: "BOLD",
        headerCase: "UPPERCASE",
        headerPaddingBlockPx: 0,
      });
      expect(stylingToModifierClasses(withAll)).toEqual(
        stylingToModifierClasses(DEFAULT_STYLING_VALUES),
      );
    });
  });

  // --- Section header style members (feature 87) -----------------------------
  //
  // The class-presence assertions above prove each member has a selector
  // SOMEWHERE. These pin what each one actually declares, which is the failure
  // feature 87 was reported for: TEXT_ONLY was labelled "text only" while still
  // painting a 2px rule, so no setting produced a bare bold title — visible only
  // by looking at a rendered table, since nothing here disagreed.
  describe("section header style members", () => {
    // Selectors wrap across lines once prettier passes 80 columns, and all three
    // collapsible ones do. Anchor on the CLASS and walk forward to the brace
    // rather than matching a formatted selector verbatim, so reformatting the
    // stylesheet cannot break these. Requiring `__section {` (with the space)
    // is what keeps the flat lookup from matching `__section-summary`.
    function declarationsFor(cls: string, element: string): string {
      const match = css.match(
        new RegExp(
          `\\.${cls}[^{}]*\\.appx-spec-table__${element} \\{([^}]*)\\}`,
        ),
      );
      return match?.[1] ?? "";
    }

    // Derived from the domain, never hand-listed: a fourth member added later
    // must satisfy every assertion below or fail here. `--section-gap` cannot
    // be caught by the prefix filter because its presence flag needs a non-null
    // sectionGapPx, and these variants leave it at the default null.
    const MEMBERS = SECTION_HEADER_STYLES.map((sectionHeaderStyle) => {
      const cls = stylingToModifierClasses(
        variant({ sectionHeaderStyle }),
      ).find((candidate) => candidate.startsWith("appx-spec-table--section-"));
      return { sectionHeaderStyle, cls: cls ?? "" };
    });

    const SHAPES = [
      { shape: "flat", element: "section" },
      { shape: "collapsible", element: "section-summary" },
    ];

    for (const { sectionHeaderStyle, cls } of MEMBERS) {
      for (const { shape, element } of SHAPES) {
        it(`${sectionHeaderStyle} owns BOTH the band and the rule on the ${shape} shape`, () => {
          // The invariant that makes the three members distinguishable: each one
          // states its own `background` AND its own `border-block-end`, so which
          // look a merchant gets is never left to whatever the base rule happens
          // to say. A member declaring only one of the two silently inherits the
          // other — which is how "text only" ended up underlined.
          const block = declarationsFor(cls, element);
          expect(block, `${cls} has no ${shape} rule`).not.toBe("");
          expect(
            block,
            `${cls} (${shape}) does not set its background`,
          ).toMatch(/\n {2}background:/);
          expect(block, `${cls} (${shape}) does not set its rule`).toMatch(
            /\n {2}border-block-end:/,
          );
        });
      }
    }

    for (const { shape, element } of SHAPES) {
      it(`PLAIN paints neither a band nor a rule on the ${shape} shape`, () => {
        // The whole feature in two declarations. `none`, not a transparent or
        // zero-width border: those still occupy the box and would leave the
        // title sitting on an invisible 2px gap.
        const block = declarationsFor(
          "appx-spec-table--section-plain",
          element,
        );
        expect(block).toContain("background: transparent;");
        expect(block).toContain("border-block-end: none;");
      });
    }

    for (const { shape, element } of SHAPES) {
      it(`TEXT_ONLY reads the underline color THROUGH borderColor on the ${shape} shape (feature 96)`, () => {
        // 🔴 THE ZERO-REPAINT CLAIM, and it lives in the INNER fallback. Before
        // feature 96 this rule read `var(--appx-spec-border-color,
        // currentColor)` outright, so every underlined table on every live
        // storefront is currently painted by the Divider color swatch. Nesting
        // the new var OUTSIDE the old chain is what keeps that true for a
        // template that never sets the knob: the new var is emitted only when a
        // merchant sets it, so an untouched table never reaches the new link.
        //
        // Drop the inner `var(...)` and this fails — which is the mutation that
        // matters, because a flat `var(--appx-spec-header-underline-color,
        // currentColor)` would typecheck, pass every other test in the suite,
        // and silently restyle every existing underlined table to the theme's
        // text colour.
        const block = declarationsFor(
          "appx-spec-table--section-text-only",
          element,
        );
        expect(block).toContain("--appx-spec-header-underline-color");
        expect(block).toContain("var(--appx-spec-border-color, currentColor)");
      });
    }

    it("gives the underline color to TEXT_ONLY and to no other member", () => {
      // Derived over the domain, like the band assertion above. BANDED and
      // PLAIN both state `border-block-end: none`, so there is no rule for the
      // var to reach — which is exactly the fact the rail's hide predicate
      // rests on. If a future member starts painting a rule, this fails and
      // forces the question of whether the swatch should show for it too.
      for (const { sectionHeaderStyle, cls } of MEMBERS) {
        for (const { shape, element } of SHAPES) {
          const block = declarationsFor(cls, element);
          const reads = block.includes("--appx-spec-header-underline-color");
          expect(reads, `${cls} (${shape})`).toBe(
            sectionHeaderStyle === "TEXT_ONLY",
          );
        }
      }
    });

    it("leaves the feature-80 separator scoped to BANDED alone", () => {
      // Deliberate, not an oversight: that hairline exists because BANDED drops
      // an edge it would otherwise have, so two closed bands merge into one
      // slab. A plain title has no fill to merge with, and the absent edge IS
      // the member. Merchants wanting the sections held apart set the gap.
      const start = css.indexOf(".appx-spec-table__section-group:not([open])");
      const rule = css.slice(css.lastIndexOf("\n.", start), start);
      expect(rule).toContain("appx-spec-table--section-banded");
      expect(rule).not.toContain("appx-spec-table--section-plain");
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

  // --- Multi-column row flow (feature 85) ------------------------------------
  //
  // Every assertion here guards something INVISIBLE when broken. The previews
  // and the storefront share this file, so a break ships to both at once, and a
  // checkerboard or a missing span reads as a deliberate design rather than a
  // bug.
  describe("row layout: GRID", () => {
    const GRID_TBODY_RULE =
      ".appx-spec-table--layout-grid .appx-spec-table__table tbody {";
    const STRIPE_STANDDOWN_SELECTOR =
      ".appx-spec-table--layout-grid.appx-spec-table--dividers-stripes\n" +
      "  .appx-spec-table__row:nth-child(even)\n" +
      "  .appx-spec-table__label,";

    it("flows the tbody with auto-fit + minmax off the 240px literal fallback", () => {
      // The fallback IS the null vocabulary: a merchant who never touches the
      // box gets 240px from here, not from any code path. Pinning the literal
      // pins the default, so moving it becomes a deliberate repaint.
      const start = css.indexOf(GRID_TBODY_RULE);
      expect(
        start,
        "the feature 85 grid tbody rule is missing",
      ).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain("display: grid;");
      expect(block).toContain(
        "grid-template-columns: repeat(\n" +
          "    auto-fit,\n" +
          "    minmax(min(var(--appx-spec-grid-min-column, 240px), 100%), 1fr)\n" +
          "  );",
      );
    });

    it("clamps the minimum with min(…, 100%) so a track can never overflow", () => {
      // Found in the harness, not on paper: a bare minmax(400px, 1fr) in a
      // 375px container lays a 400px track and pushes the page sideways —
      // measured at 25px of overflow for a 400px minimum and 265px for a 640px
      // one, both reachable from the rail's own range. min() costs nothing when
      // the px value fits, and makes horizontal overflow unreachable rather
      // than merely unlikely.
      const start = css.indexOf(GRID_TBODY_RULE);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain(
        "min(var(--appx-spec-grid-min-column, 240px), 100%)",
      );
    });

    it("keeps tbody out of the display: block list — one rule owns it", () => {
      // Contrast the stacked rule, which DOES list tbody. Listing it in both
      // places here would be a same-specificity source-order accident: whichever
      // came last would decide whether the grid exists at all.
      const start = css.indexOf(
        ".appx-spec-table--layout-grid .appx-spec-table__table,",
      );
      expect(start).toBeGreaterThan(-1);
      const selectorList = css.slice(start, css.indexOf("{", start));
      expect(selectorList).not.toContain("tbody");
    });

    it("spans a section header across every track", () => {
      // The one interaction the design could not prove on paper: `1 / -1` has to
      // address the explicit track lines auto-fit generates, not an implicit
      // grid. Verified live in the harness; pinned here.
      const start = css.indexOf(
        ".appx-spec-table--layout-grid .appx-spec-table__section-row {",
      );
      expect(start).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain("grid-column: 1 / -1;");
    });

    it("drops the column divider — a grid item has no label/value seam", () => {
      // Third shape to need this, after desktop-stacked and mobile-stacked. Left
      // in, the rule paints as a stray vertical stub at every track edge.
      const start = css.indexOf(
        ".appx-spec-table--layout-grid .appx-spec-table__label {",
      );
      expect(start).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain("border-inline-end: none;");
      expect(block).toContain("border-block-end: none;");
      expect(block).toContain("width: auto;");
    });

    it("declares the column-divider ON rule BEFORE the grid rule that undoes it", () => {
      // Two classes each, so specificity ties and source order alone decides.
      expect(
        css.indexOf(".appx-spec-table--layout-grid .appx-spec-table__label {"),
      ).toBeGreaterThan(css.indexOf(".appx-spec-table--column-divider-line"));
    });

    it("stands the zebra fill down in grid mode", () => {
      // nth-child parity across N tracks paints a checkerboard, and CSS cannot
      // know how many tracks the browser chose.
      const start = css.indexOf(STRIPE_STANDDOWN_SELECTOR);
      expect(
        start,
        "the feature 85 stripe stand-down rule is missing",
      ).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toContain("background: transparent;");
    });

    it("out-specifies the fill rule rather than merely following it", () => {
      // ⚠️ THE invisible-when-broken assertion of this feature, and the plan got
      // it WRONG on paper: the two rules do NOT tie. The fill rule is four
      // compound parts (--dividers-stripes, __row, :nth-child, __label) and the
      // obvious short form of the stand-down is three, so it loses wherever it
      // sits and the checkerboard paints anyway. Measured in the harness before
      // this shape was adopted, and demonstrated live by swapping the short form
      // back in and watching the fills return.
      //
      // Mirroring the fill rule's shape makes the stand-down five parts, so it
      // wins on specificity. Pinning :nth-child here is what stops a later
      // "simplification" from silently reintroducing the bug.
      const standdown = css.indexOf(STRIPE_STANDDOWN_SELECTOR);
      expect(standdown).toBeGreaterThan(-1);
      const block = css.slice(standdown, css.indexOf("}", standdown));
      expect(block).toContain(".appx-spec-table__row:nth-child(even)");
      expect(block).toContain(".appx-spec-table__value");
    });

    it("declares the stand-down AFTER the --dividers-stripes fill rule", () => {
      // Belt as well as braces: specificity is what decides today, but keeping
      // the source order too means a future equal-specificity variant of either
      // rule still resolves the right way.
      const fill = css.indexOf(
        ".appx-spec-table--dividers-stripes\n" +
          "  .appx-spec-table__row:nth-child(even)",
      );
      expect(fill).toBeGreaterThan(-1);
      expect(css.indexOf(STRIPE_STANDDOWN_SELECTOR)).toBeGreaterThan(fill);
    });

    it("leaves labelBgColor / valueBgColor alone — only the STRIPE stands down", () => {
      // The broad form would have wiped a merchant's own cell backgrounds in
      // Grid mode, because the base __label rule is what carries them.
      const standdown = css.indexOf(STRIPE_STANDDOWN_SELECTOR);
      const block = css.slice(standdown, css.indexOf("}", standdown));
      expect(block).not.toMatch(
        /--dividers-stripes\n {2}\.appx-spec-table__label/,
      );
    });

    it("stands the --outer-border last-row exception down in grid mode", () => {
      // That exception assumes the last DOM row is the row against the frame.
      // Across tracks the last DOM pair is the bottom-RIGHT one, so the
      // exception would drop its rule and leave its bottom-row neighbours'
      // — measured in the harness as 1px,1px,1px,0px across the final track
      // row. CSS cannot select "the last grid row", so it stands down and the
      // bottom edge stays uniform.
      expect(css).toContain(
        ".appx-spec-table--outer-border:not(.appx-spec-table--layout-grid)",
      );
      // All three selector cases must carry it, not just the flat one.
      const guarded =
        css.match(
          /\.appx-spec-table--outer-border:not\(\.appx-spec-table--layout-grid\)/g,
        ) ?? [];
      expect(guarded).toHaveLength(3);
    });

    it("adds nothing to the @media block — auto-fit IS the responsive story", () => {
      // At 375px a 240px minimum fits exactly one track, so the grid collapses
      // with no breakpoint involved. A --layout-grid rule inside the media query
      // would mean the minimum-width design had been misunderstood.
      const mediaAt = css.indexOf("@media (max-width: 749px) {");
      expect(mediaAt).toBeGreaterThan(-1);
      expect(css.slice(mediaAt)).not.toContain("--layout-grid");
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
