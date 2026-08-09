// Single source of truth for the spec-table styling vocabulary. Binding spec:
// `context/data-model.md` §5 (`TableStyling`).
//
// ONE vocabulary end to end: the field names below EQUAL the `TableStyling`
// column names, the Save-payload keys, and the metaobject JSON keys. Nothing is
// renamed at any boundary, ever.
//
// Framework-free so the engine, the rail controls, the server save-validation,
// the metaobject writer and the CSS-var mapping can all consume it.

// --- Allowed values -----------------------------------------------------------
//
// 🔴 The first member is the default, and every array is APPENDED TO, never
// inserted into — reordering repaints every table that exists.
// `SECTIONS_INITIAL_STATES` is the one exception; see its note.

// How one label/value PAIR renders. GRID is a third member rather than a
// separate boolean because a pair cannot be two-column AND grid — mutual
// exclusivity by construction instead of a hide predicate.
export const ROW_LAYOUTS = ["TWO_COLUMN", "STACKED", "GRID"] as const;
export const MOBILE_LAYOUTS = ["STACKED", "SAME_AS_DESKTOP"] as const;
// Three LOOKS, each owning both properties in play: TEXT_ONLY is a rule with no
// band, PLAIN is neither. TEXT_ONLY is labelled "Underlined" in the rail; the
// wire value keeps its original spelling so nothing repaints.
export const SECTION_HEADER_STYLES = ["BANDED", "TEXT_ONLY", "PLAIN"] as const;
// 🔴 THE ONE KEYWORD ARRAY WHOSE FIRST MEMBER IS NOT THE DEFAULT. It keeps its
// natural open→closed reading order for the rail, and
// `DEFAULT_SECTIONS_INITIAL_STATE` names the default explicitly instead.
export const SECTIONS_INITIAL_STATES = [
  "ALL_OPEN",
  "FIRST_OPEN",
  "ALL_CLOSED",
] as const;

/**
 * Which disclosures are open when a collapsible table first paints.
 *
 * `FIRST_OPEN` because the other two contradict the knob that reaches them. A
 * merchant enables collapsing because the table is LONG: `ALL_OPEN` hands back
 * the markup and none of the benefit, while `ALL_CLOSED` opens on a wall of
 * headings that reads as an empty block.
 *
 * ⚠️ Changing this value REPAINTS live storefronts. The wire shape is
 * overrides-only, so a template storing the default stores NOTHING — the default
 * IS the storage format, and there is no "unset" state to scope a change to new
 * templates only.
 *
 * 🚫 This is also why the initial state must NOT be defaulted from the
 * `sectionsCollapsible` toggle. Writing a value when collapsing flips on breaks
 * the pure-read law `showsSectionsInitialStateControl` is built on — toggle off
 * and back on, and the merchant's choice must return. Writing only when the
 * field "looks untouched" cannot repair it either: storage cannot tell an
 * explicit `ALL_OPEN` from a field nobody set.
 */
export const DEFAULT_SECTIONS_INITIAL_STATE = "FIRST_OPEN" as const;
export const ROW_DIVIDER_STYLES = ["LINES", "STRIPES", "NONE"] as const;
// The one interior VERTICAL edge: the rule between label and value. Singular
// "LINE" because there is exactly one however many rows there are.
//
// A style keyword, not a px width: the line is a fixed 1px hairline dressed by
// the shared border color, so it always matches the row rules — a width box
// would let a 4px column rule sit on 1px row rules. NONE leads because it is the
// default, and adding this knob must not repaint existing tables.
export const COLUMN_DIVIDER_STYLES = ["NONE", "LINE"] as const;
export const DENSITIES = ["DEFAULT", "COMPACT", "SPACIOUS"] as const;
// Meaningless at full width, which is why the rail hides the control then.
export const TABLE_ALIGNMENTS = ["LEFT", "CENTER", "RIGHT"] as const;

// Theme-relative presets. A bounded px NUMBER is also a valid fontSize; null =
// inherit from the merchant's theme.
export const STYLING_FONT_SIZES = ["SMALL", "MEDIUM", "LARGE"] as const;
export const STYLING_FONT_WEIGHTS = ["REGULAR", "MEDIUM", "BOLD"] as const;
export const STYLING_FONT_STYLES = ["NORMAL", "ITALIC"] as const;
export const LINE_HEIGHTS = ["TIGHT", "NORMAL", "LOOSE"] as const;
// Label column only.
export const LABEL_CASES = ["DEFAULT", "UPPERCASE"] as const;

