import {
  COLUMN_DIVIDER_STYLES,
  DENSITIES,
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
  GRID_MIN_COLUMN_WIDTH_PX_MAX,
  GRID_MIN_COLUMN_WIDTH_PX_MIN,
  HEADER_PADDING_BLOCK_PX_MAX,
  HEADER_PADDING_BLOCK_PX_MIN,
  LABEL_CASES,
  LABEL_WIDTH_PCT_MAX,
  LABEL_WIDTH_PCT_MIN,
  LINE_HEIGHTS,
  MOBILE_LAYOUTS,
  OUTER_BORDER_RADIUS_PX_MAX,
  OUTER_BORDER_RADIUS_PX_MIN,
  OUTER_BORDER_WIDTH_PX_MAX,
  OUTER_BORDER_WIDTH_PX_MIN,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTIONS_INITIAL_STATES,
  SECTION_GAP_PX_MAX,
  SECTION_GAP_PX_MIN,
  SECTION_HEADER_STYLES,
  STYLING_FONT_SIZES,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
  TABLE_ALIGNMENTS,
  TABLE_MAX_WIDTH_PX_MAX,
  TABLE_MAX_WIDTH_PX_MIN,
  parseStylingValues,
  type StylingFontSize,
  type StylingValues,
} from "../../utils/tableStyling";

// Merchant-facing option lists for the Style-tab rail controls. Pure — the panel
// renders these, the tests pin them, and nothing here imports React or Polaris.
//
// Every list is DERIVED from the domain constants in `tableStyling.ts` rather
// than hand-typed, so adding a knob value there can never leave a control
// silently offering a stale set. The domain owns which values exist; this module
// owns only how they read to a merchant.
//
// ⚠️ Before adding a gloss to anything here, read the rule on
// `StylingOption.helpText` — help text is deliberately sparse.

export interface StylingOption<T extends string> {
  value: T;
  label: string;
  /**
   * One-line plain-language gloss. OPTIONAL, and a gloss earns its place only by
   * doing one of three jobs:
   *
   *   1. reporting a state the control cannot show — a blank box, an empty
   *      swatch, `Inherit`;
   *   2. carrying a composition caveat — "two-column layouts only";
   *   3. describing a shopper-facing behavior change — collapsing, Row layout.
   *
   * An option labelled `Italic` or `Compact` explains itself and carries nothing.
   *
   * ⚠️ Absent, never `""` — an empty string renders as a blank grey line.
   * `selectedHelpText` in `StyleTab.tsx` keeps one from reaching a `details`
   * attribute.
   */
  helpText?: string;
}

/**
 * The merchant-facing copy for one option, keyed off a domain constant below.
 *
 * Named because twelve `Record`s repeat it, and because it is the one place the
 * "help text is optional" rule above is visible in the type system.
 */
type OptionCopy = { label: string; helpText?: string };

// Row dividers — the first control (Step 5). "Lines" is the default (it is
// `ROW_DIVIDER_STYLES[0]`, the storefront's long-standing hairline look), so an
// existing table's appearance is unchanged until a merchant picks otherwise.
const ROW_DIVIDER_LABELS: Record<
  (typeof ROW_DIVIDER_STYLES)[number],
  OptionCopy
> = {
  LINES: { label: "Lines", helpText: "A hairline rule between rows." },
  STRIPES: {
    label: "Stripes",
    helpText: "Alternating row shading, no rules.",
  },
  NONE: { label: "None", helpText: "No rules and no shading." },
};

export const ROW_DIVIDER_OPTIONS: ReadonlyArray<
  StylingOption<(typeof ROW_DIVIDER_STYLES)[number]>
> = ROW_DIVIDER_STYLES.map((value) => ({
  value,
  label: ROW_DIVIDER_LABELS[value].label,
  helpText: ROW_DIVIDER_LABELS[value].helpText,
}));

// The orphan entry: what Stripes reads as once it is no longer offered but is
// still the stored value. Not in the Record above, because it is not a second
// vocabulary for the knob — it is the one label that says "this is what you have
// and it is not doing anything".
const STRIPES_UNAVAILABLE_OPTION: StylingOption<
  (typeof ROW_DIVIDER_STYLES)[number]
> = {
  value: "STRIPES",
  label: "Stripes — not available in Grid",
  helpText: "Stripes do not apply in Grid layout. Pick Lines or None.",
};

/**
 * The Row-dividers options for the styling currently on screen.
 *
 * A derived list rather than a `.filter()` at the call site because of the
 * ORPHAN VALUE. Grid mode does not offer Stripes (zebra parity across several
 * tracks paints a checkerboard), but a merchant who chose Stripes on a
 * two-column table and then switched to Grid still has `STRIPES` stored — a
 * naive filter would leave the select bound to a value with no matching option,
 * rendering blank and reading as a broken control. So Stripes is gone for
 * everyone who has not chosen it, and stays visible, labelled inert, for the one
 * merchant who has.
 *
 * 🚫 Deliberately NOT coercing `STRIPES` to `LINES` on a layout change. That
 * destroys a setting preserve-on-hide exists to protect, and would make a
 * `rowLayout` change write a different field — every visibility rule here is a
 * pure read.
 *
 * ⚠️ Not in `VISIBILITY_PREDICATES`: that registry enforces preserve-on-hide over
 * whole CONTROLS. A hidden control cannot lie because it is not rendered; this
 * one is. It has its own tests.
 *
 * The stylesheet stands the stripe fill down independently, since the rail is not
 * the only writer of a `GRID` + `STRIPES` pair.
 */
export function rowDividerOptionsFor(
  styling: StylingValues,
): ReadonlyArray<StylingOption<(typeof ROW_DIVIDER_STYLES)[number]>> {
  if (styling.rowLayout !== "GRID") return ROW_DIVIDER_OPTIONS;

  const offered = ROW_DIVIDER_OPTIONS.filter(
    (option) => option.value !== "STRIPES",
  );
  return styling.rowDividerStyle === "STRIPES"
    ? [...offered, STRIPES_UNAVAILABLE_OPTION]
    : offered;
}

// Column divider — the row knob's vertical partner. Two members only: the rule
// is a fixed hairline dressed by the shared Border swatch, so there is nothing
// to size or color.
//
// ⚠️ Deliberately NOT hidden on stacked layouts: the value stays meaningful for
// the two-column case a merchant may switch back to, and the stylesheet already
// suppresses the rule there — so the LINE help text has to say so, or the no-op
// reads as a broken control.
const COLUMN_DIVIDER_LABELS: Record<
  (typeof COLUMN_DIVIDER_STYLES)[number],
  OptionCopy
