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
//
// FEATURE 86 changes only the merchant-facing COPY in this file, never a value:
// shorter labels that lean on their group heading for scope, a group id on each
// color knob, and — the change with the widest reach — `helpText` becoming
// OPTIONAL, which cut roughly ten always-on descriptions off the rail. The rule
// that decides which survive is on `StylingOption.helpText` below; read it
// before adding a gloss to anything here.

export interface StylingOption<T extends string> {
  value: T;
  label: string;
  /**
   * One-line plain-language gloss — OPTIONAL as of feature 86.
   *
   * Every one of the rail's 34 controls used to carry a description, and that
   * is a large part of why it read as a wall of text. A gloss now earns its
   * place only by doing one of three jobs:
   *
   *   1. reporting a state the control cannot show — a blank box, an empty
   *      swatch, `Inherit`;
   *   2. carrying a composition caveat — "two-column layouts only";
   *   3. describing a shopper-facing behavior change — collapsing, Row layout.
   *
   * An option labelled `Italic` or `Compact` does its own explaining, so those
   * options carry nothing. The net effect is that help text became
   * STATE-REPORTING across the rail: it appears on the option whose meaning is
   * not self-evident (almost always `Inherit`) and stays quiet otherwise.
   *
   * ⚠️ Absent, never `""`. An empty string renders as a blank grey line, which
   * is exactly the noise this rule exists to cut — `selectedHelpText` in
   * `StyleTab.tsx` is what keeps one from reaching a `details` attribute.
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
 * The Row-dividers options for the styling currently on screen (feature 85).
 *
 * The rail's FIRST per-option hide, and the reason it is a derived list rather
 * than a `.filter()` at the call site is the ORPHAN VALUE. Zebra striping is
 * DOM-order parity, which across several grid tracks paints a checkerboard
 * rather than alternating rows, so Grid mode does not offer Stripes. But the
 * control itself stays on screen, and a merchant who chose Stripes on a
 * two-column table and then switched to Grid still has `STRIPES` stored — a
 * naive filter would leave the select bound to a value with no matching option,
 * which renders blank with a blank help line and reads as a broken control.
 *
 * So: Stripes is gone for everyone who has not chosen it, and stays visible —
 * labelled as inert — for the one merchant who has, until they pick something
 * else.
 *
 * 🚫 Deliberately NOT coercing `STRIPES` to `LINES` when the layout changes.
 * That is the tidier-looking fix and it is wrong twice: it destroys a setting
 * the preserve-on-hide law exists to protect, and it would make a `rowLayout`
 * change write a different field, where every visibility rule in this file is a
 * pure read.
 *
 * ⚠️ This does NOT belong in the `VISIBILITY_PREDICATES` registry, which exists
 * to enforce preserve-on-hide over whole CONTROLS. A hidden control cannot lie
 * because it is not rendered; this one is, which is a different mechanism with a
 * different failure mode. It has its own tests instead.
 *
 * The stylesheet stands the stripe fill down independently — the rail is not the
 * only writer of a `GRID` + `STRIPES` pair (a saved template, a B2 preset, or
 * the orphan case above), so the CSS is where it is actually enforced.
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
 * The SIXTH instance of hide-when-irrelevant, and the only one gated on two
 * knobs at once. The reason is harder than the initial-state control above:
 * that one is merely meaningless without disclosures, whereas a gap can be
 * *unexpressible* — but the thing that cannot express it is a TABLE FORMATTING
 * CONTEXT, not the flat shape (feature 94).
 *
 * Feature 80 fenced this to `sectionsCollapsible` on the reasoning that a flat
 * section header is a `<tr>` and a `<tr>` takes no margin. True only under
 * `TWO_COLUMN`. What a `<tr>` displays as is decided by the row-layout rules:
 * `table-row` there, but `block` under `STACKED` and a `block` grid item under
 * `GRID`, and margin applies in both — so the flat shape gets the same gap from
 * its own rule in `spec-table.css`.
 *
 * `!== "TWO_COLUMN"` rather than a `STACKED`/`GRID` membership test, inverting
 * the call `showsMobileLayoutControl` makes below: the EXCLUDED case is the one
 * with a reason, so a fourth `ROW_LAYOUTS` member inherits "the gap works",
 * which is right — `TWO_COLUMN` is the only member that keeps `display: table`.
 *
 * An OR, not a replacement: `TWO_COLUMN` + collapsible still shows the control
 * and still works, because disclosures exist at any row layout. Every table
 * that has a gap today keeps it.
 *
 * (🚫 Two-column with collapsing off stays excluded, and the approximations are
 * on file. `padding-block-start` on the section cell grows the band rather than
 * opening a gap; a transparent `border-block-start` loses the
 * `border-collapse: collapse` width contest and silently deletes the previous
 * row's own divider. Whether `border-collapse: separate` scoped to this knob
 * can do it is an open question in `progress-tracker.md`, not a gap in this
 * reasoning.)
 *
 * A pure READ like the other five, so the merchant's px value survives a trip
 * through Two-column and back.
 */
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible || styling.rowLayout !== "TWO_COLUMN";
}

