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

// Merchant-facing option lists for the Style-tab rail controls. Pure — no React/Polaris import.
// Every list is DERIVED from the domain constants in `tableStyling.ts`, never hand-typed, so adding
// a knob value there can't leave a control silently offering a stale set. The domain owns which
// values exist; this module owns only how they read to a merchant.
//
// ⚠️ Before adding a gloss to anything here, read the rule on `StylingOption.helpText`.

export interface StylingOption<T extends string> {
  value: T;
  label: string;
  /**
   * One-line plain-language gloss. OPTIONAL, and it earns its place only by doing one of three jobs:
   *   1. reporting a state the control cannot show (a blank box, an empty swatch, `Inherit`);
   *   2. carrying a composition caveat ("two-column layouts only");
   *   3. describing a shopper-facing behavior change (collapsing, Row layout).
   * An option labelled `Italic` or `Compact` explains itself and carries nothing.
   *
   * ⚠️ Absent, never `""` — an empty string renders as a blank grey line. `selectedHelpText` in
   * StyleTab.tsx keeps one from reaching a `details` attribute.
   */
  helpText?: string;
}

/**
 * The merchant-facing copy for one option, keyed off a domain constant. Named because twelve
 * `Record`s repeat it, and it is where the "help text is optional" rule is visible in the type system.
 */
type OptionCopy = { label: string; helpText?: string };

// Row dividers — the first control (Step 5). "Lines" is the default (`ROW_DIVIDER_STYLES[0]`, the
// storefront's long-standing hairline), so an existing table is unchanged until a merchant picks otherwise.
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

// The orphan entry: what Stripes reads as once it's no longer offered but is still the stored value.
// Not a second vocabulary for the knob — it's the one label that says "this is what you have and it
// is not doing anything".
const STRIPES_UNAVAILABLE_OPTION: StylingOption<
  (typeof ROW_DIVIDER_STYLES)[number]
> = {
  value: "STRIPES",
  label: "Stripes — not available in Grid",
  helpText: "Stripes do not apply in Grid layout. Pick Lines or None.",
};

/**
 * The Row-dividers options for the styling currently on screen. Derived rather than a call-site
 * `.filter()` because of the ORPHAN VALUE: Grid doesn't offer Stripes (zebra parity across tracks
 * paints a checkerboard), but a merchant who chose Stripes then switched to Grid still has `STRIPES`
 * stored — a naive filter would bind the select to a value with no option, rendering blank. So
 * Stripes is gone for everyone who hasn't chosen it, and stays visible, labelled inert, for the one
 * who has.
 *
 * 🚫 Deliberately NOT coercing `STRIPES` to `LINES` on a layout change — that destroys a setting
 * preserve-on-hide protects, and would make a `rowLayout` change write a different field. Every
 * visibility rule here is a pure read.
 *
 * ⚠️ Not in `VISIBILITY_PREDICATES`: that registry enforces preserve-on-hide over whole CONTROLS. A
 * hidden control can't lie because it isn't rendered; this one is. It has its own tests.
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

// Column divider — the row knob's vertical partner. Two members only: a fixed hairline dressed by
// the shared Border swatch, so nothing to size or color.
//
// ⚠️ Deliberately NOT hidden on stacked layouts: the value stays meaningful for the two-column case
// a merchant may switch back to, and the stylesheet already suppresses the rule there — so the LINE
// help text has to say so, or the no-op reads as broken.
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
// Each list repeats the shape above: a `Record` keyed on the domain union, then a `.map` over the
// domain constant. The Record key type makes adding a domain value a COMPILE ERROR here — an array
// literal would go stale silently. Labels follow admin-screen-plan.md §Tab 2 wording.

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

// Mobile layout — what happens to a TWO-COLUMN table on a narrow screen. On a stacked table both
// options render identically, which is why the rail hides this control then (showsMobileLayoutControl).
// No help text (feature 86): under "On mobile", each option states its own effect.
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

// Section headers — how a section title row reads against the rows around it. Every label names the
// LOOK; none is reused. TEXT_ONLY reads "Underlined" (feature 87) because it was never text-only (it
// drops the band and keeps a 2px rule). The wire value is untouched, so a merchant on it sees their
// choice renamed, not changed.
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
// Four controls that refine the band the knob above turns on, so they sit under it in the Sections
// group. All four are NULLABLE (they take the Step 10 "inherit" vocabulary). Note the two selects
// below reuse the label knobs' DOMAINS but not their option lists — the help text has to say
// "section title", or a merchant reads the two Uppercase controls as one switch appearing twice.

/** A stored section-title size as the string a number field holds. */
export function toHeaderFontSizeControlValue(px: number | null): string {
  return toBoundedIntControlValue(px);
}