> = {
  NONE: { label: "None", helpText: "No rule between label and value." },
  LINE: {
    label: "Line",
    helpText: "A hairline between the two columns — two-column layouts only.",
  },
};

export const COLUMN_DIVIDER_OPTIONS: ReadonlyArray<
  StylingOption<(typeof COLUMN_DIVIDER_STYLES)[number]>
> = COLUMN_DIVIDER_STYLES.map((value) => ({
  value,
  label: COLUMN_DIVIDER_LABELS[value].label,
  helpText: COLUMN_DIVIDER_LABELS[value].helpText,
}));

// --- Step 8 knobs -----------------------------------------------------------
//
// Each list repeats the shape above: a `Record` keyed on the domain union, then
// a `.map` over the domain constant. The Record key type is what makes adding a
// domain value a COMPILE ERROR here — an array literal would just go stale
// silently. Labels follow `admin-screen-plan.md` §Tab 2 merchant-facing wording.

// Row layout — how a label/value pair sits on desktop.
const ROW_LAYOUT_LABELS: Record<(typeof ROW_LAYOUTS)[number], OptionCopy> = {
  TWO_COLUMN: {
    label: "Two-column",
    helpText: "Label on the left, value on the right.",
  },
  STACKED: { label: "Stacked", helpText: "Label above the value." },
  GRID: {
    label: "Grid",
    helpText:
      "Labels sit above their values and flow into as many columns as fit.",
  },
};

export const ROW_LAYOUT_OPTIONS: ReadonlyArray<
  StylingOption<(typeof ROW_LAYOUTS)[number]>
> = ROW_LAYOUTS.map((value) => ({
  value,
  label: ROW_LAYOUT_LABELS[value].label,
  helpText: ROW_LAYOUT_LABELS[value].helpText,
}));

// Mobile layout — what happens to a TWO-COLUMN table on a narrow screen. On a
// stacked table both options render identically, which is why the rail hides
// this control then (see `showsMobileLayoutControl`).
//
// No help text (feature 86): under a control labelled "On mobile", `Stacked`
// and `Same as desktop` each state their own effect, and the two glosses they
// carried ("Label above the value on small screens.") only said the label back.
const MOBILE_LAYOUT_LABELS: Record<
  (typeof MOBILE_LAYOUTS)[number],
  OptionCopy
> = {
  STACKED: { label: "Stacked" },
  SAME_AS_DESKTOP: { label: "Same as desktop" },
};

export const MOBILE_LAYOUT_OPTIONS: ReadonlyArray<
  StylingOption<(typeof MOBILE_LAYOUTS)[number]>
> = MOBILE_LAYOUTS.map((value) => ({
  value,
  label: MOBILE_LAYOUT_LABELS[value].label,
  helpText: MOBILE_LAYOUT_LABELS[value].helpText,
}));

// Section headers — how a section title row reads against the rows around it.
//
// Every label names the LOOK, and no label is reused across values. TEXT_ONLY
// reads "Underlined" (feature 87) because it was never text-only: it drops the
// band and keeps a 2px rule, which is what sent a merchant looking for a bare
// title and finding nothing that produced one. The wire value is untouched, so
// a merchant already on it sees their choice renamed, not changed.
const SECTION_HEADER_LABELS: Record<
  (typeof SECTION_HEADER_STYLES)[number],
  OptionCopy
> = {
  BANDED: {
    label: "Banded",
    helpText: "A shaded band behind the section title.",
  },
  TEXT_ONLY: {
    label: "Underlined",
    helpText: "Bold title with a rule beneath it.",
  },
  PLAIN: {
    label: "Plain",
    helpText: "Bold title, nothing else.",
  },
};

export const SECTION_HEADER_OPTIONS: ReadonlyArray<
  StylingOption<(typeof SECTION_HEADER_STYLES)[number]>
> = SECTION_HEADER_STYLES.map((value) => ({
  value,
  label: SECTION_HEADER_LABELS[value].label,
  helpText: SECTION_HEADER_LABELS[value].helpText,
}));

// --- Feature 81 · section-header typography + spacing ------------------------
//
// Four controls that refine the band the knob above turns on, so they sit
// directly under it in the Sections group. All four are NULLABLE, so they take
// the Step 10 "inherit" vocabulary further down this file — but note the two
// selects below cannot reuse the label knobs' option lists even though they
// reuse their DOMAINS: the help text has to say "section title", or a merchant
// reads the two Uppercase controls as the same switch appearing twice.
//
// (The option lists themselves are declared after `withInheritOption` is
// defined; only the domain reuse is worth flagging here.)

/** A stored section-title size as the string a number field holds. */
export function toHeaderFontSizeControlValue(px: number | null): string {
  return toBoundedIntControlValue(px);
}

/**
 * The section-title size box's string back to a clamped px, or null when empty.
 *
 * The blank-box idiom, deliberately NOT the zero-means-off one the three
 * container px knobs use: clearing this means "match the surrounding text",
 * which is a real inherit rather than an off state, and `0` is not a size a
 * font can have. Anything below the floor clamps up to it, as everywhere else.
 */
export function fromHeaderFontSizeControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(raw, FONT_SIZE_PX_MIN, FONT_SIZE_PX_MAX);
}

/** A stored band padding as the string a number field holds; null = empty. */
export function toHeaderPaddingBlockControlValue(px: number | null): string {
  return toBoundedIntControlValue(px);
}

/**
 * The band-padding box's string back to a stored px, or null when empty.
 *
 * ⚠️ The one converter in this file where a typed `0` and an EMPTY box mean
 * different things, and both are legitimate. Empty is null — inherit the
 * stylesheet's own 0.75rem. A typed 0 is a stored 0 — no padding at all, a
 * visibly different render. That is only safe because this knob's null means
 * "the default" rather than "off" (see `HEADER_PADDING_BLOCK_PX_MIN`); the
 * container knobs' zero-means-off boxes exist precisely because for THEM the
 * two states coincide.
 *
 * A negative therefore clamps to 0 (no padding) rather than degrading to null —
 * the floor is a real value here, so clamping to it is the honest read.
 */
export function fromHeaderPaddingBlockControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    HEADER_PADDING_BLOCK_PX_MIN,
    HEADER_PADDING_BLOCK_PX_MAX,
  );
}

// Density — a padding scale, nothing else, and the three labels are the whole
// vocabulary. No help text (feature 86): "Compact — Tighter rows" is the label
// with more words.
const DENSITY_LABELS: Record<(typeof DENSITIES)[number], OptionCopy> = {
  DEFAULT: { label: "Default" },
  COMPACT: { label: "Compact" },
  SPACIOUS: { label: "Spacious" },
};

export const DENSITY_OPTIONS: ReadonlyArray<
  StylingOption<(typeof DENSITIES)[number]>
> = DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value].label,
  helpText: DENSITY_LABELS[value].helpText,
}));

// --- Container knobs: table width + outer border -----------------------------
//
// Table alignment — the only non-nullable keyword knob in the container group,
// so it follows the plain option-list shape above rather than the `Inherit`
// vocabulary further down.
//
// No help text (feature 86). The three glosses it carried named the SPACE the
// table sits in ("Table hugs the left of the section."), because alignment is
// invisible until a max width leaves some space to sit in — but the control is
// HIDDEN until exactly that condition holds (`showsTableAlignControl`), so by
// the time a merchant can read the caveat it no longer applies. Left / Center /
// Right need no gloss once they are on screen at all.
const TABLE_ALIGN_LABELS: Record<
  (typeof TABLE_ALIGNMENTS)[number],
  OptionCopy
> = {
  LEFT: { label: "Left" },
  CENTER: { label: "Center" },
  RIGHT: { label: "Right" },
};

export const TABLE_ALIGN_OPTIONS: ReadonlyArray<
  StylingOption<(typeof TABLE_ALIGNMENTS)[number]>
> = TABLE_ALIGNMENTS.map((value) => ({
  value,
  label: TABLE_ALIGN_LABELS[value].label,
  helpText: TABLE_ALIGN_LABELS[value].helpText,
}));

/**
 * Whether the rail shows the alignment control. A full-width table fills its
 * section, so all three alignments render identically.
 *
 * A pure READ, so clearing the max width keeps the merchant's alignment and
 * putting a cap back returns their choice rather than Left.
 */
export function showsTableAlignControl(styling: StylingValues): boolean {
  return styling.tableMaxWidthPx !== null;
}

// --- Step 9b knobs ----------------------------------------------------------
//
// `sectionsCollapsible` is the one BOOLEAN in `StylingValues`, so it gets a
// toggle and needs no option list at all — it is the rail's first non-select
// control, which is exactly why Step 8's rejection of a generic
// `<StylingSelect>` wrapper was the right call.
//
// Sections initial state — which disclosures are open when the page loads. Only
// meaningful while collapsible is on (see `showsSectionsInitialStateControl`).
//
// No help text (feature 86): the control reads "Sections start" and the options
// complete the sentence — "Sections start: All open". The glosses were that
// sentence written out a second time.
const SECTIONS_INITIAL_STATE_LABELS: Record<
  (typeof SECTIONS_INITIAL_STATES)[number],
  OptionCopy
> = {
  ALL_OPEN: { label: "All open" },
  FIRST_OPEN: { label: "First open" },
  ALL_CLOSED: { label: "All closed" },
};

export const SECTIONS_INITIAL_STATE_OPTIONS: ReadonlyArray<
  StylingOption<(typeof SECTIONS_INITIAL_STATES)[number]>
> = SECTIONS_INITIAL_STATES.map((value) => ({
  value,
  label: SECTIONS_INITIAL_STATE_LABELS[value].label,
  helpText: SECTIONS_INITIAL_STATE_LABELS[value].helpText,
}));

/**
 * Whether the rail shows the "When the page loads" control. The initial state
 * describes which `<details>` start open, so it means nothing while sections are
 * not collapsible.
 *
 * Hidden, not disabled, and a pure READ: toggling collapsible off and back on
 * returns the merchant's own choice. Clearing the value on hide would be silent
 * data loss, and is unit-tested as such.
 */
export function showsSectionsInitialStateControl(
  styling: StylingValues,
): boolean {
  return styling.sectionsCollapsible;
}

/**
 * Whether the rail shows the "Gap between sections" control — the only predicate
 * gated on two knobs at once.
 *
 * 🔴 What cannot express a gap is a TABLE FORMATTING CONTEXT, not the flat shape.
 * "A flat section header is a `<tr>` and a `<tr>` takes no margin" is true only
 * under `TWO_COLUMN`: a `<tr>` displays as `block` under `STACKED` and as a grid
 * item under `GRID`, and margin applies in both.
 *
 * `!== "TWO_COLUMN"` rather than a membership test, because the EXCLUDED case is
 * the one with a reason — a fourth `ROW_LAYOUTS` member should inherit "the gap
 * works". An OR, not a replacement: disclosures exist at any row layout, so every
 * table that has a gap today keeps it.
 *
 * 🚫 Two-column with collapsing off stays excluded. `padding-block-start` grows
 * the band rather than opening a gap, and a transparent `border-block-start`
 * loses the `border-collapse: collapse` width contest and silently deletes the
 * previous row's divider.
 */
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible || styling.rowLayout !== "TWO_COLUMN";
}

/**
 * Whether the rail shows the "On mobile" control. A stacked desktop table is
 * already stacked everywhere, so both options mean the same thing.
 *
 * Reads `=== "TWO_COLUMN"` rather than `!== "STACKED"` because GRID reaches the
 * same conclusion by another route: `auto-fit` fits exactly one track at phone
 * width, so there is no mobile behaviour left to choose.
 *
 * ⚠️ A RAIL concern only, and a read rather than a write. It never mutates
 * `mobileLayout`, and it does not change what gets emitted —
 * `stylingToModifierClasses` still puts the mobile modifier on a stacked table's
 * wrapper, which is correct and must not be special-cased to match this.
 */
export function showsMobileLayoutControl(styling: StylingValues): boolean {
  return styling.rowLayout === "TWO_COLUMN";
}

/**
 * Whether the rail shows the "Minimum column width" control. A minimum-track
 * width with no grid to apply to is not a knob whose effect is merely invisible
 * — it is a knob with no referent at all, which is the bar a hide has to clear.
 */
export function showsGridMinColumnWidthControl(
  styling: StylingValues,
): boolean {
  return styling.rowLayout === "GRID";
}

