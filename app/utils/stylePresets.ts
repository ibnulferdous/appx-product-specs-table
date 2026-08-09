// Built-in style presets. Binding spec:
// `context/features/88-style-preset-gallery.md`.
//
// A preset is a TABLE PATTERN, not a theme and not starter content. Spec tables
// differ on four axes plus one behavioural axis:
//
//   1. pair layout       -> `rowLayout`
//   2. section headers   -> `sectionHeaderStyle`
//   3. separation        -> `rowDividerStyle` + `columnDividerStyle`
//   4. frame             -> `outerBorderWidthPx` + `outerBorderRadiusPx`
//   +  collapsible       -> `sectionsCollapsible` (+ `sectionGapPx`)
//
// Everything else in `STYLING_FIELD_NAMES` — colors, typography, density,
// alignment, widths, padding — is TUNING WITHIN a pattern, and is absent from
// every bundle below.
//
// **A bundle sets structure; an accent sets color; they compose.** Do not fold a
// color into a bundle: it would opt a merchant out of theme inheritance the
// moment they pick a card, which this module is arranged to protect.
//
// Framework-free so the gallery route, the `/new?style=` seed and the model
// layer's write gate can all consume it.

import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  type StylingFieldName,
  type StylingValues,
} from "./tableStyling";

/**
 * The fields a preset is judged on — the structure-only rule in executable form.
 * Two guards in `stylePresets.test.ts` are stated over this list: no bundle may
 * set a field outside it, and every pattern must differ from every other one
 * inside it.
 *
 * ⚠️ Not `stylingEquals` over all 34 fields — a whole-shape compare would call
 * two patterns different once accents write colors on top of a bundle.
 * 🚫 Not "the keys this bundle sets" either: `banded`'s bundle is `{}`, so that
 * form compares zero fields and makes Banded equal to everything.
 *
 * 🔴 **Colours never join this list.** An accent writes `headerBgColor`,
 * `stylePresetValues` resolves the bundle alone, and every seeded template would
 * read "Customized" the instant it is created — unrepairable, because an accent
 * has no provenance column. Colours keep their own `ACCENT_SCOPED_FIELDS`, and a
 * test asserts the two are disjoint.
 *
 * What must NOT be added: `gridMinColumnWidthPx`, `tableMaxWidthPx`,
 * `tableAlign`, and every typography / density / padding knob — those are
 * tuning, and a test names them one by one.
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

/**
 * An overrides-only wire shape — exactly the shape of `payload.styling` and the
 * metaobject `styling` field, so a bundle needs no serialization path.
 *
 * `Partial<StylingValues>` makes a misspelled field a compile error. The hole a
 * type cannot close — an in-range-looking integer the parser clamps — is why
 * `stylePresets.test.ts` asserts every bundle is a fixed point of
 * parse-then-serialize.
 */
export type StyleBundle = Readonly<Partial<StylingValues>>;

export interface StylePreset {
  /**
   * Stable, URL-safe, and PERSISTED to `TableStyling.basedOnPreset` and `?style=`.
   * Renaming one orphans every template stamped with it — treat as a wire format.
   */
  id: string;
  label: string;
  bundle: StyleBundle;
}

/**
 * The five built-in patterns.
 *
 * ORDER IS MERCHANT-FACING — the gallery card order, with "Blank" appended.
 *
 * ⚠️ `id` and `label` are allowed to diverge, and do. The id names the PATTERN
 * and is a wire format; the label is merchant-facing and may be re-branded
 * without touching a stored stamp (hence `banded` labelled "Modern").
 *
 * ⚠️ **A bundle OMITS any field equal to its domain default.** An explicit
 * default serializes away to nothing and fails the fixed-point guard in
 * `stylePresets.test.ts` — inheriting the default IS how a bundle states it.
 */
