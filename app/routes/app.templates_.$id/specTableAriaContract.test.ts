// Feature 70 — the ARIA contract that keeps the stacked layouts from silently
// destroying the spec table's label→value relationships.
//
// `display: block` (the stacked layout, and the ≤749px mobile rule) drops an
// element out of the CSS table model and takes the browser's IMPLICIT table
// semantics with it, so a screen reader stops announcing label/value as a
// header/cell pair. Explicit ARIA roles are immune to `display`, so they survive
// it — but only if the WHOLE chain is present.
//
// `display: grid` (feature 85's multi-column layout) does exactly the same
// thing, which is why the scan below matches both. It is the THIRD departure
// from `display: table` and it deliberately reuses this mechanism rather than
// inventing one — but note that the mechanism itself is still unverified
// against real assistive tech (feature 70's owed screen-reader pass). These
// tests prove the roles are PRESENT and COMPLETE; nothing here proves they are
// announced.
//
// This file pins the INVARIANT, not today's instance: if a future step adds a
// third stacked variant (a new breakpoint, a new layout knob), these tests fail
// rather than letting the same bug back in unnoticed. It reads the real
// extension files off disk, the same way `specTableCssContract.test.ts` does —
// CSS and Liquid cannot import TypeScript, so a test is the only place the three
// can be held together.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderSpecTableHtml } from "./specTablePreviewHtml";
import { DEFAULT_STYLING_VALUES } from "../../utils/tableStyling";
import type { EditorRow } from "../../utils/rows";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const css = read(
  "../../../extensions/product-specs-table/assets/spec-table.css",
);
// Comment blocks are stripped before any tag matching: this file's own header
// discusses `<table>` and `<tr>` in prose, and a guard that trips over the
// documentation explaining it is a guard nobody keeps.
const liquid = read(
  "../../../extensions/product-specs-table/blocks/spec_table.liquid",
).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");

// The role every class must carry once CSS can strip its implicit semantics.
// Keyed by the class the stylesheet targets.
const REQUIRED_ROLE: Readonly<Record<string, string>> = {
  "appx-spec-table__table": "table",
  "appx-spec-table__row": "row",
  "appx-spec-table__section-row": "row",
  "appx-spec-table__label": "rowheader",
  "appx-spec-table__value": "cell",
  "appx-spec-table__section": "columnheader",
};

// Every class named in a rule that takes an element OUT of the CSS table model
// in the real stylesheet — `display: block` or `display: grid`. Parsed rather
// than hardcoded — that is the whole point: a new stacked or flowed variant
// lands in this set automatically and must then satisfy the assertions below.
// Feature 85 is the proof that it works: adding GRID required widening this one
// regex, and everything else held.
const SEMANTICS_STRIPPING_DISPLAY = /display:\s*(?:block|grid)/;

function classesLosingTableSemantics(): Set<string> {
  const found = new Set<string>();
  // Each rule block: selector list up to `{`, then declarations up to `}`.
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const [, selectors, declarations] = match;
    if (!SEMANTICS_STRIPPING_DISPLAY.test(declarations)) continue;
    for (const cls of selectors.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      found.add(cls[1]);
    }
  }
  return found;
}

