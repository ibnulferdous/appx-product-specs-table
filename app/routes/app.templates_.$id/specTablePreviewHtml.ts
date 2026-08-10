// Feature 49 · Step 2 — pure storefront-markup renderer for the device previews.
//
// `renderSpecTableHtml(rows)` turns the editor's working `EditorRow[]` into the SAME HTML string the
// storefront emits (`extensions/product-specs-table/blocks/spec_table.liquid` +
// `snippets/spec-table-value.liquid`) so a later step can drop it into a sandboxed <iframe> and have
// the shared `spec-table.css` style it with zero drift. Liquid and TS can't share code, so this is a
// HAND-MIRRORED contract — keep the class names + structure below identical to the Liquid, and mirror
// the whole-cell `hideWhenEmpty` gate exactly.
//
// The ONE intentional divergence: dynamic parts (SHOPIFY_FIELD / METAFIELD) have no product context
// in the admin, so they render as an inert labeled pill (via `tokenLabels`, so the pill text matches
// the editor). Its emptiness is unknowable here, so a cell with any dynamic pill always renders.
// There is also NO `ACTIVE` status gate — this is a design preview of the working draft.
//
// Framework-free and pure (imports only the row types + `tokenLabels`), so the fidelity contract is
// exhaustively unit-testable in the Node vitest env.
//
// Feature 57 · Step 6 — the renderer also carries STYLING. Both entry points take a resolved
// `StylingValues` and consume the Step 2 mapping verbatim: modifier classes land on the wrapper
// (Step 3's rules are compound selectors on the block), nullable colors/typography land as CSS
// custom properties. Keep in lockstep with `spec_table.liquid` (Step 7) or preview and storefront drift.
//
// Feature 74 — content-free tables render NOTHING, here and on the storefront. Two render-time gates,
// mirrored verbatim in `spec_table.liquid`:
//   R1  a SECTION_HEADER whose label is blank after trimming is skipped (an empty one paints a bare band).
//   R2  if no row survives its gate, `renderSpecTableHtml` returns "" — no wrapper, no empty table.
// Structured to mirror the Liquid (build the body, flag as you go, decide the wrapper after) rather
// than the shortcut TS could afford — two renderers that disagree in SHAPE drift.
//
// Feature 57 · Step 9a — the renderer has TWO markup shapes. The OFF path (default) is byte-identical
// to what shipped before — one table, section headers as `<tr><th colspan="2">`; the ON path emits
// one `<details>` per section, each wrapping its own `<table>`. Structural drift is worse than colour
// drift, so `spec_table.liquid` grows the identical branch in the same commit.

import type { DataRow, EditorRow, ValuePart } from "../../utils/rows";
import type { StylingValues } from "../../utils/tableStyling";
import {
  formatCssVarDeclarations,
  stylingToCssVars,
  stylingToModifierClasses,
} from "../../utils/tableStylingCss";
import { tokenLabels } from "../../utils/tokenLabels";
import { PREVIEW_DOCUMENT_STYLES } from "./previewStyles";
import { PREVIEW_HEIGHT_BRIDGE_SCRIPT } from "./previewBridge";

// Strict CSP for the preview document (Step 6). Since the frame gets `allow-scripts`, this bounds it:
// `default-src 'none'` forbids all network egress, and only our own inline <style> + inline shim may
// run. So even if the Step 2 escaping ever failed, injected markup could neither load, exec, nor
// request anything. Placed before the <style>/<script> it governs.
const PREVIEW_CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`;

// Preview-ONLY empty state (Step 7). The storefront renders nothing for an empty template
// (`renderSpecTableHtml` → ""), which in the preview reads as a blank/broken frame. Substituted for
// the body whenever that fragment is "" — since feature 74 that covers every content-free case the
// storefront is silent for. Lives at the document level, never in `renderSpecTableHtml`, so
// storefront fidelity is unchanged.
const PREVIEW_EMPTY_STATE_HTML = `<div class="appx-spec-table-preview-empty"><p>No spec rows to preview yet — rows with content appear here as they&#39;d render on your storefront.</p></div>`;

