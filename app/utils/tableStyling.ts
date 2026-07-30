// Single source of truth for the spec-table styling vocabulary (feature 57 —
// Style tab, Step 1). Binding spec: `context/data-model.md` §5 (`TableStyling`)
// + `admin-screen-plan.md` §Tab 2.
//
// ONE vocabulary end to end: the field names below EQUAL the `TableStyling`
// column names, the Save-payload keys, and the metaobject JSON keys. The string
// values equal the constants named in the schema comments. Nothing is renamed at
// any boundary, ever.
//
// This module is framework-free on purpose (same rationale as `rows.ts`): the
// engine, the rail controls, the server save-validation, the metaobject writer,
// and the CSS-var mapping all consume it, so it must stay client-safe and
// Node-testable. It is imported by nothing yet — later steps do the wiring.

// --- Allowed values (first member is the default, with ONE exception) --------
//
// The exception is `SECTIONS_INITIAL_STATES`, which names its default in
// `DEFAULT_SECTIONS_INITIAL_STATE` instead; the reason is on that array. The
// convention is what makes a reorder a repaint, so every array below still says
// "appended, never inserted" — the exception moved where the default is
// DECLARED, not whether the order is frozen.

// How one label/value PAIR renders. Three answers to one question, which is why
// GRID is a third member here rather than a separate boolean (feature 85): a
// pair cannot be two-column AND grid, so mutual exclusivity comes by
// construction instead of by a hide predicate forbidding the combination.
// Appended, never inserted — the first member is the default, and reordering
// this array would repaint every table that exists.
export const ROW_LAYOUTS = ["TWO_COLUMN", "STACKED", "GRID"] as const;
export const MOBILE_LAYOUTS = ["STACKED", "SAME_AS_DESKTOP"] as const;
// How a section title reads against the rows around it. Three LOOKS, and each
// one owns both of the properties in play: TEXT_ONLY is a rule with no band,
// PLAIN is neither (feature 87 — a merchant reported that "Text only" still
// painted a 2px rule, so there was no way to get a bare bold title). The
// merchant-facing label for TEXT_ONLY is "Underlined" for exactly that reason;
// the wire value keeps its original spelling, so nothing repaints.
//
// Appended, never inserted — the first member is the default.
export const SECTION_HEADER_STYLES = ["BANDED", "TEXT_ONLY", "PLAIN"] as const;
// 🔴 THE ONE KEYWORD ARRAY WHOSE FIRST MEMBER IS NOT THE DEFAULT. Every other
// array in this file follows "appended, never inserted — the first member is
// the default"; this one keeps its natural open→closed reading order for the
// rail while `DEFAULT_SECTIONS_INITIAL_STATE` below names the default
// explicitly. Reordering to put the default first would have made the three
// options read as a scrambled spectrum in the Style tab, which is
// merchant-facing; a named constant costs one line and nothing else.
export const SECTIONS_INITIAL_STATES = [
  "ALL_OPEN",
  "FIRST_OPEN",
  "ALL_CLOSED",
] as const;

/**
 * Which disclosures are open when a collapsible table first paints.
 *
 * `FIRST_OPEN` (merchant decision 2026-07-30), and the reasoning is that the
 * other two both contradict the knob that reaches them. A merchant enables
 * collapsing because the table is LONG: `ALL_OPEN` then hands back the
 * disclosure markup and none of the benefit — the page is exactly as tall as
 * before and the only change is that headings became clickable — while
 * `ALL_CLOSED` opens on a wall of headings with no content, which reads as an
 * empty block. `FIRST_OPEN` is the only member that shows real content AND
 * shows that the headings beneath it open.
 *
 * ⚠️ Changing this value REPAINTS live storefronts, because the wire shape is
 * overrides-only: a template that stores the default stores NOTHING, so the
 * default IS the storage format and there is no "unset" state to scope a
 * change to new templates only. It moved ALL_OPEN → FIRST_OPEN while the only
 * data in existence was the dev store's. Post-launch that door is closed.
 *
 * 🚫 And this is why the initial state must NOT be defaulted from the
 * `sectionsCollapsible` toggle instead. Writing a value when collapsing flips
 * on breaks the pure-read law `showsSectionsInitialStateControl` is built on
 * (`stylingControls.ts`) — toggle off and back on, and the merchant's own
 * choice must return. It cannot be repaired by writing only when the field
 * "looks untouched" either: storage cannot tell an explicit `ALL_OPEN` from a
 * field nobody ever set, so the smart version silently overwrites a real
 * choice. One global default is the only mechanism this wire shape supports.
 */
