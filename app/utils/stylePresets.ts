// Built-in style presets (feature 88 — Reshell Phase B2, Step 13). Binding spec:
// `context/features/88-style-preset-gallery.md`.
//
// A preset is a TABLE PATTERN, not a theme and not starter content. The five
// bundles below were derived from seven merchant-supplied reference tables, and
// the taxonomy that produced them is the load-bearing part: spec tables differ on
// FOUR axes, plus one behavioural axis.
//
//   1. pair layout       -> `rowLayout`
//   2. section headers   -> `sectionHeaderStyle`
//   3. separation        -> `rowDividerStyle` + `columnDividerStyle`
//   4. frame             -> `outerBorderWidthPx` + `outerBorderRadiusPx`
//   +  collapsible       -> `sectionsCollapsible` (+ `sectionGapPx`)
//
// Everything else in `STYLING_FIELD_NAMES` — nine colors, six typography knobs,
// density, alignment, widths, padding — is TUNING WITHIN a pattern, not a
// pattern, and is therefore absent from every bundle below.
//
// **A bundle sets structure; an accent sets color; they compose.** The accent
// half is feature 93 and does not exist yet, but every seam it needs is cut here
// — see `seedStylingFromPreset`. Do not fold a color into a bundle to save the
// wait: it would opt a merchant out of theme inheritance the moment they pick a
// card, which is the one promise this whole module is arranged to protect.
//
// Framework-free on purpose (same rationale as `tableStyling.ts` and `rows.ts`):
// the gallery route, the `/new?style=` loader seed, and the model layer's write
// gate all consume it, so it must stay client-safe and Node-testable.

import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  type StylingFieldName,
  type StylingValues,
} from "./tableStyling";

// --- The comparison scope -----------------------------------------------------

/**
 * The fields a preset is judged on — the four pattern axes plus the collapsible
 * pair.
 *
 * **This is the structure-only rule in executable form.** The rule ("a bundle
 * sets structure; an accent sets color; they compose") is stated in prose at the
 * top of this file, and prose does not fail a build. Two guards in
 * `stylePresets.test.ts` are written in terms of this list — no bundle may set a
 * field outside it, and every pattern must differ from every other pattern
 * somewhere inside it — and together they are what stops a color, a font size or
 * a padding from being smuggled into a "pattern".
 *
 * ⚠️ It is deliberately NOT `stylingEquals` over all 34 fields. A whole-shape
 * compare would call two patterns identical only if their tuning matched too,
 * and once feature 93's accents write `headerBgColor` on top of a bundle, every
 * seeded template would differ from the bundle it came from. Comparisons here
 * must see the pattern and ignore the paint.
 *
 * 🚫 It is also NOT "the keys this bundle sets". `banded`'s bundle is `{}`, so
 * that form compares ZERO fields and would make Banded equal to everything. A
 * fixed set resolves `{}` against the defaults and gets it right.
 *
 * Append-only. Feature 93 appends the accent's color fields.
 *
 * 📌 **The frame and column-rule fields were appended 2026-07-27** (merchant
 * decision: the Classic card gets an outer border, a column rule and stripes).
 * They are not a widening of the rule — they are the rule catching up with the
 * taxonomy at the top of this file, which has named the frame as pattern axis 4
 * since the module was written. Nothing had used it, so the list had never
 * needed it. `columnDividerStyle` joins for the same reason `rowDividerStyle` is
 * already here: it is the interior VERTICAL rule, the same kind of thing on the
 * other axis.
 *
 * What must NOT follow them: `gridMinColumnWidthPx`, `tableMaxWidthPx`,
 * `tableAlign`, and every typography / density / padding knob. Those are tuning,
 * and a test still names them one by one.
 */
export const PRESET_SCOPED_FIELDS = [
  "rowLayout",
  "sectionHeaderStyle",
  "rowDividerStyle",
  "columnDividerStyle",
  "outerBorderWidthPx",
  "outerBorderRadiusPx",
  "sectionsCollapsible",
  "sectionGapPx",
] as const satisfies readonly StylingFieldName[];

