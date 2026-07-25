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
export const SPEC_TABLE_CSS = `/* Appx — Product Specs Table storefront stylesheet (feature 57, Step 3).

   The Style tab's knobs arrive as CSS custom properties (--appx-spec-*, set
   on the wrapper by later steps) and BEM modifier classes on the
   .appx-spec-table block. This file is DORMANT: no markup sets a property or
   carries a modifier class yet, so every var() resolves to its fallback —
   and each fallback is the exact literal this file shipped with before the
   rewrite, so today's rendering is unchanged.

   Rules of the design:
   - Base rules use var(--appx-spec-*, <previous literal>). An absent var
     means the merchant's theme wins — the zero-config promise.
   - One rule set per modifier member, defaults included, at equal
     specificity (two classes), so no knob needs an importance override or
     wins by accident.
   - Source order is deliberate where two knobs meet on one property: the
     layout rules come AFTER dividers/density so stacked-mode refinements
     layer over whichever divider/density member is active, and the mobile
     media query comes LAST so it beats the desktop layout rules below the
     breakpoint. */

/* --- Container stretch -----------------------------------------------------
   The block must be as wide as the space the theme gives it, NOT as wide as
   its own content.

   Shopify wraps every app block in a div of its own, and a theme section that
   centres its children (Horizon sets align-items: center on a column flex
   container) turns that div into a shrink-to-fit flex item — so the rendered
   width becomes the table's max-content width. Measured live on the dev store:
   one 9-section table rendered 1264px with its sections open and 206px with
   them closed, inside 1438px of available space. Opening a disclosure resized
   the whole table.

   The fix has to land on SHOPIFY's wrapper, not ours. Setting a width on
   .appx-spec-table is a no-op here (verified): a percentage resolves against
   the already-shrunk parent, and a child's percentage does not feed back into
   the parent's intrinsic sizing. :has() is the only way to reach up from a
   stylesheet that ships no markup of its own for that element.

   align-self, NOT width: 100%, and the difference matters. In the column-flex
   case both give the full 1438px, but align-self addresses the CROSS axis — so
   in a theme that lays app blocks out in a ROW it applies to the height and
   leaves the width alone, where width: 100% would make the block fight its
   siblings. Verified both ways. justify-self covers the same case for a grid
   parent; it is inert in flex.

   Deliberately NOT scoped to a modifier class: a table that resizes when a
   shopper opens a section is wrong in every theme, so this is a base rule, not
   a knob. The max-width / alignment knobs layer on top of it. Browsers without
   :has() simply keep the old content-driven behaviour. */
.shopify-app-block:has(> .appx-spec-table) {
  align-self: stretch;
  justify-self: stretch;
}

.appx-spec-table {
  margin-block: 1rem;
}

/* --- Base (each fallback = the pre-Step-3 literal) ------------------------ */

/* Typography vars sit on the table, not the wrapper, so em-based sizes
   multiply the theme's base font exactly once. */
.appx-spec-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--appx-spec-font-size, inherit);
  font-style: var(--appx-spec-font-style, inherit);
  line-height: var(--appx-spec-line-height, inherit);
}

.appx-spec-table__row th,
.appx-spec-table__row td {
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  border-block-end: 1px solid var(--appx-spec-border-color, rgba(0, 0, 0, 0.1));
}

/* The font-weight var is the LABEL-weight knob: the 600 was always a
   label-only literal, so the var lands here, not on the table — value text
   keeps the theme's weight. */
.appx-spec-table__label {
  width: var(--appx-spec-label-width, 33%);
  font-weight: var(--appx-spec-font-weight, 600);
  background: var(--appx-spec-label-bg, transparent);
  color: var(--appx-spec-label-color, inherit);
  text-transform: var(--appx-spec-label-transform, none);
}

.appx-spec-table__value {
  background: var(--appx-spec-value-bg, transparent);
  color: var(--appx-spec-value-color, inherit);
}

.appx-spec-table__section {
  padding: 0.75rem;
  text-align: left;
  font-weight: 700;
  background: var(--appx-spec-header-bg, transparent);
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}

/* --- Section header style ------------------------------------------------- */

/* Banded: the header paints as a real band and the band edge replaces the
   heavy rule. The fallback is a faint neutral so the band reads even before
   a merchant picks a header color. */
.appx-spec-table--section-banded .appx-spec-table__section {
  background: var(--appx-spec-header-bg, rgba(0, 0, 0, 0.06));
  border-block-end: none;
}

.appx-spec-table--section-text-only .appx-spec-table__section {
  background: transparent;
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}

/* --- Collapsible sections (Step 9a) ---------------------------------------
   The ON shape replaces each section-header row with a native disclosure
   wrapping that section's own table, so the summary must inherit the look
   the section-header cell had. The two knobs COMPOSE: a merchant who picked
   "Text only" must not get a band back the moment they enable collapsing,
   so --section-banded and --section-text-only each get a summary variant
   mirroring their section-header rule above.

   A template with the flag but no section headers degrades to the flat
   shape; the class then simply has nothing to act on, which is fine — it is
   a presence flag, not a layout switch. No JavaScript is involved: the
   disclosure element is native, keyboard-operable, and announces its own
   expanded state.

   NOTE: this file is mirrored verbatim into a TS template literal
   (previewStyles.ts) and inlined into the preview document, which unit tests
   scan as a string — so keep comments free of backticks and of literal
   angle-bracket markup. */

.appx-spec-table--collapsible .appx-spec-table__section-summary {
  /* display:list-item keeps the native disclosure marker in browsers that
     drop it otherwise; list-style-position:inside keeps the triangle within
     the padding box, aligned with the section text rather than hanging off
     the edge.

     list-style-type is set EXPLICITLY rather than left to the default, and
     this is not belt-and-braces: themes commonly ship a bare element-level
     summary rule setting list-style to none, to style their own accordions
     (Horizon does), which would otherwise leave our disclosures with no visible
     affordance on the storefront while the theme-less preview still showed
     one — found live on the dev store, 2026-07-19. Our two-class selector
     beats the theme's element selector, so the marker is ours to control. */
  display: list-item;
  list-style-position: inside;
  list-style-type: disclosure-closed;
  cursor: pointer;
  padding: 0.75rem;
  text-align: left;
  font-weight: 700;
  background: var(--appx-spec-header-bg, transparent);
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}

/* The open counterpart, so the marker actually reports state rather than
   sitting on one glyph. Same two-class weight as the rule above plus the
   attribute, so it wins only while the section is open. */
.appx-spec-table--collapsible
  details[open]
  > .appx-spec-table__section-summary {
  list-style-type: disclosure-open;
}

.appx-spec-table--collapsible.appx-spec-table--section-banded
  .appx-spec-table__section-summary {
  background: var(--appx-spec-header-bg, rgba(0, 0, 0, 0.06));
  border-block-end: none;
}

.appx-spec-table--collapsible.appx-spec-table--section-text-only
  .appx-spec-table__section-summary {
  background: transparent;
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}

/* Keyboard users must be able to SEE which summary they are on — <details>
   gives operability for free, but not a visible focus ring in every theme. */
.appx-spec-table--collapsible .appx-spec-table__section-summary:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}

/* --- Row dividers ---------------------------------------------------------- */

.appx-spec-table--dividers-lines .appx-spec-table__label,
.appx-spec-table--dividers-lines .appx-spec-table__value {
  border-block-end: 1px solid var(--appx-spec-border-color, rgba(0, 0, 0, 0.1));
}

.appx-spec-table--dividers-stripes .appx-spec-table__label,
.appx-spec-table--dividers-stripes .appx-spec-table__value {
  border-block-end: none;
}

/* nth-child, not nth-of-type: in the flat shape section-header rows are
   table rows too, and banding must count real rendered rows.

   In the COLLAPSIBLE shape each section owns its own <tbody>, so striping
   RESTARTS at every section. That is deliberate (locked Step 9a): within a
   disclosure, alternation is a within-section reading aid, and continuing a
   global parity across a collapsed boundary would look arbitrary the moment
   a section is closed. Do NOT "fix" this with nth-of-type gymnastics or
   server-computed odd/even classes — that is real complexity bought for a
   look nobody asked for. */
.appx-spec-table--dividers-stripes
  .appx-spec-table__row:nth-child(even)
  .appx-spec-table__label,
.appx-spec-table--dividers-stripes
  .appx-spec-table__row:nth-child(even)
  .appx-spec-table__value {
  background: var(--appx-spec-stripe-bg, rgba(0, 0, 0, 0.04));
}

.appx-spec-table--dividers-none .appx-spec-table__label,
.appx-spec-table--dividers-none .appx-spec-table__value {
  border-block-end: none;
}

/* --- Density (owns row-cell padding and nothing else) --------------------- */

.appx-spec-table--density-default .appx-spec-table__label,
.appx-spec-table--density-default .appx-spec-table__value {
  padding: 0.5rem 0.75rem;
}

.appx-spec-table--density-compact .appx-spec-table__label,
.appx-spec-table--density-compact .appx-spec-table__value {
  padding: 0.25rem 0.75rem;
}

.appx-spec-table--density-spacious .appx-spec-table__label,
.appx-spec-table--density-spacious .appx-spec-table__value {
  padding: 1rem 0.75rem;
}

/* --- Row layout ------------------------------------------------------------
   AFTER dividers/density on purpose (see header): the stacked refinements
   below must layer over the active divider/density member at equal
   specificity via source order. */

.appx-spec-table--layout-two-column .appx-spec-table__table {
  display: table;
}

.appx-spec-table--layout-two-column .appx-spec-table__table tbody {
  display: table-row-group;
}

.appx-spec-table--layout-two-column .appx-spec-table__section-row,
.appx-spec-table--layout-two-column .appx-spec-table__row {
  display: table-row;
}

.appx-spec-table--layout-two-column .appx-spec-table__section,
.appx-spec-table--layout-two-column .appx-spec-table__label,
.appx-spec-table--layout-two-column .appx-spec-table__value {
  display: table-cell;
}

.appx-spec-table--layout-two-column .appx-spec-table__label {
  width: var(--appx-spec-label-width, 33%);
}

/* Stacked: each label sits full-width above its own value. display:block
   removes the implicit table semantics from these elements — a known
   trade-off recorded for Step 12's a11y pass; DOM order still reads as
   label-then-value pairs. */
.appx-spec-table--layout-stacked .appx-spec-table__table,
.appx-spec-table--layout-stacked .appx-spec-table__table tbody,
.appx-spec-table--layout-stacked .appx-spec-table__section-row,
.appx-spec-table--layout-stacked .appx-spec-table__row,
.appx-spec-table--layout-stacked .appx-spec-table__section,
.appx-spec-table--layout-stacked .appx-spec-table__label,
.appx-spec-table--layout-stacked .appx-spec-table__value {
  display: block;
}

/* The label keeps its own padding but drops its divider — the pair must read
   as one unit, so the active divider style lands after the VALUE only. The
   value is pulled toward its label with a longhand padding-block-start,
   which layers over density's earlier shorthand. */
.appx-spec-table--layout-stacked .appx-spec-table__label {
  width: auto;
  border-block-end: none;
}

.appx-spec-table--layout-stacked .appx-spec-table__value {
  padding-block-start: 0.25rem;
}

/* --- Mobile default --------------------------------------------------------
   749px matches Dawn's mobile breakpoint, so the table flips where the
   surrounding theme does — and it puts the editor preview widths on the
   intended sides (mobile 375px stacked; desktop two-column). Scoped entirely
   inside the mobile-stacked modifier and LAST
   in the file so it beats the desktop layout rules at equal specificity.

   appx-spec-table--mobile-same-as-desktop is DELIBERATELY rule-less: "same
   as desktop" means no mobile override exists. Writing rules to undo the
   stacked ones would be a specificity fight with no benefit — do not "fix"
   this by adding them. */
@media (max-width: 749px) {
  .appx-spec-table--mobile-stacked .appx-spec-table__table,
  .appx-spec-table--mobile-stacked .appx-spec-table__table tbody,
  .appx-spec-table--mobile-stacked .appx-spec-table__section-row,
  .appx-spec-table--mobile-stacked .appx-spec-table__row,
  .appx-spec-table--mobile-stacked .appx-spec-table__section,
  .appx-spec-table--mobile-stacked .appx-spec-table__label,
  .appx-spec-table--mobile-stacked .appx-spec-table__value {
    display: block;
  }

  .appx-spec-table--mobile-stacked .appx-spec-table__label {
    width: auto;
    border-block-end: none;
  }

  .appx-spec-table--mobile-stacked .appx-spec-table__value {
    padding-block-start: 0.25rem;
  }
}
`;

