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
 * 🔴 **Colours never join this list, and feature 93 settled that in writing**
 * (doc `93-style-accent-themes.md` §D7 — this comment previously predicted the
 * opposite). Appending one recreates the exact bug the scope was invented to
 * avoid: an accent writes `headerBgColor`, `stylePresetValues` resolves the
 * BUNDLE ALONE, and every seeded template reads "Customized" the instant it is
 * created. It cannot be repaired by comparing against bundle + accent either,
 * because an accent has no provenance column to say which one was picked — so
 * the colour half of that comparison is not wrong, it is UNDEFINED.
 *
 * The accent vocabulary keeps its own scope, `ACCENT_SCOPED_FIELDS`, and a test
 * asserts the two are disjoint. That is "structure and colour compose" in one
 * line.
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
  bundle: StyleBundle;
}

// 🔴 **`description` was REMOVED 2026-07-31 (merchant decision), not left unused.**
// Each preset carried a hand-written sentence — "A shaded band behind each
// section title." — shown under the label on the gallery card. `presetHighlights`
// below now derives that same information from the bundle, so the two sat one
// line apart saying nearly the same thing in two ink tones ("A bordered grid with
// a line between every row." above "Underlined section headers · Line between
// rows · Line between columns · Outer border"), which cost vertical space on a
// page whose whole problem was six cards being hard to compare.
//
// ⚠️ Deleted rather than kept "in case": a merchant-facing string nothing renders
// is a claim nobody re-reads, and this exact field had already gone stale once —
// Classic's said "a line between every row" through the whole period its bundle
// shipped `STRIPES`, which paints no row lines at all. The derived line cannot do
// that.
//
// 📌 What was genuinely lost, recorded because it is not nothing: Accordion's
// "Shoppers open one section at a time" named WHO the pattern is for, which no
// readout of `sectionsCollapsible` can say. If that voice is wanted back it
// belongs in one place — the page's help line, above all six cards — and NOT as
// a per-preset field, which is what recreates the duplication.
//
// 🚫 The "Blank" card still shows a sentence ("Start with your theme's own
// styles — nothing added."), and that is not an inconsistency: Blank has no
// bundle, so it has no derived line, and the sentence is its only explanation.
// It is a literal in `BlankStyleCard`, where it has always lived.

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
    bundle: Object.freeze({}),
  },
  {
    // The full spec-table grid: outer frame, the label/value column rule, and a
    // rule under every row. Derived from the ACEFAST YF4 reference table
    // supplied 2026-07-27 — the look a merchant means by "a proper specs table",
    // and the only card that turns every separation knob ON at once.
    //
    // It is the reason `PRESET_SCOPED_FIELDS` gained the frame and column-rule
    // fields: before this card, no bundle had ever used pattern axes 3b and 4,
    // so the comparison scope had never needed them.
    //
    // 🔴 **Revised 2026-07-30 (merchant decision): UNDERLINED headers, and row
    // LINES instead of stripes.** It shipped as `PLAIN` + `STRIPES`. Two changes,
    // and the second is the load-bearing one:
    //
    //   · `TEXT_ONLY` — labelled "Underlined" in the rail (feature 87), and the
    //     name is the reason: it drops the band and keeps a 2px rule. In a table
    //     that is already full of horizontal rules, a PLAIN title is just a wider
    //     row; the header's own rule is what makes it read as a heading again.
    //     ⚠️ It was briefly the second card on `TEXT_ONLY` — Accordion moved to
    //     BANDED later the same day, so this is the ONLY card on it, and the only
    //     one `headerUnderlineColor` reaches.
    //
    //   · Rules instead of stripes, because ⚠️ **the two are ALTERNATIVES, not a
    //     stack**: `--dividers-stripes` sets `border-block-end: none` on every
    //     label and value (`spec-table.css`), so the striped build of this card
    //     had no interior horizontal edges at all — a "grid" missing half its
    //     grid. The stripes moved to the Accordion card, where nothing else was
    //     separating the rows.
    //
    // ⚠️ `rowDividerStyle` is therefore ABSENT rather than set to `"LINES"`.
    // LINES is `ROW_DIVIDER_STYLES[0]`, so an explicit write serializes away to
    // nothing and fails the fixed-point guard in `stylePresets.test.ts`. A bundle
    // is overrides-only; inheriting the default IS how it says LINES.
    //
    // No `outerBorderRadiusPx`: square corners. The reference reads as very
    // slightly rounded, but a radius is a taste knob a merchant can add in one
    // click, and a curved frame is not what makes this pattern legible.
    id: "classic",
    label: "Classic",
    bundle: Object.freeze({
      sectionHeaderStyle: "TEXT_ONLY",
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
    bundle: Object.freeze({
      rowLayout: "GRID",
      rowDividerStyle: "NONE",
    }),
  },
  {
    // Trek.
    //
    // 🔴 **Revised 2026-07-30 (merchant decision): BANDED headers.** It shipped
    // `TEXT_ONLY`, on the reasoning that a 2px rule gives a CLICKABLE header the
    // presence a disclosure needs. A band gives it more: a filled strip reads as
    // a pressable target where a rule reads as a boundary, and the whole summary
    // row — not just the text — is the hit area a shopper aims at. The
    // stylesheet already carries the collapsible variant this needs
    // (`--collapsible.--section-banded .__section-summary`, `spec-table.css`),
    // so the band survives the disclosure shape instead of being a flat-table
    // look bolted onto it.
    //
    // ⚠️ `sectionHeaderStyle` is therefore ABSENT rather than set to `"BANDED"`,
    // exactly as Multi-column's is and for the same mechanical reason: BANDED is
    // `SECTION_HEADER_STYLES[0]`, so an explicit write serializes away to nothing
    // and fails the fixed-point guard in `stylePresets.test.ts`. A bundle is
    // overrides-only; inheriting the default IS how it says BANDED.
    //
    // 📌 Knock-on, no code: `TEXT_ONLY` is now Classic's alone, so
    // `headerUnderlineColor` is live on exactly one card and `headerBgColor`
    // gains this one. Feature 93's reach table follows the resolved bundle, so it
    // needed no change beyond describing the new cards — doc 93 §reach.
    //
    // ⚠️ `sectionGapPx` is the one tuning value in any bundle and knowingly
    // bends the structure-only rule — a stack of disclosures needs whitespace
    // to read as separate blocks rather than one list. Recorded as a decision,
    // not a leak; strike it if the rule is ever wanted absolutely clean.
    //
    // 📌 **`STRIPES` added 2026-07-30 (merchant decision), the same one that took
    // them off Classic.** They belong here rather than there: inside a disclosure
    // the alternating fill is a within-section reading aid, and the storefront
    // restarts the parity at every `<tbody>` for exactly that reason
    // (`spec-table.css` — locked Step 9a), so a closed section never leaves a
    // stale checkerboard behind it. The stand-down `--dividers-stripes` performs
    // (row rules off) costs this card nothing, since a stack of separated
    // disclosures was never relying on interior rules to group anything.
    //
    // ✅ Not the GRID + STRIPES combination the stylesheet refuses to paint —
    // this card leaves `rowLayout` at its default, and a test asserts it.
    id: "accordion",
    label: "Accordion",
    bundle: Object.freeze({
      sectionsCollapsible: true,
      sectionGapPx: 12,
      rowDividerStyle: "STRIPES",
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
 * Resolve a preset plus an accent to the full working shape the engine holds.
 *
 * **The merge order is the law both vocabularies compose through** (feature 93):
 * an accent's colors win over a bundle's. It was built one feature early, as a
 * seam, because retrofitting a second overrides source through the rail, the
 * route, and the seed would have touched every one of them — and step 99
 * collected on that: `resolveGalleryParams` gained the accent in ONE line with no
 * call-site change anywhere.
 *
 * 🔬 **The order is guarded by a test that FABRICATES a collision, and it has to
 * be.** `PRESET_SCOPED_FIELDS` and `ACCENT_SCOPED_FIELDS` are asserted disjoint,
 * so no real bundle and real accent have ever overlapped on a field — swapping
 * the two spreads is a no-op on all 30 shipping combinations. A precedence law
 * cannot be tested with data that never collides, so
 * `lets an accent overlay win over the bundle` passes a SYNTHETIC accent carrying
 * `sectionHeaderStyle` — a structure field no real accent may set — purely to
 * create the overlap. Verified by mutation (step 99): reversing the spread fails
 * that test and nothing else. Do not "clean it up" to use a real accent; that
 * would delete the only coverage this line has.
 *
 * A null/unknown preset resolves to `DEFAULT_STYLING_VALUES` — the theme-inherit
 * state — so the "Blank" card and an invalid param share one code path with the
 * "picked Banded" path. They differ only in whether `basedOnPreset` is stamped.
 */
export function seedStylingFromPreset(
  presetId: string | null | undefined,
  // `AccentBundle`, not `StyleBundle`, because `accent` is what every caller
  // passes. ⚠️ Documentation, NOT enforcement — the two are structurally
  // identical aliases and TypeScript is structural, so a bundle still passes here
  // with no error. See the note on `AccentBundle` itself.
  accent: AccentBundle = {},
): StylingValues {
  const preset = findStylePreset(presetId);
  return parseStylingValues({ ...(preset?.bundle ?? {}), ...accent });
}

/** The full working shape a preset's bundle resolves to, defaults filled in. */
export function stylePresetValues(preset: StylePreset): StylingValues {
  return parseStylingValues(preset.bundle);
}

// --- What makes this pattern different ----------------------------------------
//
// 🔴 **The gallery's previews cannot show three of the five patterns apart, and
// the arithmetic says so.** `--appx-preset-scale` is 0.55, so Classic's
// `columnDividerStyle: "LINE"` and `outerBorderWidthPx: 1` render at **0.55px** —
// two of that card's three differentiating features are sub-pixel. Modern,
// Classic and Minimal are the same two-column shape differing only in hairlines
// and a section-title treatment; Multi-column and Accordion differ structurally
// and read fine. So the cards a merchant most needs help telling apart are
// exactly the ones the thumbnail cannot help with.
//
// ⚠️ And the scale cannot be raised to fix it. `--appx-preset-render-width` must
// stay above the storefront stylesheet's 749px mobile breakpoint (below it every
// card renders in its identical phone form), and two cards plus a 16px gap must
// fit the measured 966px `inlineSize="base"` page — which caps two-up at
// `(966 - 16) / 2 / 749` ≈ **0.63**. A 13% bump does not make a 1px rule visible.
// The difference has to be carried in WORDS, which is what this function is.
//
// It is also the only form of it a screen-reader user can perceive at all: the
// preview is `aria-hidden` (step 90, and rightly — five fake tables read aloud is
// worse than nothing), so before this line the entire basis for choosing was one
// prose sentence per card.

/**
 * Merchant-facing words for each pair layout, or `null` where there is nothing
 * to say — `TWO_COLUMN` is the shape a merchant already pictures when they hear
 * "spec table", so naming it would spend a chip on the absence of news.
 *
 * ⚠️ A `Record` over the union rather than an `if` chain, here and below, so
 * appending a member to `ROW_LAYOUTS` is a COMPILE error instead of a card that
 * silently stops describing its own layout.
 */
const ROW_LAYOUT_HIGHLIGHTS: Record<StylingValues["rowLayout"], string | null> =
  {
    TWO_COLUMN: null,
    STACKED: "Label above each value",
    // GRID welds "several tracks" and "label above value" into one member (feature
    // 85 — a pair cannot be two-column AND grid), so one phrase names both halves
    // rather than splitting a single decision across two chips.
    GRID: "Several columns, label above each value",
  };

/** Merchant-facing words for each section-header treatment. */
const SECTION_HEADER_HIGHLIGHTS: Record<
  StylingValues["sectionHeaderStyle"],
  string
> = {
  BANDED: "Shaded section headers",
  // "Underlined", not "Text only" — the rail renamed this member for merchants
  // (feature 87) because the wire value describes what it DROPS while the label
  // has to describe what a merchant sees. Same reasoning applies here.
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
 * 🔴 **Derived from the RESOLVED values, never hand-written per preset, and that
 * is the whole point.** A hand-written list is a second description of the same
 * bundle with nothing keeping the two in agreement — exactly the failure mode
 * step 90 rejected a static thumbnail for. The 2026-07-30 polish pass is the
 * proof it is not hypothetical: Classic moved `PLAIN` + `STRIPES` →
 * `TEXT_ONLY` + LINES, and a hardcoded line would still be promising stripes and
 * a plain title today, with nothing failing.
 *
 * ⚠️ **Reads the bundle alone (`stylePresetValues`), NOT the accent-merged
 * shape.** Safe by construction rather than by luck: `PRESET_SCOPED_FIELDS` and
 * `ACCENT_SCOPED_FIELDS` are asserted disjoint, so no accent can change any value
 * read below. Threading the accent through here would make the line vary with a
 * colour choice while saying nothing about colour.
 *
 * --- Which axes speak, and when ----------------------------------------------
 *
 * Header treatment and row separation are emitted for EVERY preset — they are the
 * two axes every pattern has an answer to, they carry the most visual weight, and
 * a shared vocabulary is what makes five cards comparable instead of five
 * unrelated pitches. The rest speak only when they depart from the default,
 * because "No column line · No outer border" on four of five cards is noise that
 * buries the one card where the frame is the point.
 *
 * 🚫 `sectionGapPx` is deliberately silent. It is the one tuning value in any
 * bundle (Accordion's, a knowing exception to the structure-only rule) and
 * "12px between sections" is not a reason anybody picks a card.
 *
 * Structure leads, decoration follows: a merchant sorting six cards needs
 * "several columns" before "shaded headers".
 */
export function presetHighlights(preset: StylePreset): readonly string[] {
  const values = stylePresetValues(preset);
  const highlights: string[] = [];

  // The two structural departures, first because they are the largest
  // differences in the gallery and the ones a merchant can decide on alone.
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

  // Spoken only when set, and they are the two the preview renders sub-pixel —
  // this line is the ONLY place a merchant learns Classic has them.
  if (values.columnDividerStyle === "LINE") {
    highlights.push("Line between columns");
  }
  if ((values.outerBorderWidthPx ?? 0) > 0) {
    highlights.push("Outer border");
  }

  return highlights;
}

/**
 * Read the gallery's choice off a URL's query string (feature 88 step 92).
 *
 * The `/app/templates/new` loader's whole share of the create flow: the gallery
 * links each card at `?style=<id>`, and this turns that param into the two
 * things a brand-new scaffold needs — the resolved styling to open with, and the
 * provenance stamp to save.
 *
 * 🔴 **ONE lookup, BOTH outputs, and that is the point.** The failure this step
 * exists to prevent is a template seeded from one bundle and stamped with a
 * different one (or with nothing) — a lie that no later code recomputes, because
 * `basedOnPreset` is provenance and is never re-read as a live link. Calling
 * `seedStylingFromPreset(raw)` beside `normalizeStylePresetStamp(raw)` at the
 * call site would agree today only because both happen to be tolerant in the
 * same way, which is a property an edit can break silently. Deriving both from a
 * single `findStylePreset` makes disagreement unrepresentable rather than
 * merely tested.
 *
 * Every invalid `style` degrades to the same place: an absent param, `""`, an
 * unknown id, a wrong-cased id, a withdrawn card's id and a 10KB string all
 * produce `DEFAULT_STYLING_VALUES` + a `null` stamp — byte-identical to the
 * "Blank" card's landing, and to bare `/app/templates/new`. **No throw, no 404,
 * no redirect, no toast**: the param is not merchant-authored (it comes from a
 * card), so a bad one means a stale bookmark or an id dropped in a later
 * release, and the right answer to both is a working blank scaffold. Every
 * invalid `accent` degrades the same way, to no colours at all.
 *
 * ✅ Takes `URLSearchParams`, not a `string`, because feature 93's route contract
 * is `?style=<id>&accent=<token>` with the two independently optional — and step
 * 99 collected on it: the accent read below is ONE line inside this function and
 * **no call site changed**, not the editor loader and not its contract test.
 * Parsing the URL itself stays the loader's job so this module stays
 * framework-free and client-safe.
 *
 * 🔴 **A `null` stamp no longer implies default styling** (feature 93 step 99).
 * `?accent=blue` with no `?style=` resolves to five real colours with a `null`
 * `basedOnPreset`, so "unstamped" and "untouched" have come apart. That is doc 93
 * §D4 working as decided — Blank ignores the accent by never EMITTING the param,
 * which is a fact about the card's href; this function stays TOTAL and honours a
 * hand-typed one. Rejecting the combination would add a validation branch to buy
 * nothing, since the gallery never generates that URL. The step-92 guard that
 * relied on the old shortcut is restated in two halves, one per scope, rather
 * than relaxed — see `stylePresets.test.ts`.
 */
export function resolveGalleryParams(params: URLSearchParams): {
  styling: StylingValues;
  basedOnPreset: string | null;
} {
  const preset = findStylePreset(params.get("style"));
  const accent = findAccent(params.get("accent"));
  return {
    // Routed through `seedStylingFromPreset` rather than `parseStylingValues`
    // directly, because that function is where the bundle/accent merge ORDER
    // lives. Bypassing it would mean retrofitting the merge in two places.
    //
    // ⚠️ `accent?.bundle` is `undefined` on a miss ON PURPOSE — it lands on that
    // function's `= {}` default. `?? {}` here would duplicate a default the
    // signature already owns, giving two places to keep in agreement about what
    // "no accent" means.
    styling: seedStylingFromPreset(preset?.id, accent?.bundle),
    // The PATTERN only. An accent gets no provenance column (doc 93 §D7), so
    // there is nothing here for it to carry — and this must not start varying
    // with the accent, or a column read back as a closed vocabulary across
    // releases would fill with values no `findStylePreset` recognizes.
    basedOnPreset: preset?.id ?? null,
  };
}

/**
 * The gallery's link into creation — `resolveGalleryParams`' INVERSE (feature 93 ·
 * step 101).
 *
 * 🔴 **It lives here, beside the decoder, on purpose.** Encoder and decoder of one
 * wire format belong in one file, where a reader edits both or neither. Built as a
 * pure function rather than inline in the card for the same reason step 100
 * extracted `nextRovingIndex`: it makes the wire testable without a browser — and
 * here it buys something better than coverage, because one test can COMPOSE the two
 * and prove they agree about every preset × accent pair:
 *
 * ```ts
 * resolveGalleryParams(new URL(galleryHref(p, a), "https://x").searchParams);
 * ```
 *
 * Neither half can drift without the other failing. A card that built its href by
 * string concatenation would be checkable only by clicking it.
 *
 * ⚠️ Both params are independently optional and `null` means absent, so
 * `galleryHref(null, null)` is the bare `/app/templates/new` the "Blank" card uses —
 * byte-identical, no trailing `?`. That is what lets Blank's href stay a literal
 * while every other card goes through here (doc 93 §D4: Blank ignores the accent by
 * never EMITTING the param).
 *
 * 🔬 Truthiness IS the right test for these two, unlike the `next === null` check in
 * `AccentSwatchRow`. The only falsy string is `""`, and an empty id genuinely means
 * "absent" — where there the falsy value was the integer `0`, a perfectly valid
 * index. Same-looking check, opposite verdict, decided by what the type can hold.
 *
 * 🔴 **Takes ONE NAMED OBJECT, not two positional strings, and a mutation is why.**
 * The first version was `galleryHref(presetId, accentId)` — two params of identical
 * type, which is precisely the shape that invites a transposition TypeScript cannot
 * catch. Step 101 mutated the CALL SITE to `galleryHref(accent, preset)` and **all
 * 119 tests passed**, while every merchant would have been sent to
 * `?style=blue&accent=classic`: neither id resolves in the other's lookup, so the
 * gallery would silently create a blank, unstamped, uncoloured template from every
 * card. Total feature failure, green suite.
 *
 * The round-trip test below does not cover it — it composes this function with the
 * decoder, so it proves the FORMAT agrees while saying nothing about what a caller
 * passes. Hence a shape change rather than another assertion here.
 *
 * ⚠️ **This is not compiler-enforced and must not be read as if it were.** Both
 * fields are `string | null`, so `{ preset: accent.id, accent: preset.id }` still
 * typechecks — verified. What the named keys buy is that the mistake can no longer
 * be made by ACCIDENT: a transposition has to be spelled out with the wrong key
 * beside the wrong value, which reads as wrong. The call site is additionally pinned
 * textually by `StylePresetCardContract.test.ts`, because the failure mode is total
 * (every card creating a blank, unstamped, uncoloured template) and defence in depth
 * is cheap at one call site.
 */
export function galleryHref(choice: {
  preset: string | null;
  accent: string | null;
}): string {
  // `URLSearchParams` does the percent-encoding, so there is no hand-rolled
  // `encodeURIComponent` pair to keep in agreement with the decoder — which reads
  // the params back through the same class.
  const params = new URLSearchParams();
  if (choice.preset) params.set("style", choice.preset);
  if (choice.accent) params.set("accent", choice.accent);

  const query = params.toString();
  return query === "" ? "/app/templates/new" : `/app/templates/new?${query}`;
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

// --- Accents (feature 93 · step 97) -------------------------------------------
//
// The colour half of the vocabulary. Binding design:
// `context/features/93-style-accent-themes.md`; this step's spec is
// `97-accent-vocabulary.md`.
//
// **A bundle sets structure, an accent sets colour, they compose.** The merge
// order lives in `seedStylingFromPreset` and predates this section by design.
//
// --- Why an accent is FIVE fields and not one --------------------------------
//
// Kaching tints one thing, the band behind a title, and every one of their cards
// has that band. Ours do not. A pattern picks a `sectionHeaderStyle`, and two of
// the three members HARDCODE the band away (`spec-table.css` — `--section-plain`
// and `--section-text-only` both set `background: transparent`). So an accent
// writing only `headerBgColor` paints NOTHING on three of the five cards —
// Classic, Minimal and Accordion — and a merchant clicking a colour watches
// three of five sit still.
//
// `headerTextColor` is what makes the set total: none of the three member rules
// overrides `color:`, so the title is tintable under every header style. It is
// the ONLY live field on Minimal, which has no band, no rule, no frame and no
// stripes.
//
// 🚫 An accent that varies by pattern — `accentFor(preset, token)` — was
// rejected (doc 93). It would work, and it would cost the composition promise
// above, which every later merge of the two would then inherit as an exception.

/**
 * An overrides-only wire shape, structurally identical to `StyleBundle`.
 *
 * ⚠️ **Deliberately a separate type name, for READERS — it enforces nothing.**
 * The two vocabularies obey different laws (a bundle may set a subset and must
 * set no colour; an accent must set all five colours and no structure), and the
 * name is what the exact-set test is stated about.
 *
 * 🔴 **Step 97's comment here claimed more than that and was wrong**: it said a
 * shared alias "would let a bundle pass as the `accent` argument to
 * `seedStylingFromPreset` with no type error", implying two names prevent it.
 * They do not. TypeScript is structural, both aliases are
 * `Readonly<Partial<StylingValues>>`, so they are MUTUALLY ASSIGNABLE and a
 * `StyleBundle` passes as an `accent` with no diagnostic (checked under
 * `tsc --strict`, step 99 — the first non-test caller of the two-argument form).
 * The guard at that seam is the test suite, not the type checker. Only a branded
 * type would close it, and it is not worth a cast at every literal.
 */
export type AccentBundle = Readonly<Partial<StylingValues>>;

export interface AccentPreset {
  /**
   * Stable and URL-safe — carried in `?accent=<id>`.
   *
   * ⚠️ **Not persisted anywhere.** Unlike `StylePreset.id`, which is written to
   * `TableStyling.basedOnPreset` and is therefore a wire format, an accent's
   * effect lands in five real colour columns and the token itself is discarded.
   * Renaming one breaks a bookmarked gallery URL and nothing else.
   */
  id: string;
  label: string;
  bundle: AccentBundle;
}

/**
 * The fields an accent is allowed to set — the executable form of "an accent
 * sets colour".
 *
 * Three guards in `stylePresets.test.ts` are stated in terms of this list: every
 * accent sets EXACTLY these (both directions), every member is a colour field
 * per the parser probe, and this list is DISJOINT from
 * `PRESET_SCOPED_FIELDS`. Together they are the composition rule, and the third
 * is what fails if anyone ever acts on the prediction §D7 corrected.
 *
 * ⚠️ Order is `STYLING_FIELD_NAMES`' order, not the palette's
 * band/title/border/stripe reading order. The palette table in doc 93 is
 * merchant-facing; this is a comparison scope, and matching the domain's own
 * order is what lets a test derive it rather than hand-list it.
 *
 * 🚫 The four body-surface colours (`labelBgColor`, `valueBgColor`,
 * `labelTextColor`, `valueTextColor`) are excluded by merchant decision
 * (doc 93 §D2): a whole column of tinted text reads as a themed widget dropped
 * onto the page rather than part of the merchant's storefront.
 */
export const ACCENT_SCOPED_FIELDS = [
  "headerBgColor",
  "headerUnderlineColor",
  "headerTextColor",
  "stripeBgColor",
  // Earns its place by covering three surfaces no other accent field reaches:
  // the outline (through the stylesheet's own
  // `outer-border-color -> border-color` fallback, so the frame costs no second
  // field), the row rules, and the column divider. Merchant decision 2026-07-30,
  // asked explicitly and answered "tint them all".
  "borderColor",
] as const satisfies readonly StylingFieldName[];

export type AccentScopedField = (typeof ACCENT_SCOPED_FIELDS)[number];

/**
 * The six built-in accents.
 *
 * 🔴 **These twenty-four hexes are DATA, approved by the merchant 2026-07-30
 * from a 1:1 render study — never derived at runtime.** No hue arithmetic, no
 * shared lightness constant, no `derive(h)` helper. Two of the roles were tuned
 * against measured references (Blue's stripe `#f1f6fd` against a real storefront's
 * `#f1f8ff`), and an `hsl()` derivation would produce merely SIMILAR values while
 * silently discarding that approval. A revision is a merchant decision with a
 * date, not a refactor.
 *
 * ORDER IS MERCHANT-FACING — it is the swatch order. `graphite` leads because it
 * is the near-neutral one, the closest of the six to "no accent at all", so the
 * row reads outward from the least committal choice.
 *
 * ⚠️ **There is no `theme` entry, and one must never be added.** "Theme" is the
 * ABSENCE of an accent, exactly as the gallery's Blank card is the absence of a
 * preset: `findAccent(null)` -> `null` -> `{}` -> `DEFAULT_STYLING_VALUES` is
 * already that behaviour, reached through the same path every invalid input
 * takes. A seventh member with an empty bundle would add a second way to express
 * one state and give the swatch row two code paths to keep in agreement. The
 * "Theme" option is rendered as a hardcoded first choice in the component — a UI
 * fact, not a data one.
 *
 * Every accent sets all five scoped fields. A PARTIAL accent is a defect the
 * gallery cannot afford: it would leave one surface neutral grey beside tinted
 * neighbours, and per doc 93's reach table that inconsistency is invisible on
 * four of the five cards and shows only on the one preset where that surface is
 * live.
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

// ✅ **`headerUnderlineColor` = the Title hex, CONFIRMED by measurement**
// (feature 93 · step 98, 2026-07-30). It shipped in step 97 as a provisional
// placeholder, because the palette study rendered banded headers with striped
// rows — where a header has no rule at all — and so never produced a value for
// this field.
//
// It is the Title hex and not the paler border hex because the underline is a
// HEADING, and a heading must not tone-match the row boundaries around it.
// Measured on the Accordion card at 1:1: the underline computes `1.81818px` at
// the title tone while the row rules in the same table sit at the border tone —
// contrast to white 1.66 for the rules against roughly 14 for the underline, so
// the header reads as a header and not as one more row boundary. Falling back to
// the border hex would have made those two tones identical, which is the one
// outcome the member was chosen to avoid.
//
// ⚠️ **That measurement is HISTORICAL as to its card.** It was taken when
// Accordion was `TEXT_ONLY`; Accordion moved to BANDED on 2026-07-30 and the only
// card carrying an underline now is **Classic**. The finding is unchanged — it is
// about two tones in one table, and Classic ships row LINES at the border tone
// under the same underline — but do not go looking for a rule on the Accordion
// card to re-check it against.
//
// 🚫 They must still NOT be set equal to `borderColor`. The stylesheet already
// falls back `header-underline-color -> border-color -> currentColor`
// (`spec-table.css:205`), and `borderColor` is in the accent, so equal values
// make this field a pure no-op. If a future palette revision wants the pale tone
// here, the correct change is to DROP the field from `ACCENT_SCOPED_FIELDS`, not
// to write the same value twice — a guard asserts this.

/**
 * Tolerant lookup for the `?accent=<token>` param.
 *
 * Mirrors `findStylePreset` exactly — never throws, never guesses; an unknown
 * token, a `null`, an empty string and a non-string all degrade to `null`, which
 * callers read as "Theme", the same state as never having picked one.
 *
 * 🚫 **There is deliberately no `normalizeAccentToken` twin.**
 * `normalizeStylePresetStamp` exists because `basedOnPreset` is a PERSISTED
 * column that has to stay a closed vocabulary across releases. An accent has no
 * column — its effect lands in five colour fields `parseStylingValues` already
 * validates — so a second gate would guard nothing.
 */
export function findAccent(id: string | null | undefined): AccentPreset | null {
  if (typeof id !== "string" || id === "") return null;
  return ACCENT_PRESETS.find((accent) => accent.id === id) ?? null;
}
