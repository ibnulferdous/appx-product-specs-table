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

// --- Allowed values (first member is always the default) ---------------------

export const ROW_LAYOUTS = ["TWO_COLUMN", "STACKED"] as const;
export const MOBILE_LAYOUTS = ["STACKED", "SAME_AS_DESKTOP"] as const;
export const SECTION_HEADER_STYLES = ["BANDED", "TEXT_ONLY"] as const;
export const SECTIONS_INITIAL_STATES = [
  "ALL_OPEN",
  "FIRST_OPEN",
  "ALL_CLOSED",
] as const;
export const ROW_DIVIDER_STYLES = ["LINES", "STRIPES", "NONE"] as const;
export const DENSITIES = ["DEFAULT", "COMPACT", "SPACIOUS"] as const;

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

export type RowLayout = (typeof ROW_LAYOUTS)[number];
export type MobileLayout = (typeof MOBILE_LAYOUTS)[number];
export type SectionHeaderStyle = (typeof SECTION_HEADER_STYLES)[number];
export type SectionsInitialState = (typeof SECTIONS_INITIAL_STATES)[number];
export type RowDividerStyle = (typeof ROW_DIVIDER_STYLES)[number];
export type Density = (typeof DENSITIES)[number];
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
  mobileLayout: MobileLayout;
  sectionHeaderStyle: SectionHeaderStyle;
  sectionsCollapsible: boolean;
  sectionsInitialState: SectionsInitialState;
  rowDividerStyle: RowDividerStyle;
  density: Density;

  headerBgColor: string | null;
  labelBgColor: string | null;
  valueBgColor: string | null;
  stripeBgColor: string | null;
  borderColor: string | null;
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
  "mobileLayout",
  "sectionHeaderStyle",
  "sectionsCollapsible",
  "sectionsInitialState",
  "rowDividerStyle",
  "density",
  "headerBgColor",
  "labelBgColor",
  "valueBgColor",
  "stripeBgColor",
  "borderColor",
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
  mobileLayout: MOBILE_LAYOUTS[0],
  sectionHeaderStyle: SECTION_HEADER_STYLES[0],
  sectionsCollapsible: false,
  sectionsInitialState: SECTIONS_INITIAL_STATES[0],
  rowDividerStyle: ROW_DIVIDER_STYLES[0],
  density: DENSITIES[0],

  headerBgColor: null,
  labelBgColor: null,
  valueBgColor: null,
  stripeBgColor: null,
  borderColor: null,
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
 * Integer percent clamped into [20, 80]. Numbers only — a non-integer, a
 * numeric string, NaN or Infinity all degrade to null (the stylesheet's default
 * ratio) rather than to a guessed number.
 */
function parseLabelWidthPct(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return clamp(value, LABEL_WIDTH_PCT_MIN, LABEL_WIDTH_PCT_MAX);
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
    // Literal `true` only — "true"/1/null are not an opt-in.
    sectionsCollapsible: raw.sectionsCollapsible === true,
    sectionsInitialState: parseKeyword(
      raw.sectionsInitialState,
      SECTIONS_INITIAL_STATES,
      d.sectionsInitialState,
    ),
    rowDividerStyle: parseKeyword(
      raw.rowDividerStyle,
      ROW_DIVIDER_STYLES,
      d.rowDividerStyle,
    ),
    density: parseKeyword(raw.density, DENSITIES, d.density),

    headerBgColor: parseColor(raw.headerBgColor),
    labelBgColor: parseColor(raw.labelBgColor),
    valueBgColor: parseColor(raw.valueBgColor),
    stripeBgColor: parseColor(raw.stripeBgColor),
    borderColor: parseColor(raw.borderColor),
    labelTextColor: parseColor(raw.labelTextColor),
    valueTextColor: parseColor(raw.valueTextColor),

    fontSize: parseFontSize(raw.fontSize),
    fontWeight: parseNullableKeyword(raw.fontWeight, STYLING_FONT_WEIGHTS),
    fontStyle: parseNullableKeyword(raw.fontStyle, STYLING_FONT_STYLES),
    lineHeight: parseNullableKeyword(raw.lineHeight, LINE_HEIGHTS),
    labelCase: parseNullableKeyword(raw.labelCase, LABEL_CASES),
    labelWidthPct: parseLabelWidthPct(raw.labelWidthPct),
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