/**
 * Whether the rail shows the "On mobile" control.
 *
 * A stacked desktop table is already stacked everywhere, so both mobile options
 * mean the same thing — the control would be noise. Hidden, not disabled: a
 * greyed-out control whose two choices are equivalent still asks the merchant to
 * think about it.
 *
 * GRID reaches the same conclusion by a different route (feature 85), which is
 * why this reads `=== "TWO_COLUMN"` rather than `!== "STACKED"`: a grid is
 * already responsive by construction — `auto-fit` fits exactly one track at a
 * phone width — so there is no mobile behaviour left to choose. A merchant
 * offered the choice would reasonably expect one of the options to do something.
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
  return styling.rowLayout === "TWO_COLUMN";
}

/**
 * Whether the rail shows the "Minimum column width" control (feature 85).
 *
 * The SEVENTH instance of hide-when-irrelevant, and warranted where feature 79
 * declined one: a minimum-track-width box with no grid to apply to is not a knob
 * whose effect is merely invisible, it is a knob with no referent at all.
 *
 * A pure READ like the other six, so a merchant's 320px survives a trip through
 * Two-column and back — registered in `VISIBILITY_PREDICATES` so the shared
 * preserve-on-hide law test covers it automatically.
 */
export function showsGridMinColumnWidthControl(
  styling: StylingValues,
): boolean {
  return styling.rowLayout === "GRID";
}

/**
 * Whether the rail shows the Section headers "Background" swatch (feature 95).
 *
 * The NINTH hide rule, the second over a color, and the closing of an open
 * question that had been on file since feature 87's sign-off. `headerBgColor`
 * reads through `--appx-spec-header-bg`, which `spec-table.css` mentions in
 * exactly four rules:
 *
 *   - two BASE rules (`__section` and, under `--collapsible`,
 *     `__section-summary`) that read it with a `transparent` fallback;
 *   - two `--section-banded` rules, one per shape, that read it with the
 *     `rgba(0, 0, 0, 0.06)` band fallback.
 *
 * ⚠️ The two base rules are UNREACHABLE for this var, and that is what makes
 * the hide safe rather than merely tidy. `stylingToModifierClasses` emits a
 * section-header class unconditionally — defaults included, by that function's
 * own stated rule — and every member selector outspecifies the base one (2
 * classes vs 1 flat, 3 vs 2 collapsible). `TEXT_ONLY` and `PLAIN` both hardcode
 * `background: transparent`, so they win and the var is never consulted. One
 * knob, one class, one live rule per shape.
 *
 * Both shapes agree, which is why this needs no second clause: feature 87's
 * composition hazard was that a member styling only the flat `th` hands the
 * band back the moment collapsing is enabled, and the fix was to mirror every
 * member rule onto the `<summary>`. That mirroring is exactly what lets one
 * predicate cover both.
 *
 * 🔴 Reverses this file's own previous comment ("a composition fact rather than
 * a reason to hide the swatch: the merchant may legitimately set it before
 * switching"), on the merchant's call 2026-07-28. That objection is weaker here
 * than it looks: `BANDED` is `SECTION_HEADER_STYLES[0]`, so the swatch is
 * visible by DEFAULT and only disappears once a merchant actively picks
 * Underlined or Plain — set-before-switching is not the order anyone arrives in.
 * And the value is preserved regardless, so the order still works: pick Banded,
 * set the colour, and it survives a trip through Plain and back.
 *
 * 🚫 Deliberately NOT extended to "the template has no section header rows".
 * That is row DATA, not styling state, and no rule in this file has ever read
 * it — the rail would start hiding controls in response to the merchant's
 * content, which is a different and much larger claim.
 */