export const DEFAULT_SECTIONS_INITIAL_STATE = "FIRST_OPEN" as const;
export const ROW_DIVIDER_STYLES = ["LINES", "STRIPES", "NONE"] as const;
// The one interior VERTICAL edge a two-column table has: the rule between the
// label and the value. Singular "LINE" rather than the row knob's plural
// "LINES" because there is exactly one of them, however many rows there are.
//
// A style keyword, not a px width (merchant decision 2026-07-26). The line is a
// fixed 1px hairline dressed by the shared border color, so it always matches
// the row rules — a width box would let a 4px column rule sit on 1px row rules,
// and row-divider width is deliberately NOT configurable. NONE leads because it
// is the default: every table that exists today has no column rule, and adding
// this knob must not repaint any of them.
export const COLUMN_DIVIDER_STYLES = ["NONE", "LINE"] as const;
export const DENSITIES = ["DEFAULT", "COMPACT", "SPACIOUS"] as const;
// How a width-capped table sits in the space the theme gives it. Meaningless at
// full width, which is why the rail hides the control then.
export const TABLE_ALIGNMENTS = ["LEFT", "CENTER", "RIGHT"] as const;

// Theme-relative presets. A bounded px NUMBER is also a valid fontSize; null =
// inherit from the merchant's theme.
export const STYLING_FONT_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export const STYLING_FONT_WEIGHTS = ["REGULAR", "MEDIUM", "BOLD"] as const;
export const STYLING_FONT_STYLES = ["NORMAL", "ITALIC"] as const;
export const LINE_HEIGHTS = ["TIGHT", "NORMAL", "LOOSE"] as const;
// Label column only.
export const LABEL_CASES = ["DEFAULT", "UPPERCASE"] as const;

// Custom-px bounds for `fontSize`. The floor is an accessibility guard; the
// ceiling keeps a hand-edited blob from blowing up a storefront table. Clamped
// (not rejected) so a slightly out-of-range stored value still renders.
// The Custom-px escape hatch's bounds. The FLOOR is an accessibility guard and
// is not negotiable; the CEILING is a taste guard only, and was raised 40 → 184
// on 2026-07-19 to match the maximum offered by the Horizon theme editor's own
// font-size control, so a merchant is never more constrained here than in the
// theme editor they came from.
//
// 184 is deliberately generous for a DATA TABLE: this var lands on
// `.appx-spec-table__table`, so it scales labels and values together rather than
// a single heading. A merchant who picks a very large size will get a table that
// overflows its column on narrow viewports — that is their call, it is visible
// the instant they pick it, and it is one control away from being undone.
export const FONT_SIZE_PX_MIN = 10;
export const FONT_SIZE_PX_MAX = 184;

// Label-column width bounds, in percent. Locks the Step 10 slider range.
export const LABEL_WIDTH_PCT_MIN = 20;
export const LABEL_WIDTH_PCT_MAX = 80;

// --- Container bounds (table width + outer border) ---------------------------
//
// The three integer container knobs are all `number | null`, and for each of
// them **null is the DEFAULT, not "inherit"** — unlike the colors and typography
// above, there is no theme value to fall back to. null means, respectively: full
// width, no outer border, square corners. That is also why every minimum is 1
// rather than 0: a 0 would be a SECOND spelling of the same "off" state, which
// `serializeStylingOverrides` would then write to the wire as an override of a
// default that renders identically. One representation per state, so clearing
// the control is the only way to turn a container knob off.
//
// The max-width floor is a usability guard (below ~240px a two-column table has
// no room for a label and a value side by side); the ceiling is generous enough
// for a full-bleed section on a large monitor.
export const TABLE_MAX_WIDTH_PX_MIN = 240;
export const TABLE_MAX_WIDTH_PX_MAX = 1600;

// A hairline up to a heavy frame. Past ~12px an "outline" reads as a filled
// block, and the storefront is a shopper-facing surface, not a canvas.
export const OUTER_BORDER_WIDTH_PX_MIN = 1;
export const OUTER_BORDER_WIDTH_PX_MAX = 12;

// Ceiling chosen so the radius can never eat a whole row: at 48px a corner is
// already softer than any theme card, and beyond that the first and last rows
// start losing their content to the curve.
export const OUTER_BORDER_RADIUS_PX_MIN = 1;
export const OUTER_BORDER_RADIUS_PX_MAX = 48;