describe("feature 70 — table semantics survive `display: block`", () => {
  it("the stylesheet really does strip table semantics somewhere", () => {
    // Guards the guard: if this ever comes back empty the parser broke, and
    // every assertion below would pass vacuously.
    const stripped = classesLosingTableSemantics();
    expect(stripped.size).toBeGreaterThan(0);
    expect(stripped).toContain("appx-spec-table__label");
    expect(stripped).toContain("appx-spec-table__value");
  });

  it("catches the GRID layout too, not only the two stacked ones (feature 85)", () => {
    // The scan is the guard, so widening it has to be observable: if a future
    // edit narrowed it back to `display: block` alone, the grid rules would go
    // unchecked and this fails rather than passing vacuously. The tbody rule is
    // the specific one a `block`-only scan would miss — it is the only place in
    // the file that says `display: grid`.
    const stripped = classesLosingTableSemantics();
    expect(stripped).toContain("appx-spec-table--layout-grid");
    expect(stripped).toContain("appx-spec-table__table");
    expect(css).toContain("display: grid;");
  });

  it("every class in a `display: block` rule carries an explicit role in the Liquid", () => {
    for (const cls of classesLosingTableSemantics()) {
      const role = REQUIRED_ROLE[cls];
      // Modifier/wrapper classes (appx-spec-table--layout-stacked, tbody's
      // parent selectors) carry no element of their own — only the element
      // classes in REQUIRED_ROLE need a role.
      if (!role) continue;
      const tag = new RegExp(`<[a-z]+[^>]*class="${cls}"[^>]*>`, "g");
      const occurrences = [...liquid.matchAll(tag)];
      expect(
        occurrences.length,
        `${cls} appears in a display:block rule but in no Liquid element`,
      ).toBeGreaterThan(0);
      for (const [tagText] of occurrences) {
        expect(tagText, `${cls} is missing role="${role}"`).toContain(
          `role="${role}"`,
        );
      }
    }
  });

  it("keeps the chain COMPLETE — a partial chain is worse than none", () => {
    // A role="row" whose ancestor carries no table/rowgroup role can be dropped
    // outright by assistive tech, children included. Every <table> and <tbody>
    // in the Liquid must be roled, not just the ones that were convenient.
    for (const [tag] of liquid.matchAll(/<table[^>]*>/g)) {
      expect(tag).toContain('role="table"');
    }
    for (const [tag] of liquid.matchAll(/<tbody[^>]*>/g)) {
      expect(tag).toContain('role="rowgroup"');
    }
  });

  it("keeps the section header's span expressed in ARIA as well as HTML", () => {
    // `colspan` and `aria-colspan` are separate mechanisms; with explicit roles
    // in play, state the span in both rather than assume the native attribute
    // is still read. (Drop `aria-colspan` only if a screen-reader pass proves
    // it redundant — see `context/features/70-…` §1.)
    const section = liquid.match(
      /<th[^>]*class="appx-spec-table__section"[^>]*>/,
    );
    expect(section?.[0]).toContain('colspan="2"');
    expect(section?.[0]).toContain('aria-colspan="2"');
  });
});

// The two markup sites are HAND-MIRRORED — `specTablePreviewHtml.ts` says so in
// its own header, and Liquid cannot import TypeScript. Nothing has ever checked
// that the mirror holds; for the role attributes at least, now something does.
describe("feature 70 — Liquid ↔ preview parity on roles", () => {
  const ROWS: EditorRow[] = [
    {
      id: "s1",
      key: "aircraft",
      rowType: "SECTION_HEADER",
      label: "Aircraft",
      hideWhenEmpty: false,
    },
    {
      id: "r1",
      key: "weight",
      rowType: "DATA",
      label: "Weight",
      valueParts: [{ type: "TEXT", text: "249 g" }],
      hideWhenEmpty: false,
    },
  ];

  const preview = renderSpecTableHtml(ROWS, DEFAULT_STYLING_VALUES);

  it("emits the same role attributes the storefront does", () => {
    for (const role of [
      'role="table"',
      'role="rowgroup"',
      'role="row"',
      'role="rowheader"',
      'role="cell"',
      'role="columnheader"',
      'aria-colspan="2"',
    ]) {
      expect(liquid, `Liquid is missing ${role}`).toContain(role);
      expect(preview, `preview HTML is missing ${role}`).toContain(role);
    }
  });

  it("roles the preview's tables and tbodies completely too", () => {
    for (const [tag] of preview.matchAll(/<table[^>]*>/g)) {
      expect(tag).toContain('role="table"');
    }
    for (const [tag] of preview.matchAll(/<tbody[^>]*>/g)) {
      expect(tag).toContain('role="rowgroup"');
    }
  });
});
