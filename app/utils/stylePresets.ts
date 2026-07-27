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
//   3. row separation    -> `rowDividerStyle`
//   4. frame             -> `outerBorderWidthPx` + `outerBorderRadiusPx`
//   +  collapsible       -> `sectionsCollapsible` (+ `sectionGapPx`)
//
// Everything else in `STYLING_FIELD_NAMES` — nine colors, six typography knobs,
// density, alignment, widths, padding — is TUNING WITHIN a pattern, not a
// pattern, and is therefore absent from every bundle below.
//
// **A bundle sets structure; an accent sets color; they compose.** The accent
// half is feature 89 and does not exist yet, but every seam it needs is cut here
// — see `seedStylingFromPreset`. Do not fold a color into a bundle to save the
// wait: it would opt a merchant out of theme inheritance the moment they pick a
// card, which is the one promise this whole module is arranged to protect.
//
// Framework-free on purpose (same rationale as `tableStyling.ts` and `rows.ts`):
// the rail, the gallery route, and the server-side seed all consume it, so it
// must stay client-safe and Node-testable.

import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  type StylingFieldName,
  type StylingValues,
} from "./tableStyling";

// --- The comparison scope -----------------------------------------------------

/**
 * The fields a preset is judged on — the four pattern axes plus the collapsible
 * pair. Drives the rail's "Customized" hint and nothing else.
 *
 * ⚠️ **This is deliberately NOT `stylingEquals` over all 34 fields**, and the
 * reason is feature 89. `stylingEquals` compares the whole shape; the moment an
 * accent theme writes `headerBgColor`, every freshly created template would
 * differ from its own bundle and read "Customized" without the merchant having
 * touched anything. The hint would die on arrival and Step 13 would reopen.
 *
 * 🚫 It is also NOT "the keys this bundle sets". `banded`'s bundle is `{}`, so
 * that form compares ZERO fields: a Banded template could never read
 * "Customized", not even after the merchant switched it to `GRID`. A fixed set
 * resolves `{}` against the defaults and gets it right.
 *
 * Append-only. Feature 89 adds the accent's color fields here and nothing else
 * about the hint changes. A test pins that no bundle sets a field outside this
 * list — a field outside it is invisible to the hint forever.
 */
export const PRESET_SCOPED_FIELDS = [
  "rowLayout",
  "sectionHeaderStyle",
  "rowDividerStyle",
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
  /** One line, merchant-facing. Shown on the gallery card and the rail card. */
  description: string;
  bundle: StyleBundle;
}

/**
 * The five built-in patterns.
 *
 * ORDER IS MERCHANT-FACING — it is the order of the gallery cards and the rail
 * cards. `banded` leads because it is both the most frequent reference shape
 * (2 of 7, and the dominant electronics-retail look) and the app's own default;
 * `simple` and `minimal` follow as the same two-column family with progressively
 * less chrome; the two structural departures come last. Reordering changes what
 * a merchant sees first, never what anything means.
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
    // consequences: this card and the once-planned "start with your theme's
    // styles" option are the same thing and were merged, and picking it writes
    // no override at all — only the `basedOnPreset` stamp distinguishes it from
    // the skip path. A test pins the emptiness, so a future change to
    // `DEFAULT_STYLING_VALUES` has to revisit this decision rather than
    // silently redefine the card.
    id: "banded",
    label: "Banded",
    description: "A shaded band behind each section title.",
    bundle: Object.freeze({}),
  },
  {
    // No direct reference — the safe middle, and the only bundle not derived
    // from a supplied table. Earns its place as the one-step-quieter answer for
    // a merchant who finds the band heavy but still wants rows separated.
    id: "simple",
    label: "Simple",
    description: "Plain section titles, a hairline between rows.",
    bundle: Object.freeze({ sectionHeaderStyle: "PLAIN" }),
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
    id: "multi-column",
    label: "Multi-column",
    description: "Specs flow into several columns, each label above its value.",
    bundle: Object.freeze({
      rowLayout: "GRID",
      sectionHeaderStyle: "PLAIN",
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
 * `?style=` query param, a stored `basedOnPreset` column, and the rail.
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
 * Resolve a preset (plus, later, an accent) to the full working shape the engine
 * holds.
 *
 * The `accent` parameter is feature 89's seam and is doing real work today by
 * being absent-able: the merge order fixes that an accent's colors win over a
 * bundle's, and the signature does not change when `ACCENT_PRESETS` lands. Built
 * now because retrofitting a second overrides source through the rail, the
 * route, and the seed would touch every one of them.
 *
 * A null/unknown preset resolves to `DEFAULT_STYLING_VALUES` — the theme-inherit
 * state — so the skip path and an invalid param share one code path with the
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

// --- The "Customized" hint ----------------------------------------------------

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
 * Has the merchant moved off the pattern they picked?
 *
 * `false` when nothing was picked (or the stamp is unrecognized): with no preset
 * there is no baseline to deviate from, and "Customized" against nothing would
 * be noise on every unstyled template.
 *
 * ⚠️ Changing a COLOR never makes this true, by construction. That is the
 * intended reading — colors were never part of the pattern — and it is what
 * keeps the hint meaningful once accents ship.
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