/**
 * The section-title size box's string back to a clamped px, or null when empty. The blank-box idiom,
 * NOT the zero-means-off one the three container px knobs use: clearing this means "match the
 * surrounding text" (a real inherit), and 0 is not a size a font can have. Below the floor clamps up.
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
 * ⚠️ The one converter here where a typed `0` and an EMPTY box mean different things, both legitimate.
 * Empty is null (inherit the stylesheet's 0.75rem); a typed 0 is a stored 0 (no padding, a visibly
 * different render). Safe only because this knob's null means "the default" rather than "off"; the
 * container knobs' zero-means-off boxes exist because for THEM the two states coincide. A negative
 * therefore clamps to 0, not null — the floor is a real value here.
 */
export function fromHeaderPaddingBlockControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    HEADER_PADDING_BLOCK_PX_MIN,
    HEADER_PADDING_BLOCK_PX_MAX,
  );
}

// Density — a padding scale; the three labels are the whole vocabulary. No help text (feature 86).
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
// Table alignment — the only non-nullable keyword knob in the container group, so it uses the plain
// option-list shape rather than the `Inherit` vocabulary. No help text (feature 86): alignment is
// invisible until a max width leaves space, and the control is HIDDEN until exactly that holds
// (showsTableAlignControl), so Left / Center / Right need no gloss once on screen.
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
 * Whether the rail shows the alignment control. A full-width table fills its section, so all three
 * alignments render identically. A pure READ, so clearing the max width keeps the alignment.
 */
export function showsTableAlignControl(styling: StylingValues): boolean {
  return styling.tableMaxWidthPx !== null;
}

// --- Step 9b knobs ----------------------------------------------------------
//
// `sectionsCollapsible` is the one BOOLEAN in `StylingValues` — a toggle, no option list; the rail's
// first non-select control (why Step 8 rejected a generic `<StylingSelect>` wrapper).
//
// Sections initial state — which disclosures are open on load. Only meaningful while collapsible is
// on (showsSectionsInitialStateControl). No help text (feature 86): "Sections start: All open".
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
 * Whether the rail shows the "When the page loads" control. Meaningless while sections aren't
 * collapsible. Hidden, not disabled, and a pure READ — toggling collapsible off and back on returns
 * the merchant's choice. Clearing the value on hide would be silent data loss (unit-tested).
 */
export function showsSectionsInitialStateControl(
  styling: StylingValues,
): boolean {
  return styling.sectionsCollapsible;
}

/**
 * Whether the rail shows the "Gap between sections" control — the only predicate gated on two knobs.
 *
 * 🔴 What can't express a gap is a TABLE FORMATTING CONTEXT, not the flat shape. "A flat section
 * header is a `<tr>` and a `<tr>` takes no margin" is true only under `TWO_COLUMN`: a `<tr>` displays
 * as block under STACKED and as a grid item under GRID, and margin applies in both. `!== "TWO_COLUMN"`
 * rather than a membership test, because the EXCLUDED case is the one with a reason — a fourth
 * ROW_LAYOUTS member should inherit "the gap works". An OR, not a replacement: disclosures exist at
 * any row layout, so every table with a gap today keeps it.
 *
 * 🚫 Two-column with collapsing off stays excluded: `padding-block-start` grows the band rather than
 * opening a gap, and a transparent `border-block-start` loses the `border-collapse` width contest
 * and silently deletes the previous row's divider.
 */
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible || styling.rowLayout !== "TWO_COLUMN";
}