// Minimal, neutral preview-page ambient. The storefront `spec-table.css` styles
// only the TABLE; on a real product page the surrounding theme supplies the font
// and text color. The preview has no theme, so without this base it falls back to
// the browser-default serif — which no real storefront uses and which muddies the
// "does it match the storefront" check. This is deliberately NOT the table's own
// CSS (fidelity, above) and NOT merchant-theme replication (out of feature 49) —
// just the neutral page the table sits on. Kept tiny: a body reset + a system
// sans-serif stack + a neutral ink + the page scrollbar, no table styling, no
// accent colors.
//
// The `html` rule is page CHROME, not content (feature 73): once a device mockup
// bounds its screen (Mobile always, Desktop when the table outgrows the viewport),
// the framed document scrolls itself, and a full-width platform scrollbar inside a
// small mockup reads as a UI artifact rather than as part of the previewed page.
// `scrollbar-width` is the standard property (no `::-webkit-scrollbar` fork), it
// degrades to the platform default where unsupported, and it is inert whenever the
// document fits — a short desktop table shows no scrollbar at all. Preview-only,
// like everything in this module: never shipped to the storefront.
const PREVIEW_AMBIENT = `html {
  scrollbar-width: thin;
}

body {
  margin: 0.5rem;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1a1a1a;
}`;