export type PresetScopedField = (typeof PRESET_SCOPED_FIELDS)[number];

// --- The bundles --------------------------------------------------------------

/**
 * An overrides-only wire shape: exactly the shape of `payload.styling` and the
 * metaobject `styling` field, so a bundle needs no serialization path of its own.
 *
 * Typed as `Partial<StylingValues>` rather than `Record<string, unknown>` so a
 * misspelled field or a wrong-typed value is a compile error. That still leaves
 * one hole a type cannot close — an in-range-looking integer that the parser
 * clamps — which is why `stylePresets.test.ts` asserts every bundle is a fixed
 * point of parse-then-serialize.
 */
export type StyleBundle = Readonly<Partial<StylingValues>>;

export interface StylePreset {
  /**
   * Stable, URL-safe, and PERSISTED — this string is written to
   * `TableStyling.basedOnPreset` and carried in `?style=<id>`. Renaming one
   * orphans every template stamped with it, so treat these as a wire format.
   */
  id: string;
  label: string;
  /** One line, merchant-facing. Shown on the gallery card, under the label. */
  description: string;
  bundle: StyleBundle;
}

/**
 * The five built-in patterns.
 *
 * ORDER IS MERCHANT-FACING — it is the order of the gallery cards, with the
 * "Blank" card appended after them. `banded` leads because it is both the most
 * frequent reference shape (2 of 7, and the dominant electronics-retail look)
 * and the app's own default. Then the rest of the two-column family, ordered by
 * how much chrome they carry — `classic` (the full grid: frame, column rule,
 * stripes) and `minimal` (none of it) are the two ends, with the default sitting
 * between them. The two structural departures come last. Reordering changes what
 * a merchant sees first, never what anything means.
 *
 * ⚠️ `id` and `label` are allowed to diverge, and do. The id names the PATTERN
 * and is a wire format; the label is merchant-facing and may be re-branded
 * without touching a stored stamp. `banded` is labelled "Modern" for exactly
 * that reason — the bundle really is the banded pattern, and the id still says
 * so where it matters.
 *
 * Reference attribution lives in the per-preset comments so a future reader can
 * check a bundle against the thing it was derived from rather than re-deriving
 * taste.
 */