// Preview-only class for the inert dynamic-field pill. The storefront CSS has no such selector (it
// resolves dynamic parts to plain text), so this never collides with the shared stylesheet.
const PILL_CLASS = "appx-spec-table__dynamic-pill";

// Mirror Liquid's `| escape` (`& < > " '` → entities). No shared HTML-escape helper in the repo, so
// this small pure one applies to every author-derived string (labels, TEXT, pill text + title).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The value-cell HTML for one DATA row, mirroring `spec-table-value.liquid`: TEXT escaped (whitespace
// preserved), LINE_BREAK → <br>, dynamic → an inert labeled pill. Part order preserved.
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

// The gate input, mirroring the storefront's `cell | strip_html | strip`: visible text, tags dropped.
// `strip_html` removes the <br>s (a LINE_BREAK-only cell counts as empty) and keeps a pill's inner
// text (a dynamic pill's label counts as content) — which is why any cell with a pill always survives.
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

// One DATA row's `<tr>`, or "" when the whole-cell hideWhenEmpty gate skips it. Shared by both markup
// shapes so the gate can never differ.
//
// The explicit ARIA roles (feature 70) exist because the stacked layouts apply `display: block`,
// stripping the browser's implicit table semantics; roles are immune to `display`. Unconditional
// because the mobile stacked rule is a media query no server-side renderer can see. HAND-MIRRORED with
// `spec_table.liquid` (full reasoning in its header), so the role sets must move together;
// `specTableAriaContract.test.ts` enforces completeness + parity.
function renderDataRow(row: DataRow): string {
  if (row.hideWhenEmpty && cellPlainText(row.valueParts) === "") {
    return "";
  }
  const cell = renderValueCell(row.valueParts);
  return `<tr class="appx-spec-table__row" role="row"><th class="appx-spec-table__label" scope="row" role="rowheader">${escapeHtml(row.label)}</th><td class="appx-spec-table__value" role="cell">${cell}</td></tr>`;
}

// What a body builder reports back: the markup, plus whether ANYTHING rendered (feature 74 · R2). The
// flag isn't derivable from `html` by sniffing — the flat shape always carries its eagerly-opened
// `<table><tbody>`, and a named-but-empty collapsible section legitimately produces a `<details>` with
// no `<tr>`. Mirrors Liquid's `has_content`.
type RenderedBody = { html: string; hasContent: boolean };

// The OFF shape (default): one table, one tbody, section headers as full-width `<tr>`s. The markup
// that shipped before Step 9a — must stay byte-identical (every existing template renders through here).
function renderSingleTableBody(rows: EditorRow[]): RenderedBody {
  let body = "";
  let hasContent = false;
  for (const row of rows) {
    if (row.rowType === "SECTION_HEADER") {
      // R1 — tested trimmed, emitted untrimmed. A skipped header just vanishes; the rows that followed
      // continue in the same open table, which is what "no section header" means.
      if (row.label.trim() === "") continue;
      body += `<tr class="appx-spec-table__section-row" role="row"><th class="appx-spec-table__section" colspan="2" scope="colgroup" role="columnheader" aria-colspan="2">${escapeHtml(row.label)}</th></tr>`;
      hasContent = true;
      continue;
    }
    const tr = renderDataRow(row);
    if (tr !== "") hasContent = true;
    body += tr;
  }
  return {
    html: `<table class="appx-spec-table__table" role="table"><tbody role="rowgroup">${body}</tbody></table>`,
    hasContent,
  };
}