/**
 * Whether the rail shows the "On mobile" control. A stacked desktop table is already stacked
 * everywhere. Reads `=== "TWO_COLUMN"` rather than `!== "STACKED"` because GRID reaches the same
 * conclusion: `auto-fit` fits exactly one track at phone width, so there's no mobile behaviour left.
 *
 * ⚠️ A RAIL concern only, a read not a write. It never mutates `mobileLayout` and doesn't change what
 * gets emitted — `stylingToModifierClasses` still puts the mobile modifier on a stacked table's
 * wrapper, which is correct and must not be special-cased to match this.
 */
export function showsMobileLayoutControl(styling: StylingValues): boolean {
  return styling.rowLayout === "TWO_COLUMN";
}

/**
 * Whether the rail shows the "Minimum column width" control. A minimum-track width with no grid to
 * apply to is a knob with no referent at all — the bar a hide has to clear.
 */
export function showsGridMinColumnWidthControl(
  styling: StylingValues,
): boolean {
  return styling.rowLayout === "GRID";
}

/**
 * Whether the rail shows the Section headers "Background" swatch.
 *
 * ⚠️ Safe because the two BASE rules reading `--appx-spec-header-bg` are UNREACHABLE for it:
 * `stylingToModifierClasses` emits a section-header class unconditionally, every member selector
 * outspecifies the base, and TEXT_ONLY / PLAIN both hardcode `background: transparent` — so outside
 * BANDED the var is never consulted. One knob, one class, one live rule per shape.
 *
 * 🚫 Deliberately NOT extended to "the template has no section header rows" — that is row DATA, not
 * styling state; the rail would start hiding controls in response to content, a much larger claim.
 */
export function showsHeaderBackgroundControl(styling: StylingValues): boolean {
  return styling.sectionHeaderStyle === "BANDED";
}

/**
 * Whether the rail shows the Section headers "Underline color" swatch — the exact mirror of
 * `showsHeaderBackgroundControl`, on the same specificity argument. BANDED and PLAIN both state
 * `border-block-end: none` at member specificity, so under either there's no rule to consult the var.
 * No orphan to guard: the outer-border exception that drops the LAST closed summary's rule takes away
 * one element's underline, not the surface.
 */
export function showsHeaderUnderlineColorControl(
  styling: StylingValues,
): boolean {
  return styling.sectionHeaderStyle === "TEXT_ONLY";
}

/**
 * Whether the rail shows the "Stripe background" swatch. `stripeBgColor` feeds exactly ONE
 * declaration — the even-row fill — so outside Stripes it has no referent.
 *
 * 🚫 `borderColor` must NOT get the same treatment: it dresses four surfaces (row rules, column
 * divider, section separator, and the outline whenever `outerBorderColor` is unset), so even at Row
 * dividers = None it's the only control for two live surfaces. One field, one surface, one rule earns
 * a hide, and only the stripe has it.
 *
 * The `!== "GRID"` half catches the ORPHAN: a merchant who chose Stripes then switched to Grid still
 * has `STRIPES` stored, and the stylesheet stands the fill down there. Without it the swatch reappears
 * in exactly the state the select labels "not available in Grid", painting nothing.
 */
export function showsStripeBackgroundControl(styling: StylingValues): boolean {
  return styling.rowDividerStyle === "STRIPES" && styling.rowLayout !== "GRID";
}

