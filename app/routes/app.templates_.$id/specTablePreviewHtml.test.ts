import { describe, expect, it } from "vitest";
import type { DataRow, SectionHeaderRow, ValuePart } from "../../utils/rows";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  renderSpecTableHtml,
  renderSpecTablePreviewDocument,
} from "./specTablePreviewHtml";
import { PREVIEW_DOCUMENT_STYLES, SPEC_TABLE_CSS } from "./previewStyles";
import {
  PREVIEW_HEIGHT_BRIDGE_SCRIPT,
  PREVIEW_HEIGHT_MESSAGE_TYPE,
} from "./previewBridge";

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
      '<div class="appx-spec-table"><table class="appx-spec-table__table"><tbody>',
    );
    expect(html).toContain("</tbody></table></div>");
    // No storefront-only bits leak into the preview.
    expect(html).not.toContain("shopify_attributes");
  });

  it("renders a section header row spanning both columns", () => {
    const html = renderSpecTableHtml([sectionRow({ label: "Display" })]);
    expect(html).toContain(
      '<tr class="appx-spec-table__section-row"><th class="appx-spec-table__section" colspan="2" scope="colgroup">Display</th></tr>',
    );
  });

  it("renders a data row as a label th + value td", () => {
    const html = renderSpecTableHtml([
      dataRow([text("6.1 inches")], { label: "Screen" }),
    ]);
    expect(html).toContain(
      '<tr class="appx-spec-table__row"><th class="appx-spec-table__label" scope="row">Screen</th><td class="appx-spec-table__value">6.1 inches</td></tr>',
    );
  });

  it("emits a <br> for a LINE_BREAK part", () => {
    const html = renderSpecTableHtml([
      dataRow([text("line one"), lineBreak, text("line two")]),
    ]);
    expect(html).toContain(
      '<td class="appx-spec-table__value">line one<br>line two</td>',
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
      '<td class="appx-spec-table__value">Up to <span class="appx-spec-table__dynamic-pill" title="custom · battery_life">Metafield · battery_life</span> hours</td>',
    );
  });

  it("escapes HTML metacharacters in labels and TEXT (no raw injection)", () => {
    const html = renderSpecTableHtml([
      dataRow([text(`a < b & c > d " ' <script>`)], {
        label: `Weird & <Label>`,
      }),
    ]);
    expect(html).toContain(
      '<th class="appx-spec-table__label" scope="row">Weird &amp; &lt;Label&gt;</th>',
    );
    expect(html).toContain(
      '<td class="appx-spec-table__value">a &lt; b &amp; c &gt; d &quot; &#39; &lt;script&gt;</td>',
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
        '<div class="appx-spec-table"><table class="appx-spec-table__table"><tbody></tbody></table></div>',
      );
    });

    it("keeps the same empty cell when the flag is off", () => {
      const html = renderSpecTableHtml([
        dataRow([text("")], { label: "Empty", hideWhenEmpty: false }),
      ]);
      expect(html).toContain(
        '<th class="appx-spec-table__label" scope="row">Empty</th>',
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
        '<th class="appx-spec-table__label" scope="row">Vendor</th>',
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
      'colgroup">A</th>',
      ">First</th>",
      ">Second</th>",
      'colgroup">B</th>',
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
    expect(doc).not.toContain("desktop");
    expect(doc).not.toContain("tablet");
    expect(doc).not.toContain("mobile");
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
      '<div class="appx-spec-table"><table class="appx-spec-table__table"><tbody></tbody></table></div>',
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