/**
 * Whether the rail shows the Section headers "Background" swatch.
 *
 * ⚠️ Safe because the two BASE rules reading `--appx-spec-header-bg` are
 * UNREACHABLE for it. `stylingToModifierClasses` emits a section-header class
 * unconditionally, every member selector outspecifies the base one, and
 * `TEXT_ONLY` / `PLAIN` both hardcode `background: transparent` — so outside
 * BANDED the var is never consulted. One knob, one class, one live rule per
 * shape, and both markup shapes agree because every member rule is mirrored onto
 * the `<summary>`.
 *
 * 🚫 Deliberately NOT extended to "the template has no section header rows".
 * That is row DATA, not styling state — the rail would start hiding controls in
 * response to the merchant's content, a much larger claim.
 */
export function showsHeaderBackgroundControl(styling: StylingValues): boolean {
  return styling.sectionHeaderStyle === "BANDED";
}

/**
 * Whether the rail shows the Section headers "Underline color" swatch — the
 * exact mirror of `showsHeaderBackgroundControl`, on the same specificity
 * argument. `BANDED` and `PLAIN` both state `border-block-end: none` at member
 * specificity, so under either there is no rule left to consult the var.
 *
 * No orphan to guard: no other knob can strand this surface. The outer-border
 * exception that drops the LAST closed summary's rule takes away one element's
 * underline, not the surface, so it is not a hide condition.
 */
export function showsHeaderUnderlineColorControl(
  styling: StylingValues,
): boolean {
  return styling.sectionHeaderStyle === "TEXT_ONLY";
}

/**
 * Whether the rail shows the "Stripe background" swatch. `stripeBgColor` feeds
 * exactly ONE declaration — the `--dividers-stripes` even-row fill — so outside
 * Stripes it is a knob with no referent.
 *
 * 🚫 `borderColor` must NOT get the same treatment: it dresses four surfaces (row
 * rules, the column divider, the section separator, and the outline whenever
 * `outerBorderColor` is unset), so even at Row dividers = None it is the only
 * control for two live surfaces. One field, one surface, one rule is what earns a
 * hide, and only the stripe has it.
 *
 * The `!== "GRID"` half is not defensive — it catches the ORPHAN: a merchant who
 * chose Stripes then switched to Grid still has `STRIPES` stored, and the
 * stylesheet stands the fill down there. Without it the swatch would reappear in
 * exactly the state the select labels "not available in Grid", painting nothing.
 */
export function showsStripeBackgroundControl(styling: StylingValues): boolean {
  return styling.rowDividerStyle === "STRIPES" && styling.rowLayout !== "GRID";
}

/**
 * Whether the rail shows the Table size & frame "Outline color" swatch.
 * `--appx-spec-outer-border-color` is read by exactly ONE declaration, the
 * `border:` shorthand, which at the width's `0` fallback resolves to
 * `border: 0 solid <color>` — painting nothing. The width is the only thing that
 * can switch this surface on or off.
 *
 * 🚫 `outerBorderRadiusPx` must NOT get the same treatment — the near miss worth
 * stating. `--outer-radius` sets `overflow: hidden`, so the curve clips the
 * section band and stripe fills whether or not a frame is drawn. Gating Corner
 * radius on the width would remove the only control for a live effect.
 *
 * `!== null` rather than `>= 1`: `fromZeroMeansOffControlValue` never stores a 0,
 * so a null width and a `0` in the box are one state. Reading the STORED
 * vocabulary keeps this right if the display convention changes.
 *
 * ⚠️ THE FIRST PREDICATE THAT CAN EMPTY A GROUP — `tableFrame` holds exactly one
 * swatch, which is why `colorGrid` returns null on an empty filter instead of
 * painting a bare `<s-grid>`.
 */
export function showsOuterBorderColorControl(styling: StylingValues): boolean {
  return styling.outerBorderWidthPx !== null;
}

// --- The `null` vocabulary ---------------------------------------------------
//
// Thirteen `StylingValues` fields are NULLABLE, and null is semantic: "inherit
// from the merchant's theme", the app's zero-config promise, not a missing value.
//
// 🔴 THE TRAP THIS CLOSES: an `<s-option>`'s `value` is a string, so null needs a
// sentinel on the wire between the DOM and the engine. That sentinel must be
// converted HERE, at the control boundary, and must never reach `StylingValues`,
// the Save payload or the DB. A stray `""` would be coerced to null by
// `parseStylingValues` anyway, so the bug would be invisible in the editor and
// surface only as a wrong metaobject — hence two helpers, unit-tested in both
// directions, rather than open-coding it per control.
export const INHERIT_CONTROL_VALUE = "";

/** A nullable domain value as the string a Polaris control can hold. */
export function toControlValue<T extends string>(value: T | null): string {
  return value ?? INHERIT_CONTROL_VALUE;
}

/**
 * The inverse: a control's string back to a domain value or null.
 *
 * Membership-checked against the domain list rather than cast, so an unexpected
 * string degrades to null (= inherit) instead of being written into styling
 * state as a value the mapping has no case for.
 */
