import { describe, expect, it } from "vitest";
import type { DataRow, SectionHeaderRow, ValuePart } from "../../utils/rows";
import {
  renderSpecTableHtml,
  renderSpecTablePreviewDocument,
} from "./specTablePreviewHtml";

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

  it("carries the rendered rows fragment in the body", () => {
    const rows = [sectionRow({ label: "Display" }), dataRow([text("6.1 in")])];
    const doc = renderSpecTablePreviewDocument(rows);
    // The body holds the exact renderSpecTableHtml output — same fidelity contract.
    expect(doc).toContain(`<body>${renderSpecTableHtml(rows)}</body>`);
  });

  it("stays a valid, complete document for empty rows (blank body)", () => {
    const doc = renderSpecTablePreviewDocument([]);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    // renderSpecTableHtml([]) is "" → an empty body, no crash, no "undefined".
    expect(doc).toContain("<body></body>");
    expect(doc).not.toContain("undefined");
  });

  it("links no stylesheet yet (Step 3 is intentionally unstyled)", () => {
    const doc = renderSpecTablePreviewDocument([dataRow([text("x")])]);
    expect(doc).not.toContain("spec-table.css");
    expect(doc).not.toContain("<link");
    expect(doc).not.toContain("<style");
  });
});