/**
 * Whether the rail shows the Table size & frame "Outline color" swatch.
 * `--appx-spec-outer-border-color` is read by exactly ONE declaration, the `border:` shorthand, which
 * at the width's `0` fallback resolves to `border: 0 solid <color>` — painting nothing. The width is
 * the only thing that can switch this surface on or off.
 *
 * 🚫 `outerBorderRadiusPx` must NOT get the same treatment — `--outer-radius` sets `overflow: hidden`,
 * so the curve clips the band and stripe fills whether or not a frame is drawn. Gating Corner radius
 * on the width would remove the only control for a live effect.
 *
 * `!== null` rather than `>= 1`: `fromZeroMeansOffControlValue` never stores a 0, so a null width and
 * a 0 in the box are one state. Reading the STORED vocabulary keeps this right if the display
 * convention changes.
 *
 * ⚠️ THE FIRST PREDICATE THAT CAN EMPTY A GROUP — `tableFrame` holds exactly one swatch, which is why
 * `colorGrid` returns null on an empty filter instead of painting a bare `<s-grid>`.
 */
export function showsOuterBorderColorControl(styling: StylingValues): boolean {
  return styling.outerBorderWidthPx !== null;
}

// --- The `null` vocabulary ---------------------------------------------------
//
// Thirteen `StylingValues` fields are NULLABLE, and null is semantic: "inherit from the merchant's
// theme" (the zero-config promise), not a missing value.
//
// 🔴 THE TRAP THIS CLOSES: an `<s-option>`'s `value` is a string, so null needs a wire sentinel
// between DOM and engine. It must be converted HERE, at the control boundary, and never reach
// `StylingValues`, the Save payload or the DB. A stray `""` would be coerced to null by
// `parseStylingValues` anyway, so the bug would be invisible in the editor and surface only as a wrong
// metaobject — hence two helpers, unit-tested both directions, rather than open-coding per control.
export const INHERIT_CONTROL_VALUE = "";

/** A nullable domain value as the string a Polaris control can hold. */
export function toControlValue<T extends string>(value: T | null): string {
  return value ?? INHERIT_CONTROL_VALUE;
}

/**
 * The inverse: a control's string back to a domain value or null. Membership-checked against the
 * domain list rather than cast, so an unexpected string degrades to null (= inherit) instead of being
 * written into styling state as a value the mapping has no case for.
 */
export function fromControlValue<T extends string>(
  raw: string,
  allowed: readonly T[],
): T | null {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

// --- Feature 86 · the rail's group vocabulary --------------------------------

/**
 * The rail's eight groups, in render order, with their merchant-facing headings.
 *
 * Feature 86 recut the rail onto ONE axis — the object being styled. Before it, four groups were cut
 * by object and two by CSS property (Colors / Typography), so styling one part of the table meant
 * visiting three groups. Headings live here rather than inline in JSX so the vocabulary is one table
 * of truth: `COLOR_KNOBS` files each swatch under a group id, and the contract test checks every id
 * renders.
 *
 * ⚠️ THE HEADINGS ARE LOAD-BEARING, not decoration. Feature 86 shortened labels that named their own
 * scope ("Label weight" → "Weight") on the strength of the heading stating it. That only holds while
 * each group is a `role="group"` wired to its heading with `aria-labelledby`. Two swatches are
 * literally called "Background" (Labels and Values); nothing else tells them apart.
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

// The color fields, in `STYLING_FIELD_NAMES` order. `alpha` is ON for SURFACE colors and OFF for
// TEXT colors: the stylesheet's defaults are translucent (an opaque-only picker couldn't reproduce
// them), while translucent body text is a contrast bug, not a design choice.
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
   * ⚠️ The array below stays in `STYLING_FIELD_NAMES` order (the color block is contiguous there and
   * the test derives the expected order from it), so a group's swatches are selected by FILTERING,
   * never reordering.
   */
  group: StyleGroupId;
  label: string;
  // One line (the rail is ~300px). Says which SURFACE the color paints, since several are only
  // visible in certain combinations.
  helpText: string;
  /**
   * What the swatch says while EMPTY — the state, not the surface. Per-swatch rather than one group
   * note, because "inherits from your theme" is true for only five of the ten: two fall back to an
   * app literal, one to the hairline grey, and `outerBorderColor` falls back THROUGH `borderColor`
   * (so its empty state is "follows another control on this screen").
   *
   * ⚠️ OPTIONAL, and the exception must stay a SHORT NAMED LIST (pinned in the test). Dropped for
   * exactly one swatch — `headerUnderlineColor` — whose fallback chain has two links and ends in
   * `currentColor`, so no rail-width string is true. A gloss that can't be true is worse than none.
   */
  emptyHelpText?: string;
  alpha: boolean;
  /**
   * When present, the swatch renders only while this returns true. A property of the knob rather
   * than a JSX guard because all swatches come from one `.filter(…).map(…)` over this array.
   *
   * 🔴 OPTIONAL, and the exception. The bar is a fact about the STYLESHEET, not tidiness: the field
   * must dress exactly one SURFACE, and the hiding state must be one where that surface's rules can't
   * fire at all — a var emitted, inherited, and read by nothing.
   *
   * ⚠️ "One surface", not "one rule": a section header has TWO markup shapes, so `headerBgColor` and
   * `headerUnderlineColor` each feed two live rules while dressing one surface.
   *
   * 🚫 `borderColor` fails the bar and must stay ungated — it dresses the row rules, column divider,
   * section separator AND the outline whenever `outerBorderColor` is unset. Check the stylesheet
   * before adding an entry.
   *
   * ⚠️ A FULLY GATED GROUP IS LEGAL, so the law is: a group whose swatches can ALL vanish must still
   * hold a non-swatch control that always renders, or the heading and its divider fence nothing.
   * `colorGrid` returns null when nothing survives its filter.
   */
  visibleWhen?: (styling: StylingValues) => boolean;
}