// Space between COLLAPSIBLE sections (feature 80). Nullable with null = no gap,
// so it takes the container knobs' law rather than the colors' "null = inherit":
// there is no theme value for the space between our own disclosures. Minimum 1
// for the same reason as the three above — a stored 0 would be a second spelling
// of off, and off is what null already means.
//
// A px number rather than a keyword scale (contrast the column divider, feature
// 79, where a width box could have fought the fixed 1px row rules). Nothing
// clashes here — a gap is whitespace between blocks — and a merchant matching
// their theme's rhythm needs a number, not three presets. Ceiling shared with
// the radius: past ~48px the sections stop reading as one table, and the cost of
// a large value is visible the instant it is picked.
export const SECTION_GAP_PX_MIN = 1;
export const SECTION_GAP_PX_MAX = 48;

// Vertical padding inside a section header band (feature 81). null = the
// stylesheet's own `0.75rem`, NOT "off" — which is why this is the one integer
// knob whose floor is 0 rather than 1.
//
// The feature 78 minimum-of-1 law governs knobs where null ALREADY means off
// (no outline, square corners, no gap): there a stored 0 is a second spelling of
// a state null already has, it serializes as a bogus override, and it trips a
// presence flag that then paints nothing. None of that applies here. null means
// `0.75rem` and 0 means no padding — two genuinely different renders, so 0 is a
// FIRST spelling. Nothing keys a presence flag on this field either: the
// stylesheet's `var(--…, 0.75rem)` fallback needs no class to gate it.
//
// Ceiling shared with the section gap and the corner radius. Past ~48px the band
// is taller than the rows it introduces.
export const HEADER_PADDING_BLOCK_PX_MIN = 0;
export const HEADER_PADDING_BLOCK_PX_MAX = 48;

// The narrowest a GRID track may get (feature 85). A MINIMUM WIDTH, never a
// column count, and that is the load-bearing decision of the whole feature: the
// stylesheet feeds it to `repeat(auto-fit, minmax(…, 1fr))`, so the track count
// falls out of the container width. Three things follow that a count knob could
// not give — the layout is responsive with no media query (at 375px exactly one
// track fits), a merchant cannot produce three unreadable 200px tracks in a
// 600px theme, and the editor's ~640px Desktop preview stays TRUTHFUL, because
// it is showing what a 640px container does with that minimum rather than a
// count that would look completely different at 1400px.
//
// null = the stylesheet's own `240px` literal, i.e. the `headerPaddingBlockPx`
// vocabulary and NOT the container knobs' "null = off": grid mode always has a
// minimum, so there is no off state to spell. Nothing keys a presence flag on
// this field either (the `--layout-grid` class is the gate), so feature 78's
// minimum-of-1 law does not reach it and the floor below is a usability number
// rather than a modelling constraint.
//
// Floor 160: below that a label and its value are unreadable at any theme font
// size — the same guard as `TABLE_MAX_WIDTH_PX_MIN`. Ceiling 640: past that a
// 1440px page yields two tracks and the knob has stopped being a multi-column
// control.
export const GRID_MIN_COLUMN_WIDTH_PX_MIN = 160;
export const GRID_MIN_COLUMN_WIDTH_PX_MAX = 640;

export type RowLayout = (typeof ROW_LAYOUTS)[number];
export type MobileLayout = (typeof MOBILE_LAYOUTS)[number];
export type SectionHeaderStyle = (typeof SECTION_HEADER_STYLES)[number];
export type SectionsInitialState = (typeof SECTIONS_INITIAL_STATES)[number];
export type RowDividerStyle = (typeof ROW_DIVIDER_STYLES)[number];
export type ColumnDividerStyle = (typeof COLUMN_DIVIDER_STYLES)[number];
export type Density = (typeof DENSITIES)[number];
export type TableAlign = (typeof TABLE_ALIGNMENTS)[number];
export type StylingFontSizeKeyword = (typeof STYLING_FONT_SIZES)[number];
export type StylingFontWeight = (typeof STYLING_FONT_WEIGHTS)[number];
export type StylingFontStyle = (typeof STYLING_FONT_STYLES)[number];
export type LineHeight = (typeof LINE_HEIGHTS)[number];
export type LabelCase = (typeof LABEL_CASES)[number];