// Preview-ONLY affordances (feature 49, Step 7) — deliberately NOT part of
// `SPEC_TABLE_CSS` (which stays byte-equal to the extension, drift-guarded) and
// NOT shipped to the storefront. On a real product page a dynamic value resolves
// to plain text and an empty template renders nothing; these rules exist only so
// the in-editor preview READS clearly.
//
// - `.appx-spec-table__dynamic-pill` — the inert dynamic-field placeholder (Step 2
//   markup). The storefront CSS has no such selector, so this collides with
//   nothing. A neutral chip (NOT the editor's blue editable-token look; the iframe
//   can't see the admin's captured `--appx-token-color` anyway) that reads as "a
//   value that resolves per-product on the storefront". Self-contained colors,
//   WCAG AA: text #4a5568 on #eef1f5 ≈ 6.65:1.
// - `.appx-spec-table-preview-empty` — the empty-state block shown when there are
//   no rows to preview. Muted, centered; text #6b7280 on the white preview ≈
//   4.83:1 (AA). Light-surface colors on purpose — the preview is a light,
//   storefront-like page, not the admin theme.
const PREVIEW_AFFORDANCES = `.appx-spec-table__dynamic-pill {
  display: inline-block;
  padding: 0.05em 0.4em;
  border-radius: 0.25rem;
  background: #eef1f5;
  color: #4a5568;
  font-size: 0.9em;
  font-weight: 500;
  white-space: nowrap;
}

.appx-spec-table-preview-empty {
  margin: 2rem auto;
  max-width: 22rem;
  text-align: center;
  color: #6b7280;
  font-size: 0.95rem;
  line-height: 1.5;
}

.appx-spec-table-preview-empty p {
  margin: 0;
}`;

// The full <style> payload for the preview document: the ambient base first (so
// the storefront rules win any future overlap), then the preview-only affordances,
// then the storefront CSS verbatim.
export const PREVIEW_DOCUMENT_STYLES = `${PREVIEW_AMBIENT}\n${PREVIEW_AFFORDANCES}\n${SPEC_TABLE_CSS}`;