export const STYLE_PRESETS: readonly StylePreset[] = Object.freeze([
  {
    // startech.com.bd, techlandbd.com. Those two differ only on the frame and
    // column-rule axes, which is the evidence that made a separate "Bordered"
    // card unnecessary: both are two clicks from this one.
    //
    // ⚠️ The bundle is EMPTY, and that is a finding rather than an oversight.
    // BANDED + LINES + no frame is exactly `DEFAULT_STYLING_VALUES`, so the
    // app's zero-config default already IS the dominant retail pattern. Two
    // consequences: this card and the "Blank" card resolve to the SAME 34
    // values, which is why Blank is not a sixth entry here (it is the absence of
    // a preset, and shows no preview for exactly this reason), and picking this
    // one writes no override at all — only the `basedOnPreset` stamp
    // distinguishes it from Blank. A test pins the emptiness, so a future change to
    // `DEFAULT_STYLING_VALUES` has to revisit this decision rather than
    // silently redefine the card.
    id: "banded",
    label: "Modern",
    description: "A shaded band behind each section title.",
    bundle: Object.freeze({}),
  },
  {
    // The full spec-table grid: outer frame, the label/value column rule, and
    // striped rows. Derived from the ACEFAST YF4 reference table supplied
    // 2026-07-27 — the look a merchant means by "a proper specs table", and the
    // only card that turns every separation knob ON at once.
    //
    // It is the reason `PRESET_SCOPED_FIELDS` gained the frame and column-rule
    // fields: before this card, no bundle had ever used pattern axes 3b and 4,
    // so the comparison scope had never needed them.
    //
    // ⚠️ STRIPES, not LINES — the two are alternatives, not a stack. With
    // stripes on, the storefront CSS drops the row rules and the alternating
    // fill does the separating; asking for both would just be the striped look
    // with dead declarations under it.
    //
    // No `outerBorderRadiusPx`: square corners. The reference reads as very
    // slightly rounded, but a radius is a taste knob a merchant can add in one
    // click, and a curved frame is not what makes this pattern legible.
    id: "classic",
    label: "Classic",
    description: "A bordered grid with alternating row shading.",
    bundle: Object.freeze({
      sectionHeaderStyle: "PLAIN",
      rowDividerStyle: "STRIPES",
      columnDividerStyle: "LINE",
      outerBorderWidthPx: 1,
    }),
  },
  {
    // The black "SPECS" audio-product page: bare bold titles, no rules at all,
    // whitespace carrying the structure. Unreachable before feature 87 — this
    // is the card `PLAIN` was added for.
    id: "minimal",
    label: "Minimal",
    description: "No bands and no rules — spacing does the work.",
    bundle: Object.freeze({
      sectionHeaderStyle: "PLAIN",
      rowDividerStyle: "NONE",
    }),
  },
  {
    // Samsung (3 tracks) and Lazada (2). Both stack the label above its value,
    // and both are multi-track — which is why `GRID` welds the two together as
    // one `ROW_LAYOUTS` member instead of exposing them as two knobs.
    //
    // `gridMinColumnWidthPx` is deliberately NOT set: null means the
    // stylesheet's own 240px, which measured materially shorter than any
    // narrower value on the live 44-row reference (feature 85 — narrower tracks
    // wrap long values more, so smaller is taller). A bundle that pinned a
    // number would ship the worse default.
    // `sectionHeaderStyle` is deliberately ABSENT, so this card inherits the
    // BANDED default (merchant decision 2026-07-27). It matters more here than
    // anywhere else: a section header in GRID spans every track
    // (`grid-column: 1 / -1`), so without a band it is a bare line of text
    // floating across a wide flow with no visible tie to the items under it.
    // The band is what makes the groups read as groups once the pairs stop
    // being stacked in one column.
    id: "multi-column",
    label: "Multi-column",
    description: "Specs flow into several columns, each label above its value.",
    bundle: Object.freeze({
      rowLayout: "GRID",
      rowDividerStyle: "NONE",
    }),
  },
  {
    // Trek. `TEXT_ONLY` rather than `PLAIN` here on purpose: the 2px rule gives
    // a CLICKABLE header the presence a disclosure needs, where the other two
    // cards' headers are inert.
    //
    // ⚠️ `sectionGapPx` is the one tuning value in any bundle and knowingly
    // bends the structure-only rule — a stack of disclosures needs whitespace
    // to read as separate blocks rather than one list. Recorded as a decision,
    // not a leak; strike it if the rule is ever wanted absolutely clean.
    id: "accordion",
    label: "Accordion",
    description: "Shoppers open one section at a time.",
    bundle: Object.freeze({
      sectionsCollapsible: true,
      sectionHeaderStyle: "TEXT_ONLY",
      sectionGapPx: 12,
    }),
  },
]);

// --- Lookup + seeding ---------------------------------------------------------

/**
 * Tolerant lookup, used by every trust boundary that can carry a preset id: the
 * `?style=` query param, a stored `basedOnPreset` column, and a Save payload.
 *
 * **Never throws, never guesses.** An unknown id, a null, an empty string and a
 * `?style=<garbage>` all degrade to `null` — which the callers read as "no
 * preset", the same state as never having picked one. That is what makes the
 * route contract total without a validation branch at each call site.
 */
