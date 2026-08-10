// The canned sample table every style-preset card previews (feature 88 · step 90; binding spec in
// features/90). ONE generic sample, reused by all five cards. Deliberately not per-category content:
// "Screen size / Battery / Chipset" would be the starter-content idea the merchant rejected, arriving
// through the back door. The card advertises a LAYOUT, so the words carry as little meaning as
// possible while still reading like a real spec table. Colocated with the gallery (presentation
// fixture data — never read outside this route, never persisted).
//
// ⚠️ The SHAPE is load-bearing; a smaller sample would make a card lie about the pattern it names, and
// `sampleRows.test.ts` pins each requirement:
//   - TWO section headers. Header treatment separates three cards (banded / underlined / plain); with
//     one there's nothing to compare, with none the axis is invisible.
//   - SEVEN data rows. `GRID` flows tracks at a minimum column width; too few and Multi-column renders
//     as a single column, showing something the preset doesn't do.
//   - ONE long-ish value. Wrapping is half of what distinguishes the layouts (feature 85); all-short
//     values flatten that difference away.
//   - STATIC ids. `newRowId()` would mint fresh UUIDs every import, changing the markup and defeating
//     memoisation of the five preview documents.

import type { EditorRow } from "../../utils/rows";

/**
 * The sample, as real `EditorRow`s. Typed as `EditorRow[]` rather than inferred so a change to the
 * row contract fails to COMPILE rather than quietly rendering a stale shape into five cards.
 * `hideWhenEmpty` follows the editor's own row-factory defaults so the fixture is plausible; nothing
 * here is empty, so the flag never fires.
 */
export const STYLE_PREVIEW_SAMPLE_ROWS: EditorRow[] = [
  {
    id: "sample-section-overview",
    key: "overview",
    rowType: "SECTION_HEADER",
    label: "Overview",
    hideWhenEmpty: false,
  },
  {
    id: "sample-material",
    key: "material",
    rowType: "DATA",
    label: "Material",
    // The long-ish value. Long enough to wrap in a narrow `GRID` track and stay on one line in a wide
    // two-column row — the difference the Multi-column card advertises.
    valueParts: [
      { type: "TEXT", text: "Anodised aluminium with a brushed finish" },
    ],
    hideWhenEmpty: true,
  },
  {
    id: "sample-dimensions",
    key: "dimensions",
    rowType: "DATA",
    label: "Dimensions",
    valueParts: [{ type: "TEXT", text: "310 × 220 × 16 mm" }],
    hideWhenEmpty: true,
  },
  {
    id: "sample-weight",
    key: "weight",
    rowType: "DATA",
    label: "Weight",
    valueParts: [{ type: "TEXT", text: "1.2 kg" }],
    hideWhenEmpty: true,
  },
  {
    id: "sample-section-details",
    key: "details",
    rowType: "SECTION_HEADER",
    label: "Details",
    hideWhenEmpty: false,
  },
  {
    id: "sample-finish",
    key: "finish",
    rowType: "DATA",
    label: "Finish",
    valueParts: [{ type: "TEXT", text: "Matte" }],
    hideWhenEmpty: true,
  },
  {
    id: "sample-in-the-box",
    key: "in_the_box",
    rowType: "DATA",
    label: "In the box",
    valueParts: [{ type: "TEXT", text: "Unit, cable, quick-start guide" }],
    hideWhenEmpty: true,
  },
  {
    id: "sample-warranty",
    key: "warranty",
    rowType: "DATA",
    label: "Warranty",
    valueParts: [{ type: "TEXT", text: "2 years" }],
    hideWhenEmpty: true,
  },
  {
    id: "sample-origin",
    key: "origin",
    rowType: "DATA",
    label: "Country of origin",
    valueParts: [{ type: "TEXT", text: "Vietnam" }],
    hideWhenEmpty: true,
  },
];