export const COLOR_KNOBS: ReadonlyArray<ColorKnob> = [
  {
    field: "headerBgColor",
    group: "sectionHeaders",
    // ⚠️ Label length is measured: the 2-up color grid wraps past ~15 chars, breaking row alignment.
    // "Header background" wrapped; the group heading carries the scope instead.
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
    // Seated between `Background` and `Title color` on purpose: those two are mutually exclusive, so
    // slot 1 is always "the header style's own surface" and slot 2 is always `Title color`.
    label: "Underline color",
    helpText: "The rule beneath a section title.",
    // 🔴 The only swatch with NO `emptyHelpText`: its empty state is two hops (`borderColor`, then
    // `currentColor`), so the honest sentence doesn't fit and the half-truth would be wrong by default.
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
    // ⚠️ The coupling has to be stated: this dresses the frame too until `outerBorderColor` is set,
    // or a merchant watching the outline move with it reads the coupling as a bug.
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
    // The one swatch whose empty state is NOT an inherit — it falls back through `borderColor` first.
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
 * A color field's string back to a stored color or null. Empty means the merchant cleared the swatch
 * — the explicit way back to Theme, and what `s-color-field` emits for an unparseable value.
 *
 * 🔴 Validated through `parseStylingValues`, THE trust boundary, rather than by re-typing the hex
 * whitelist here — these values are interpolated into an inline `style` attribute on a live
 * storefront, and a second copy of that pattern could drift out of agreement with the server's.
 */
export function fromColorControlValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === INHERIT_CONTROL_VALUE) return null;
  return parseStylingValues({ headerBgColor: trimmed }).headerBgColor;
}

// --- Step 10b · typography + label width -------------------------------------

/**
 * A nullable keyword knob's option list: `Inherit` first, then the domain's values in order.
 * Abstracts DATA, not rendering. The `Record` key type makes adding a domain value a compile error.
 *
 * ⚠️ `inheritHelpText` is REQUIRED while the domain options' copy is optional — `Bold` and `Uppercase`
 * explain themselves; `Inherit` is the one option a merchant can't read off the word, so it has to
 * say what is inherited and from where.
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

// Font size — the one genuinely THREE-shaped knob (`keyword | number | null`), so its list carries a
// fifth entry that is not a domain value: `Custom` is a MODE, and picking it reveals a bounded px
// input. S/M/L are theme-relative em multipliers (they survive a theme switch); Custom is the
// absolute escape hatch.
export const CUSTOM_FONT_SIZE_CONTROL_VALUE = "CUSTOM";

/**
 * What the px box shows the first time a merchant picks Custom. A UI affordance, not a domain fact.
 * `16` because it is what `MEDIUM` (`1em`) resolves to on most themes, so Custom opens close to where
 * the table was. 🚫 Not the clamp floor of 10 — that's an accessibility guard rail, and seeding there
 * would shrink the table to its smallest legal size the instant Custom was clicked.
 */