export function showsHeaderBackgroundControl(styling: StylingValues): boolean {
  return styling.sectionHeaderStyle === "BANDED";
}

/**
 * Whether the rail shows the Section headers "Underline color" swatch
 * (feature 96).
 *
 * The TENTH hide rule and the third over a color, and it is the exact mirror of
 * `showsHeaderBackgroundControl` above: one surface, two markup shapes, two live
 * rules, and two members that hardcode the surface away.
 * `--appx-spec-header-underline-color` is read by the two `--section-text-only`
 * rules (flat `th` + collapsible `<summary>`) and by the two BASE rules, which
 * are unreachable for the same specificity reason feature 95 documented above.
 * `BANDED` and `PLAIN` both state `border-block-end: none` at member
 * specificity, so under either of them there is no rule left to consult the var.
 *
 * No second clause, and unlike `showsStripeBackgroundControl` there is no orphan
 * to guard: no other knob can strand this surface from a stored-data
 * combination the rail would not otherwise show. The one partial suppression —
 * the outer-border exception that drops the LAST closed summary's rule so it
 * does not double against the wrapper frame — takes away one element's underline
 * on one table, not the surface, so it is not a hide condition.
 *
 * ⚠️ The safety argument is `headerBgColor`'s, mirrored and stronger. That one
 * is safe to hide because `BANDED` is `SECTION_HEADER_STYLES[0]`, the default,
 * so "I wanted to set the colour before switching" needs an order of work nobody
 * arrives in. Here it is the reverse: `TEXT_ONLY` is NOT the default, so the
 * only way to reach this swatch at all is to have actively picked Underlined —
 * the merchant is already standing in the state the colour applies to.
 *
 * A pure READ like the other nine, registered in `VISIBILITY_PREDICATES` so the
 * shared preserve-on-hide law test covers it: a hex survives Underlined →
 * Banded → Underlined. Consumed through `ColorKnob.visibleWhen`.
 */
export function showsHeaderUnderlineColorControl(
  styling: StylingValues,
): boolean {
  return styling.sectionHeaderStyle === "TEXT_ONLY";
}