// Custom-px bounds for `fontSize`, clamped rather than rejected so a slightly
// out-of-range stored value still renders. The FLOOR is an accessibility guard
// and is not negotiable; the CEILING is a taste guard, matched to the Horizon
// theme editor's own font-size control so a merchant is never more constrained
// here than in the theme editor they came from.
export const FONT_SIZE_PX_MIN = 10;
export const FONT_SIZE_PX_MAX = 184;

// Label-column width bounds, in percent.
export const LABEL_WIDTH_PCT_MIN = 20;
export const LABEL_WIDTH_PCT_MAX = 80;

// --- Container bounds ---------------------------------------------------------
//
// For the three integer container knobs **null is the DEFAULT, not "inherit"** —
// there is no theme value to fall back to. null means, respectively: full width,
// no outer border, square corners.
//
// 🔴 That is why every minimum is 1 rather than 0: a 0 would be a SECOND
// spelling of the same "off" state, which `serializeStylingOverrides` would then
// write to the wire as an override of a default that renders identically.
export const TABLE_MAX_WIDTH_PX_MIN = 240;
export const TABLE_MAX_WIDTH_PX_MAX = 1600;

// Past ~12px an "outline" reads as a filled block.
export const OUTER_BORDER_WIDTH_PX_MIN = 1;
export const OUTER_BORDER_WIDTH_PX_MAX = 12;

// Ceiling chosen so the radius can never eat a whole row.
export const OUTER_BORDER_RADIUS_PX_MIN = 1;
export const OUTER_BORDER_RADIUS_PX_MAX = 48;

// Space between COLLAPSIBLE sections. Nullable with null = no gap, so it takes
// the container knobs' law and the minimum-of-1 rule above.
export const SECTION_GAP_PX_MIN = 1;
export const SECTION_GAP_PX_MAX = 48;

// Vertical padding inside a section header band. ⚠️ null = the stylesheet's own
// `0.75rem`, NOT "off" — which is why this is the one integer knob whose floor
// is 0. The minimum-of-1 law governs knobs where null ALREADY means off; here
// null and 0 are two genuinely different renders, so 0 is a FIRST spelling.
export const HEADER_PADDING_BLOCK_PX_MIN = 0;
export const HEADER_PADDING_BLOCK_PX_MAX = 48;

// The narrowest a GRID track may get. A MINIMUM WIDTH, never a column count: the
// stylesheet feeds it to `repeat(auto-fit, minmax(…, 1fr))`, so the track count
// falls out of the container width. That keeps the layout responsive with no
// media query, stops a merchant producing three unreadable tracks in a narrow
// theme, and keeps the editor's Desktop preview truthful.
//
// null = the stylesheet's own `240px`, not "off" — grid mode always has a
// minimum. Floor 160: below that a label and value are unreadable at any theme
// font size. Ceiling 640: past that a 1440px page yields two tracks.
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

// Keyword = theme-relative preset (mapped to an em-scale, so it survives a theme
// switch); number = an absolute px override; null = inherit.
export type StylingFontSize = StylingFontSizeKeyword | number | null;

/**
 * The resolved working shape the engine, rail controls and mapping functions
 * operate on.
 *
 * Layout knobs are NON-NULL — defaults resolved at parse time, so a control
 * always has a concrete value to select. Colors, typography and `labelWidthPct`
 * are NULLABLE, where **null is semantic**: the "Theme" swatch state / the
 * `Inherit` font segment, not "missing".
 *
 * The DB's "null column = default" convention exists only at the persistence
 * edge.
 */
export interface StylingValues {
  rowLayout: RowLayout;
  // Only meaningful while `rowLayout` is GRID, which is why the rail hides its
  // control otherwise — without clearing the value, so a merchant's 320px
  // survives a trip through Two-column and back.
  gridMinColumnWidthPx: number | null;
  mobileLayout: MobileLayout;
  sectionHeaderStyle: SectionHeaderStyle;

  // Section-header typography + spacing. All four are nullable with null =
  // inherit the literal the stylesheet ships, so an untouched table renders
  // byte-identically. They apply to BOTH shapes — the flat `th[colspan=2]` and
  // the collapsible `<summary>` — so none is hidden when collapsing is off.
  //
  // ⚠️ `headerFontSizePx` is absolute px rather than an em-scale keyword, and
  // that is structural: the collapsible summary is a SIBLING of the table
  // carrying `--appx-spec-font-size`, so an em multiplier would resolve against
  // a different base in each shape and silently change size when a merchant
  // toggled Collapsible.
  headerFontSizePx: number | null;
  headerFontWeight: StylingFontWeight | null;
  headerCase: LabelCase | null;
  // Block axis only. Inline padding stays welded to the row cells' 0.75rem so a
  // section title never drifts out of alignment with the label column.
  headerPaddingBlockPx: number | null;

