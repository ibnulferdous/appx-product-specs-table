import { describe, expect, it } from "vitest";
import type {
  DataRow,
  EditorRow,
  SectionHeaderRow,
  ValuePart,
} from "../../utils/rows";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StylingValues } from "../../utils/tableStyling";
import { DEFAULT_STYLING_VALUES } from "../../utils/tableStyling";
import {
  formatCssVarDeclarations,
  SPEC_TABLE_CSS_VARS,
  stylingToCssVars,
  stylingToModifierClasses,
} from "../../utils/tableStylingCss";
import {
  renderSpecTableHtml as renderSpecTableHtmlStyled,
  renderSpecTablePreviewDocument as renderSpecTablePreviewDocumentStyled,
} from "./specTablePreviewHtml";
import { PREVIEW_DOCUMENT_STYLES, SPEC_TABLE_CSS } from "./previewStyles";
import {
  PREVIEW_HEIGHT_BRIDGE_SCRIPT,
  PREVIEW_HEIGHT_MESSAGE_TYPE,
} from "./previewBridge";

// Both renderers REQUIRE a resolved `StylingValues` (feature 57 · Step 6). The
// feature-49 assertions below all predate styling and exercise the markup
// fidelity contract, which is styling-independent — so bind the default value
// once here rather than repeating it at two dozen call sites. The Step 6
// describe block calls the real functions with explicit non-default values.
const renderSpecTableHtml = (
  rows: EditorRow[],
  styling: StylingValues = DEFAULT_STYLING_VALUES,
) => renderSpecTableHtmlStyled(rows, styling);

const renderSpecTablePreviewDocument = (
  rows: EditorRow[],
  styling: StylingValues = DEFAULT_STYLING_VALUES,
) => renderSpecTablePreviewDocumentStyled(rows, styling);

// Feature 49 · Step 2. The pure storefront-markup renderer — the fidelity
// contract that "the preview matches the storefront exactly" hinges on. Because
// Liquid and TS can't share code, this hand-mirrors `spec_table.liquid` +
// `spec-table-value.liquid`; the coverage for the whole feature lives here in the
// Node vitest env (no DOM, no iframe). The one intentional divergence — dynamic
// parts as inert labeled pills — is asserted below.

// --- row builders (keep the tests declarative) --------------------------------
function dataRow(
  valueParts: ValuePart[],
  overrides: Partial<DataRow> = {},
): DataRow {
  return {
    id: overrides.id ?? "d1",
    key: overrides.key ?? "row",
    rowType: "DATA",
    label: overrides.label ?? "Label",
    valueParts,
    hideWhenEmpty: overrides.hideWhenEmpty ?? false,
  };
}

function sectionRow(
  overrides: Partial<SectionHeaderRow> = {},
): SectionHeaderRow {
  return {
    id: overrides.id ?? "s1",
    key: overrides.key ?? "section",
    rowType: "SECTION_HEADER",
    label: overrides.label ?? "Section",
    hideWhenEmpty: overrides.hideWhenEmpty ?? false,
  };
}

// The expected wrapper open tag for a given styling — derived from the Step 2
// mapping, never hand-typed, so adding a knob can't leave a stale literal here.
const wrapperOpenTag = (styling: StylingValues = DEFAULT_STYLING_VALUES) =>
  `<div class="${["appx-spec-table", ...stylingToModifierClasses(styling)].join(" ")}">`;

const text = (t: string): ValuePart => ({ type: "TEXT", text: t });
const lineBreak: ValuePart = { type: "LINE_BREAK" };
const vendorField: ValuePart = { type: "SHOPIFY_FIELD", field: "vendor" };
const metafield: ValuePart = {
  type: "METAFIELD",
  namespace: "custom",
  key: "battery_life",
};