// The ON shape: one `<details>` per section header, each wrapping its own `<table>`. Four edge cases
// decided in the feature doc (§2) and encoded here:
//  - Rows BEFORE the first section header render in a leading bare `<table>` with no `<details>` —
//    there is no section to name, and an "Ungrouped" summary would put unwritten words on the
//    storefront. Opens lazily, so no leading rows → no empty table.
//  - A section whose rows are ALL hidden still renders as an empty collapsible — as it renders as a
//    lone section-header row in the OFF shape. No new emptiness logic.
//  - A template with NO section headers never reaches here (see the caller).
//  - `sectionsInitialState` is the `open` ATTRIBUTE, never a class (a standing test enforces this).
//
// Each per-section table gets an `aria-label` carrying the section title: the split costs each table
// its `<th scope="colgroup">` heading, and a screen reader meeting six unnamed tables is a regression.
function renderCollapsibleBody(
  rows: EditorRow[],
  initialState: StylingValues["sectionsInitialState"],
): RenderedBody {
  let html = "";
  let hasContent = false;
  let tableOpen = false;
  let detailsOpen = false;
  let sectionIndex = 0;

  const closeTable = () => {
    if (tableOpen) {
      html += "</tbody></table>";
      tableOpen = false;
    }
  };
  const closeDetails = () => {
    if (detailsOpen) {
      html += "</details>";
      detailsOpen = false;
    }
  };

  for (const row of rows) {
    if (row.rowType === "SECTION_HEADER") {
      // R1. A blank header still CLOSES the open group before vanishing — without the close, the rows
      // that followed would be filed under the PREVIOUS section, worse than the band it removes. They
      // fall through to the lazy-open branch and land in a fresh bare unnamed table, like rows before
      // the first section header. `sectionIndex` is NOT incremented: a skipped section is not a
      // section, so FIRST_OPEN still opens the first REAL one.
      closeTable();
      closeDetails();
      if (row.label.trim() === "") continue;
      const open =
        initialState === "ALL_OPEN" ||
        (initialState === "FIRST_OPEN" && sectionIndex === 0);
      const label = escapeHtml(row.label);
      html += `<details class="appx-spec-table__section-group"${open ? " open" : ""}><summary class="appx-spec-table__section-summary">${label}</summary><table class="appx-spec-table__table" role="table" aria-label="${label}"><tbody role="rowgroup">`;
      detailsOpen = true;
      tableOpen = true;
      sectionIndex += 1;
      hasContent = true;
      continue;
    }
    const tr = renderDataRow(row);
    if (tr === "") continue;
    if (!tableOpen) {
      // Leading rows before the first section header — a bare table, no <details>.
      html += `<table class="appx-spec-table__table" role="table"><tbody role="rowgroup">`;
      tableOpen = true;
    }
    html += tr;
    hasContent = true;
  }

  closeTable();
  closeDetails();
  return { html, hasContent };
}

/**
 * Render `rows` to the storefront's spec-table HTML string, styled by `styling`.
 *
 * No RENDERABLE CONTENT → `""` (feature 74 · R2) — an empty array, or a rows array none of whose rows
 * survives its gate (the editor's starter scaffold: one blank section header + five empty rows).
 * Never an empty wrapper or table; the storefront is silent in the same cases. Otherwise the rows are
 * wrapped in `<div class="appx-spec-table <modifiers>"><table><tbody>…` in array order:
 *   - SECTION_HEADER → a full-width `<th colspan="2" scope="colgroup">` row, unless its label is blank
 *     after trimming (R1). No `hideWhenEmpty` gate on sections.
 *   - DATA → a label `<th scope="row">` + value `<td>`, skipped when `hideWhenEmpty` is set AND the
 *     cell's visible text (TEXT + pill labels; `<br>` ignored) is all-whitespace.
 *
 * The wrapper's class list is `appx-spec-table` plus every modifier class the Step 2 mapping derives
 * from `styling` (defaults included — a total function of the value, keeping every knob's rules at
 * equal specificity). `styling` is REQUIRED: a caller without one has a bug upstream, and defaulting
 * here would silently re-invent `DEFAULT_STYLING_VALUES` at each call site.
 *
 * Step 9a: when `styling.sectionsCollapsible` is true AND the template has at least one section
 * header, the body becomes one `<details>` per section (see `renderCollapsibleBody`). Otherwise the
 * single-table shape is emitted byte-identically to pre-Step-9a.
 *
 * No ACTIVE-status gate and no `block.shopify_attributes` (storefront-only).
 */
