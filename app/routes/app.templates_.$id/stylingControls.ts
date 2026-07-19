import {
  DENSITIES,
  MOBILE_LAYOUTS,
  ROW_DIVIDER_STYLES,
  ROW_LAYOUTS,
  SECTIONS_INITIAL_STATES,
  SECTION_HEADER_STYLES,
  parseStylingValues,
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
  | "labelBgColor"
  | "valueBgColor"
  | "stripeBgColor"
  | "borderColor"
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
    helpText: "Row rules and the table outline.",
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