export function fromControlValue<T extends string>(
  raw: string,
  allowed: readonly T[],
): T | null {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

// --- Feature 86 · the rail's group vocabulary --------------------------------

/**
 * The rail's eight groups, in render order, with their merchant-facing
 * headings.
 *
 * Feature 86 recut the rail onto ONE axis — the object being styled. Before it,
 * four groups were cut by object (Layout / Size & frame / Sections / Rows) and
 * two by CSS property (Colors / Typography), so a merchant styling one part of
 * the table had to visit three groups: the band's background sat ~20 controls
 * from the control that turns the band on, and the label column had its weight
 * in Typography, its colors in Colors, and no group of its own at all.
 *
 * Headings live here rather than inline in the JSX so the vocabulary is one
 * table of truth: `COLOR_KNOBS` files each swatch under a group id from this
 * object, and the rail's contract test can check that every id is rendered.
 *
 * ⚠️ THE HEADINGS ARE LOAD-BEARING, not decoration. Feature 86 shortened labels
 * that used to name their own scope — "Label weight" became "Weight",
 * "Section title case" became "Title case" — on the strength of the group
 * heading stating it instead. That only holds while each group is a
 * `role="group"` wired to its heading with `aria-labelledby`, which is what
 * makes the scope announced rather than merely visible. Two swatches are
 * literally called "Background" (Labels and Values); nothing else tells them
 * apart.
 */
export const STYLE_GROUP_HEADINGS = {
  tableLayout: "Table layout",
  tableFrame: "Table size & frame",
  tableText: "Table text",
  sectionHeaders: "Section headers",
  collapsibleSections: "Collapsible sections",
  rows: "Rows",
  labels: "Labels",
  values: "Values",
} as const;

export type StyleGroupId = keyof typeof STYLE_GROUP_HEADINGS;

// --- Step 10a · colors -------------------------------------------------------

// The color fields, in `STYLING_FIELD_NAMES` order.
//
// `alpha` is ON for SURFACE colors and OFF for TEXT colors: the stylesheet's own
// defaults are translucent, so an opaque-only picker could not reproduce the
// default look, while translucent body text is a contrast bug rather than a
// design choice.
export type StylingColorFieldName =
  | "headerBgColor"
  | "headerUnderlineColor"
  | "headerTextColor"
  | "labelBgColor"
  | "valueBgColor"
  | "stripeBgColor"
  | "borderColor"
  | "outerBorderColor"
  | "labelTextColor"
  | "valueTextColor";

export interface ColorKnob {
  field: StylingColorFieldName;
  /**
   * Which rail group the swatch renders in.
   *
   * ⚠️ The array below stays in `STYLING_FIELD_NAMES` order — the color block is
   * contiguous there, and `stylingControls.test.ts` derives the expected order
   * from it — so a group's swatches are selected by FILTERING, never by
   * reordering.
   */
  group: StyleGroupId;
  label: string;
  // One line, because the rail is ~300px wide. Says which SURFACE the color
  // paints, since several of them are only visible in certain combinations.
  helpText: string;
  /**
   * What the swatch says while it is EMPTY — the state, not the surface.
   *
   * Per-swatch rather than one group note, because "inherits from your theme" is
   * true for only five of the ten: two fall back to an app literal, one to the
   * hairline grey, and `outerBorderColor` falls back THROUGH `borderColor`, so
   * its empty state is "follows another control on this screen".
   *
   * ⚠️ OPTIONAL, and the exception must stay a SHORT NAMED LIST (pinned in
   * `stylingControls.test.ts`), not a habit. Dropped for exactly one swatch —
   * `headerUnderlineColor` — whose fallback chain has two links and ends in
   * `currentColor`, so no string that fits a ~300px rail is true. A gloss that
   * cannot be true is worse than no gloss.
   */
  emptyHelpText?: string;
  alpha: boolean;
  /**
   * When present, the swatch renders only while this returns true.
   *
   * A property of the knob rather than a JSX guard because all the swatches are
   * produced by one `.filter(…).map(…)` over this array.
   *
   * 🔴 OPTIONAL, and it must stay the exception. The bar is a fact about the
   * STYLESHEET, not a tidiness judgement: the field must dress exactly one
   * SURFACE, and the hiding state must be one where that surface's rules cannot
   * fire at all — a var emitted, inherited, and read by nothing.
   *
   * ⚠️ "One surface", not "one rule": a section header has TWO markup shapes, so
   * `headerBgColor` and `headerUnderlineColor` each feed two live rules while
   * dressing one surface. Counting rules would wrongly disqualify both.
   *
   * 🚫 `borderColor` fails that bar and must stay ungated — it dresses the row
   * rules, the column divider, the section separator AND the outline whenever
   * `outerBorderColor` is unset. Check the stylesheet before adding an entry here.
   *
   * ⚠️ A FULLY GATED GROUP IS LEGAL, so the law is: a group whose swatches can ALL
   * vanish must still hold a non-swatch control that always renders, or the
   * heading and its divider fence nothing. `colorGrid` returns null when nothing
   * survives its filter rather than painting a bare `<s-grid>`.
   */
  visibleWhen?: (styling: StylingValues) => boolean;
}

export const COLOR_KNOBS: ReadonlyArray<ColorKnob> = [
  {
    field: "headerBgColor",
    group: "sectionHeaders",
    // ⚠️ Label length is measured: the 2-up color grid wraps past ~15 chars,
    // which pushes a swatch a line below its neighbour's and breaks row
    // alignment. "Header background" wrapped; the group heading carries the
    // scope instead.
    label: "Background",
    helpText: "The band behind a section title.",
    // Not "From your theme": the banded default is this app's own literal.
    emptyHelpText: "The default grey band.",
    alpha: true,
    visibleWhen: showsHeaderBackgroundControl,
  },
  {
    field: "headerUnderlineColor",
    group: "sectionHeaders",
    // Seated between `Background` and `Title color` on purpose: those two are
    // mutually exclusive, so slot 1 is always "the header style's own surface"
    // and slot 2 is always `Title color`, which then never moves as a merchant
    // switches between Banded and Underlined.
    label: "Underline color",
    helpText: "The rule beneath a section title.",
    // 🔴 The only swatch with NO `emptyHelpText`. Every other empty state is one
    // hop; this one is two — `borderColor`, then `currentColor` — so the honest
    // sentence does not fit the rail, and the half-truth that does would be wrong
    // in exactly the default state.
    alpha: true,
    visibleWhen: showsHeaderUnderlineColorControl,
  },
  {
    field: "headerTextColor",
    group: "sectionHeaders",
    label: "Title color",
    helpText: "The section title text.",
    emptyHelpText: "From your theme.",
    alpha: false,
  },
  {
    field: "labelBgColor",
    group: "labels",
    label: "Background",
    helpText: "Behind the label column.",
    emptyHelpText: "From your theme.",
    alpha: true,
  },
  {
    field: "valueBgColor",
    group: "values",
    label: "Background",
    helpText: "Behind the value column.",
    emptyHelpText: "From your theme.",
    alpha: true,
  },
  {
    field: "stripeBgColor",
    group: "rows",
    label: "Stripe background",
    helpText: "The fill on alternating rows.",
    emptyHelpText: "The default grey shading.",
    alpha: true,
    visibleWhen: showsStripeBackgroundControl,
  },
  {
    field: "borderColor",
    group: "rows",
    label: "Divider color",
    // ⚠️ The coupling has to be stated: this dresses the frame too until
    // `outerBorderColor` is set, or a merchant who changes it and watches the
    // outline move with it reads the coupling as a bug.
    helpText:
      "Row and column rules, and the outline unless Outline color is set.",
    emptyHelpText: "The default hairline grey.",
    alpha: true,
  },
  {
    field: "outerBorderColor",
    group: "tableFrame",
    label: "Outline color",
    helpText: "The table's outer frame.",
    // The one swatch whose empty state is NOT an inherit — the stylesheet falls
    // back through `--appx-spec-border-color` first.
    emptyHelpText: "Follows Divider color.",
    alpha: true,
    visibleWhen: showsOuterBorderColorControl,
  },
  {
    field: "labelTextColor",
    group: "labels",
    label: "Text color",
    helpText: "The label column's text.",
    emptyHelpText: "From your theme.",
    alpha: false,
  },
  {
    field: "valueTextColor",
    group: "values",
    label: "Text color",
    helpText: "The value column's text.",
    emptyHelpText: "From your theme.",
    alpha: false,
  },
];

/** A stored color as the string `s-color-field` holds; null renders as Theme. */
export function toColorControlValue(color: string | null): string {
  return toControlValue(color);
}

/**
 * A color field's string back to a stored color or null.
 *
 * Empty means the merchant cleared the swatch — the explicit way back to Theme,
 * and also what `s-color-field` emits for an unparseable value.
 *
 * 🔴 Validated through `parseStylingValues`, THE trust boundary, rather than by
 * re-typing the hex whitelist here — these values are interpolated into an inline
 * `style` attribute on a live storefront, and a second copy of that pattern can
 * drift out of agreement with the server's.
 */
export function fromColorControlValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === INHERIT_CONTROL_VALUE) return null;
  return parseStylingValues({ headerBgColor: trimmed }).headerBgColor;
}