export const STYLE_PRESETS: readonly StylePreset[] = Object.freeze([
  {
    // ⚠️ The EMPTY bundle is a finding, not an oversight: BANDED + LINES + no
    // frame is exactly `DEFAULT_STYLING_VALUES`, so the zero-config default
    // already IS the dominant retail pattern. This card and "Blank" resolve to
    // the same 34 values; only the `basedOnPreset` stamp distinguishes them. A
    // test pins the emptiness so a change to the defaults revisits this.
    id: "banded",
    label: "Modern",
    bundle: Object.freeze({}),
  },
  {
    // The full grid: outer frame, column rule, rule under every row.
    //
    // ⚠️ Row rules, not stripes — the two are ALTERNATIVES, not a stack.
    // `--dividers-stripes` sets `border-block-end: none` on every label and
    // value (`spec-table.css`), so a striped build of this card would have no
    // interior horizontal edges at all.
    //
    // The only card on `TEXT_ONLY`, so the only one `headerUnderlineColor`
    // reaches. `rowDividerStyle` is absent because LINES is the default.
    id: "classic",
    label: "Classic",
    bundle: Object.freeze({
      sectionHeaderStyle: "TEXT_ONLY",
      columnDividerStyle: "LINE",
      outerBorderWidthPx: 1,
    }),
  },
  {
    // Bare bold titles, no rules, whitespace carrying the structure.
    id: "minimal",
    label: "Minimal",
    bundle: Object.freeze({
      sectionHeaderStyle: "PLAIN",
      rowDividerStyle: "NONE",
    }),
  },
  {
    // `gridMinColumnWidthPx` is deliberately NOT set: null means the
    // stylesheet's 240px, which measured shorter than any narrower value on the
    // live 44-row reference (narrower tracks wrap long values more, so smaller
    // is taller). `sectionHeaderStyle` is absent so this inherits BANDED — a
    // GRID section header spans every track, so without a band it is a bare
    // line of text with no visible tie to the items under it.
    id: "multi-column",
    label: "Multi-column",
    bundle: Object.freeze({
      rowLayout: "GRID",
      rowDividerStyle: "NONE",
    }),
  },
  {
    // `sectionHeaderStyle` is absent so this inherits BANDED: a filled strip
    // reads as a pressable target where a rule reads as a boundary, and the
    // whole summary row becomes the hit area.
    //
    // ⚠️ `sectionGapPx` is the one tuning value in any bundle and knowingly
    // bends the structure-only rule — a stack of disclosures needs whitespace
    // to read as separate blocks. Recorded as a decision, not a leak.
    //
    // STRIPES belong here rather than on Classic: inside a disclosure the
    // alternating fill is a within-section reading aid, and the storefront
    // restarts the parity at every `<tbody>`, so a closed section leaves no
    // stale checkerboard. Not the GRID + STRIPES combination the stylesheet
    // refuses to paint — `rowLayout` stays default, and a test asserts it.
    id: "accordion",
    label: "Accordion",
    bundle: Object.freeze({
      sectionsCollapsible: true,
      sectionGapPx: 12,
      rowDividerStyle: "STRIPES",
    }),
  },
]);

/**
 * Tolerant lookup for every trust boundary carrying a preset id: `?style=`, a
 * stored `basedOnPreset`, a Save payload.
 *
 * **Never throws, never guesses.** An unknown id, a null and an empty string all
 * degrade to `null` — read as "no preset", so the route contract is total
 * without a validation branch per call site.
 */