  sectionsCollapsible: boolean;
  sectionsInitialState: SectionsInitialState;
  // null means "no gap" — the container knobs' vocabulary, not the colors'
  // "inherit". Only the collapsible shape can express it (a flat section header
  // is a table row, which takes no margin), so the rail hides its control while
  // collapsing is off, without clearing the value.
  sectionGapPx: number | null;
  rowDividerStyle: RowDividerStyle;
  columnDividerStyle: ColumnDividerStyle;
  density: Density;

  // Container knobs. The three integers are nullable with null = the default
  // (full width, no outer border, square corners) rather than null = inherit.
  tableMaxWidthPx: number | null;
  tableAlign: TableAlign;
  outerBorderWidthPx: number | null;
  outerBorderRadiusPx: number | null;

  headerBgColor: string | null;
  // The rule under an Underlined section header. null is NOT "inherit the
  // theme" — the stylesheet falls back through `borderColor` first, so an
  // untouched underline tracks the Divider color swatch.
  //
  // ⚠️ Its fallback chain ends in `currentColor`, not a literal, which is why
  // this is the one swatch with no `emptyHelpText`.
  headerUnderlineColor: string | null;
  // Grouped with the colors rather than the header knobs above because the
  // rail's swatch list is DERIVED from `STYLING_FIELD_NAMES` order.
  headerTextColor: string | null;
  labelBgColor: string | null;
  valueBgColor: string | null;
  stripeBgColor: string | null;
  borderColor: string | null;
  // null falls back to `borderColor` in the stylesheet, so one swatch dresses
  // both the row rules and the frame until a merchant deliberately splits them.
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
 * The canonical field list. Drives `stylingEquals`, serialization iteration and
 * the preset column drift test. Adding a knob means adding it here — nothing
 * else iterates the shape.
 *
 * 🔴 **ORDER IS MERCHANT-FACING, and the colour block must stay contiguous.**
 * `stylingControls.test.ts` derives `COLOR_KNOBS`' expected order by filtering
 * this array for fields the parser accepts a hex for, and the rail renders a
 * group's swatches in that order — so a colour placed outside the block fails
 * that test rather than merely reading oddly.
 */
export const STYLING_FIELD_NAMES = [
  "rowLayout",
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
  // Ahead of `headerTextColor` on purpose: these two are mutually exclusive
  // (exactly one is visible per `sectionHeaderStyle`), so seating them
  // adjacently keeps the Section headers grid geometry stable — slot 1 is always
  // "this header style's own surface", slot 2 is always `Title color`.
  "headerUnderlineColor",
  "headerTextColor",
  "labelBgColor",
  "valueBgColor",
  "stripeBgColor",
  "borderColor",
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

// 🔴 Strict hex only. These values are emitted into inline `style` attributes on
// a live storefront, so the whitelist is CSS-injection defense, not tidiness —
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
 * null rather than to a guessed number. Shared by every bounded integer, which
 * differ only in their bounds; a copied clamp can drift out of agreement with
 * its own control.
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
 * clamped into [`FONT_SIZE_PX_MIN`, `FONT_SIZE_PX_MAX`]. Only a validated
 * integer ever reaches an inline style — the same injection defense as hex-only
 * colors.
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
 * object, a Prisma `TableStyling` row (extra keys ignored, column nulls →
 * defaults), and the parsed metaobject JSON.
 *
 * **Never throws.** Stored styling can be malformed (old rows, a hand-edited
 * metaobject, a bad deploy); every invalid field degrades to its own default so
 * a bad blob can never blank a merchant's editor or storefront table.
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
    // ⚠️ The padding's floor is 0, a real stored value here rather than a second
    // spelling of null — see `HEADER_PADDING_BLOCK_PX_MIN`.
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
 * defaults → `{}`; an absent key means "default".
 *
 * This is the exact content of `payload.styling`, the metaobject `styling`
 * field, and the preset bundles. ⚠️ A wire shape only — never the Prisma upsert
 * input, which must write every column so a field reset to default is actually
 * cleared in the DB.
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
    // nullable that is non-null, and `sectionsCollapsible` only when true.
    if (value !== DEFAULT_STYLING_VALUES[field]) {
      overrides[field] = value;
    }
  }

  return overrides;
}

/**
 * Flat, strict, field-by-field compare over `STYLING_FIELD_NAMES`. Drives the
 * dirty snapshot and the "Customized" preset hint.
 */
export function stylingEquals(a: StylingValues, b: StylingValues): boolean {
  return STYLING_FIELD_NAMES.every((field) => a[field] === b[field]);
}