// Keyword = theme-relative preset (mapped to an em-scale in Steps 2–3, so it
// survives a theme switch); number = an absolute px override; null = inherit.
export type StylingFontSize = StylingFontSizeKeyword | number | null;

/**
 * The resolved working shape the engine, rail controls, and mapping functions
 * operate on.
 *
 * Layout knobs are NON-NULL — their defaults are resolved at parse time, so a
 * control always has a concrete value to select. Colors, typography and
 * `labelWidthPct` are NULLABLE, where **null is semantic**: it is the "Theme"
 * swatch state / the `Inherit` font segment, not "missing".
 *
 * The DB's "null column = default" convention exists only at the persistence
 * edge — Step 4 maps default -> column null on write.
 */
export interface StylingValues {
  rowLayout: RowLayout;
  // Only meaningful while `rowLayout` is GRID, which is why the rail hides its
  // control otherwise — without clearing the value, so a merchant's 320px
  // survives a trip through Two-column and back.
  gridMinColumnWidthPx: number | null;
  mobileLayout: MobileLayout;
  sectionHeaderStyle: SectionHeaderStyle;

  // Section-header typography + spacing (feature 81). All four are NULLABLE and
  // null = inherit the literal the stylesheet already ships, so an untouched
  // table renders byte-identically. They apply to BOTH shapes — the flat
  // `th[colspan=2]` and the collapsible `<summary>` — so unlike the gap above
  // none of them is hidden when collapsing is off.
  //
  // `headerFontSizePx` is an absolute px integer rather than an em-scale keyword
  // like the table's own `fontSize`, and that is structural, not taste: the
  // collapsible summary is a SIBLING of the table that carries
  // `--appx-spec-font-size`, so an em multiplier would resolve against a
  // different base in each shape and silently change size when a merchant
  // toggled Collapsible. A px number resolves identically in both.
  headerFontSizePx: number | null;
  headerFontWeight: StylingFontWeight | null;
  headerCase: LabelCase | null;
  // Block axis only. The inline padding stays welded to the row cells' 0.75rem
  // so a section title never drifts out of alignment with the label column.
  headerPaddingBlockPx: number | null;

  sectionsCollapsible: boolean;
  sectionsInitialState: SectionsInitialState;
  // The one NULLABLE field among the section knobs, and null means "no gap" —
  // the container knobs' vocabulary, not the colors' "inherit". Only the
  // collapsible shape can express it (a flat section header is a table row,
  // which takes no margin), so the rail hides its control while collapsing is
  // off — without clearing the value.
  sectionGapPx: number | null;
  rowDividerStyle: RowDividerStyle;
  columnDividerStyle: ColumnDividerStyle;
  density: Density;

  // Container knobs. `tableAlign` is non-null like every other keyword knob;
  // the three integers are nullable with null = the default (full width, no
  // outer border, square corners) rather than null = inherit.
  tableMaxWidthPx: number | null;
  tableAlign: TableAlign;
  outerBorderWidthPx: number | null;
  outerBorderRadiusPx: number | null;

  headerBgColor: string | null;
  // The 2px rule under an Underlined section header (feature 96). Like
  // `outerBorderColor` below, null is NOT "inherit the theme" — the stylesheet
  // falls back through `borderColor` first, so an untouched underline tracks the
  // Divider color swatch exactly as it did before this field existed.
  //
  // ⚠️ Its fallback chain ends in `currentColor`, not a literal, which is what
  // makes its empty state unstateable in one short string and is why this is the
  // one swatch with no `emptyHelpText` (feature 96 decision (a)).
  headerUnderlineColor: string | null;
  // The section title's own text color. Grouped with the colors rather than
  // with the four header knobs above because the rail's swatch list is DERIVED
  // from `STYLING_FIELD_NAMES` order — see the note on that array.
  headerTextColor: string | null;
  labelBgColor: string | null;
  valueBgColor: string | null;
  stripeBgColor: string | null;
  borderColor: string | null;
  // The outer frame's own color. Null does NOT mean "inherit the theme" here —
  // it falls back to `borderColor` in the stylesheet, so one swatch dresses both
  // the row rules and the frame until a merchant deliberately splits them.
  outerBorderColor: string | null;
  labelTextColor: string | null;
  valueTextColor: string | null;

  fontSize: StylingFontSize;
  fontWeight: StylingFontWeight | null;
  fontStyle: StylingFontStyle | null;
  lineHeight: LineHeight | null;
  labelCase: LabelCase | null;
  labelWidthPct: number | null;
}