export function findStylePreset(
  id: string | null | undefined,
): StylePreset | null {
  if (typeof id !== "string" || id === "") return null;
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Narrow an UNTRUSTED value to a storable `basedOnPreset` (feature 88 step 89).
 *
 * The one gate on the column. Returns a known preset id or `null`; a number, an
 * object, a 10KB string and a `<script>` all become `null`. Same posture as
 * `parseRows` and `parseStylingValues` — the Save payload is JSON the client
 * composes, so the server re-validates it rather than trusting the one client we
 * happen to ship.
 *
 * Applied on the WRITE and on the READ, which is not belt-and-braces: a preset
 * removed in a future release leaves stamps behind in rows nobody rewrites, and
 * normalizing on read is what makes those quietly degrade to "no pattern"
 * instead of pointing at nothing. It is also what keeps the column a closed
 * vocabulary, so a later reader can treat it as an enum-in-a-string without
 * auditing every writer.
 *
 * Returns the plain id, not the `StylePreset` — callers that need the object
 * call `findStylePreset`. That is what lets the model layer use this without
 * importing a shape it has no use for.
 */
export function normalizeStylePresetStamp(value: unknown): string | null {
  return typeof value === "string"
    ? (findStylePreset(value)?.id ?? null)
    : null;
}

/**
 * Resolve a preset (plus, later, an accent) to the full working shape the engine
 * holds.
 *
 * The `accent` parameter is feature 93's seam and is doing real work today by
 * being absent-able: the merge order fixes that an accent's colors win over a
 * bundle's, and the signature does not change when `ACCENT_PRESETS` lands. Built
 * now because retrofitting a second overrides source through the rail, the
 * route, and the seed would touch every one of them.
 *
 * A null/unknown preset resolves to `DEFAULT_STYLING_VALUES` — the theme-inherit
 * state — so the "Blank" card and an invalid param share one code path with the
 * "picked Banded" path. They differ only in whether `basedOnPreset` is stamped.
 */
export function seedStylingFromPreset(
  presetId: string | null | undefined,
  accent: StyleBundle = {},
): StylingValues {
  const preset = findStylePreset(presetId);
  return parseStylingValues({ ...(preset?.bundle ?? {}), ...accent });
}

/** The full working shape a preset's bundle resolves to, defaults filled in. */
export function stylePresetValues(preset: StylePreset): StylingValues {
  return parseStylingValues(preset.bundle);
}

// --- Pattern comparison -------------------------------------------------------

/**
 * Do these two value sets agree on every field a preset is judged on?
 *
 * Scoped to `PRESET_SCOPED_FIELDS` — see the note there for why this is not
 * `stylingEquals`. Flat strict compare, same shape as `stylingEquals`, so the
 * two read alike at their call sites.
 */
export function presetScopedEquals(
  a: StylingValues,
  b: StylingValues,
): boolean {
  return PRESET_SCOPED_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Has the merchant moved off the pattern they were created from?
 *
 * ⚠️ **Currently has no consumer, and that is deliberate** (feature 88 step 90).
 * It was written for an in-editor rail that showed a "Customized" hint beside
 * the selected card; the 2026-07-27 create-time-only decision cut the rail, and
 * the hint went with it. Kept rather than deleted because two things ahead want
 * exactly this comparison — feature 93 (accents) and the B3 saved-preset phase,
 * which has to answer "is this still the shared preset?" before it can offer to
 * update one. Six tested lines; re-deriving it later costs more than the wait.
 *
 * `false` when nothing was picked (or the stamp is unrecognized): with no preset
 * there is no baseline to deviate from.
 *
 * ⚠️ Changing a COLOR never makes this true, by construction. That is the
 * intended reading — colors were never part of the pattern — and it is what
 * keeps the answer meaningful once accents ship.
 */
export function isCustomizedFromPreset(
  values: StylingValues,
  presetId: string | null | undefined,
): boolean {
  const preset = findStylePreset(presetId);
  if (preset === null) return false;
  return !presetScopedEquals(values, stylePresetValues(preset));
}

/**
 * The default-state guard the `banded` bundle's emptiness rests on, exported so
 * the test can state the claim in the same vocabulary the comment does.
 */
export function isThemeDefault(values: StylingValues): boolean {
  return presetScopedEquals(values, DEFAULT_STYLING_VALUES);
}