// --- Step 10b · typography + label width -------------------------------------

/**
 * A nullable keyword knob's option list: `Inherit` first, then the domain's
 * values in domain order.
 *
 * Abstracts DATA, not rendering, so it has no opinion about how the value is
 * picked. The `Record` key type is what makes adding a domain value a compile
 * error.
 *
 * ⚠️ `inheritHelpText` is REQUIRED while the domain options' copy is optional —
 * the help-text rule in one signature. `Bold` and `Uppercase` explain themselves;
 * `Inherit` is the one option whose meaning a merchant cannot read off the word,
 * so it has to say what is inherited and from where.
 */
function withInheritOption<T extends string>(
  domain: readonly T[],
  labels: Record<T, OptionCopy>,
  inheritHelpText: string,
): ReadonlyArray<StylingOption<string>> {
  return [
    {
      value: INHERIT_CONTROL_VALUE,
      label: "Inherit",
      helpText: inheritHelpText,
    },
    ...domain.map((value) => ({
      value: value as string,
      label: labels[value].label,
      helpText: labels[value].helpText,
    })),
  ];
}

// Font size — the one genuinely THREE-shaped knob in `StylingValues`
// (`keyword | number | null`), so its list carries a fifth entry that is not a
// domain value at all: `Custom` is a MODE, and picking it reveals a bounded px
// input. S/M/L are theme-relative em multipliers (they survive a theme switch);
// Custom is the absolute escape hatch.
export const CUSTOM_FONT_SIZE_CONTROL_VALUE = "CUSTOM";

/**
 * What the px box shows the first time a merchant picks Custom.
 *
 * A UI affordance, not a domain fact — the domain owns the bounds that CONSTRAIN
 * it, and deliberately has no opinion about unset values (unset is `null`).
 *
 * `16` because it is what `MEDIUM` (`1em`) resolves to on most themes, so Custom
 * opens close to where the table already was. 🚫 Not the clamp floor of `10` —
 * that is an accessibility guard rail, and seeding there would shrink the table
 * to its smallest legal size the instant a merchant clicked Custom.
 */
export const CUSTOM_FONT_SIZE_SEED_PX = 16;

// These three KEEP their help text where Weight / Case / Line height lost theirs:
// `Small` states a size but not that it is measured against the THEME, and being
// em multipliers that follow a theme switch is exactly what separates them from
// `Custom`.
const FONT_SIZE_LABELS: Record<
  (typeof STYLING_FONT_SIZES)[number],
  OptionCopy
> = {
  SMALL: { label: "Small", helpText: "Slightly smaller than your theme's." },
  MEDIUM: { label: "Medium", helpText: "Matches your theme's body text." },
  LARGE: { label: "Large", helpText: "Slightly larger than your theme's." },
};

export const FONT_SIZE_OPTIONS: ReadonlyArray<StylingOption<string>> = [
  ...withInheritOption(
    STYLING_FONT_SIZES,
    FONT_SIZE_LABELS,
    "Use your theme's table text size.",
  ),
  {
    value: CUSTOM_FONT_SIZE_CONTROL_VALUE,
    label: "Custom",
    helpText: `An exact size in pixels (${FONT_SIZE_PX_MIN}–${FONT_SIZE_PX_MAX}).`,
  },
];

// Label weight — LABEL COLUMN ONLY, because the stylesheet puts
// `--appx-spec-font-weight` on `.appx-spec-table__label` rather than the table.
//
// ⚠️ The control reads just "Weight"; the scope is stated by the `Labels` group
// heading, wired with `role="group"` + `aria-labelledby` so it is announced too.
// Renaming this to a table-wide "Font weight" would require MOVING THE VAR, which
// repaints every live table — and dropping the group wrapper breaks the same lock
// silently.
const FONT_WEIGHT_LABELS: Record<
  (typeof STYLING_FONT_WEIGHTS)[number],
  OptionCopy
> = {
  REGULAR: { label: "Regular" },
  MEDIUM: { label: "Medium" },
  BOLD: { label: "Bold" },
};

export const FONT_WEIGHT_OPTIONS = withInheritOption(
  STYLING_FONT_WEIGHTS,
  FONT_WEIGHT_LABELS,
  "Use your theme's weight.",
);

const FONT_STYLE_LABELS: Record<
  (typeof STYLING_FONT_STYLES)[number],
  OptionCopy
> = {
  NORMAL: { label: "Normal" },
  ITALIC: { label: "Italic" },
};

export const FONT_STYLE_OPTIONS = withInheritOption(
  STYLING_FONT_STYLES,
  FONT_STYLE_LABELS,
  "Use your theme's text style.",
);

const LINE_HEIGHT_LABELS: Record<(typeof LINE_HEIGHTS)[number], OptionCopy> = {
  TIGHT: { label: "Tight" },
  NORMAL: { label: "Normal" },
  LOOSE: { label: "Loose" },
};