export const CUSTOM_FONT_SIZE_SEED_PX = 16;

// These three KEEP their help text where Weight / Case / Line height lost theirs: `Small` states a
// size but not that it's measured against the THEME, and being em multipliers that follow a theme
// switch is exactly what separates them from `Custom`.
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

// Label weight — LABEL COLUMN ONLY, because the stylesheet puts `--appx-spec-font-weight` on
// `.appx-spec-table__label`, not the table.
//
// ⚠️ The control reads just "Weight"; the `Labels` group heading (wired `role="group"` +
// `aria-labelledby`) states the scope. Renaming to a table-wide "Font weight" would require MOVING
// THE VAR (repaints every live table); dropping the group wrapper breaks the same lock silently.
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

// Label case — label column only, under the same scope lock as the weight knob. The section header
// takes its own case var, so this never touches section titles.
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
// Same DOMAINS and emitted scales as the two label knobs, so "Bold" can never mean two different
// numbers. The pairs are distinguished by GROUP HEADING and by the Inherit gloss.
//
// 🚫 The two `Record`s below are IDENTICAL to `FONT_WEIGHT_LABELS` / `LABEL_CASE_LABELS` today and
// deliberately NOT collapsed: the duplication buys a guard — the test asserting the header lists
// never say "label" can only fail while the lists are separable. Sharing one record makes it
// structurally incapable of failing.
//
// ⚠️ The Inherit gloss does NOT say "your theme's" — there's no theme value behind a section title's
// weight or casing, only this app's own literal.
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
// Pure functions rather than inline panel logic so all three shapes are testable without rendering
// Polaris web components, which jsdom cannot do.

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
 * The stored value a font-size selection produces. `rememberedPx` makes leaving and re-entering
 * Custom non-destructive (S → Custom → S → Custom must return the merchant's number, not the seed).
 * It can't live in `StylingValues` (the field holds one shape at a time), so it's UI memory the panel
 * carries and hands back — same data-loss class as the hide rules, solved the same way: read, never
 * write on a mode change.
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
 * The Custom px box's string to a stored px, or null when there's nothing usable.
 *
 * ⚠️ Null here means "ignore this entry", NOT "inherit" — Inherit is its own option on the select, so
 * an emptied px box must not silently flip the mode.
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
 * ⚠️ These predicates stay independent one-line reads rather than a shared record — they look at
 * genuinely different fields. The LAW is generalised instead: one shared test asserts over all of
 * them that hiding is a read and never a write.
 */
export function showsCustomFontSizeInput(styling: StylingValues): boolean {
  return typeof styling.fontSize === "number";
}

// --- Label width -------------------------------------------------------------

/**
 * Whether the rail shows the label-width control. A stacked table has no label column to size, so
 * the control means nothing there. Hidden, not disabled, and a pure read.
 */
export function showsLabelWidthControl(styling: StylingValues): boolean {
  return styling.rowLayout === "TWO_COLUMN";
}

export function toLabelWidthControlValue(pct: number | null): string {
  return pct === null ? INHERIT_CONTROL_VALUE : String(pct);
}

/**
 * The label-width box's string to a stored percentage or null. Empty DOES mean inherit here, unlike
 * the Custom px box above: label width has no separate Inherit option, so clearing the field is the
 * merchant's only way back to the stylesheet's default ratio.
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
// A number field where CLEARING IT is the way back to the default. These differ only in bounds, so
// the conversion lives once here and each knob keeps a named wrapper for its call sites and help text.
//
// ⚠️ Clamping, not rejecting: Polaris's `min`/`max` are display affordances only (a keyboard user can
// type past them), so the boundary holds the range itself.

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
 * The minimum-column-width box's string back to a stored px or null. The BLANK-BOX idiom, not
 * zero-means-off. Clearing is the way back to the stylesheet's 240px, and 0 spells nothing here (an
 * unbounded track count, the unreadable case the floor exists to prevent) — so a typed 0 clamps UP.
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
// Outline thickness, Corner radius and Section gap break the blank-box convention. Their off state is
// still `null`, but a blank box is a poor way to say "none" on a px control — a merchant who wants no
// frame reaches for 0. So display and storage disagree: the box always holds a number, and `0` means
// off. (Maximum width keeps the blank box, since 0 is not a spelling of "full width".)
//
// 🔴 The disagreement is one-directional and total: **0 is NEVER stored.** Written as `null` out, read
// as `null` in, so there's one stored spelling of off. Load-bearing, because all three knobs carry a
// presence flag keyed on non-null, and a stored 0 would trip it while painting nothing:
// - `--outer-border` drops the last row's bottom rule → a 0px outline would lose a divider.
// - `--outer-radius` turns on `overflow: hidden` → a 0px radius would start clipping an over-wide table.
// - `--section-gap` tells the banded separator to stand down → a 0px gap would remove the hairline
//   between closed section bands.

/**
 * BELOW the domain's stored floor on purpose: the stepper has to walk down to the 0 that means off.
 * The domain minimums remain the smallest values ever stored.
 */
export const ZERO_MEANS_OFF_CONTROL_MIN = 0;

/** A stored value as the string a zero-means-off box holds; null shows as `0`. */
export function toZeroMeansOffControlValue(value: number | null): string {
  return value === null ? "0" : String(value);
}

/**
 * A zero-means-off box's string back to a stored value, reading anything at or below zero as off.
 * Rounding before the test keeps the rule total: `0`, `0.4`, `-5` are all off, `0.6` clamps up, and
 * an emptied box lands here too (`Number("")` is 0) — which is why clearing works even as the box
 * refills with `0`.
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
// 🔴 THE BUG THIS EXISTS FOR. On a Polaris field `change` fires on COMMIT (blur or Enter), not per
// keystroke, so typing into a box called no setter, `isDirty` stayed false, and the SaveBar never
// appeared — and since it's the only Save affordance, leaving between the last keystroke and a blur
// discarded the value silently.
//
// ⚠️ AND `onInput` ALONE IS WORSE THAN THE BUG. These boxes are CONTROLLED and every `from…` CLAMPS,
// so the `1` of a `1000` typed into a box whose floor is 240 would be stored as 240 and re-rendered
// under the caret — making a four-digit number untypable.
//
// The rule that reconciles them: commit on a keystroke only when the parse is LOSSLESS — the text
// already spells exactly what would be stored, so the re-render can't rewrite the box. Half-typed,
// out-of-range, fractional or zero-padded text falls through to `onChange`, which clamps on blur.
//
// A ROUND TRIP rather than a range test, because a range test would be wrong for two families:
//   - blank box: `""` round-trips to `""`, so CLEARING dirties the editor live;
//   - zero-means-off: `"0"` parses to null and formats back to `"0"`, so typing 0 turns it off live,
//     while an EMPTIED one correctly does not commit;
//   - custom font size: the caller keeps its own "null means ignore" guard.

/**
 * The value a number box should commit for `raw` on a keystroke, or `undefined` for "not yet — wait
 * for blur".
 *
 * ⚠️ THE THREE RESULTS ARE ALL DIFFERENT. `undefined` = do not write; `null` = write the field's
 * empty/off state; a number = write it. A call site testing truthiness, or `!= null`, would silently
 * drop every legitimate clear-the-box and every zero-means-off.
 */
export function liveCommitValue(
  raw: string,
  parse: (raw: string) => number | null,
  format: (value: number | null) => string,
): number | null | undefined {
  const value = parse(raw);
  return format(value) === raw ? value : undefined;
}