/**
 * The canonical field list. Drives `stylingEquals`, serialization iteration, and
 * (in B3) the `StylePreset` column drift test. Adding a knob means adding it
 * here — nothing else iterates the shape.
 */
export const STYLING_FIELD_NAMES = [
  "rowLayout",
  // Sits with its layout knob, ahead of the colour block: the rail's swatch list
  // is derived from this array by filtering for fields the parser accepts a hex
  // for, so a non-colour placed inside that block would be fine here but a
  // colour placed outside it would not — keep the colour block contiguous.
  "gridMinColumnWidthPx",
  "mobileLayout",
  "sectionHeaderStyle",
  "headerFontSizePx",
  "headerFontWeight",
  "headerCase",
  "headerPaddingBlockPx",
  "sectionsCollapsible",
  "sectionsInitialState",
  "sectionGapPx",
  "rowDividerStyle",
  "columnDividerStyle",
  "density",
  "tableMaxWidthPx",
  "tableAlign",
  "outerBorderWidthPx",
  "outerBorderRadiusPx",
  "headerBgColor",
  // Second, ahead of `headerTextColor`, and the ORDER IS MERCHANT-FACING:
  // `stylingControls.test.ts` derives `COLOR_KNOBS`' expected order by filtering
  // this array for fields the parser accepts a hex for, and the rail renders a
  // group's swatches in that order. `headerBgColor` and `headerUnderlineColor`
  // are mutually exclusive (exactly one is visible per `sectionHeaderStyle`), so
  // seating them adjacently keeps the Section headers grid geometry stable —
  // slot 1 is always "this header style's own surface", slot 2 is always
  // `Title color`. Filed after `headerTextColor` instead, the constant would
  // jump cells between Banded and Underlined for no reason.
  "headerUnderlineColor",
  // Must stay INSIDE the colour block, with the two section-header surfaces
  // above it: a colour placed outside that block fails the derived-order test
  // rather than merely reading oddly.
  "headerTextColor",
  "labelBgColor",
  "valueBgColor",
  "stripeBgColor",
  "borderColor",
  // Grouped with the colors, NOT with the container knobs above: the Step 10a
  // swatch list is derived from this array's order, so a color placed outside
  // the color block would surface as a stray swatch at the top of the rail.
  "outerBorderColor",
  "labelTextColor",
  "valueTextColor",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "labelCase",
  "labelWidthPct",
] as const satisfies readonly (keyof StylingValues)[];

export type StylingFieldName = (typeof STYLING_FIELD_NAMES)[number];

/** Every knob at its default; every nullable inheriting from the theme. */
export const DEFAULT_STYLING_VALUES: StylingValues = Object.freeze({
  rowLayout: ROW_LAYOUTS[0],
  gridMinColumnWidthPx: null,
  mobileLayout: MOBILE_LAYOUTS[0],
  sectionHeaderStyle: SECTION_HEADER_STYLES[0],
  headerFontSizePx: null,
  headerFontWeight: null,
  headerCase: null,
  headerPaddingBlockPx: null,
  sectionsCollapsible: false,
  sectionsInitialState: DEFAULT_SECTIONS_INITIAL_STATE,
  sectionGapPx: null,
  rowDividerStyle: ROW_DIVIDER_STYLES[0],
  columnDividerStyle: COLUMN_DIVIDER_STYLES[0],
  density: DENSITIES[0],

  tableMaxWidthPx: null,
  tableAlign: TABLE_ALIGNMENTS[0],
  outerBorderWidthPx: null,
  outerBorderRadiusPx: null,

  headerBgColor: null,
  headerUnderlineColor: null,
  headerTextColor: null,
  labelBgColor: null,
  valueBgColor: null,
  stripeBgColor: null,
  borderColor: null,
  outerBorderColor: null,
  labelTextColor: null,
  valueTextColor: null,

  fontSize: null,
  fontWeight: null,
  fontStyle: null,
  lineHeight: null,
  labelCase: null,
  labelWidthPct: null,
});

// --- Parsing -----------------------------------------------------------------

// Strict hex only (`#rgb` / `#rrggbb` / `#rrggbbaa`, case-insensitive). These
// values are later emitted into inline `style` attributes on a live storefront
// (Step 7), so the whitelist is CSS-injection defense in depth, not tidiness —
// `"#fff;background:url(x)"` must never survive parsing.
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The DB column shape for a px fontSize is an all-digit string ("18").
const ALL_DIGITS_PATTERN = /^\d+$/;