export const LINE_HEIGHT_OPTIONS = withInheritOption(
  LINE_HEIGHTS,
  LINE_HEIGHT_LABELS,
  "Use your theme's line spacing.",
);

// Label case — label column only, under the same scope lock as the weight knob
// above. The section header takes its own case var, so this never touches
// section titles.
const LABEL_CASE_LABELS: Record<(typeof LABEL_CASES)[number], OptionCopy> = {
  DEFAULT: { label: "As typed" },
  UPPERCASE: { label: "Uppercase" },
};

export const LABEL_CASE_OPTIONS = withInheritOption(
  LABEL_CASES,
  LABEL_CASE_LABELS,
  "Use your theme's letter casing.",
);

// --- The two section-header selects ------------------------------------------
//
// Same DOMAINS and emitted scales as the two label knobs above, so "Bold" can
// never come to mean two different numbers. The pairs are distinguished by their
// GROUP HEADING and, in the data, by the Inherit gloss.
//
// 🚫 The two `Record`s below are IDENTICAL to `FONT_WEIGHT_LABELS` /
// `LABEL_CASE_LABELS` today and are deliberately NOT collapsed into them. The
// duplication buys a real guard: the test asserting the header lists never say
// "label" can only fail while the lists are separable. Sharing one record makes
// that test structurally incapable of failing.
//
// ⚠️ The Inherit gloss does NOT say "your theme's" the way the Typography lists
// do — there is no theme value behind a section title's weight or casing, only
// this app's own literal.
const HEADER_FONT_WEIGHT_LABELS: Record<
  (typeof STYLING_FONT_WEIGHTS)[number],
  OptionCopy
> = {
  REGULAR: { label: "Regular" },
  MEDIUM: { label: "Medium" },
  BOLD: { label: "Bold" },
};

export const HEADER_FONT_WEIGHT_OPTIONS = withInheritOption(
  STYLING_FONT_WEIGHTS,
  HEADER_FONT_WEIGHT_LABELS,
  "Keep the standard bold section title.",
);

const HEADER_CASE_LABELS: Record<(typeof LABEL_CASES)[number], OptionCopy> = {
  DEFAULT: { label: "As typed" },
  UPPERCASE: { label: "Uppercase" },
};

export const HEADER_CASE_OPTIONS = withInheritOption(
  LABEL_CASES,
  HEADER_CASE_LABELS,
  "Keep the casing you typed.",
);

// --- The font-size tri-state -------------------------------------------------
//
// Kept as pure functions rather than inline logic in the panel so all three
// shapes are testable without rendering Polaris web components, which jsdom
// cannot do.

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Which of the five font-size options is selected for a stored value. */
export function fontSizeControlValue(fontSize: StylingFontSize): string {
  if (fontSize === null) return INHERIT_CONTROL_VALUE;
  if (typeof fontSize === "number") return CUSTOM_FONT_SIZE_CONTROL_VALUE;
  return fontSize;
}

/**
 * The stored value a font-size selection produces.
 *
 * `rememberedPx` makes leaving and re-entering Custom non-destructive: S →
 * Custom → S → Custom must return the merchant's number, not the seed. It cannot
 * live in `StylingValues` (the field holds ONE of the three shapes at a time), so
 * it is UI memory the panel carries and hands back in — same data-loss class as
 * the hide rules, solved the same way: never write on a mode change, only read.
 */
export function nextFontSizeForControl(
  choice: string,
  rememberedPx: number,
): StylingFontSize {
  if (choice === CUSTOM_FONT_SIZE_CONTROL_VALUE) {
    return clampToRange(
      Math.round(rememberedPx),
      FONT_SIZE_PX_MIN,
      FONT_SIZE_PX_MAX,
    );
  }
  return fromControlValue(choice, STYLING_FONT_SIZES);
}

/** The px to hand back the next time Custom is picked. */
export function rememberedCustomFontSizePx(
  fontSize: StylingFontSize,
  previous: number,
): number {
  return typeof fontSize === "number" ? fontSize : previous;
}

/**
 * The Custom px box's string to a stored px, or null when there is nothing
 * usable to store.
 *
 * ⚠️ Null here means "ignore this entry", NOT "inherit" — Inherit is its own
 * option on the select above, so an emptied px box must not silently flip the
 * mode.
 */
export function parseCustomFontSizePx(raw: string): number | null {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value)) return null;
  return clampToRange(Math.round(value), FONT_SIZE_PX_MIN, FONT_SIZE_PX_MAX);
}

/**
 * Whether the rail shows the Custom px input.
 *
 * ⚠️ These predicates stay independent one-line reads rather than a shared
 * record — they look at genuinely different fields. The LAW is generalised
 * instead: one shared test asserts over all of them that hiding is a read and
 * never a write, which is what catches a new control that forgets it.
 */
export function showsCustomFontSizeInput(styling: StylingValues): boolean {
  return typeof styling.fontSize === "number";
}

// --- Label width -------------------------------------------------------------

/**
 * Whether the rail shows the label-width control.
 *
 * A stacked table has no label column to size, so the control means nothing
 * there. Hidden, not disabled — and a pure read, so a trip through Stacked and
 * back returns the merchant's percentage.
 */
export function showsLabelWidthControl(styling: StylingValues): boolean {
  return styling.rowLayout === "TWO_COLUMN";
}

export function toLabelWidthControlValue(pct: number | null): string {
  return pct === null ? INHERIT_CONTROL_VALUE : String(pct);
}

/**
 * The label-width box's string to a stored percentage or null.
 *
 * Empty DOES mean inherit here, unlike the Custom px box above: label width has
 * no separate Inherit option, so clearing the field is the merchant's only way
 * back to the stylesheet's default ratio. Same clamp reasoning as the px box.
 */
export function fromLabelWidthControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    LABEL_WIDTH_PCT_MIN,
    LABEL_WIDTH_PCT_MAX,
  );
}

// --- The bounded-integer boxes -----------------------------------------------
//
// A number field where CLEARING IT is the way back to the default. These differ
// only in their bounds, so the conversion lives once here and each knob keeps a
// named wrapper for its call sites and help text.
//
// ⚠️ Clamping, not rejecting: Polaris's `min`/`max` are display affordances only
// — a keyboard user can type past them — so the boundary holds the range itself.

/** A stored bounded integer as the string a number field holds; null = empty. */
export function toBoundedIntControlValue(value: number | null): string {
  return value === null ? INHERIT_CONTROL_VALUE : String(value);
}