/**
 * Whether the rail shows the "Stripe background" swatch (feature 95).
 *
 * The EIGHTH instance of hide-when-irrelevant, the FIRST one over a color, and
 * a deliberate reversal of feature 86's decision 4 ("Stripe background stays
 * visible too") on the merchant's own 2026-07-28 report. What changed is not
 * the principle but the fact it was applied to: `stripeBgColor` feeds exactly
 * ONE declaration in `spec-table.css` — the `--dividers-stripes` even-row fill
 * — so outside Stripes it is not a knob whose effect is merely hard to see, it
 * is a knob with no referent, which is the bar `showsGridMinColumnWidthControl`
 * already set.
 *
 * 🚫 This does NOT reopen decision 3. `Divider color` stays visible always, and
 * the asymmetry is the point: `borderColor` dresses four surfaces (row rules,
 * the column divider, the feature-80 section separator, and the outline
 * whenever `outerBorderColor` is unset), so at Row dividers = None it is still
 * the only control for two live surfaces. One field, one surface, one rule —
 * that is what earns a hide, and only the stripe has it.
 *
 * `rowLayout !== "GRID"` is the second half, and it is not defensive: Grid does
 * not offer Stripes (`rowDividerOptionsFor`), but the ORPHAN case reaches here
 * — a merchant who chose Stripes on a two-column table and then switched to
 * Grid still has `STRIPES` stored, and `spec-table.css` stands the fill down to
 * `transparent` in Grid. Without this clause the swatch would reappear in
 * exactly the state the select is simultaneously labelling "not available in
 * Grid", painting nothing. Written `!== "GRID"` rather than a TWO_COLUMN /
 * STACKED membership test for the same reason `showsSectionGapControl` is: the
 * EXCLUDED case is the one with a reason, so a fourth `ROW_LAYOUTS` member
 * inherits "stripes paint".
 *
 * A pure READ like the other seven, so a merchant's hex survives a trip through
 * Lines and back — registered in `VISIBILITY_PREDICATES` so the shared
 * preserve-on-hide law test covers it automatically. Consumed through
 * `ColorKnob.visibleWhen` rather than as a JSX guard, because the swatch is
 * rendered by a `.filter` over `COLOR_KNOBS` and not by a hand-written control.
 */