describe("renderSpecTableHtml", () => {
  it("returns an empty string for no rows", () => {
    expect(renderSpecTableHtml([])).toBe("");
  });

  it("wraps non-empty rows in the storefront div/table/tbody", () => {
    const html = renderSpecTableHtml([dataRow([text("42")])]);
    expect(html).toContain(
      `${wrapperOpenTag()}<table class="appx-spec-table__table" role="table"><tbody role="rowgroup">`,
    );
    expect(html).toContain("</tbody></table></div>");
    // No storefront-only bits leak into the preview.
    expect(html).not.toContain("shopify_attributes");
  });

  it("renders a section header row spanning both columns", () => {
    const html = renderSpecTableHtml([sectionRow({ label: "Display" })]);
    expect(html).toContain(
      '<tr class="appx-spec-table__section-row" role="row"><th class="appx-spec-table__section" colspan="2" scope="colgroup" role="columnheader" aria-colspan="2">Display</th></tr>',
    );
  });

  it("renders a data row as a label th + value td", () => {
    const html = renderSpecTableHtml([
      dataRow([text("6.1 inches")], { label: "Screen" }),
    ]);
    expect(html).toContain(
      '<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">Screen</th><td class="appx-spec-table__value" role="cell">6.1 inches</td></tr>',
    );
  });

  it("emits a <br> for a LINE_BREAK part", () => {
    const html = renderSpecTableHtml([
      dataRow([text("line one"), lineBreak, text("line two")]),
    ]);
    expect(html).toContain(
      '<td class="appx-spec-table__value" role="cell">line one<br>line two</td>',
    );
  });

  it("renders a SHOPIFY_FIELD part as an inert labeled pill", () => {
    const html = renderSpecTableHtml([dataRow([vendorField])]);
    expect(html).toContain(
      '<span class="appx-spec-table__dynamic-pill" title="Product field · vendor">Field · vendor</span>',
    );
  });

  it("renders a METAFIELD part as an inert labeled pill", () => {
    const html = renderSpecTableHtml([dataRow([metafield])]);
    expect(html).toContain(
      '<span class="appx-spec-table__dynamic-pill" title="custom · battery_life">Metafield · battery_life</span>',
    );
  });

  it("preserves order and author whitespace across a mixed value", () => {
    const html = renderSpecTableHtml([
      dataRow([text("Up to "), metafield, text(" hours")]),
    ]);
    expect(html).toContain(
      '<td class="appx-spec-table__value" role="cell">Up to <span class="appx-spec-table__dynamic-pill" title="custom · battery_life">Metafield · battery_life</span> hours</td>',
    );
  });

  it("escapes HTML metacharacters in labels and TEXT (no raw injection)", () => {
    const html = renderSpecTableHtml([
      dataRow([text(`a < b & c > d " ' <script>`)], {
        label: `Weird & <Label>`,
      }),
    ]);
    expect(html).toContain(
      '<th class="appx-spec-table__label" scope="row" role="rowheader">Weird &amp; &lt;Label&gt;</th>',
    );
    expect(html).toContain(
      '<td class="appx-spec-table__value" role="cell">a &lt; b &amp; c &gt; d &quot; &#39; &lt;script&gt;</td>',
    );
    expect(html).not.toContain("<script>");
  });

  describe("hideWhenEmpty (whole-cell gate)", () => {
    it("omits an empty-static cell when the flag is set", () => {
      const html = renderSpecTableHtml([
        dataRow([text("")], { label: "Empty", hideWhenEmpty: true }),
      ]);
      expect(html).not.toContain("Empty");
      // No rows survive → wrapper still renders (rows.length > 0), tbody empty.
      expect(html).toBe(
        `${wrapperOpenTag()}<table class="appx-spec-table__table" role="table"><tbody role="rowgroup"></tbody></table></div>`,
      );
    });

    it("keeps the same empty cell when the flag is off", () => {
      const html = renderSpecTableHtml([
        dataRow([text("")], { label: "Empty", hideWhenEmpty: false }),
      ]);
      expect(html).toContain(
        '<th class="appx-spec-table__label" scope="row" role="rowheader">Empty</th>',
      );
    });

    it("treats a whitespace-only cell as empty when the flag is set", () => {
      const html = renderSpecTableHtml([
        dataRow([text("   ")], { label: "Spaces", hideWhenEmpty: true }),
      ]);
      expect(html).not.toContain("Spaces");
    });

    it("treats a LINE_BREAK-only cell as empty when the flag is set", () => {
      const html = renderSpecTableHtml([
        dataRow([text(""), lineBreak, text("")], {
          label: "BreakOnly",
          hideWhenEmpty: true,
        }),
      ]);
      expect(html).not.toContain("BreakOnly");
    });

    it("always renders a cell that contains a dynamic pill, even with the flag set", () => {
      const html = renderSpecTableHtml([
        dataRow([vendorField], { label: "Vendor", hideWhenEmpty: true }),
      ]);
      expect(html).toContain(
        '<th class="appx-spec-table__label" scope="row" role="rowheader">Vendor</th>',
      );
      expect(html).toContain("Field · vendor");
    });
  });

  it("keeps array order across a mix of section and data rows", () => {
    const html = renderSpecTableHtml([
      sectionRow({ label: "A" }),
      dataRow([text("one")], { id: "d1", label: "First" }),
      dataRow([text("two")], { id: "d2", label: "Second" }),
      sectionRow({ id: "s2", label: "B" }),
      dataRow([text("three")], { id: "d3", label: "Third" }),
    ]);
    const order = [
      'aria-colspan="2">A</th>',
      ">First</th>",
      ">Second</th>",
      'aria-colspan="2">B</th>',
      ">Third</th>",
    ].map((needle) => html.indexOf(needle));
    // Every needle is present and strictly increasing (array order preserved).
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

// Feature 49 · Step 3 — the pure document wrapper that Step 3's iframe drops into
// its `srcDoc`. Node-unit-tested like the renderer; the actual iframe paint is
// browser-verified.
describe("renderSpecTablePreviewDocument", () => {
  it("emits a well-formed, complete HTML document", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("42")])]);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('<html lang="en">');
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain('name="viewport"');
    expect(doc).toContain("<body>");
    expect(doc).toContain("</body></html>");
  });

  it("carries the rendered rows fragment at the start of the body", () => {
    const rows = [sectionRow({ label: "Display" }), dataRow([text("6.1 in")])];
    const doc = renderSpecTablePreviewDocument(rows);
    // The body opens with the exact renderSpecTableHtml output — same fidelity
    // contract; the Step 6 height shim trails it before </body>.
    expect(doc).toContain(`<body>${renderSpecTableHtml(rows)}`);
    expect(doc).toContain(`${PREVIEW_HEIGHT_BRIDGE_SCRIPT}</body>`);
  });

  it("shows the empty state (not a blank body) for zero rows; shim + styles present", () => {
    const doc = renderSpecTablePreviewDocument([]);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    // renderSpecTableHtml([]) is "" (no <tr>) → the preview-only empty state fills
    // the body (Step 7), then the height shim; no crash, no "undefined".
    expect(doc).toContain('<body><div class="appx-spec-table-preview-empty">');
    expect(doc).toContain(`</div>${PREVIEW_HEIGHT_BRIDGE_SCRIPT}</body>`);
    expect(doc).not.toContain("<tr");
    expect(doc).not.toContain("undefined");
    // The stylesheet is still injected even when there are no rows (Step 4).
    expect(doc).toContain("<style>");
  });

  // Feature 49 · Step 4 — the shared storefront stylesheet is now inlined. These
  // assertions replace the Step 3 "intentionally unstyled" invariant.
  it("inlines the shared storefront stylesheet in the head", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("x")])]);
    // A <style> block sits in the head (before the body opens).
    const headEnd = doc.indexOf("</head>");
    const styleAt = doc.indexOf("<style>");
    expect(styleAt).toBeGreaterThanOrEqual(0);
    expect(styleAt).toBeLessThan(headEnd);
    // Inlined, not linked — the sandboxed opaque-origin frame has no reliable URL.
    expect(doc).not.toContain("<link");
    // The exact single-source payload is present, byte-for-byte.
    expect(doc).toContain(PREVIEW_DOCUMENT_STYLES);
  });

  it("carries the real storefront rules (not a stub)", () => {
    // Signature selectors from the extension's spec-table.css must be present,
    // proving the real rules are inlined.
    expect(PREVIEW_DOCUMENT_STYLES).toContain(".appx-spec-table__table");
    expect(PREVIEW_DOCUMENT_STYLES).toContain(".appx-spec-table__label");
    expect(PREVIEW_DOCUMENT_STYLES).toContain(".appx-spec-table__section");
  });

  // The single-source-of-truth guard: SPEC_TABLE_CSS is a verbatim mirror of the
  // theme app extension's storefront stylesheet. This reads the REAL file and
  // asserts they are byte-identical (line endings normalized), so the mirror can
  // never drift silently — if the storefront CSS changes, this fails until the
  // copy in previewStyles.ts is updated to match.
  it("mirrors the extension's spec-table.css byte-for-byte (no drift)", () => {
    const cssPath = fileURLToPath(
      new URL(
        "../../../extensions/product-specs-table/assets/spec-table.css",
        import.meta.url,
      ),
    );
    const onDisk = readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
    expect(SPEC_TABLE_CSS).toBe(onDisk);
  });

  it("includes the minimal neutral preview-page ambient base", () => {
    // A body font reset so the preview isn't the browser-default serif; explicitly
    // not storefront table styling and not merchant-theme replication.
    expect(PREVIEW_DOCUMENT_STYLES).toContain("body {");
    expect(PREVIEW_DOCUMENT_STYLES).toContain("font-family");
  });

  // Feature 49 · Step 6 — the document now carries the auto-height shim (so it can
  // report its content height) and a strict CSP (to bound the newly-granted
  // `allow-scripts`).
  it("injects the height-measurement shim at the end of the body", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("x")])]);
    // The shim is our single-source bridge script, and it sits just before </body>.
    expect(doc).toContain(PREVIEW_HEIGHT_BRIDGE_SCRIPT);
    expect(doc).toContain(`${PREVIEW_HEIGHT_BRIDGE_SCRIPT}</body>`);
    // The message type the parent listener filters on is present (no drift).
    expect(doc).toContain(PREVIEW_HEIGHT_MESSAGE_TYPE);
  });

  it("leads the head with a strict Content-Security-Policy meta", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("x")])]);
    // Present, inside the head, and before the <style>/<script> it governs.
    const cspAt = doc.indexOf("Content-Security-Policy");
    const headEnd = doc.indexOf("</head>");
    const styleAt = doc.indexOf("<style>");
    expect(cspAt).toBeGreaterThanOrEqual(0);
    expect(cspAt).toBeLessThan(headEnd);
    expect(cspAt).toBeLessThan(styleAt);
    // default-src 'none' (no network egress); only our inline style + script run.
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("style-src 'unsafe-inline'");
    expect(doc).toContain("script-src 'unsafe-inline'");
  });

  it("is view-independent — the builder takes only rows, so the srcDoc is byte-identical across device views", () => {
    // Step 5 changes only the iframe's OUTER width; the document must not encode
    // any device view, so a toggle does not reload the frame (Step 6 relies on the
    // in-frame ResizeObserver, not a reload, to re-height).
    const rows = [dataRow([text("x")])];
    const doc = renderSpecTablePreviewDocument(rows);
    // Two legitimate sources of device WORDS that are not device VIEWS:
    //   1. the shared stylesheet (feature 57 Step 3's `--mobile-stacked`
    //      selectors + breakpoint comment) — width-responsive CSS;
    //   2. the wrapper's modifier classes (Step 6) — `--mobile-stacked` /
    //      `--mobile-same-as-desktop` encode the MERCHANT'S mobile-layout knob,
    //      a property of the styling value, not of which device tab is active.
    // Both are view-independent; strip them and assert nothing else names a
    // device, i.e. the document still carries no per-view payload.
    const outsideStyles = doc
      .replace(PREVIEW_DOCUMENT_STYLES, "")
      .replace(wrapperOpenTag(), "");
    expect(outsideStyles).not.toContain("desktop");
    expect(outsideStyles).not.toContain("tablet");
    expect(outsideStyles).not.toContain("mobile");
    // Same input → identical output (no hidden per-call variation).
    expect(renderSpecTablePreviewDocument(rows)).toBe(doc);
  });

  // Feature 49 · Step 7 — the preview-only empty state + dynamic-pill affordance.
  it("shows the empty state when rows exist but are all hidden by hideWhenEmpty", () => {
    const rows = [
      dataRow([text("")], { id: "d1", hideWhenEmpty: true }),
      dataRow([text("   ")], { id: "d2", hideWhenEmpty: true }),
    ];
    // The storefront fragment renders no rows (empty tbody, no <tr>)...
    expect(renderSpecTableHtml(rows)).not.toContain("<tr");
    // ...so the preview document substitutes the empty state.
    const doc = renderSpecTablePreviewDocument(rows);
    expect(doc).toContain('<div class="appx-spec-table-preview-empty">');
    expect(doc).not.toContain("<tr");
  });

  it("does NOT substitute the empty state when there are visible rows", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("42")])]);
    expect(doc).toContain("<tr");
    // The empty-state DIV must be absent (the CSS rule for it still lives in the
    // <style>, so assert on the body block marker, not the bare class name).
    expect(doc).not.toContain('<div class="appx-spec-table-preview-empty">');
  });

  it("keeps the empty state preview-only — renderSpecTableHtml is unchanged", () => {
    // The storefront-fidelity renderer still returns "" for [] and the empty-tbody
    // wrapper for all-hidden; the empty state is a document-level addition only.
    expect(renderSpecTableHtml([])).toBe("");
    expect(
      renderSpecTableHtml([dataRow([text("")], { hideWhenEmpty: true })]),
    ).toBe(
      `${wrapperOpenTag()}<table class="appx-spec-table__table" role="table"><tbody role="rowgroup"></tbody></table></div>`,
    );
    expect(renderSpecTableHtml([])).not.toContain(
      "appx-spec-table-preview-empty",
    );
  });

  it("styles the dynamic pill + empty state preview-only (present in preview styles, absent from SPEC_TABLE_CSS)", () => {
    // The affordance rules ship only in the preview document; the drift-guarded
    // storefront mirror must stay clean (or its byte-equality test fails).
    expect(PREVIEW_DOCUMENT_STYLES).toContain(".appx-spec-table__dynamic-pill");
    expect(PREVIEW_DOCUMENT_STYLES).toContain(".appx-spec-table-preview-empty");
    expect(SPEC_TABLE_CSS).not.toContain("dynamic-pill");
    expect(SPEC_TABLE_CSS).not.toContain("preview-empty");
  });
});

