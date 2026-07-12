// Feature 49 · Step 4 — the stylesheet payload for the device-preview iframe.
//
// The preview must be styled by the SAME CSS the storefront ships, so its table
// matches the product page exactly. The bytes below are a verbatim mirror of the
// theme app extension's `extensions/product-specs-table/assets/spec-table.css`.
//
// Why a mirror and not a bundler import: importing the extension file across the
// app/extensions boundary (Vite `?raw`) is fragile in the `shopify app dev`
// server — it sits outside `server.fs.allow`, so the dev server blocks the read
// and the editor fails to hydrate. Instead the CSS lives here as a plain string
// (zero dev-server coupling) and a unit test (`specTablePreviewHtml.test.ts`)
// reads the real extension file and asserts it EQUALS `SPEC_TABLE_CSS` — so the
// mirror can never drift silently: change one, the test fails until both match.
// That gives the single-source guarantee without the build-time import.

// Verbatim copy of extensions/product-specs-table/assets/spec-table.css.
// Guarded against drift by the equality test — edit BOTH together (or better,
// edit the extension file and re-copy here to satisfy the test).
export const SPEC_TABLE_CSS = `.appx-spec-table {
  margin-block: 1rem;
}

/* Deliberately minimal for slice 1 — the Style tab / real theming is a later
   slice. Just enough structure to read as a table. */
.appx-spec-table__table {
  width: 100%;
  border-collapse: collapse;
}

.appx-spec-table__row th,
.appx-spec-table__row td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  border-block-end: 1px solid rgba(0, 0, 0, 0.1);
}

.appx-spec-table__label {
  width: 33%;
  font-weight: 600;
}

.appx-spec-table__section {
  padding: 0.75rem;
  text-align: left;
  font-weight: 700;
  border-block-end: 2px solid currentColor;
}
`;

// Minimal, neutral preview-page ambient. The storefront `spec-table.css` styles
// only the TABLE; on a real product page the surrounding theme supplies the font
// and text color. The preview has no theme, so without this base it falls back to
// the browser-default serif — which no real storefront uses and which muddies the
// "does it match the storefront" check. This is deliberately NOT the table's own
// CSS (fidelity, above) and NOT merchant-theme replication (out of feature 49) —
// just the neutral page the table sits on. Kept tiny: a body reset + a system
// sans-serif stack + a neutral ink, no table styling, no accent colors.
const PREVIEW_AMBIENT = `body {
  margin: 0.5rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1a1a1a;
}`;

// The full <style> payload for the preview document: the ambient base first (so
// the storefront rules win any future overlap), then the storefront CSS verbatim.
export const PREVIEW_DOCUMENT_STYLES = `${PREVIEW_AMBIENT}\n${SPEC_TABLE_CSS}`;
