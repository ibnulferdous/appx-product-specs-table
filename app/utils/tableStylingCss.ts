// Pure presentation mapping for the styling vocabulary: a parsed `StylingValues`
// becomes CSS custom properties (`stylingToCssVars`) and BEM modifier classes
// (`stylingToModifierClasses`).
//
// The organizing rule:
//
//   Nullable fields -> CSS custom properties. Non-null knobs -> modifier classes.
//
// A nullable field has null = inherit, and "inherit" is expressed by NOT setting
// the property so the stylesheet's `var(--x, <fallback>)` wins. A non-null knob
// always has a concrete value and selects between structural rule sets, which a
// value substitution cannot express.
//
// 🚫 There are TWO consumers — the storefront Liquid block and the preview iframe
// — and that is correct, not an unfinished job. The Edit grid is a fixed editing
// surface that never reflects merchant styling (see `context/features/67-…`,
// built then withdrawn). Do not wire a third consumer here.
//
// Security: `parseStylingValues` is the only trust boundary — colors are
// hex-whitelisted, integers clamped, keywords membership-checked. This module
// therefore does not re-escape, and its signature enforces that by accepting
// `StylingValues`, never `unknown`. Every mapping is total, so a new allowed
// value is a compile error rather than a silently-interpolated `undefined`.

import type {
  ColumnDividerStyle,
  Density,
  LabelCase,
  LineHeight,
  MobileLayout,
  RowDividerStyle,
  RowLayout,
  SectionHeaderStyle,
  StylingFontSizeKeyword,
  StylingFontStyle,
  StylingFontWeight,
  StylingValues,
  TableAlign,
} from "./tableStyling";

// --- Custom property names ---------------------------------------------------

// The `--appx-spec-*` prefix follows the `--appx-*` convention, scoped with
// `spec` so a merchant theme cannot collide. Keyed by `StylingValues` field name
// so callers reference `SPEC_TABLE_CSS_VARS.borderColor`, not the raw string.
export const SPEC_TABLE_CSS_VARS = Object.freeze({
  headerBgColor: "--appx-spec-header-bg",
  // The one var whose fallback chain has TWO links: the stylesheet reads
  // `var(--appx-spec-header-underline-color, var(--appx-spec-border-color,
  // currentColor))`, so an unset underline follows the Divider swatch and then
  // the title's own colour. That is why its swatch has no empty-state help text.
  headerUnderlineColor: "--appx-spec-header-underline-color",
  headerTextColor: "--appx-spec-header-color",
  headerFontSizePx: "--appx-spec-header-font-size",
  headerFontWeight: "--appx-spec-header-font-weight",
  headerCase: "--appx-spec-header-transform",
  headerPaddingBlockPx: "--appx-spec-header-padding-block",
  labelBgColor: "--appx-spec-label-bg",
  valueBgColor: "--appx-spec-value-bg",
  stripeBgColor: "--appx-spec-stripe-bg",
  borderColor: "--appx-spec-border-color",
  labelTextColor: "--appx-spec-label-color",
  valueTextColor: "--appx-spec-value-color",
  fontSize: "--appx-spec-font-size",
  fontWeight: "--appx-spec-font-weight",
  fontStyle: "--appx-spec-font-style",
  lineHeight: "--appx-spec-line-height",
  labelCase: "--appx-spec-label-transform",
  labelWidthPct: "--appx-spec-label-width",
  sectionGapPx: "--appx-spec-section-gap",
  tableMaxWidthPx: "--appx-spec-table-max-width",
  outerBorderWidthPx: "--appx-spec-outer-border-width",
  outerBorderColor: "--appx-spec-outer-border-color",
  outerBorderRadiusPx: "--appx-spec-outer-radius",
  // The `grid` prefix matters: "column" is already spoken for in this vocabulary
  // — `--appx-spec-column-divider`'s column is the label/value SEAM, the opposite
  // of a grid track.
  gridMinColumnWidthPx: "--appx-spec-grid-min-column",
} as const);

// --- Shared numeric/keyword scales -------------------------------------------

// Exported so the stylesheet fallbacks and the control previews read the same
// numbers. `satisfies Record<Union, string>` makes each scale total over its
// keyword union — a new member with no mapping here is a compile error.

// Theme-relative em multipliers: S/M/L multiply the merchant's theme base font,
// so they survive a theme switch. Only the Custom-px hatch is absolute.
export const FONT_SIZE_EM_SCALE = Object.freeze({
  SMALL: "0.875em",
  MEDIUM: "1em",
  LARGE: "1.125em",
} as const satisfies Record<StylingFontSizeKeyword, string>);

export const FONT_WEIGHT_SCALE = Object.freeze({
  REGULAR: "400",
  MEDIUM: "500",
  BOLD: "700",
} as const satisfies Record<StylingFontWeight, string>);

// Unitless on purpose: a unitless line-height inherits as a RATIO, so child
// elements recompute against their own font size instead of a frozen px value.
export const LINE_HEIGHT_SCALE = Object.freeze({
  TIGHT: "1.25",
  NORMAL: "1.5",
  LOOSE: "1.8",
} as const satisfies Record<LineHeight, string>);