export function showsStripeBackgroundControl(styling: StylingValues): boolean {
  return styling.rowDividerStyle === "STRIPES" && styling.rowLayout !== "GRID";
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

// The nine color fields, in `STYLING_FIELD_NAMES` order.
//
// `alpha` follows the 2026-07-19 lock: ON for the five SURFACE colors, OFF for
// the two TEXT colors. The stylesheet's own defaults are translucent
// (`rgba(0,0,0,0.06)` band, `0.04` stripes, `0.1` borders), so an opaque-only
// picker could not reproduce the default look; translucent body text, by
// contrast, is a contrast bug rather than a design choice. No domain change is
// needed — `parseColor` already accepts `#rgb` / `#rrggbb` / `#rrggbbaa`.
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
   * Which rail group the swatch renders in (feature 86).
   *
   * The nine swatches used to be one `Colors` group rendered by a single
   * `.map`; they now scatter across five groups, each sitting with the controls
   * it composes with. The array below stays in `STYLING_FIELD_NAMES` order —
   * `tableStyling.ts` documents that the color block is contiguous and
   * `stylingControls.test.ts` derives the expected order from it — so a group's
   * swatches are selected by FILTERING, never by reordering. Within-group
   * render order is therefore inherited from the canonical field order rather
   * than chosen, which is fine: every group's swatches sit side by side in one
   * 2-up row.
   */
  group: StyleGroupId;
  label: string;
  // One line, because the rail is ~300px wide. Says which SURFACE the color
  // paints, since several of them are only visible in certain combinations.
  helpText: string;
  /**
   * What the swatch says while it is EMPTY — the state, not the surface.
   *
   * Replaces the `Colors` group's single note ("Leave a swatch empty to inherit
   * that color from your theme"), which had nowhere to live once the swatches
   * scattered across five groups, and which repeating five times would have
   * been precisely the help-text noise feature 86 exists to cut.
   *
   * It is also strictly MORE accurate than the note was, and that is the real
   * argument for it: "inherit from your theme" was only true for five of the
   * nine. Two of the remaining four fall back to a literal of this app's own
   * (the band's `rgba(0,0,0,0.06)`, the stripe's `0.04`), one to the hairline
   * `rgba(0,0,0,0.1)`, and `outerBorderColor` does not inherit anything — it
   * falls back THROUGH `borderColor`, so its empty state is "follows another
   * control on this screen", which no group-level sentence could have said.
   *
   * Same idiom the rail's six number fields already use, so it is
   * programmatically associated on the control itself for a screen-reader user
   * who lands directly in `Labels` without passing a group note.
   *
   * ⚠️ OPTIONAL since feature 96, and the exception must stay a SHORT NAMED LIST
   * (pinned in `stylingControls.test.ts`), not a habit. It was dropped for
   * exactly one swatch — `headerUnderlineColor` — because that one's fallback
   * chain has two links and ends in `currentColor` rather than a literal, so its
   * empty state is "follows Divider color, or the title's own colour if that is
   * unset too". No string that fits a ~300px rail says that, and the rule this
   * file already enforces is that a gloss which cannot be true is worse than no
   * gloss (the same call feature 95 made when it deleted two `needs …` caveats).
   *
   * The precedent for loosening a required string is one interface over:
   * feature 86 made `StylingOption.helpText` optional and cut ten always-on
   * descriptions, leaving the rail's help text state-reporting rather than
   * decorative throughout.
   */
  emptyHelpText?: string;
  alpha: boolean;
  /**
   * When present, the swatch renders only while this returns true (feature 95).
   *
   * The rail's other seven hide rules are JSX guards — `{showsX(styling) && …}`
   * around a hand-written control. A swatch has no such line to wrap: all nine
   * are produced by one `.filter(…).map(…)` over this array, so the guard has
   * to be a property of the knob and be applied inside that filter.
   *
   * OPTIONAL, and it must stay the exception. Seven of the ten swatches are
   * always visible. The bar for gating one is narrow and it is a fact about the
   * STYLESHEET, not a judgement about tidiness: the field must dress exactly one
   * SURFACE, and the state that hides it must be one where that surface's rules
   * cannot fire at all — a var that is emitted, inherited, and read by nothing.
   *
   * ⚠️ "One surface", not "one rule", and the difference is not pedantry: a
   * section header has TWO markup shapes (the flat `th` and the collapsible
   * `<summary>`), so `headerBgColor` and `headerUnderlineColor` each feed two
   * live rules while dressing one surface. Feature 87's mirroring law is what
   * guarantees the pair always agrees, which is why one predicate can cover
   * both. Counting rules would have wrongly disqualified both of them.
   *
   * 🚫 `borderColor` fails that bar and must stay ungated: it dresses the row
   * rules, the column divider, the feature-80 section separator, AND the table
   * outline whenever `outerBorderColor` is unset, so at Row dividers = None it
   * is still the only control for two live surfaces. Check the stylesheet
   * before adding a fourth entry here — the swatches that survived are the ones
   * whose var dresses more than one thing.
   *
   * ⚠️ A group must never end up with ALL of its swatches conditional: the
   * group would render an empty `<s-grid>` — visible dead space, and a hole in
   * the "no group collapses to a bare heading" count in
   * `styleTabContract.test.ts`, which treats `colorGrid(…)` as one control that
   * always renders. Pinned in `stylingControls.test.ts`.
   */
  visibleWhen?: (styling: StylingValues) => boolean;
}