function asRecord(input: unknown): Record<string, unknown> {
  // Arrays are rejected alongside primitives: neither is a styling blob.
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

/** A member of `allowed`, or that field's default when anything else. */
function parseKeyword<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A member of `allowed`, or null (= inherit) when anything else. */
function parseNullableKeyword<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseColor(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * A clamped integer, or null when there is nothing usable to store.
 *
 * Numbers only — a non-integer, a numeric string, NaN or Infinity all degrade to
 * null (that field's stylesheet default) rather than to a guessed number. These
 * back the `Int?` columns, which Prisma hands back as numbers, so unlike
 * `parseFontSize` there is no digit-string shape to accept.
 *
 * Shared by every bounded integer rather than repeated: they differ only in
 * their bounds, and a copied clamp is a clamp that can drift out of agreement
 * with its own control.
 */
function parseBoundedInt(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return clamp(value, min, max);
}

/**
 * Keyword | px integer | null. Accepts both boundary shapes for px: a JSON
 * number (the wire shape) and an all-digit string (the DB column shape), both
 * normalized to a number clamped into [`FONT_SIZE_PX_MIN`, `FONT_SIZE_PX_MAX`]
 * — 10–184 since the 2026-07-19 ceiling amendment (the docstring said 40 until
 * Step 12 caught the drift; name the constants so it cannot drift again). Only
 * a validated integer ever
 * reaches an inline style — the same injection defense as hex-only colors.
 */
function parseFontSize(value: unknown): StylingFontSize {
  if (typeof value === "string") {
    if ((STYLING_FONT_SIZES as readonly string[]).includes(value)) {
      return value as StylingFontSizeKeyword;
    }
    if (ALL_DIGITS_PATTERN.test(value)) {
      return clamp(Number(value), FONT_SIZE_PX_MIN, FONT_SIZE_PX_MAX);
    }
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return clamp(value, FONT_SIZE_PX_MIN, FONT_SIZE_PX_MAX);
  }
  return null;
}

/**
 * Tolerant parse used at EVERY trust boundary — the Save payload's overrides
 * object, a Prisma `TableStyling` row (extra `id`/`templateId` keys ignored,
 * column nulls -> defaults), and the parsed metaobject JSON.
 *
 * **Never throws.** Stored styling can be malformed (old rows, a hand-edited
 * metaobject, a future bad deploy); every invalid field degrades to its own
 * default so a bad blob can never blank a merchant's editor or storefront table.
 */
export function parseStylingValues(input: unknown): StylingValues {
  const raw = asRecord(input);
  const d = DEFAULT_STYLING_VALUES;

  return {
    rowLayout: parseKeyword(raw.rowLayout, ROW_LAYOUTS, d.rowLayout),
    gridMinColumnWidthPx: parseBoundedInt(
      raw.gridMinColumnWidthPx,
      GRID_MIN_COLUMN_WIDTH_PX_MIN,
      GRID_MIN_COLUMN_WIDTH_PX_MAX,
    ),
    mobileLayout: parseKeyword(
      raw.mobileLayout,
      MOBILE_LAYOUTS,
      d.mobileLayout,
    ),
    sectionHeaderStyle: parseKeyword(
      raw.sectionHeaderStyle,
      SECTION_HEADER_STYLES,
      d.sectionHeaderStyle,
    ),
    // Section-header typography (feature 81). The px pair goes through
    // `parseBoundedInt` like every other integer knob — note the padding's
    // floor is 0, which is a real stored value here rather than a second
    // spelling of null; see `HEADER_PADDING_BLOCK_PX_MIN`.
    headerFontSizePx: parseBoundedInt(
      raw.headerFontSizePx,
      FONT_SIZE_PX_MIN,
      FONT_SIZE_PX_MAX,
    ),
    headerFontWeight: parseNullableKeyword(
      raw.headerFontWeight,
      STYLING_FONT_WEIGHTS,
    ),
    headerCase: parseNullableKeyword(raw.headerCase, LABEL_CASES),
    headerPaddingBlockPx: parseBoundedInt(
      raw.headerPaddingBlockPx,
      HEADER_PADDING_BLOCK_PX_MIN,
      HEADER_PADDING_BLOCK_PX_MAX,
    ),
    // Literal `true` only — "true"/1/null are not an opt-in.
    sectionsCollapsible: raw.sectionsCollapsible === true,
    sectionsInitialState: parseKeyword(
      raw.sectionsInitialState,
      SECTIONS_INITIAL_STATES,
      d.sectionsInitialState,
    ),
    sectionGapPx: parseBoundedInt(
      raw.sectionGapPx,
      SECTION_GAP_PX_MIN,
      SECTION_GAP_PX_MAX,
    ),
    rowDividerStyle: parseKeyword(
      raw.rowDividerStyle,
      ROW_DIVIDER_STYLES,
      d.rowDividerStyle,
    ),
    columnDividerStyle: parseKeyword(
      raw.columnDividerStyle,
      COLUMN_DIVIDER_STYLES,
      d.columnDividerStyle,
    ),
    density: parseKeyword(raw.density, DENSITIES, d.density),

    tableMaxWidthPx: parseBoundedInt(
      raw.tableMaxWidthPx,
      TABLE_MAX_WIDTH_PX_MIN,
      TABLE_MAX_WIDTH_PX_MAX,
    ),
    tableAlign: parseKeyword(raw.tableAlign, TABLE_ALIGNMENTS, d.tableAlign),
    outerBorderWidthPx: parseBoundedInt(
      raw.outerBorderWidthPx,
      OUTER_BORDER_WIDTH_PX_MIN,
      OUTER_BORDER_WIDTH_PX_MAX,
    ),
    outerBorderRadiusPx: parseBoundedInt(
      raw.outerBorderRadiusPx,
      OUTER_BORDER_RADIUS_PX_MIN,
      OUTER_BORDER_RADIUS_PX_MAX,
    ),

    headerBgColor: parseColor(raw.headerBgColor),
    headerUnderlineColor: parseColor(raw.headerUnderlineColor),
    headerTextColor: parseColor(raw.headerTextColor),
    labelBgColor: parseColor(raw.labelBgColor),
    valueBgColor: parseColor(raw.valueBgColor),
    stripeBgColor: parseColor(raw.stripeBgColor),
    borderColor: parseColor(raw.borderColor),
    outerBorderColor: parseColor(raw.outerBorderColor),
    labelTextColor: parseColor(raw.labelTextColor),
    valueTextColor: parseColor(raw.valueTextColor),

    fontSize: parseFontSize(raw.fontSize),
    fontWeight: parseNullableKeyword(raw.fontWeight, STYLING_FONT_WEIGHTS),
    fontStyle: parseNullableKeyword(raw.fontStyle, STYLING_FONT_STYLES),
    lineHeight: parseNullableKeyword(raw.lineHeight, LINE_HEIGHTS),
    labelCase: parseNullableKeyword(raw.labelCase, LABEL_CASES),
    labelWidthPct: parseBoundedInt(
      raw.labelWidthPct,
      LABEL_WIDTH_PCT_MIN,
      LABEL_WIDTH_PCT_MAX,
    ),
  };
}

// --- Serialization -----------------------------------------------------------

/**
 * The ONE wire shape: a plain object holding **only non-default fields**. All
 * defaults -> `{}`; an absent key means "default".
 *
 * This is the exact content of `payload.styling` (Step 5), the metaobject
 * `styling` field (Step 7), and the Step 13 preset bundles. It is a wire shape
 * only — never the Prisma upsert input, which must write every column so a
 * field reset to default is actually cleared in the DB.
 *
 * Round-trip law: `parseStylingValues(serializeStylingOverrides(v))` deep-equals
 * `v` for every valid `v`.
 */
export function serializeStylingOverrides(
  values: StylingValues,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const field of STYLING_FIELD_NAMES) {
    const value = values[field];
    // Covers all three cases uniformly: a knob differing from its default, a
    // nullable that is non-null, and `sectionsCollapsible` only when true
    // (its default being `false`).
    if (value !== DEFAULT_STYLING_VALUES[field]) {
      overrides[field] = value;
    }
  }

  return overrides;
}

/**
 * Flat, strict, field-by-field compare over `STYLING_FIELD_NAMES`. Drives the
 * dirty snapshot (Step 5) and the "Customized" preset hint (Step 13).
 */
export function stylingEquals(a: StylingValues, b: StylingValues): boolean {
  return STYLING_FIELD_NAMES.every((field) => a[field] === b[field]);
}
