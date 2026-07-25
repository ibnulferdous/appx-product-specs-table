// Pure presentation mapping for the spec-table styling vocabulary (feature 57 —
// Style tab, Step 2). Turns a parsed `StylingValues` into the two things a
// stylesheet can consume: CSS custom properties (`stylingToCssVars`) and BEM
// modifier classes (`stylingToModifierClasses`).
//
// The organizing rule (locked in the Step 2 spec):
//
//   Nullable fields -> CSS custom properties. Non-null knobs -> modifier classes.
//
// A nullable field (colors, typography, labelWidthPct) has null = inherit, and
// "inherit" in CSS is expressed by NOT setting the property so the stylesheet's
// `var(--x, <fallback>)` fallback wins — present = override, absent = theme. A
// non-null knob always has a concrete value and selects between structural rule
// sets, which a value substitution cannot express — hence a class.
//
// This module is framework-free on purpose (same rationale as `tableStyling.ts`):
// the storefront Liquid block (Step 7) and the preview iframe (Step 6) consume
// THE SAME mapping, so it must stay client-safe and Node-testable.
//
// TWO consumers, and that is correct — not an unfinished job. This comment once
// named "the live editing grid (Step 11)" as a third. That step was built and
// then WITHDRAWN (`context/features/67-…`): the Edit grid is a fixed editing
// surface that never reflects merchant styling, and the device previews are the
// only place styling appears. Do not wire a third consumer here.
//
// Security posture: `parseStylingValues` is the only trust boundary — colors are
// hex-whitelisted, fontSize/labelWidthPct are clamped integers, keywords are
// list-membership checked. This module therefore does not re-escape, and its
// signature enforces that: it accepts `StylingValues`, never `unknown`. Every
// mapping is total (a `switch` with an exhaustive `never` default, or a Record
// keyed by the full union), so a future allowed-value addition is a compile
// error, never a silently-interpolated `undefined`.

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

// The `--appx-spec-*` prefix follows the existing `--appx-*` convention
// (code-standards.md → Color & Theming), scoped with `spec` so a merchant theme
// cannot collide. Keyed by `StylingValues` field name so Steps 3/6/7 reference
// `SPEC_TABLE_CSS_VARS.borderColor` instead of retyping the string.
export const SPEC_TABLE_CSS_VARS = Object.freeze({
  headerBgColor: "--appx-spec-header-bg",
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
} as const);

// --- Shared numeric/keyword scales -------------------------------------------

// Exported (not inlined) so Step 3's stylesheet fallbacks and the Step 10
// control previews read the same numbers. `satisfies Record<Union, string>`
// makes each scale total over its keyword union — adding a member to the
// Step 1 array without mapping it here is a compile error.

// Theme-relative em multipliers (the Step 1 typography lock): S/M/L multiply
// the merchant's theme base font, so they survive a theme switch. Only the
// Custom-px escape hatch below is absolute.
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
 * emitted ONLY when the source field is non-null — never an empty string,
 * `"inherit"`, or `"initial"` — so an all-inherit value yields `{}` and the
 * stylesheet's `var(--x, <fallback>)` keeps the merchant's theme as the true
 * default. Key order follows the `StylingValues` field order (stable across
 * calls; Step 6 recomputes the preview `srcDoc` every render).
 */
export function stylingToCssVars(
  values: StylingValues,
): Record<string, string> {
  const vars: Record<string, string> = {};

  // The px knobs in `STYLING_FIELD_NAMES` order — the section gap, then the
  // three container integers. All four are integer-clamped by Step 1, so the
  // `px` suffix is appended to a validated number — the same posture as
  // `fontSize`'s absolute override.
  //
  // `tableAlign` is absent here on purpose: it is a non-null keyword knob, so it
  // travels as a modifier class (see `stylingToModifierClasses`).
  const pxFields = [
    "sectionGapPx",
    "tableMaxWidthPx",
    "outerBorderWidthPx",
    "outerBorderRadiusPx",
  ] as const;
  for (const field of pxFields) {
    const px = values[field];
    if (px !== null) vars[SPEC_TABLE_CSS_VARS[field]] = `${px}px`;
  }

  const colorFields = [
    "headerBgColor",
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

// The vertical rule between the label and value columns. A CLASS and not a
// custom property, per this file's organizing rule: it is a non-null keyword
// knob, and it selects between two rule sets (a border or none) rather than
// substituting a value. It carries no width or color of its own — the ON rule
// hardcodes the 1px hairline and reads `--appx-spec-border-color`, so the
// column rule is dressed by the same swatch as the row rules by construction.
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
 * block. EVERY knob emits its class, defaults included — omitting defaults
 * would make "default" mean "whatever the unmodified base rule does", which
 * drifts the moment a base rule changes; emitting always keeps every knob's
 * rules at equal specificity and makes the list a total function of the value.
 * `sectionsCollapsible` is the one boolean and follows the CSS presence-flag
 * idiom (emitted only when true).
 *
 * `sectionsInitialState` deliberately produces NO class — it decides the `open`
 * attribute on the Step 9 `<details>` markup, which CSS cannot express.
 *
 * Order follows `STYLING_FIELD_NAMES` and is stable across calls.
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
  // property. They exist because each one needs a rule that a value
  // substitution cannot express, and CSS cannot branch on whether a var is set:
  //
  // - `--section-gap` carries the gap rule itself, rather than letting every
  //   collapsible table declare `margin-block-start: var(--…, 0)`. An explicit
  //   0 from a two-class selector would beat a theme's own element-level
  //   `details` margin, restyling tables whose merchant never touched the knob.
  //   It ALSO tells the feature-80 separator to stand down: once whitespace
  //   separates the bands, the hairline between them is a stray line.
  // - `--outer-border` drops the LAST row's own bottom rule, which would
  //   otherwise sit directly on the wrapper's border and read as one thick
  //   line. Unconditionally dropping it would change every existing table.
  // - `--outer-radius` turns on `overflow: hidden`, without which a rounded
  //   corner does not clip the section band or the stripe fills behind it.
  //   Gated rather than always-on because clipping an over-wide table is worse
  //   than letting it overflow visibly, and only a radius needs it.
  //
  // Same idiom as `--collapsible`: emitted only when the knob is set, so the
  // "null = default" rendering stays byte-identical to the pre-knob look.
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
 * The one shared string form of a var record — `--k: v;` per entry, input
 * order preserved, `""` for `{}`. Both downstream renderers need the identical
 * join (the Step 6 preview's `<style>` block and the Step 7 Liquid wrapper's
 * `style` attribute), so it lives here rather than being duplicated. Formats
 * only; validation happened at `parseStylingValues`.
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