export const LABEL_CASE_TRANSFORMS = Object.freeze({
  DEFAULT: "none",
  UPPERCASE: "uppercase",
} as const satisfies Record<LabelCase, string>);

// --- CSS custom properties ---------------------------------------------------

function fontStyleValue(style: StylingFontStyle): string {
  switch (style) {
    case "NORMAL":
      return "normal";
    case "ITALIC":
      return "italic";
    default:
      return assertNever(style);
  }
}

/**
 * The nullable color/typography/width fields as CSS custom properties. A key is
 * emitted ONLY when the source field is non-null — never `""`, `"inherit"` or
 * `"initial"` — so an all-inherit value yields `{}` and the stylesheet's
 * `var(--x, <fallback>)` keeps the merchant's theme as the true default. Key
 * order follows `StylingValues` and is stable across calls.
 */
export function stylingToCssVars(
  values: StylingValues,
): Record<string, string> {
  const vars: Record<string, string> = {};

  // ⚠️ The guard is `!== null`, not falsiness, and that matters for exactly one
  // field: `headerPaddingBlockPx` may legitimately be 0, which must emit `0px`
  // rather than fall through to the stylesheet's `0.75rem` fallback.
  //
  // `tableAlign` is absent here on purpose — a non-null keyword knob travels as
  // a modifier class instead.
  const pxFields = [
    "headerFontSizePx",
    "headerPaddingBlockPx",
    "sectionGapPx",
    "tableMaxWidthPx",
    "outerBorderWidthPx",
    "outerBorderRadiusPx",
    // No companion presence flag: the grid rules are already gated by the
    // `--layout-grid` class and the `var(--…, 240px)` fallback covers null, so
    // there is nothing for a flag to switch on.
    "gridMinColumnWidthPx",
  ] as const;
  for (const field of pxFields) {
    const px = values[field];
    if (px !== null) vars[SPEC_TABLE_CSS_VARS[field]] = `${px}px`;
  }

  const colorFields = [
    "headerBgColor",
    "headerUnderlineColor",
    "headerTextColor",
    "labelBgColor",
    "valueBgColor",
    "stripeBgColor",
    "borderColor",
    "outerBorderColor",
    "labelTextColor",
    "valueTextColor",
  ] as const;
  for (const field of colorFields) {
    const color = values[field];
    // Hex-whitelisted by parseStylingValues — emitted verbatim.
    if (color !== null) vars[SPEC_TABLE_CSS_VARS[field]] = color;
  }

  if (values.fontSize !== null) {
    vars[SPEC_TABLE_CSS_VARS.fontSize] =
      typeof values.fontSize === "number"
        ? `${values.fontSize}px` // absolute override; integer-clamped by Step 1
        : FONT_SIZE_EM_SCALE[values.fontSize];
  }
  if (values.fontWeight !== null) {
    vars[SPEC_TABLE_CSS_VARS.fontWeight] = FONT_WEIGHT_SCALE[values.fontWeight];
  }
  // Reuses the label knobs' scales rather than declaring parallel ones, so the
  // two cannot drift into disagreeing about what "Bold" means.
  if (values.headerFontWeight !== null) {
    vars[SPEC_TABLE_CSS_VARS.headerFontWeight] =
      FONT_WEIGHT_SCALE[values.headerFontWeight];
  }
  if (values.headerCase !== null) {
    vars[SPEC_TABLE_CSS_VARS.headerCase] =
      LABEL_CASE_TRANSFORMS[values.headerCase];
  }
  if (values.fontStyle !== null) {
    vars[SPEC_TABLE_CSS_VARS.fontStyle] = fontStyleValue(values.fontStyle);
  }
  if (values.lineHeight !== null) {
    vars[SPEC_TABLE_CSS_VARS.lineHeight] = LINE_HEIGHT_SCALE[values.lineHeight];
  }
  if (values.labelCase !== null) {
    vars[SPEC_TABLE_CSS_VARS.labelCase] =
      LABEL_CASE_TRANSFORMS[values.labelCase];
  }
  if (values.labelWidthPct !== null) {
    // Integer-clamped by Step 1; safe to interpolate.
    vars[SPEC_TABLE_CSS_VARS.labelWidthPct] = `${values.labelWidthPct}%`;
  }

  return vars;
}

// --- Modifier classes --------------------------------------------------------

// All modifiers hang off the existing storefront block, so Step 3 adds rules
// without touching markup.
const BLOCK = "appx-spec-table";

function rowLayoutClass(layout: RowLayout): string {
  switch (layout) {
    case "TWO_COLUMN":
      return `${BLOCK}--layout-two-column`;
    case "STACKED":
      return `${BLOCK}--layout-stacked`;
    case "GRID":
      return `${BLOCK}--layout-grid`;
    default:
      return assertNever(layout);
  }
}