// Feature 57 · Step 6 — live styling in the previews. The renderers now consume
// the Step 2 presentation mapping: modifier classes on the wrapper, custom
// properties in a head <style>. These assertions pin the WIRING (that the mapping
// output reaches the document intact and totally); the mapping's own semantics are
// exhaustively covered in `app/utils/tableStylingCss.test.ts`.
describe("styling → preview document (feature 57 · Step 6)", () => {
  const rows = [dataRow([text("42")], { label: "Weight" })];

  // A value with every nullable field overridden, so the var path is exercised
  // beyond the all-inherit default.
  const styled: StylingValues = {
    ...DEFAULT_STYLING_VALUES,
    rowDividerStyle: "STRIPES",
    density: "COMPACT",
    borderColor: "#ff0000",
    labelTextColor: "#123456",
    fontSize: 18,
    labelWidthPct: 40,
  };

  it("puts the mapping's modifier classes on the wrapper, defaults included", () => {
    const html = renderSpecTableHtmlStyled(rows, DEFAULT_STYLING_VALUES);
    const expected = stylingToModifierClasses(DEFAULT_STYLING_VALUES);
    // Exactly `appx-spec-table` + the mapping output, in mapping order.
    expect(html).toContain(
      `<div class="${["appx-spec-table", ...expected].join(" ")}">`,
    );
    // Defaults are emitted (not omitted) — equal specificity for every knob.
    expect(expected.length).toBeGreaterThan(0);
    expect(html).toContain("appx-spec-table--dividers-lines");
  });

  it("swaps the modifier class when a knob changes", () => {
    const html = renderSpecTableHtmlStyled(rows, {
      ...DEFAULT_STYLING_VALUES,
      rowDividerStyle: "STRIPES",
    });
    expect(html).toContain("appx-spec-table--dividers-stripes");
    expect(html).not.toContain("appx-spec-table--dividers-lines");
  });

  it("renders every modifier for a fully non-default value", () => {
    const html = renderSpecTableHtmlStyled(rows, styled);
    for (const cls of stylingToModifierClasses(styled)) {
      expect(html).toContain(cls);
    }
  });

  it("emits the custom-property rule unconditionally — empty body when all-inherit", () => {
    const doc = renderSpecTablePreviewDocument(rows, DEFAULT_STYLING_VALUES);
    // Defaults are all-inherit for the nullable fields → no declarations, but the
    // rule (and so the document shape) is still there.
    expect(stylingToCssVars(DEFAULT_STYLING_VALUES)).toEqual({});
    expect(doc).toContain("<style>.appx-spec-table {  }</style>");
  });

  it("emits exactly the mapping's declarations for an overridden value", () => {
    const doc = renderSpecTablePreviewDocument(rows, styled);
    const declarations = formatCssVarDeclarations(stylingToCssVars(styled));
    expect(doc).toContain(
      `<style>.appx-spec-table { ${declarations} }</style>`,
    );
    // Sanity: the overrides really did reach the document.
    expect(declarations).toContain("--appx-spec-border-color: #ff0000;");
    expect(declarations).toContain("--appx-spec-font-size: 18px;");
    expect(declarations).toContain("--appx-spec-label-width: 40%;");
  });

  // Feature 57 · Step 10 — the one new preview assertion this step warrants.
  // Steps 5/8/9b could only reach the class half of the mapping; Step 10 is
  // where the LAST of the thirteen nullable knobs gains a control, so for the
  // first time a merchant can drive every custom property from the UI. This
  // pins that the preview carries all thirteen, not merely the six the Step 6
  // fixture happened to set — the pipe's totality through the now-complete
  // UI-reachable range.
  it("carries every custom property for a fully-overridden value (Step 10 totality)", () => {
    const everyKnobSet: StylingValues = {
      ...DEFAULT_STYLING_VALUES,
      headerBgColor: "#111111",
      labelBgColor: "#222222",
      valueBgColor: "#333333",
      stripeBgColor: "#44444480", // the 8-digit shape the alpha swatches emit
      borderColor: "#555555",
      labelTextColor: "#666666",
      valueTextColor: "#777777",
      fontSize: 31,
      fontWeight: "BOLD",
      fontStyle: "ITALIC",
      lineHeight: "LOOSE",
      labelCase: "UPPERCASE",
      labelWidthPct: 35,
    };

    const doc = renderSpecTablePreviewDocument(rows, everyKnobSet);
    const vars = stylingToCssVars(everyKnobSet);

    // Asserted against SPEC_TABLE_CSS_VARS rather than a hand-typed list, so a
    // fourteenth nullable knob fails here instead of silently never rendering.
    const varNames = Object.values(SPEC_TABLE_CSS_VARS);
    expect(Object.keys(vars).sort()).toEqual([...varNames].sort());
    for (const name of varNames) {
      expect(doc).toContain(`${name}: ${vars[name]};`);
    }
  });

  it("declares the vars on the block, after the shared stylesheet", () => {
    const doc = renderSpecTablePreviewDocument(rows, styled);
    // On `.appx-spec-table` (not :root) so they inherit down to __table, where
    // Step 3's typography rules read them.
    const varsAt = doc.indexOf("<style>.appx-spec-table {");
    const sharedAt = doc.indexOf(PREVIEW_DOCUMENT_STYLES);
    const headEnd = doc.indexOf("</head>");
    expect(sharedAt).toBeGreaterThanOrEqual(0);
    // Overrides follow the shared rules, so they win at equal specificity...
    expect(varsAt).toBeGreaterThan(sharedAt);
    // ...and both sit in the head.
    expect(varsAt).toBeLessThan(headEnd);
  });

  it("is styling-DEPENDENT — different styling yields a different document", () => {
    // The liveness mechanism: the component recomputes srcDoc every render, so a
    // knob change must produce new bytes or the frame would never repaint.
    const a = renderSpecTablePreviewDocument(rows, DEFAULT_STYLING_VALUES);
    const b = renderSpecTablePreviewDocument(rows, styled);
    expect(a).not.toBe(b);
    // ...while staying deterministic for a fixed (rows, styling).
    expect(renderSpecTablePreviewDocument(rows, styled)).toBe(b);
  });

  it("leaves the fidelity contract untouched under non-default styling", () => {
    // Escaping, the hideWhenEmpty gate, section rows and the empty-array contract
    // are all styling-independent.
    expect(renderSpecTableHtmlStyled([], styled)).toBe("");
    const html = renderSpecTableHtmlStyled(
      [
        sectionRow({ label: "A & B" }),
        dataRow([text("<script>")], { id: "d1", label: "Esc" }),
        dataRow([text("  ")], { id: "d2", hideWhenEmpty: true, label: "Gone" }),
      ],
      styled,
    );
    expect(html).toContain('aria-colspan="2">A &amp; B</th>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Gone");
  });

  it("keeps the empty state intact when styling is set", () => {
    const doc = renderSpecTablePreviewDocument([], styled);
    expect(doc).toContain('<div class="appx-spec-table-preview-empty">');
    // The var rule is still emitted (harmless with no wrapper to style).
    expect(doc).toContain("<style>.appx-spec-table {");
  });

  it("emits the collapsible class only when the knob is on (Step 9a)", () => {
    // Was "does not emit the collapsible class until Step 9 wires the control".
    // Step 9a turns that into the POSITIVE assertion: the presence flag is now
    // reachable and drives real markup. Assert on the MARKUP, not the document
    // — the stylesheet the document inlines mentions the class legitimately.
    expect(
      renderSpecTableHtmlStyled(rows, DEFAULT_STYLING_VALUES),
    ).not.toContain("appx-spec-table--collapsible");
    expect(
      renderSpecTableHtmlStyled(rows, {
        ...DEFAULT_STYLING_VALUES,
        sectionsCollapsible: true,
      }),
    ).toContain("appx-spec-table--collapsible");
  });
});

// Feature 57 · Step 9a — collapsible sections, the one B1 step that changes
// MARKUP. Two shapes switched by one flag: OFF must stay byte-identical to what
// shipped before (every existing template renders through it), ON becomes one
// <details> per section wrapping its own <table>. With no control able to set
// the flag until 9b, these tests are the ONLY thing standing between "correct"
// and "silently broken" — so the four locked edge cases are covered first.
describe("collapsible sections (feature 57 · Step 9a)", () => {
  const collapsible = (
    overrides: Partial<StylingValues> = {},
  ): StylingValues => ({
    ...DEFAULT_STYLING_VALUES,
    sectionsCollapsible: true,
    ...overrides,
  });

  // A shape that actually exercises grouping: two sections, two rows each.
  const twoSections: EditorRow[] = [
    sectionRow({ id: "s1", label: "Aircraft" }),
    dataRow([text("249 g")], { id: "d1", label: "Weight" }),
    dataRow([text("34 min")], { id: "d2", label: "Flight time" }),
    sectionRow({ id: "s2", label: "Camera" }),
    dataRow([text("48 MP")], { id: "d3", label: "Photo" }),
    dataRow([text("4K/60")], { id: "d4", label: "Video" }),
  ];

  const detailsOpenings = (html: string) => html.match(/<details[^>]*>/g) ?? [];

  it("OFF renders the pre-Step-9a single-table shape, byte for byte", () => {
    // The regression that matters most. If this moves, the step is wrong.
    const off = renderSpecTableHtmlStyled(twoSections, DEFAULT_STYLING_VALUES);
    expect(off).toBe(
      `<div class="appx-spec-table ${stylingToModifierClasses(DEFAULT_STYLING_VALUES).join(" ")}">` +
        `<table class="appx-spec-table__table" role="table"><tbody role="rowgroup">` +
        `<tr class="appx-spec-table__section-row" role="row"><th class="appx-spec-table__section" colspan="2" scope="colgroup" role="columnheader" aria-colspan="2">Aircraft</th></tr>` +
        `<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">Weight</th><td class="appx-spec-table__value" role="cell">249 g</td></tr>` +
        `<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">Flight time</th><td class="appx-spec-table__value" role="cell">34 min</td></tr>` +
        `<tr class="appx-spec-table__section-row" role="row"><th class="appx-spec-table__section" colspan="2" scope="colgroup" role="columnheader" aria-colspan="2">Camera</th></tr>` +
        `<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">Photo</th><td class="appx-spec-table__value" role="cell">48 MP</td></tr>` +
        `<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">Video</th><td class="appx-spec-table__value" role="cell">4K/60</td></tr>` +
        `</tbody></table></div>`,
    );
    expect(off).not.toContain("<details");
    expect(off).not.toContain("<summary");
  });

  it("ON emits one <details> per section header, each wrapping its own table", () => {
    const html = renderSpecTableHtmlStyled(twoSections, collapsible());
    expect(detailsOpenings(html)).toHaveLength(2);
    expect(html.match(/<\/details>/g)).toHaveLength(2);
    expect(html.match(/<table class="appx-spec-table__table"/g)).toHaveLength(
      2,
    );
    // No section-header <tr> survives — the summary replaced it entirely.
    expect(html).not.toContain("appx-spec-table__section-row");
    expect(html).not.toContain('scope="colgroup"');
  });

  it("ON puts exactly that section's rows inside its own <details>, in order", () => {
    const html = renderSpecTableHtmlStyled(twoSections, collapsible());
    const groups = html.split("<details").slice(1);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toContain("Aircraft");
    expect(groups[0]).toContain("Weight");
    expect(groups[0]).toContain("Flight time");
    expect(groups[0]).not.toContain("Photo");
    expect(groups[1]).toContain("Camera");
    expect(groups[1]).toContain("Photo");
    expect(groups[1]).toContain("Video");
    expect(groups[1]).not.toContain("Weight");
    // Row order preserved within the section.
    expect(groups[0].indexOf("Weight")).toBeLessThan(
      groups[0].indexOf("Flight time"),
    );
  });

  it("maps sectionsInitialState onto the `open` attribute (the full matrix)", () => {
    const openFlags = (state: StylingValues["sectionsInitialState"]) =>
      detailsOpenings(
        renderSpecTableHtmlStyled(
          twoSections,
          collapsible({ sectionsInitialState: state }),
        ),
      ).map((tag) => tag.includes(" open"));

    expect(openFlags("ALL_OPEN")).toEqual([true, true]);
    expect(openFlags("FIRST_OPEN")).toEqual([true, false]);
    expect(openFlags("ALL_CLOSED")).toEqual([false, false]);
  });

  it("never turns sectionsInitialState into a CSS class (Step 2's no-leak law)", () => {
    // The initial state is the `open` ATTRIBUTE and nothing else.
    for (const state of ["ALL_OPEN", "FIRST_OPEN", "ALL_CLOSED"] as const) {
      const html = renderSpecTableHtmlStyled(
        twoSections,
        collapsible({ sectionsInitialState: state }),
      );
      expect(html).not.toContain(state.toLowerCase().replace("_", "-"));
      expect(html).not.toContain(state);
    }
  });

  it("gives every per-section table an accessible name (the a11y cost of the split)", () => {
    // Each table lost its <th scope="colgroup"> heading; unnamed tables would be
    // a regression over one named one.
    const html = renderSpecTableHtmlStyled(twoSections, collapsible());
    expect(html).toContain(
      '<table class="appx-spec-table__table" role="table" aria-label="Aircraft">',
    );
    expect(html).toContain(
      '<table class="appx-spec-table__table" role="table" aria-label="Camera">',
    );
  });

  it("escapes the section title in BOTH the summary and the aria-label", () => {
    const html = renderSpecTableHtmlStyled(
      [
        sectionRow({ id: "s1", label: 'A & "B"' }),
        dataRow([text("x")], { id: "d1", label: "L" }),
      ],
      collapsible(),
    );
    expect(html).toContain(
      '<summary class="appx-spec-table__section-summary">A &amp; &quot;B&quot;</summary>',
    );
    expect(html).toContain('aria-label="A &amp; &quot;B&quot;"');
    expect(html).not.toContain('aria-label="A & "B""');
  });

  // --- the four locked edge cases (§2 of the feature doc) ---------------------

  it("edge 1 · rows before the first section render in a leading bare table", () => {
    const html = renderSpecTableHtmlStyled(
      [
        dataRow([text("Acme")], { id: "d0", label: "Brand" }),
        sectionRow({ id: "s1", label: "Aircraft" }),
        dataRow([text("249 g")], { id: "d1", label: "Weight" }),
      ],
      collapsible(),
    );
    // The leading table comes FIRST and is not inside a <details> — inventing an
    // "Ungrouped" summary would put words on the storefront nobody wrote.
    const lead = html.slice(0, html.indexOf("<details"));
    expect(lead).toContain(
      '<table class="appx-spec-table__table" role="table"><tbody role="rowgroup">',
    );
    expect(lead).toContain("Brand");
    expect(lead).toContain("</tbody></table>");
    expect(lead).not.toContain("<summary");
    // ...and the leading table has no aria-label (there is no section to name).
    expect(lead).not.toContain("aria-label");
    expect(detailsOpenings(html)).toHaveLength(1);
  });

  it("edge 1b · no leading table is emitted when the first row IS a section", () => {
    const html = renderSpecTableHtmlStyled(twoSections, collapsible());
    expect(html.indexOf("<details")).toBe(
      '<div class="appx-spec-table '.length +
        stylingToModifierClasses(collapsible()).join(" ").length +
        '">'.length,
    );
  });

  it("edge 2 · a template with NO section headers degrades to the single-table shape", () => {
    const rowsOnly = [
      dataRow([text("249 g")], { id: "d1", label: "Weight" }),
      dataRow([text("34 min")], { id: "d2", label: "Flight time" }),
    ];
    const on = renderSpecTableHtmlStyled(rowsOnly, collapsible());
    const off = renderSpecTableHtmlStyled(
      rowsOnly,
      collapsible({ sectionsCollapsible: false }),
    );
    expect(on).not.toContain("<details");
    // Identical but for the wrapper's presence flag — the class stays (it IS a
    // presence flag) and the CSS tolerates it with nothing to act on.
    expect(on.replace(" appx-spec-table--collapsible", "")).toBe(off);
  });

  it("edge 3 · a section whose rows are all hidden renders as an empty collapsible", () => {
    // No new emptiness logic: it renders exactly as a lone section-header row
    // does in the OFF shape. Skipping it here would beg to change the OFF path.
    const html = renderSpecTableHtmlStyled(
      [
        sectionRow({ id: "s1", label: "Aircraft" }),
        dataRow([text("   ")], {
          id: "d1",
          label: "Weight",
          hideWhenEmpty: true,
        }),
        sectionRow({ id: "s2", label: "Camera" }),
        dataRow([text("48 MP")], { id: "d2", label: "Photo" }),
      ],
      collapsible(),
    );
    expect(detailsOpenings(html)).toHaveLength(2);
    expect(html).toContain(
      '<table class="appx-spec-table__table" role="table" aria-label="Aircraft"><tbody role="rowgroup"></tbody></table>',
    );
    expect(html).not.toContain("Weight");
    expect(html).toContain("Photo");
  });

  it("edge 4 · sectionsInitialState is inert while collapsible is OFF", () => {
    // Stored but ignored: the markup must not react to it at all.
    const base = renderSpecTableHtmlStyled(twoSections, DEFAULT_STYLING_VALUES);
    for (const state of ["ALL_OPEN", "FIRST_OPEN", "ALL_CLOSED"] as const) {
      expect(
        renderSpecTableHtmlStyled(twoSections, {
          ...DEFAULT_STYLING_VALUES,
          sectionsInitialState: state,
        }),
      ).toBe(base);
    }
  });

  it("keeps the hideWhenEmpty gate identical across both shapes", () => {
    // One shared row renderer, so the gate cannot differ — pinned here because a
    // future refactor could easily duplicate it.
    const rows: EditorRow[] = [
      sectionRow({ id: "s1", label: "Aircraft" }),
      dataRow([text("  ")], { id: "d1", hideWhenEmpty: true, label: "Gone" }),
      dataRow([text("")], { id: "d2", hideWhenEmpty: false, label: "Kept" }),
    ];
    for (const styling of [DEFAULT_STYLING_VALUES, collapsible()]) {
      const html = renderSpecTableHtmlStyled(rows, styling);
      expect(html).not.toContain("Gone");
      expect(html).toContain("Kept");
    }
  });

  it("composes with the other knobs without special-casing (totality)", () => {
    // Collapsible is orthogonal to every other knob: the wrapper still carries
    // the full mapping output, unchanged.
    const styling = collapsible({
      sectionHeaderStyle: "TEXT_ONLY",
      density: "COMPACT",
      rowDividerStyle: "STRIPES",
    });
    const html = renderSpecTableHtmlStyled(twoSections, styling);
    for (const cls of stylingToModifierClasses(styling)) {
      expect(html).toContain(cls);
    }
  });

  it("renders through the preview document, empty state untouched", () => {
    const doc = renderSpecTablePreviewDocumentStyled(
      twoSections,
      collapsible(),
    );
    // Match the OPENING TAG, not the bare word: the document inlines the
    // stylesheet, whose Step 9a comment legitimately mentions <details>.
    expect(doc).toContain('<details class="appx-spec-table__section-group"');
    // Zero rows still yields the preview-only empty state, not a stray <details>.
    const empty = renderSpecTablePreviewDocumentStyled([], collapsible());
    expect(empty).toContain('<div class="appx-spec-table-preview-empty">');
    expect(empty).not.toContain(
      '<details class="appx-spec-table__section-group"',
    );
  });

  it('returns "" for zero rows regardless of the flag', () => {
    expect(renderSpecTableHtmlStyled([], collapsible())).toBe("");
  });
});