/** A number field's string back to a clamped integer, or null when empty. */
export function fromBoundedIntControlValue(
  raw: string,
  min: number,
  max: number,
): number | null {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(value)) return null;
  return clampToRange(Math.round(value), min, max);
}

/** A stored grid minimum as the string a number field holds; null = empty. */
export function toGridMinColumnWidthControlValue(px: number | null): string {
  return toBoundedIntControlValue(px);
}

/**
 * The minimum-column-width box's string back to a stored px or null.
 *
 * The BLANK-BOX idiom, not zero-means-off. Clearing the field is the way back to
 * the stylesheet's 240px, and `0` spells nothing here — it would mean an
 * unbounded track count, the unreadable case the floor exists to prevent — so a
 * typed 0 clamps UP rather than reading as "off".
 */
export function fromGridMinColumnWidthControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    GRID_MIN_COLUMN_WIDTH_PX_MIN,
    GRID_MIN_COLUMN_WIDTH_PX_MAX,
  );
}

export function fromTableMaxWidthControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    TABLE_MAX_WIDTH_PX_MIN,
    TABLE_MAX_WIDTH_PX_MAX,
  );
}

// --- The three "0 is what off LOOKS like" boxes ------------------------------
//
// Outline thickness, Corner radius and Section gap deliberately break the
// blank-box convention above. Their off state is still `null`, but a blank box is
// a poor way to say "none" on a control whose vocabulary is a px number — a
// merchant who wants no frame reaches for 0. So display and storage disagree: the
// box always holds a number, and `0` is the number that means off. (Maximum width
// keeps the blank box, since 0 is not a spelling of "full width".)
//
// 🔴 The disagreement is one-directional and total: **0 is NEVER stored.** It is
// written as `null` on the way out and read back as `null` on the way in, so
// there is exactly one stored spelling of off. That is load-bearing, because all
// three knobs carry a presence flag keyed on non-null, and a stored 0 would trip
// it while painting nothing:
//
// - `--outer-border` drops the last row's bottom rule, so a 0px outline would
//   draw no frame AND silently lose a divider.
// - `--outer-radius` turns on `overflow: hidden`, so a 0px radius would round
//   nothing AND start clipping an over-wide table.
// - `--section-gap` tells the banded separator to stand down, so a 0px gap would
//   add no space AND remove the hairline between closed section bands.

/**
 * BELOW the domain's stored floor on purpose: the stepper has to walk down to the
 * 0 that means off. The domain minimums remain the smallest values ever stored.
 */
export const ZERO_MEANS_OFF_CONTROL_MIN = 0;

/** A stored value as the string a zero-means-off box holds; null shows as `0`. */
export function toZeroMeansOffControlValue(value: number | null): string {
  return value === null ? "0" : String(value);
}

/**
 * A zero-means-off box's string back to a stored value, reading anything at or
 * below zero as off.
 *
 * Rounding before the test keeps the rule total over everything the box can
 * hold: `0`, `0.4` and `-5` are all off, `0.6` clamps up to the minimum, and an
 * emptied box lands here too (`Number("")` is 0), which is why clearing still
 * works even though the box refills with `0`.
 */
function fromZeroMeansOffControlValue(
  raw: string,
  min: number,
  max: number,
): number | null {
  const value = Number(raw.trim());
  if (Number.isFinite(value) && Math.round(value) <= 0) return null;
  return fromBoundedIntControlValue(raw, min, max);
}

export function fromOuterBorderWidthControlValue(raw: string): number | null {
  return fromZeroMeansOffControlValue(
    raw,
    OUTER_BORDER_WIDTH_PX_MIN,
    OUTER_BORDER_WIDTH_PX_MAX,
  );
}

export function fromOuterBorderRadiusControlValue(raw: string): number | null {
  return fromZeroMeansOffControlValue(
    raw,
    OUTER_BORDER_RADIUS_PX_MIN,
    OUTER_BORDER_RADIUS_PX_MAX,
  );
}

export function fromSectionGapControlValue(raw: string): number | null {
  return fromZeroMeansOffControlValue(
    raw,
    SECTION_GAP_PX_MIN,
    SECTION_GAP_PX_MAX,
  );
}

// --- Committing a number box WHILE the merchant is still typing --------------
//
// 🔴 THE BUG THIS EXISTS FOR. On a Polaris field `change` fires on COMMIT — blur
// or Enter — not per keystroke, so typing into a box called no setter, `isDirty`
// stayed false, and the SaveBar never appeared. Since the SaveBar is the only
// Save affordance and `isDirty` is what the unsaved-changes guard reads, leaving
// the editor between the last keystroke and a blur discarded the value silently.
//
// ⚠️ AND `onInput` ALONE IS WORSE THAN THE BUG. These boxes are CONTROLLED and
// every `from…` above CLAMPS, so the `1` of a `1000` typed into a box whose floor
// is 240 would be stored as 240 and re-rendered under the caret — making a
// four-digit number untypable.
//
// The rule that reconciles them: commit on a keystroke only when the parse is
// LOSSLESS — when the text already spells exactly what would be stored, so the
// re-render cannot rewrite the box. Half-typed (`1`), out-of-range (`5000`),
// fractional or zero-padded text falls through to `onChange`, which clamps on
// blur as before.
//
// Stated as a ROUND TRIP rather than a range test, because a range test would be
// wrong for two of the three families the rail uses:
//
//   - blank box: `""` round-trips to `""`, so CLEARING dirties the editor live;
//   - zero-means-off: `"0"` parses to null and formats back to `"0"`, so typing 0
//     turns the thing off live, while an EMPTIED one correctly does not commit;
//   - custom font size: the caller keeps its own "null means ignore" guard.

/**
 * The value a number box should commit for `raw` on a keystroke, or `undefined`
 * for "not yet — wait for blur".
 *
 * ⚠️ THE THREE RESULTS ARE ALL DIFFERENT. `undefined` means do not write;
 * `null` means write the field's own empty/off state; a number means write it.
 * A call site testing truthiness, or `!= null`, would silently drop every
 * legitimate clear-the-box and every zero-means-off.
 */
export function liveCommitValue(
  raw: string,
  parse: (raw: string) => number | null,
  format: (value: number | null) => string,
): number | null | undefined {
  const value = parse(raw);
  return format(value) === raw ? value : undefined;
}