export function renderSpecTableHtml(
  rows: EditorRow[],
  styling: StylingValues,
): string {
  if (rows.length === 0) {
    return "";
  }

  // Collapsible is meaningless without sections, so a template with none DEGRADES to the single-table
  // shape. The `--collapsible` class may still sit on the wrapper (a presence flag the CSS tolerates).
  // Counted BEFORE R1, mirroring Liquid's `where: "rowType", "SECTION_HEADER"` (which also counts
  // blank ones), so a template whose only section is blank stays on the collapsible path and emits no
  // `<details>` — every row lands in the leading bare table.
  const hasSections = rows.some((row) => row.rowType === "SECTION_HEADER");
  const body =
    styling.sectionsCollapsible && hasSections
      ? renderCollapsibleBody(rows, styling.sectionsInitialState)
      : renderSingleTableBody(rows);

  // R2 — nothing survived its gate, so emit nothing at all.
  if (!body.hasContent) {
    return "";
  }

  // Modifier classes come straight from the Step 2 mapping — no class-name literals here, so adding a
  // knob never touches this file.
  const wrapperClass = ["appx-spec-table", ...stylingToModifierClasses(styling)]
    .join(" ")
    .trim();
  return `<div class="${wrapperClass}">${body.html}</div>`;
}

// The styling custom properties as their own `<style>` block (Step 6). Declared ON the block
// (`.appx-spec-table`) rather than `:root` so the vars inherit down to `__table`, where Step 3's
// typography rules read them — the placement that makes an `em` font-size multiply the theme base
// exactly once. Follows the shared stylesheet so an override wins at equal specificity.
//
// Emitted UNCONDITIONALLY, empty rule body included (an all-inherit value yields no declarations).
// The preview uses a <style> block; Step 7's Liquid uses an inline `style` attribute on the same
// element. Both join via `formatCssVarDeclarations`, so the two can't drift on the declaration text.
// No escaping: `parseStylingValues` is the trust boundary and the mapping only accepts an
// already-parsed `StylingValues`.
function stylingVarStyleBlock(styling: StylingValues): string {
  const declarations = formatCssVarDeclarations(stylingToCssVars(styling));
  return `<style>.appx-spec-table { ${declarations} }</style>`;
}

/**
 * Wrap `renderSpecTableHtml(rows, styling)` in a minimal, complete HTML document for an iframe
 * `srcDoc` — a `<!doctype html>` shell with `<meta charset>` + responsive viewport and the rendered
 * rows in the `<body>`.
 *
 * The shared storefront `spec-table.css` (plus a minimal preview ambient) is inlined as a `<style>`
 * from its single source of truth (`PREVIEW_DOCUMENT_STYLES`), so the preview is styled by the same
 * bytes the storefront ships — inlined rather than `<link>`ed because the sandboxed opaque-origin
 * `srcDoc` frame has no reliable URL to the CDN asset. The strict CSP meta leads the `<head>` and the
 * height-measurement shim trails the `<body>` — both view-independent, so the document is
 * byte-identical across the three device views (Step 5 changes only the iframe's outer width), which
 * is why a device-toggle doesn't reload the frame. Pure and framework-free.
 *
 * Step 6 adds a SECOND `<style>` carrying the styling custom properties. The document is now a
 * function of `(rows, styling)` and nothing else — still view-independent, so the toggle doesn't
 * reload the frame, while a styling change legitimately produces a new document.
 */
export function renderSpecTablePreviewDocument(
  rows: EditorRow[],
  styling: StylingValues,
): string {
  // Nothing to preview → the preview-only empty state instead of a blank body (Step 7). The emptiness
  // DECISION lives upstream in `renderSpecTableHtml` (R2); this is a plain identity test on its "" contract.
  //
  // Do NOT "simplify" this back to sniffing for `"<tr"` (what it did before feature 74). That test was
  // WRONG in one case: a collapsible template with a named-but-empty section renders a `<details>`
  // carrying no `<tr>` — legitimate output — so the preview showed the empty state while the storefront
  // showed the disclosure.
  const fragment = renderSpecTableHtml(rows, styling);
  const body = fragment === "" ? PREVIEW_EMPTY_STATE_HTML : fragment;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${PREVIEW_CSP_META}<meta name="viewport" content="width=device-width, initial-scale=1"><title>Spec table preview</title><style>${PREVIEW_DOCUMENT_STYLES}</style>${stylingVarStyleBlock(styling)}</head><body>${body}${PREVIEW_HEIGHT_BRIDGE_SCRIPT}</body></html>`;
}