function mobileLayoutClass(layout: MobileLayout): string {
  switch (layout) {
    case "STACKED":
      return `${BLOCK}--mobile-stacked`;
    case "SAME_AS_DESKTOP":
      return `${BLOCK}--mobile-same-as-desktop`;
    default:
      return assertNever(layout);
  }
}

function sectionHeaderStyleClass(style: SectionHeaderStyle): string {
  switch (style) {
    case "BANDED":
      return `${BLOCK}--section-banded`;
    case "TEXT_ONLY":
      return `${BLOCK}--section-text-only`;
    case "PLAIN":
      return `${BLOCK}--section-plain`;
    default:
      return assertNever(style);
  }
}

function rowDividerStyleClass(style: RowDividerStyle): string {
  switch (style) {
    case "LINES":
      return `${BLOCK}--dividers-lines`;
    case "STRIPES":
      return `${BLOCK}--dividers-stripes`;
    case "NONE":
      return `${BLOCK}--dividers-none`;
    default:
      return assertNever(style);
  }
}

// Carries no width or color of its own — the ON rule hardcodes the 1px hairline
// and reads `--appx-spec-border-color`, so the column rule is dressed by the same
// swatch as the row rules by construction.
function columnDividerStyleClass(style: ColumnDividerStyle): string {
  switch (style) {
    case "NONE":
      return `${BLOCK}--column-divider-none`;
    case "LINE":
      return `${BLOCK}--column-divider-line`;
    default:
      return assertNever(style);
  }
}

function densityClass(density: Density): string {
  switch (density) {
    case "DEFAULT":
      return `${BLOCK}--density-default`;
    case "COMPACT":
      return `${BLOCK}--density-compact`;
    case "SPACIOUS":
      return `${BLOCK}--density-spacious`;
    default:
      return assertNever(density);
  }
}

function tableAlignClass(align: TableAlign): string {
  switch (align) {
    case "LEFT":
      return `${BLOCK}--align-left`;
    case "CENTER":
      return `${BLOCK}--align-center`;
    case "RIGHT":
      return `${BLOCK}--align-right`;
    default:
      return assertNever(align);
  }
}

/**
 * The non-null layout knobs as BEM modifier classes on the `appx-spec-table`
 * block.
 *
 * ⚠️ EVERY knob emits its class, defaults included. Omitting defaults would make
 * "default" mean "whatever the unmodified base rule does", which drifts the
 * moment a base rule changes; emitting always keeps every knob's rules at equal
 * specificity. `sectionsCollapsible` is the one boolean and follows the presence-
 * flag idiom.
 *
 * `sectionsInitialState` deliberately produces NO class — it decides the `open`
 * attribute on the `<details>` markup, which CSS cannot express.
 */
export function stylingToModifierClasses(values: StylingValues): string[] {
  const classes: string[] = [
    rowLayoutClass(values.rowLayout),
    mobileLayoutClass(values.mobileLayout),
    sectionHeaderStyleClass(values.sectionHeaderStyle),
  ];
  if (values.sectionsCollapsible) classes.push(`${BLOCK}--collapsible`);
  classes.push(
    rowDividerStyleClass(values.rowDividerStyle),
    columnDividerStyleClass(values.columnDividerStyle),
    densityClass(values.density),
    tableAlignClass(values.tableAlign),
  );
  // Three PRESENCE FLAGS for knobs whose value already travels as a custom
  // property. Each needs a rule a value substitution cannot express, and CSS
  // cannot branch on whether a var is set:
  //
  // - `--section-gap` carries the gap rule itself. An explicit 0 from a
  //   two-class selector would beat a theme's own `details` margin, restyling
  //   tables whose merchant never touched the knob. It also tells the separator
  //   to stand down — once whitespace separates the bands, a hairline is stray.
  // - `--outer-border` drops the LAST row's bottom rule, which would otherwise
  //   sit on the wrapper's border and read as one thick line.
  // - `--outer-radius` turns on `overflow: hidden`, without which a rounded
  //   corner does not clip the section band or stripe fills. Gated because
  //   clipping an over-wide table is worse than letting it overflow visibly.
  //
  // Emitted only when set, so "null = default" stays byte-identical to the
  // pre-knob look.
  if (values.sectionGapPx !== null) {
    classes.push(`${BLOCK}--section-gap`);
  }
  if (values.outerBorderWidthPx !== null) {
    classes.push(`${BLOCK}--outer-border`);
  }
  if (values.outerBorderRadiusPx !== null) {
    classes.push(`${BLOCK}--outer-radius`);
  }
  return classes;
}

// --- String form -------------------------------------------------------------

/**
 * The one shared string form of a var record — `--k: v;` per entry, input order
 * preserved, `""` for `{}`. Both renderers (the preview's `<style>` block and the
 * Liquid wrapper's `style` attribute) need the identical join. Formats only;
 * validation happened at `parseStylingValues`.
 */
export function formatCssVarDeclarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}

// --- Internal ----------------------------------------------------------------

// Exhaustiveness backstop: reached only if a switch above stops being total,
// which the `never` parameter turns into a compile error at the call site.
function assertNever(value: never): never {
  throw new Error(`Unhandled styling value: ${String(value)}`);
}
