// Feature 88 · step 90 — guards on the canned gallery sample.
//
// The sample is fixture data, so the temptation is to test it by echoing its own
// shape back ("it has 9 rows"). That would pin a number nobody cares about while
// leaving the properties that actually matter unguarded. Every assertion below
// instead states a reason a SMALLER or SLOPPIER sample would make a merchant-
// facing card lie about the pattern it names.
import { describe, expect, it } from "vitest";
import { parseRows } from "../../utils/rowsSerialize";
import { STYLE_PRESETS, stylePresetValues } from "../../utils/stylePresets";
import { renderSpecTablePreviewDocument } from "../app.templates_.$id/specTablePreviewHtml";
import { STYLE_PREVIEW_SAMPLE_ROWS } from "./sampleRows";

// The count the GRID guard needs. Two of the five patterns are distinguished by
// how rows FLOW, and a flow needs things to flow: with fewer than this the
// Multi-column card renders a single column at any width and advertises a
// layout the preset does not produce.
const MIN_DATA_ROWS_FOR_FLOW = 6;

// Every data row renders exactly one `scope="row"` label cell (`renderDataRow`),
// which is what makes this a count of RENDERED rows rather than of array
// entries — a row silently dropped by its `hideWhenEmpty` gate would not be
// counted here, and should not be.
function renderedDataRowCount(html: string): number {
  return html.split('scope="row"').length - 1;
}

describe("the canned sample", () => {
  it("is a valid rows array by the shared parser, not merely a lookalike", () => {
    // `parseRows` drops anything it cannot make sense of, so a fixture that
    // survives it unchanged is one the real persistence path would accept.
    expect(parseRows(STYLE_PREVIEW_SAMPLE_ROWS)).toEqual(
      STYLE_PREVIEW_SAMPLE_ROWS,
    );
  });

  it("carries at least TWO section headers — the axis three cards differ on", () => {
    // Section-header treatment separates Banded (a band), Simple / Minimal /
    // Multi-column (a plain title) and Accordion (a clickable rule). One header
    // shows the treatment but gives nothing to compare it against; none makes
    // the axis invisible and three of the six cards indistinguishable.
    const sections = STYLE_PREVIEW_SAMPLE_ROWS.filter(
      (row) => row.rowType === "SECTION_HEADER",
    );
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it("carries enough data rows for GRID to have something to flow", () => {
    const dataRows = STYLE_PREVIEW_SAMPLE_ROWS.filter(
      (row) => row.rowType === "DATA",
    );
    expect(dataRows.length).toBeGreaterThanOrEqual(MIN_DATA_ROWS_FOR_FLOW);
  });

  it("has a long-ish value, so wrapping can differ between layouts", () => {
    // Feature 85: narrower tracks wrap long values more, so the multi-column
    // layout is SHORTER than the two-column one. All-short values flatten that
    // difference away and the cards stop looking different from each other.
    const longest = Math.max(
      ...STYLE_PREVIEW_SAMPLE_ROWS.map((row) =>
        row.rowType === "DATA"
          ? row.valueParts.reduce(
              (total, part) => total + (part.type === "TEXT" ? part.text : ""),
              "",
            ).length
          : 0,
      ),
    );
    expect(longest).toBeGreaterThanOrEqual(30);
  });

  it("has unique ids that are STABLE across imports", async () => {
    const ids = STYLE_PREVIEW_SAMPLE_ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);

    // A `newRowId()` leak would mint fresh UUIDs per module evaluation. Vitest
    // caches the module, so compare against a literal snapshot of the ids rather
    // than a second import — the literal is what a UUID could never match.
    expect(ids.every((id) => id.startsWith("sample-"))).toBe(true);
    const reimported = await import("./sampleRows");
    expect(reimported.STYLE_PREVIEW_SAMPLE_ROWS.map((row) => row.id)).toEqual(
      ids,
    );
  });
});

describe("the sample through the preview pipeline", () => {
  const documents = STYLE_PRESETS.map((preset) => ({
    preset,
    html: renderSpecTablePreviewDocument(
      STYLE_PREVIEW_SAMPLE_ROWS,
      stylePresetValues(preset),
    ),
  }));

  it("renders for every preset without throwing, and never empty", () => {
    for (const { preset, html } of documents) {
      // The empty state is what a sample that failed every `hideWhenEmpty` gate
      // would produce — a card showing "nothing to preview" is the specific
      // silent failure this catches.
      //
      // Matched on the `class="…"` ATTRIBUTE, not the bare class name: the
      // empty state's CSS rule is inlined into every document, so the bare name
      // is present even when the table renders perfectly.
      expect(html, preset.id).not.toContain(
        'class="appx-spec-table-preview-empty"',
      );
      expect(renderedDataRowCount(html), preset.id).toBeGreaterThanOrEqual(
        MIN_DATA_ROWS_FOR_FLOW,
      );
    }
  });

  it("does NOT render all five identically", () => {
    // The cheapest possible proof that a bundle reaches the rendered markup at
    // all. If seeding ever broke, five cards would render the same table under
    // five different names and no other test here would notice.
    const distinct = new Set(documents.map(({ html }) => html));
    expect(distinct.size).toBe(STYLE_PRESETS.length);
  });

  it("🔴 gives Multi-column a grid AND enough rows to flow into it", () => {
    const grid = documents.find(({ preset }) => preset.id === "multi-column");
    const html = grid?.html ?? "";

    // Two assertions, and the second is the one that matters. The class is
    // emitted from `styling` alone, so it would appear on a two-row sample just
    // as readily — a class check by itself cannot see that the card is showing a
    // single column. The rendered-row count is what makes "multi-column" true of
    // the picture rather than only of the stylesheet.
    expect(html).toContain("appx-spec-table--layout-grid");
    expect(renderedDataRowCount(html)).toBeGreaterThanOrEqual(
      MIN_DATA_ROWS_FOR_FLOW,
    );
  });
});
