// Feature 49 · Step 2 — pure storefront-markup renderer for the device previews.
//
// `renderSpecTableHtml(rows)` turns the editor's working `EditorRow[]` into the
// SAME HTML string the storefront emits (`extensions/product-specs-table/
// blocks/spec_table.liquid` + `snippets/spec-table-value.liquid`) so a later step
// can drop it into a sandboxed <iframe> and have the shared `spec-table.css`
// style it with zero drift. Liquid and TS can't share code, so this is a
// hand-mirrored contract — keep the class names + structure below identical to
// the Liquid, and mirror the whole-cell `hideWhenEmpty` gate exactly.
//
// The ONE intentional divergence: dynamic parts (SHOPIFY_FIELD / METAFIELD) have
// no product context in the admin, so instead of a resolved product value they
// render as an inert labeled pill (via the editor's own `tokenLabels`, so the
// pill text matches the editor). Its emptiness is therefore unknowable here, so
// a cell containing any dynamic pill always renders. There is also NO `ACTIVE`
// status gate — this is a design preview of the working draft, not the live
// storefront.
//
// Framework-free and pure on purpose (imports only the row types + the pure
// `tokenLabels`), so the whole fidelity contract is exhaustively unit-testable in
// the Node vitest env. Wired to no UI at Step 2; Step 3 feeds its output into the
// iframe `srcDoc`.

import type { EditorRow, ValuePart } from "../../utils/rows";
import { tokenLabels } from "../../utils/valueDom";
import { PREVIEW_DOCUMENT_STYLES } from "./previewStyles";

// Preview-only class for the inert dynamic-field pill. The storefront CSS has no
// such selector (it resolves dynamic parts to plain text), so this never collides
// with the shared stylesheet Step 4 loads; the pill's visual styling lands in a
// preview-scoped rule at Step 4/7. Step 2 fixes only the markup (class + title).
const PILL_CLASS = "appx-spec-table__dynamic-pill";

// Mirror Liquid's `| escape` filter (`& < > " '` → entities). The repo has no
// shared HTML-escape helper, so the renderer supplies this small pure one and
// applies it to every author-derived string (labels, TEXT, pill text + title).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The value-cell HTML for one DATA row, mirroring `spec-table-value.liquid`:
// TEXT escaped (author whitespace preserved), LINE_BREAK → <br>, dynamic → an
// inert labeled pill. Part order is preserved.
function renderValueCell(parts: ValuePart[]): string {
  let html = "";
  for (const part of parts) {
    switch (part.type) {
      case "TEXT":
        html += escapeHtml(part.text);
        break;
      case "LINE_BREAK":
        html += "<br>";
        break;
      case "SHOPIFY_FIELD":
      case "METAFIELD": {
        const { text, title } = tokenLabels(part);
        html += `<span class="${PILL_CLASS}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
        break;
      }
    }
  }
  return html;
}

// The gate input, mirroring the storefront's `cell | strip_html | strip`: the
// cell's visible text with tags dropped. `strip_html` removes the `<br>`s (so a
// LINE_BREAK-only cell counts as empty) and would keep a pill's inner text, so a
// dynamic pill's label counts as content — which is why any cell with a pill
// always survives the hideWhenEmpty gate.
function cellPlainText(parts: ValuePart[]): string {
  let text = "";
  for (const part of parts) {
    if (part.type === "TEXT") {
      text += part.text;
    } else if (part.type === "SHOPIFY_FIELD" || part.type === "METAFIELD") {
      text += tokenLabels(part).text;
    }
    // LINE_BREAK contributes nothing (strip_html drops the <br>).
  }
  return text.trim();
}

/**
 * Render `rows` to the storefront's spec-table HTML string.
 *
 * Empty array → `""` (the storefront renders nothing without rows). Otherwise the
 * rows are wrapped in `<div class="appx-spec-table"><table
 * class="appx-spec-table__table"><tbody>…` in array order:
 *   - SECTION_HEADER → a full-width `<th colspan="2" scope="colgroup">` row,
 *     always rendered (no hideWhenEmpty gate on sections, mirroring the block).
 *   - DATA → a label `<th scope="row">` + value `<td>`, subject to the whole-cell
 *     hideWhenEmpty gate: the row is skipped when `hideWhenEmpty` is set AND the
 *     cell's visible text (TEXT + pill labels; `<br>` ignored) is all-whitespace.
 *
 * No ACTIVE-status gate and no `block.shopify_attributes` (storefront-only).
 */
export function renderSpecTableHtml(rows: EditorRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  let body = "";
  for (const row of rows) {
    if (row.rowType === "SECTION_HEADER") {
      body += `<tr class="appx-spec-table__section-row"><th class="appx-spec-table__section" colspan="2" scope="colgroup">${escapeHtml(row.label)}</th></tr>`;
      continue;
    }
    // Whole-cell hideWhenEmpty gate (mirrors `unless row.hideWhenEmpty and
    // cell_plain == blank`). A cell with any dynamic pill never reads blank here.
    if (row.hideWhenEmpty && cellPlainText(row.valueParts) === "") {
      continue;
    }
    const cell = renderValueCell(row.valueParts);
    body += `<tr class="appx-spec-table__row"><th class="appx-spec-table__label" scope="row">${escapeHtml(row.label)}</th><td class="appx-spec-table__value">${cell}</td></tr>`;
  }

  return `<div class="appx-spec-table"><table class="appx-spec-table__table"><tbody>${body}</tbody></table></div>`;
}

/**
 * Wrap `renderSpecTableHtml(rows)` in a minimal, complete HTML document suitable
 * for an iframe `srcDoc` — a `<!doctype html>` shell with `<meta charset>` +
 * responsive viewport and the rendered rows in the `<body>`.
 *
 * The shared storefront `spec-table.css` (plus a minimal preview-page ambient) is
 * inlined as a `<style>` in the `<head>` from its single source of truth
 * (`PREVIEW_DOCUMENT_STYLES`), so the preview is styled by the same bytes the
 * storefront ships — inlined rather than `<link>`ed because the sandboxed,
 * opaque-origin `srcDoc` frame has no reliable URL to the CDN-served asset. Pure
 * and framework-free (string in, string out) so the whole HTML contract stays
 * Node-unit-testable; the component just drops the return value into `srcDoc`.
 */
export function renderSpecTablePreviewDocument(rows: EditorRow[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spec table preview</title><style>${PREVIEW_DOCUMENT_STYLES}</style></head><body>${renderSpecTableHtml(rows)}</body></html>`;
}
