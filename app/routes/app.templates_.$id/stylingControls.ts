import {
  COLUMN_DIVIDER_STYLES,
  DENSITIES,
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
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

// Merchant-facing option lists for the Style-tab rail controls (feature 57
// Step 5). Pure and framework-free — the panel renders these, the tests pin
// them, and nothing here imports React or Polaris.
//
// Every list is DERIVED from the domain constants in `tableStyling.ts` rather
// than hand-typed, so adding a knob value there can never leave a control
// silently offering a stale set. The domain owns which values exist; this module
// owns only how they read to a merchant.
//
// Step 8 adds the remaining four NON-NULLABLE keyword knobs below (row layout,
// mobile layout, section headers, density). Step 10 adds the nullable ones
// (label width, colors, typography), which need a different UI vocabulary
// because null means "inherit from the theme" rather than a concrete value —
// see the "the null vocabulary" section near the bottom of this file.

export interface StylingOption<T extends string> {
  value: T;
  label: string;
  // One-line plain-language gloss. The rail is ~300px, so these stay short.
  helpText: string;
}

// Row dividers — the first control (Step 5). "Lines" is the default (it is
// `ROW_DIVIDER_STYLES[0]`, the storefront's long-standing hairline look), so an
// existing table's appearance is unchanged until a merchant picks otherwise.
const ROW_DIVIDER_LABELS: Record<
  (typeof ROW_DIVIDER_STYLES)[number],
  { label: string; helpText: string }
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

// Column divider — the row knob's vertical partner (feature 79). Two members
// only: the rule is a fixed hairline dressed by the shared Border swatch, so
// there is nothing to size or color and the control is a plain either/or.
//
// The help text names the SEAM ("between the two columns") rather than the
// implementation, and the NONE gloss says what a merchant sees rather than
// what is absent. Deliberately NOT hidden on stacked layouts (merchant call
// 2026-07-26): the value stays meaningful for the two-column case they may
// switch back to, and the stylesheet already suppresses the rule there — so
// the LINE help text has to say so, or the no-op reads as a broken control.
const COLUMN_DIVIDER_LABELS: Record<
  (typeof COLUMN_DIVIDER_STYLES)[number],
  { label: string; helpText: string }
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
const ROW_LAYOUT_LABELS: Record<
  (typeof ROW_LAYOUTS)[number],
  { label: string; helpText: string }
> = {
  TWO_COLUMN: {
    label: "Two-column",
    helpText: "Label on the left, value on the right.",
  },
  STACKED: { label: "Stacked", helpText: "Label above the value." },
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
const MOBILE_LAYOUT_LABELS: Record<
  (typeof MOBILE_LAYOUTS)[number],
  { label: string; helpText: string }
> = {
  STACKED: {
    label: "Stacked",
    helpText: "Label above the value on small screens.",
  },
  SAME_AS_DESKTOP: {
    label: "Same as desktop",
    helpText: "Keep two columns on small screens.",
  },
};

export const MOBILE_LAYOUT_OPTIONS: ReadonlyArray<
  StylingOption<(typeof MOBILE_LAYOUTS)[number]>
> = MOBILE_LAYOUTS.map((value) => ({
  value,
  label: MOBILE_LAYOUT_LABELS[value].label,
  helpText: MOBILE_LAYOUT_LABELS[value].helpText,
}));

// Section headers — how a section title row reads against the rows around it.
const SECTION_HEADER_LABELS: Record<
  (typeof SECTION_HEADER_STYLES)[number],
  { label: string; helpText: string }
> = {
  BANDED: {
    label: "Banded",
    helpText: "A shaded band behind the section title.",
  },
  TEXT_ONLY: {
    label: "Text only",
    helpText: "Bold title with no background band.",
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

// Density — a padding scale, nothing else. The help text says what the merchant
// will see rather than quoting the rem values.
const DENSITY_LABELS: Record<
  (typeof DENSITIES)[number],
  { label: string; helpText: string }
> = {
  DEFAULT: { label: "Default", helpText: "Standard spacing inside each row." },
  COMPACT: { label: "Compact", helpText: "Tighter rows, less height overall." },
  SPACIOUS: { label: "Spacious", helpText: "Roomier rows, easier to scan." },
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
// vocabulary further down. Help text names the SPACE the table sits in, because
// alignment is invisible until a max width leaves some space to sit in.
const TABLE_ALIGN_LABELS: Record<
  (typeof TABLE_ALIGNMENTS)[number],
  { label: string; helpText: string }
> = {
  LEFT: { label: "Left", helpText: "Table hugs the left of the section." },
  CENTER: { label: "Center", helpText: "Equal space on both sides." },
  RIGHT: { label: "Right", helpText: "Table hugs the right of the section." },
};

export const TABLE_ALIGN_OPTIONS: ReadonlyArray<
  StylingOption<(typeof TABLE_ALIGNMENTS)[number]>
> = TABLE_ALIGNMENTS.map((value) => ({
  value,
  label: TABLE_ALIGN_LABELS[value].label,
  helpText: TABLE_ALIGN_LABELS[value].helpText,
}));

/**
 * Whether the rail shows the alignment control.
 *
 * A full-width table fills its section, so all three alignments render
 * identically — the control would ask the merchant to decide something that
 * cannot be seen. The FIFTH instance of hide-when-irrelevant, and a pure READ
 * like the other four: clearing the max width keeps the merchant's alignment,
 * so putting a cap back returns their choice rather than Left. The shared law
 * test in `stylingControls.test.ts` covers this automatically once the
 * predicate is registered there.
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
const SECTIONS_INITIAL_STATE_LABELS: Record<
  (typeof SECTIONS_INITIAL_STATES)[number],
  { label: string; helpText: string }
> = {
  ALL_OPEN: {
    label: "All open",
    helpText: "Every section starts expanded.",
  },
  FIRST_OPEN: {
    label: "First open",
    helpText: "Only the first section starts expanded.",
  },
  ALL_CLOSED: {
    label: "All closed",
    helpText: "Every section starts collapsed.",
  },
};

export const SECTIONS_INITIAL_STATE_OPTIONS: ReadonlyArray<
  StylingOption<(typeof SECTIONS_INITIAL_STATES)[number]>
> = SECTIONS_INITIAL_STATES.map((value) => ({
  value,
  label: SECTIONS_INITIAL_STATE_LABELS[value].label,
  helpText: SECTIONS_INITIAL_STATE_LABELS[value].helpText,
}));

/**
 * Whether the rail shows the "When the page loads" control.
 *
 * The initial state describes which `<details>` start open, so it means nothing
 * at all while sections are not collapsible. Hidden, not disabled — same
 * reasoning as `showsMobileLayoutControl`, and with the same trap avoided: this
 * is a pure READ, so toggling collapsible off and back on returns the merchant's
 * own choice rather than the default. Clearing the value on hide would be silent
 * data loss, and it is unit-tested as such.
 *
 * This is the SECOND instance of the hide-when-irrelevant pattern. If a third
 * appears in Step 10, that is the point to consider generalising it — two is not
 * enough duplication to pay for an abstraction.
 */
export function showsSectionsInitialStateControl(
  styling: StylingValues,
): boolean {
  return styling.sectionsCollapsible;
}

/**
 * Whether the rail shows the "Gap between sections" control.
 *
 * The SIXTH instance of hide-when-irrelevant, and the second gated on
 * `sectionsCollapsible` — for a harder reason than the initial-state control
 * above, which is merely meaningless without disclosures. This one is
 * *unexpressible*: only the collapsible shape gives each section its own
 * element to push away from its neighbour. In the flat shape a section header
 * is a table row, and a table row takes no margin at all.
 *
 * (🚫 The tempting flat-shape approximation — a transparent `border-block-start`
 * on the section cell — does not work either: under `border-collapse: collapse`
 * the wider border wins the shared edge, so anything past 1px would silently
 * delete the previous row's own divider. Rejected before it was built.)
 *
 * A pure READ like the other five, so the merchant's px value survives a trip
 * through Collapsible-off and back on.
 */
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible;
}

/**
 * Whether the rail shows the "On mobile" control.
 *
 * A stacked desktop table is already stacked everywhere, so both mobile options
 * mean the same thing — the control would be noise. Hidden, not disabled: a
 * greyed-out control whose two choices are equivalent still asks the merchant to
 * think about it.
 *
 * This is a RAIL concern only, and it is deliberately a read, not a write:
 *
 * - It never mutates `mobileLayout`. The merchant's choice survives a trip
 *   through STACKED and back — clearing it on hide would be silent data loss.
 * - It does not change what gets emitted. `stylingToModifierClasses` still puts
 *   the mobile modifier on a stacked table's wrapper, which is correct (the
 *   stacked-layout CSS wins anyway) and must not be special-cased to match this.
 *
 * Lives here rather than in the component so it is testable without rendering
 * Polaris web components, which jsdom cannot do.
 */
export function showsMobileLayoutControl(styling: StylingValues): boolean {
  return styling.rowLayout !== "STACKED";
}

// --- Step 10 · the `null` vocabulary ----------------------------------------
//
// Thirteen fields in `StylingValues` are NULLABLE, and null is semantic there:
// it means "inherit from the merchant's theme", which is the app's zero-config
// promise, not a missing value. Steps 5/8/9b only ever touched knobs whose
// default was a real value, so this is the first step that has to give absence
// a name a merchant can see and — crucially — get back to.
//
// THE TRAP THIS SECTION EXISTS TO CLOSE: a `<s-option>`'s `value` attribute is a
// string, so null needs a sentinel on the wire between the DOM and the engine.
// `""` is the natural one (it is also what `s-color-field` itself emits for an
// invalid value). That sentinel must be converted HERE, at the control boundary,
// and must never reach `StylingValues`, the Save payload, or the DB. A stray `""`
// would be coerced to null by `parseStylingValues` anyway, which means the bug
// would be invisible in the editor and only surface as a wrong metaobject — so
// the conversion lives in these two helpers and is unit-tested in both
// directions rather than being open-coded per control.
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

// --- Step 10a · colors -------------------------------------------------------

// The seven color fields, in `admin-screen-plan.md` §Tab 2 order.
//
// `alpha` follows the 2026-07-19 lock: ON for the five SURFACE colors, OFF for
// the two TEXT colors. The stylesheet's own defaults are translucent
// (`rgba(0,0,0,0.06)` band, `0.04` stripes, `0.1` borders), so an opaque-only
// picker could not reproduce the default look; translucent body text, by
// contrast, is a contrast bug rather than a design choice. No domain change is
// needed — `parseColor` already accepts `#rgb` / `#rrggbb` / `#rrggbbaa`.
export type StylingColorFieldName =
  | "headerBgColor"
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
  label: string;
  // One line, because the rail is ~300px wide. Says which SURFACE the color
  // paints, since several of them are only visible in certain combinations.
  helpText: string;
  alpha: boolean;
}

export const COLOR_KNOBS: ReadonlyArray<ColorKnob> = [
  {
    field: "headerBgColor",
    label: "Section header background",
    // Only visible while section headers are Banded, but that is a composition
    // fact rather than a reason to hide the swatch: unlike the four visibility
    // rules below, the merchant may legitimately set it before switching.
    helpText: "The band behind a section title.",
    alpha: true,
  },
  {
    field: "headerTextColor",
    label: "Section header text",
    // The third TEXT swatch, so `alpha: false` by the 2026-07-19 lock:
    // translucent body text is a contrast bug rather than a design choice, and
    // a section title is the most load-bearing text in the table.
    helpText: "The section title itself.",
    alpha: false,
  },
  {
    field: "labelBgColor",
    label: "Label background",
    helpText: "Behind the label column.",
    alpha: true,
  },
  {
    field: "valueBgColor",
    label: "Value background",
    helpText: "Behind the value column.",
    alpha: true,
  },
  {
    field: "stripeBgColor",
    label: "Stripe background",
    // The composition trap worth naming in the UI itself, so a merchant who
    // sets it on a lines table does not read the no-op as a broken control.
    helpText: "Alternating rows — needs Row dividers set to Stripes.",
    alpha: true,
  },
  {
    field: "borderColor",
    label: "Border",
    // Was "Row rules and the table outline" until the outer border became its
    // own knob. It still dresses BOTH by default — the outline only stops
    // following it once the swatch below is set — and the text has to say so,
    // or a merchant who sets Border and then wonders why the frame moved with
    // it reads the coupling as a bug.
    helpText: "Row rules, and the outline unless set below.",
    alpha: true,
  },
  {
    field: "outerBorderColor",
    label: "Table outline",
    helpText: "The outer frame — needs an Outline width.",
    alpha: true,
  },
  {
    field: "labelTextColor",
    label: "Label text",
    helpText: "The label column's text.",
    alpha: false,
  },
  {
    field: "valueTextColor",
    label: "Value text",
    helpText: "The value column's text.",
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
 * Anything else is validated through `parseStylingValues`, THE trust boundary,
 * rather than by re-typing the hex whitelist here: these values are interpolated
 * into an inline `style` attribute on a live storefront, and a second copy of
 * that pattern is a copy that can drift out of agreement with the server's.
 * A value the domain rejects degrades to null (= Theme), exactly as it would on
 * the way back out of the database.
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
 * Shared because four lists want the identical shape, and — unlike the
 * `<StylingSelect>` wrapper rejected in Step 8 — this abstracts DATA, not
 * rendering, so it has no opinion about how the value is picked. The `Record`
 * key type is still what makes adding a domain value a compile error.
 *
 * `Inherit` leads for the same reason every other list leads with its default:
 * the control opens on the current look. The difference is only that this
 * list's leading value is `null` rather than a domain member.
 */
function withInheritOption<T extends string>(
  domain: readonly T[],
  labels: Record<T, { label: string; helpText: string }>,
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
 * Lives HERE and not in `tableStyling.ts` deliberately: it is a UI affordance
 * ("what the box shows when you open it"), not a domain fact. The domain owns
 * the numbers that CONSTRAIN it (`FONT_SIZE_PX_MIN`/`MAX`); putting a *default*
 * beside those *bounds* would imply the domain has an opinion about unset
 * values, which it deliberately does not — unset is `null`.
 *
 * `16` because it is the web default and therefore what `MEDIUM` (`1em`)
 * resolves to on most themes, so picking Custom lands close to where the table
 * already was. The clamp floor of `10` was considered and REJECTED as the seed:
 * it is an accessibility guard rail, not a sensible default, and seeding there
 * would shrink the table to its smallest legal size the instant a merchant
 * clicked Custom, leaving them to type their way back up.
 */
export const CUSTOM_FONT_SIZE_SEED_PX = 16;

const FONT_SIZE_LABELS: Record<
  (typeof STYLING_FONT_SIZES)[number],
  { label: string; helpText: string }
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

// Label weight — LABEL COLUMN ONLY, settled in Step 3 when the stylesheet put
// `--appx-spec-font-weight` on `.appx-spec-table__label` rather than the table.
// The control says "Label weight" so the UI itself states the scope; do not
// rename it to "Font weight" without also moving the var, which would change
// every merchant's live table.
const FONT_WEIGHT_LABELS: Record<
  (typeof STYLING_FONT_WEIGHTS)[number],
  { label: string; helpText: string }
> = {
  REGULAR: { label: "Regular", helpText: "Labels read as body text." },
  MEDIUM: { label: "Medium", helpText: "Labels stand out a little." },
  BOLD: { label: "Bold", helpText: "Labels stand out strongly." },
};

export const FONT_WEIGHT_OPTIONS = withInheritOption(
  STYLING_FONT_WEIGHTS,
  FONT_WEIGHT_LABELS,
  "Use your theme's label weight.",
);

const FONT_STYLE_LABELS: Record<
  (typeof STYLING_FONT_STYLES)[number],
  { label: string; helpText: string }
> = {
  NORMAL: { label: "Normal", helpText: "Upright text." },
  ITALIC: { label: "Italic", helpText: "Slanted text." },
};

export const FONT_STYLE_OPTIONS = withInheritOption(
  STYLING_FONT_STYLES,
  FONT_STYLE_LABELS,
  "Use your theme's text style.",
);

const LINE_HEIGHT_LABELS: Record<
  (typeof LINE_HEIGHTS)[number],
  { label: string; helpText: string }
> = {
  TIGHT: { label: "Tight", helpText: "Lines sit close together." },
  NORMAL: { label: "Normal", helpText: "Comfortable line spacing." },
  LOOSE: { label: "Loose", helpText: "Airy lines, easier to scan." },
};

export const LINE_HEIGHT_OPTIONS = withInheritOption(
  LINE_HEIGHTS,
  LINE_HEIGHT_LABELS,
  "Use your theme's line spacing.",
);

// Label case — label column only. The section header sets `font-weight: 700` as
// a literal and takes no case var, so this never touches section titles.
const LABEL_CASE_LABELS: Record<
  (typeof LABEL_CASES)[number],
  { label: string; helpText: string }
> = {
  DEFAULT: { label: "As typed", helpText: "Labels appear as you wrote them." },
  UPPERCASE: { label: "Uppercase", helpText: "Labels render in capitals." },
};

export const LABEL_CASE_OPTIONS = withInheritOption(
  LABEL_CASES,
  LABEL_CASE_LABELS,
  "Use your theme's letter casing.",
);

// --- Feature 81 · the two section-header selects -----------------------------
//
// Same DOMAINS as the two label knobs above (`STYLING_FONT_WEIGHTS`,
// `LABEL_CASES`) and the same emitted scales, so "Bold" can never come to mean
// two different numbers. Only the prose differs, and it has to: these controls
// sit in Sections while their twins sit in Typography, and identical help text
// on both would read as one control duplicated rather than two surfaces.
//
// Note the Inherit gloss does NOT say "your theme's" the way the four
// Typography lists do. There is no theme value behind a section title's weight
// or casing — the fallback is this app's own literal (700 / none), and saying
// otherwise would be a lie the merchant could catch by switching themes.
const HEADER_FONT_WEIGHT_LABELS: Record<
  (typeof STYLING_FONT_WEIGHTS)[number],
  { label: string; helpText: string }
> = {
  REGULAR: { label: "Regular", helpText: "Titles read as body text." },
  MEDIUM: { label: "Medium", helpText: "Titles stand out a little." },
  BOLD: { label: "Bold", helpText: "Titles stand out strongly." },
};

export const HEADER_FONT_WEIGHT_OPTIONS = withInheritOption(
  STYLING_FONT_WEIGHTS,
  HEADER_FONT_WEIGHT_LABELS,
  "Keep the standard bold section title.",
);

const HEADER_CASE_LABELS: Record<
  (typeof LABEL_CASES)[number],
  { label: string; helpText: string }
> = {
  DEFAULT: { label: "As typed", helpText: "Titles appear as you wrote them." },
  UPPERCASE: { label: "Uppercase", helpText: "Titles render in capitals." },
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
 * `rememberedPx` is what makes leaving and re-entering Custom non-destructive:
 * S → Custom → S → Custom must return the merchant's number, not the seed. It
 * cannot live in `StylingValues` (the field holds ONE of the three shapes at a
 * time), so it is UI memory the panel carries and hands back in — the same
 * data-loss class as the four hide rules, solved the same way: never write on a
 * mode change, only read.
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
 * Null here means "ignore this entry", NOT "inherit" — Inherit is its own
 * option on the select above, so an emptied px box must not silently flip the
 * mode. Clamped rather than rejected, because Polaris's `min`/`max` are display
 * affordances only: its own docs note a keyboard user can still type past them.
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
 * The FOURTH instance of hide-when-irrelevant. Per the 2026-07-19 lock the four
 * predicates stay as independent one-line reads — they look at genuinely
 * different fields, so a `VISIBILITY_RULES` record would save ~4 lines while
 * adding a layer of indirection — and the LAW is generalised instead: one shared
 * test asserts over all four that hiding is a read and never a write. The risk
 * was never "someone wrote a similar one-liner again", it is "someone adds a
 * fifth control and forgets the law", and a shared test catches that.
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

// --- The four bounded-integer boxes ------------------------------------------
//
// Label width and the three container integers all present the same control:
// a number field where CLEARING IT is the way back to the default. They differ
// only in their bounds, so the conversion lives once here and each knob keeps
// its own named wrapper for the call sites and the help text.
//
// Clamping (not rejecting) repeats the Step 10b reasoning: Polaris's `min`/`max`
// are display affordances only — its own docs note a keyboard user can type past
// them — so the boundary has to hold the range itself.

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

export function fromTableMaxWidthControlValue(raw: string): number | null {
  return fromBoundedIntControlValue(
    raw,
    TABLE_MAX_WIDTH_PX_MIN,
    TABLE_MAX_WIDTH_PX_MAX,
  );
}

// --- The three "0 is what off LOOKS like" boxes ------------------------------
//
// Outline width, Corner radius and Section gap break the blank-box convention
// above, and deliberately. Their off state is `null` like every other knob, but
// a blank box is a poor way to say "none" on a control whose entire vocabulary
// is a px number — a merchant who wants no frame reaches for 0, and one reading
// the rail back wants to see what the value IS, not an absence. So here the
// display and the storage are allowed to disagree: the box always holds a
// number, and `0` is the number that means off. (Maximum width keeps the blank
// box — 0 is not a spelling of "full width", so the same trick would be a lie
// there.)
//
// The disagreement is one-directional and total, which is what keeps feature
// 78's minimum-of-1 lock intact: 0 is NEVER stored. It is written for `null` on
// the way out and read back as `null` on the way in, so there is still exactly
// one stored spelling of off and `serializeStylingOverrides` still has nothing
// to write. That is load-bearing rather than tidy, because ALL THREE knobs carry
// a presence flag keyed on non-null (`tableStylingCss.ts`), and a stored 0 would
// trip it while painting nothing:
//
// - `--outer-border` drops the last row's own bottom rule, so a 0 px outline
//   would draw no frame AND silently lose a divider.
// - `--outer-radius` turns on `overflow: hidden`, so a 0 px radius would round
//   nothing AND start clipping an over-wide table — the exact trade that flag
//   exists to avoid taking unasked.
// - `--section-gap` (feature 80) tells the banded separator to stand down, so a
//   0 px gap would add no space AND remove the hairline between closed section
//   bands — the exact defect that rule exists to fix.
//
// Keeping 0 out of the model makes both unreachable by construction rather than
// by a second guard downstream.

/**
 * The floor these two boxes carry, BELOW their domain's stored floor on purpose:
 * the stepper has to be able to walk down to the 0 that means off. The domain
 * minimums (1) remain the smallest values ever stored.
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
 * emptied box lands here too — `Number("")` is 0 — reaching the same null by the
 * shorter route. That last case is why clearing still works even though the
 * merchant can no longer see it happen: the box refills with `0`.
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