export function findStylePreset(
  id: string | null | undefined,
): StylePreset | null {
  if (typeof id !== "string" || id === "") return null;
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Narrow an UNTRUSTED value to a storable `basedOnPreset` — the one gate on the
 * column. Returns a known preset id or `null`.
 *
 * Applied on WRITE and on READ: a preset removed in a future release leaves
 * stamps behind, and normalizing on read degrades those to "no pattern" instead
 * of pointing at nothing. That keeps the column a closed vocabulary.
 */
export function normalizeStylePresetStamp(value: unknown): string | null {
  return typeof value === "string"
    ? (findStylePreset(value)?.id ?? null)
    : null;
}

/**
 * Resolve a preset plus an accent to the full working shape.
 *
 * **The merge order is the law both vocabularies compose through:** an accent's
 * colors win over a bundle's.
 *
 * 🔬 The order is guarded by a test that FABRICATES a collision, and has to be:
 * the two scopes are disjoint, so swapping the spreads is a no-op on every real
 * combination. Do not "clean up" that test to use a real accent — it would
 * delete the only coverage this line has.
 *
 * A null/unknown preset resolves to `DEFAULT_STYLING_VALUES`, so "Blank" and an
 * invalid param share one path with a real pick.
 */
export function seedStylingFromPreset(
  presetId: string | null | undefined,
  // `AccentBundle` here is documentation, NOT enforcement — the two aliases are
  // structurally identical, so a `StyleBundle` still passes with no error.
  accent: AccentBundle = {},
): StylingValues {
  const preset = findStylePreset(presetId);
  return parseStylingValues({ ...(preset?.bundle ?? {}), ...accent });
}

/** The full working shape a preset's bundle resolves to, defaults filled in. */
export function stylePresetValues(preset: StylePreset): StylingValues {
  return parseStylingValues(preset.bundle);
}

// 🔴 The gallery's previews cannot show three of the five patterns apart.
// `--appx-preset-scale` is 0.55, so Classic's column rule and 1px frame render
// at 0.55px — sub-pixel. And the scale cannot be raised: the render width must
// stay above the stylesheet's 749px mobile breakpoint, and two cards plus a gap
// must fit the 966px page, capping two-up at ~0.63. The difference has to be
// carried in WORDS, which is what `presetHighlights` is — and it is the only
// form a screen-reader user can perceive, since the preview is `aria-hidden`.

/**
 * Merchant-facing words for each pair layout, or `null` where there is nothing
 * to say — `TWO_COLUMN` is the shape a merchant already pictures.
 *
 * ⚠️ A `Record` over the union rather than an `if` chain, here and below, so
 * appending a member to `ROW_LAYOUTS` is a COMPILE error instead of a card that
 * silently stops describing its own layout.
 */
const ROW_LAYOUT_HIGHLIGHTS: Record<StylingValues["rowLayout"], string | null> =
  {
    TWO_COLUMN: null,
    STACKED: "Label above each value",
    // GRID welds "several tracks" and "label above value" into one member, so
    // one phrase names both halves.
    GRID: "Several columns, label above each value",
  };

/** Merchant-facing words for each section-header treatment. */
const SECTION_HEADER_HIGHLIGHTS: Record<
  StylingValues["sectionHeaderStyle"],
  string
> = {
  BANDED: "Shaded section headers",
  // "Underlined", not "Text only" — the wire value describes what it DROPS,
  // while a merchant-facing label has to describe what they see.
  TEXT_ONLY: "Underlined section headers",
  PLAIN: "Plain section headers",
};

/** Merchant-facing words for each row-separation treatment. */
const ROW_DIVIDER_HIGHLIGHTS: Record<StylingValues["rowDividerStyle"], string> =
  {
    LINES: "Line between rows",
    STRIPES: "Alternating row shading",
    NONE: "No lines between rows",
  };

/**
 * The short "what's different about this one" line under a gallery card.
 *
 * 🔴 **Derived from the RESOLVED values, never hand-written per preset.** A
 * hand-written list is a second description with nothing keeping the two in
 * agreement — and it has already gone stale once in this codebase.
 *
 * ⚠️ Reads the bundle alone, NOT the accent-merged shape. Safe because the two
 * scopes are disjoint; threading the accent through would make the line vary
 * with a colour choice while saying nothing about colour.
 *
 * Header treatment and row separation are emitted for EVERY preset — a shared
 * vocabulary is what makes the cards comparable. The rest speak only when they
 * depart from the default, or "No column line" on four of five cards buries the
 * one card where the frame is the point. 🚫 `sectionGapPx` stays silent: "12px
 * between sections" is not a reason anybody picks a card.
 */
export function presetHighlights(preset: StylePreset): readonly string[] {
  const values = stylePresetValues(preset);
  const highlights: string[] = [];

  // Structure leads, decoration follows.
  if (values.sectionsCollapsible) {
    highlights.push("Sections open and close");
  }
  const layout = ROW_LAYOUT_HIGHLIGHTS[values.rowLayout];
  if (layout !== null) {
    highlights.push(layout);
  }

  // Always spoken — the shared vocabulary.
  highlights.push(SECTION_HEADER_HIGHLIGHTS[values.sectionHeaderStyle]);
  highlights.push(ROW_DIVIDER_HIGHLIGHTS[values.rowDividerStyle]);

  // Spoken only when set, and the two the preview renders sub-pixel — this line
  // is the ONLY place a merchant learns Classic has them.
  if (values.columnDividerStyle === "LINE") {
    highlights.push("Line between columns");
  }
  if ((values.outerBorderWidthPx ?? 0) > 0) {
    highlights.push("Outer border");
  }

  return highlights;
}

/**
 * Read the gallery's choice off a URL's query string — the resolved styling to
 * open a new scaffold with, plus the provenance stamp to save.
 *
 * 🔴 **ONE lookup, BOTH outputs.** The failure this prevents is a template
 * seeded from one bundle and stamped with another — a lie no later code
 * recomputes, since `basedOnPreset` is provenance and never re-read as a live
 * link. Deriving both from a single `findStylePreset` makes disagreement
 * unrepresentable rather than merely tested.
 *
 * Every invalid `style` degrades to `DEFAULT_STYLING_VALUES` + a `null` stamp —
 * identical to bare `/app/templates/new`. **No throw, no 404, no redirect**: the
 * param comes from a card, not a merchant, so a bad one means a stale bookmark,
 * and the right answer is a working blank scaffold.
 *
 * 🔴 **A `null` stamp does not imply default styling.** `?accent=blue` with no
 * `?style=` resolves to five real colours with a `null` `basedOnPreset`, so
 * "unstamped" and "untouched" have come apart. Blank ignores the accent by never
 * emitting the param — a fact about the card's href; this function stays total
 * and honours a hand-typed one.
 */
export function resolveGalleryParams(params: URLSearchParams): {
  styling: StylingValues;
  basedOnPreset: string | null;
} {
  const preset = findStylePreset(params.get("style"));
  const accent = findAccent(params.get("accent"));
  return {
    // Routed through `seedStylingFromPreset` because that is where the merge
    // ORDER lives. ⚠️ `accent?.bundle` is left `undefined` on a miss on purpose
    // — it lands on that function's `= {}` default rather than duplicating it.
    styling: seedStylingFromPreset(preset?.id, accent?.bundle),
    // The PATTERN only. An accent gets no provenance column, and this must not
    // start varying with it or the stamp would fill with values no
    // `findStylePreset` recognizes.
    basedOnPreset: preset?.id ?? null,
  };
}

/**
 * The gallery's link into creation — `resolveGalleryParams`' INVERSE.
 *
 * 🔴 Lives beside the decoder so a reader edits both or neither, and so one test
 * can COMPOSE them and prove they agree about every preset × accent pair:
 *
 * ```ts
 * resolveGalleryParams(new URL(galleryHref(p, a), "https://x").searchParams);
 * ```
 *
 * ⚠️ Both params are independently optional; `galleryHref(null, null)` is the
 * bare `/app/templates/new` the "Blank" card uses, with no trailing `?`.
 *
 * 🔴 **Takes ONE NAMED OBJECT, not two positional strings.** The first version
 * was `galleryHref(presetId, accentId)` — two params of identical type. A
 * mutation transposing the call site passed all 119 tests while sending every
 * merchant to `?style=blue&accent=classic`, silently creating a blank, unstamped
 * template from every card. The round-trip test cannot catch it: it proves the
 * FORMAT agrees, saying nothing about what a caller passes.
 *
 * ⚠️ Not compiler-enforced — both fields are `string | null`, so a transposition
 * still typechecks. What the named keys buy is that it can no longer happen by
 * ACCIDENT. The call site is additionally pinned by
 * `StylePresetCardContract.test.ts`.
 */
export function galleryHref(choice: {
  preset: string | null;
  accent: string | null;
}): string {
  // `URLSearchParams` does the percent-encoding, so there is no hand-rolled
  // pair to keep in agreement with the decoder, which reads params back through
  // the same class.
  const params = new URLSearchParams();
  if (choice.preset) params.set("style", choice.preset);
  if (choice.accent) params.set("accent", choice.accent);

  const query = params.toString();
  return query === "" ? "/app/templates/new" : `/app/templates/new?${query}`;
}

/**
 * Do these two value sets agree on every field a preset is judged on? Scoped to
 * `PRESET_SCOPED_FIELDS` — see the note there for why this is not
 * `stylingEquals`.
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
 * ⚠️ **No consumer today, deliberately.** Written for an in-editor rail the
 * create-time-only decision cut. Kept because the B3 saved-preset phase needs
 * exactly this comparison before it can offer to update a shared preset.
 *
 * `false` when nothing was picked — with no preset there is no baseline. Also
 * `false` for any COLOR change, by construction: colors were never part of the
 * pattern, which is what keeps the answer meaningful alongside accents.
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
 * the test can state the claim in the same vocabulary.
 */
export function isThemeDefault(values: StylingValues): boolean {
  return presetScopedEquals(values, DEFAULT_STYLING_VALUES);
}

// --- Accents ------------------------------------------------------------------
//
// The colour half of the vocabulary. Binding design:
// `context/features/93-style-accent-themes.md`.
//
// **Why an accent is FIVE fields and not one:** a pattern picks a
// `sectionHeaderStyle`, and two of the three members hardcode the band away
// (`--section-plain` and `--section-text-only` both set
// `background: transparent`). An accent writing only `headerBgColor` paints
// NOTHING on three of the five cards. `headerTextColor` is what makes the set
// total — no member rule overrides `color:`, so the title is tintable under
// every header style, and it is the only live field on Minimal.
//
// 🚫 An accent that varies by pattern — `accentFor(preset, token)` — was
// rejected: it would cost the composition promise above.

/**
 * An overrides-only wire shape, structurally identical to `StyleBundle`.
 *
 * ⚠️ **A separate name for READERS — it enforces nothing.** TypeScript is
 * structural, so the two aliases are mutually assignable and a `StyleBundle`
 * passes as an `accent` with no diagnostic. The guard at that seam is the test
 * suite, not the type checker. The two obey different laws: a bundle may set a
 * subset and must set no colour; an accent must set all five colours and no
 * structure.
 */
export type AccentBundle = Readonly<Partial<StylingValues>>;

export interface AccentPreset {
  /**
   * Stable and URL-safe — carried in `?accent=<id>`.
   *
   * ⚠️ **Not persisted.** Unlike `StylePreset.id`, an accent's effect lands in
   * five real colour columns and the token itself is discarded. Renaming one
   * breaks a bookmarked gallery URL and nothing else.
   */
  id: string;
  label: string;
  bundle: AccentBundle;
}

/**
 * The fields an accent may set — the executable form of "an accent sets colour".
 *
 * Three guards in `stylePresets.test.ts` are stated over this list: every accent
 * sets exactly these (both directions), every member is a colour field, and this
 * list is DISJOINT from `PRESET_SCOPED_FIELDS`.
 *
 * ⚠️ Order is `STYLING_FIELD_NAMES`' order, not the palette's reading order, so
 * a test can derive it rather than hand-list it.
 *
 * 🚫 The four body-surface colours (`labelBgColor`, `valueBgColor`,
 * `labelTextColor`, `valueTextColor`) are excluded by merchant decision: a whole
 * column of tinted text reads as a themed widget dropped onto the page.
 */
export const ACCENT_SCOPED_FIELDS = [
  "headerBgColor",
  "headerUnderlineColor",
  "headerTextColor",
  "stripeBgColor",
  // Covers three surfaces no other accent field reaches: the outline (through
  // the stylesheet's `outer-border-color -> border-color` fallback, so the frame
  // costs no second field), the row rules, and the column divider.
  "borderColor",
] as const satisfies readonly StylingFieldName[];

export type AccentScopedField = (typeof ACCENT_SCOPED_FIELDS)[number];

/**
 * The six built-in accents.
 *
 * 🔴 **These hexes are DATA, approved from a 1:1 render study — never derived at
 * runtime.** No hue arithmetic, no `derive(h)` helper. Roles were tuned against
 * measured references, and an `hsl()` derivation would produce merely SIMILAR
 * values while silently discarding that approval.
 *
 * ORDER IS MERCHANT-FACING — the swatch order; `graphite` leads as the least
 * committal choice.
 *
 * ⚠️ **There is no `theme` entry, and one must never be added.** "Theme" is the
 * ABSENCE of an accent: `findAccent(null)` → `null` → `{}` →
 * `DEFAULT_STYLING_VALUES` is already that behaviour. A seventh member with an
 * empty bundle would give the swatch row two code paths for one state. The
 * "Theme" option is a hardcoded first choice in the component — a UI fact.
 *
 * Every accent sets all five scoped fields; a PARTIAL accent would leave one
 * surface neutral grey beside tinted neighbours.
 */
export const ACCENT_PRESETS: readonly AccentPreset[] = Object.freeze([
  {
    id: "graphite",
    label: "Graphite",
    bundle: Object.freeze({
      headerBgColor: "#e6ebf7",
      headerUnderlineColor: "#1c2333",
      headerTextColor: "#1c2333",
      stripeBgColor: "#f3f6fb",
      borderColor: "#c2c9d8",
    }),
  },
  {
    id: "blue",
    label: "Blue",
    bundle: Object.freeze({
      headerBgColor: "#e6effc",
      headerUnderlineColor: "#0a4e9e",
      headerTextColor: "#0a4e9e",
      stripeBgColor: "#f1f6fd",
      borderColor: "#b3cbec",
    }),
  },
  {
    id: "teal",
    label: "Teal",
    bundle: Object.freeze({
      headerBgColor: "#ddf3ee",
      headerUnderlineColor: "#04564a",
      headerTextColor: "#04564a",
      stripeBgColor: "#f4fbf9",
      borderColor: "#a6d3c9",
    }),
  },
  {
    id: "amber",
    label: "Amber",
    bundle: Object.freeze({
      headerBgColor: "#fbeeda",
      headerUnderlineColor: "#5f3f06",
      headerTextColor: "#5f3f06",
      stripeBgColor: "#fef9f1",
      borderColor: "#e5d0a2",
    }),
  },
  {
    id: "terracotta",
    label: "Terracotta",
    bundle: Object.freeze({
      headerBgColor: "#fbe9e4",
      headerUnderlineColor: "#79220d",
      headerTextColor: "#79220d",
      stripeBgColor: "#fdf4f2",
      borderColor: "#e8c2b5",
    }),
  },
  {
    id: "plum",
    label: "Plum",
    bundle: Object.freeze({
      headerBgColor: "#f4e8f8",
      headerUnderlineColor: "#501760",
      headerTextColor: "#501760",
      stripeBgColor: "#f9f3fb",
      borderColor: "#d5bade",
    }),
  },
]);

// `headerUnderlineColor` is the Title hex, not the paler border hex, because an
// underline is a HEADING and must not tone-match the row boundaries around it.
// Measured at 1:1: contrast to white ~1.66 for the row rules against ~14 for the
// underline.
//
// 🚫 They must NOT be set equal to `borderColor`. The stylesheet already falls
// back `header-underline-color -> border-color -> currentColor`, so equal values
// make this field a pure no-op. If a palette revision wants the pale tone here,
// DROP the field from `ACCENT_SCOPED_FIELDS` rather than write the same value
// twice — a guard asserts this.

/**
 * Tolerant lookup for `?accent=<token>`, mirroring `findStylePreset` — an
 * unknown token, a null and an empty string all degrade to `null`, which callers
 * read as "Theme".
 *
 * 🚫 **There is deliberately no `normalizeAccentToken` twin.**
 * `normalizeStylePresetStamp` exists because `basedOnPreset` is a persisted
 * column. An accent has no column — its effect lands in five colour fields
 * `parseStylingValues` already validates — so a second gate would guard nothing.
 */
export function findAccent(id: string | null | undefined): AccentPreset | null {
  if (typeof id !== "string" || id === "") return null;
  return ACCENT_PRESETS.find((accent) => accent.id === id) ?? null;
}