export const COLOR_KNOBS: ReadonlyArray<ColorKnob> = [
  {
    field: "headerBgColor",
    group: "sectionHeaders",
    // "Header background" (17 chars) was the first try and it WRAPPED — measured
    // live in the rail's 2-up color grid, where it broke to "Header /
    // background" and pushed its swatch a line below its neighbour's, so the two
    // fields in the row no longer aligned. `Stripe background` is the same 17
    // characters and fits, because "Stripe" sets narrower than "Header"; the
    // usable width is right at the boundary, so the real limit is nearer 15.
    //
    // Shortening rather than widening the cell: under a `Section headers`
    // heading "Background" is unambiguous, and it makes the swatch pair read the
    // same way in all three groups that have one (`Background` + a text color).
    // Only the TITLE keeps a qualifier, because the band and the title text are
    // genuinely different surfaces.
    label: "Background",
    // Feature 86 kept this swatch visible under every header style and moved
    // the caveat INTO the text ("needs Header style Banded"). Feature 95 hides
    // it instead — `--appx-spec-header-bg` is read by the Banded rules alone,
    // in both shapes — so the caveat went with it: a condition a merchant can
    // only read while it already holds is not information.
    helpText: "The band behind a section title.",
    // Not "From your theme": the banded default is this app's own
    // `rgba(0, 0, 0, 0.06)`, not a value the theme supplies.
    emptyHelpText: "The default grey band.",
    alpha: true,
    visibleWhen: showsHeaderBackgroundControl,
  },
  {
    field: "headerUnderlineColor",
    group: "sectionHeaders",
    // Deliberately seated between `Background` and `Title color` rather than
    // after both — see the note on `STYLING_FIELD_NAMES`, which is what fixes
    // this order. `Background` and `Underline color` are mutually exclusive, so
    // slot 1 of this group is always "the header style's own surface" and slot 2
    // is always `Title color`, which then never moves as a merchant switches
    // between Banded and Underlined.
    //
    // 13 characters, inside the ~15 the 2-up grid actually allows (see the
    // wrap measurement on `Background` above).
    label: "Underline color",
    // No "needs Header style Underlined" caveat, for the reason feature 95
    // deleted two of them: the swatch is only on screen while the condition
    // already holds, so the caveat could never be read by anyone who needed it.
    helpText: "The rule beneath a section title.",
    // 🔴 NO `emptyHelpText`, and this is the only swatch without one
    // (feature 96 decision (a), 2026-07-28). Every other empty state is one
    // hop — a theme value, or an app literal, or `outerBorderColor`'s single
    // "Follows Divider color." This one is two: `borderColor` first, and then
    // `currentColor`, which resolves to the section title's own colour. So the
    // honest sentence is "follows Divider color, or the title colour if that is
    // unset too", which does not fit a ~300px rail, and the half-truth that does
    // fit would be wrong precisely when a merchant has left both empty — the
    // DEFAULT state. See the `emptyHelpText` doc for why a missing gloss beats
    // an untrue one.
    alpha: true,
    visibleWhen: showsHeaderUnderlineColorControl,
  },
  {
    field: "headerTextColor",
    group: "sectionHeaders",
    label: "Title color",
    // The third TEXT swatch, so `alpha: false` by the 2026-07-19 lock:
    // translucent body text is a contrast bug rather than a design choice, and
    // a section title is the most load-bearing text in the table.
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
    // Feature 86 put this swatch in the same group as the control it names and
    // stated the caveat in prose — "needs Row dividers set to Stripes" — so a
    // merchant who set it on a lines table would not read the no-op as a broken
    // control. Feature 95 removes the no-op instead: the swatch is now only on
    // screen while that condition already holds, so restating it here would be
    // help text describing a state the merchant cannot be in.
    helpText: "The fill on alternating rows.",
    emptyHelpText: "The default grey shading.",
    alpha: true,
    visibleWhen: showsStripeBackgroundControl,
  },
  {
    field: "borderColor",
    group: "rows",
    label: "Divider color",
    // Was "Border" until feature 86. The rename is what lets the help text stop
    // being positional: it used to end "unless set below", which was only true
    // while the outline swatch happened to be the next entry in one long Colors
    // list. Both ends now name each other, so neither depends on layout.
    //
    // The coupling itself is unchanged and has to be stated: this dresses the
    // frame too until `outerBorderColor` is set, or a merchant who changes it
    // and watches the outline move with it reads the coupling as a bug.
    helpText:
      "Row and column rules, and the outline unless Outline color is set.",
    emptyHelpText: "The default hairline grey.",
    alpha: true,
  },
  {
    field: "outerBorderColor",
    group: "tableFrame",
    label: "Outline color",
    helpText: "The table's outer frame. Needs an Outline width.",
    // The one swatch whose empty state is NOT an inherit: `spec-table.css`
    // falls back through `--appx-spec-border-color` before reaching a literal
    // (feature 78), so an untouched outline tracks the Rows swatch. The single
    // group note this replaced could not have expressed that.
    emptyHelpText: "Follows Divider color.",
    alpha: true,
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
 *
 * ⚠️ `inheritHelpText` is REQUIRED while the domain options' copy is optional,
 * and that asymmetry is the feature-86 help-text rule in one signature.
 * `Bold` and `Uppercase` explain themselves; `Inherit` is the one option in the
 * rail whose meaning a merchant cannot read off the word — it has to say what
 * is inherited and from where. Every gloss on these five lists was cut except
 * this one.
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

// These three KEEP their help text where Weight / Case / Line height lost
// theirs, and the reason is the feature-86 rule rather than an exception to it:
// `Small` states a size but not that it is measured against the THEME. A
// merchant reading `Small` has no way to know these are em multipliers that
// follow a theme switch, which is exactly what separates them from `Custom`.
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

// Label weight — LABEL COLUMN ONLY, settled in Step 3 when the stylesheet put
// `--appx-spec-font-weight` on `.appx-spec-table__label` rather than the table.
//
// ⚠️ THE SCOPE LOCK STILL HOLDS, BY A DIFFERENT MECHANISM (feature 86). This
// used to read "the control says 'Label weight', so the UI itself states the
// scope". The control now says just "Weight" — and the scope is still stated,
// by the `Labels` group heading it sits under, which is wired to the control
// with `role="group"` + `aria-labelledby`, so it is announced too. What has NOT
// changed: renaming this to a table-wide "Font weight" would require MOVING THE
// VAR off `.appx-spec-table__label`, which would repaint every live table.
// Dropping the group wrapper would silently break the same lock.
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
  // No longer "your theme's LABEL weight": the `Labels` heading carries the
  // scope, and the gloss is short enough to read at 300px without it.
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

// Label case — label column only, and under the same scope lock as the weight
// knob above: the `Labels` heading is what states the scope now that the
// control reads "Case". The section header takes its own case var, so this
// never touches section titles.
const LABEL_CASE_LABELS: Record<(typeof LABEL_CASES)[number], OptionCopy> = {
  DEFAULT: { label: "As typed" },
  UPPERCASE: { label: "Uppercase" },
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
// two different numbers.
//
// ⚠️ FEATURE 86 CHANGED WHAT SEPARATES THESE FROM THEIR TWINS. Until now it was
// the per-option prose ("Titles stand out strongly." vs "Labels stand out
// strongly."), written that way so a merchant reading two Uppercase controls in
// two groups did not take them for one control appearing twice. That prose is
// cut on both sides — it only said the label back — so the pairs are now
// distinguished by their GROUP HEADING (`Section headers` vs `Labels`) and, in
// the data, by the Inherit gloss alone.
//
// 🚫 The two `Record`s below are therefore IDENTICAL to `FONT_WEIGHT_LABELS` /
// `LABEL_CASE_LABELS` today, and are deliberately NOT collapsed into them. The
// duplication buys a real guard: the test asserting the header lists never say
// "label" can only fail while the lists are separable. Share one record and
// that test becomes structurally incapable of failing — a vacuous guard, which
// is worse than four lines of repetition, and it is exactly the leak the
// feature-81 comment above was written to prevent.
//
// The Inherit gloss still does NOT say "your theme's" the way the four
// Typography lists do. There is no theme value behind a section title's weight
// or casing — the fallback is this app's own literal (700 / none), and saying
// otherwise would be a lie the merchant could catch by switching themes.
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

/** A stored grid minimum as the string a number field holds; null = empty. */
export function toGridMinColumnWidthControlValue(px: number | null): string {
  return toBoundedIntControlValue(px);
}

/**
 * The minimum-column-width box's string back to a stored px or null.
 *
 * The BLANK-BOX idiom, not zero-means-off (feature 85). Clearing the field is
 * the way back to the stylesheet's own 240px, and `0` is deliberately not a
 * spelling of anything here: it would mean an unbounded track count, which is
 * precisely the unreadable case the 160 floor exists to prevent. So a typed 0
 * clamps UP to the floor rather than reading as "off" — contrast the outline
 * width and corner radius, where null already means off and 0 is its display
 * form.
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
