# Feature 93 — Accent themes (the gallery's colour-theme swatch row)

**Status:** 🟡 **SPECCED 2026-07-30, not built.** All six open decisions were
answered by the merchant the same day and are recorded verbatim below.
**This file is the binding design; it is not an implementation plan.** The build
is split into six step files, each with its own instructions and completion gate:

| Step | File                              | Scope                                          | Merchant-visible |
| ---- | --------------------------------- | ---------------------------------------------- | ---------------- |
| 97   | `97-accent-vocabulary.md`         | `ACCENT_PRESETS` pure domain + palette         | no               |
| 98   | `98-accent-render-harness.md`     | 5 × 6 render matrix at 1:1, lock the underline | no               |
| 99   | `99-accent-seed-path.md`          | `&accent=` → resolved styling                  | no               |
| 100  | `100-accent-swatch-row.md`        | the swatch row component                       | no               |
| 101  | `101-accent-gallery-wiring.md`    | gallery state + live restyle + hrefs           | ✅               |
| 102  | `102-accent-live-verification.md` | admin → Postgres → metaobject → storefront     | ✅               |

**Parent feature:** `88-style-preset-gallery.md` §"Feature 93 — accent themes
(forward compatibility)" — read it first. This file does not restate the
taxonomy, the bundles, or the create-time-only decision.
**Depends on:** nothing unbuilt. Feature 88 (all four steps, live-verified) cut
the seams; feature 96 shipped `headerUnderlineColor`, which this feature is the
second consumer of.
**Migration:** **none.** An accent writes five columns that already exist in
`TableStyling`, and it gets no provenance column of its own — see D6.

---

## The ask

> "In caching bundle app, there is a color picker. From there merchants can choose
> colors that match their brand. Can we add something like this? Merchants can
> select a theme color on the 'Choose style' page. When merchants click on a
> color, all the preset cards will reflect that theme color."

This is the other half of the Kaching screen feature 88 adopted. Feature 88 built
the card gallery and deliberately left the swatch row for here, cutting six seams
so this feature would be additive rather than a rewrite.

**Four of those six seams landed in code and are load-bearing today:**

| Seam                                                                       | Where                       |
| -------------------------------------------------------------------------- | --------------------------- |
| `seedStylingFromPreset(presetId, accent = {})` — merge order already fixed | `stylePresets.ts:301`       |
| `resolveGalleryParams(URLSearchParams)` — takes params, not a string       | `stylePresets.ts:346`       |
| Card previews built in the browser from resolved values, not from an id    | `StylePresetCard.tsx:132`   |
| The gallery header-right slot left deliberately empty                      | `choose-style/route.tsx:57` |

The two that did not: the gallery holds **no client state** (it is a pure
function of frozen constants), and `ACCENT_PRESETS` does not exist. Those are
steps 101 and 97.

---

## 🔴 The finding that reshaped the feature

**Tinting one field does not work here, and Kaching's design does not transfer.**

Kaching tints one thing — the band behind a deal's title — and every one of their
cards has that band. Ours do not. A pattern picks a `sectionHeaderStyle`, and
that choice decides which CSS rule paints the header. Measured against
`spec-table.css`, two of the three members **hardcode** the band away:

```css
.appx-spec-table--section-banded .appx-spec-table__section {
  background: var(--appx-spec-header-bg, rgba(0, 0, 0, 0.06));
}
.appx-spec-table--section-plain .appx-spec-table__section {
  background: transparent;
}
.appx-spec-table--section-text-only .appx-spec-table__section {
  background: transparent;
}
```

So an accent writing only `headerBgColor` paints **nothing on three of the five
cards** — Classic and Minimal (both `PLAIN`) and Accordion (`TEXT_ONLY`). A
merchant clicks a colour on a gallery of five cards and three sit still. That is
the feature failing on its own screen, and it is the reason the accent is a
**set** of fields rather than one.

✅ **`headerTextColor` is the field that makes the set total.** None of the three
member rules overrides `color:` — each sets `background` and `border-block-end`
only — so the section title is tintable under every header style. It is the sole
live field on Minimal, which has no band, no rule, no frame and no stripes.

---

## The rule (unchanged from feature 88)

**A bundle sets structure, an accent sets colour, and they compose without
knowing about each other.** The merge order is already law at
`stylePresets.ts:301`: an accent's colours win over a bundle's, and no bundle has
ever set a colour (pinned by `stylePresets.test.ts` — "the comparison scope
contains no color field").

🚫 **`accentFor(preset, token)` is rejected.** An accent that varies by pattern —
tint the band on Modern, the rule on Accordion, the frame on Classic — would work
and would cost exactly the composition promise above. Every later feature that
merges the two would inherit the exception. The set below is chosen so one
pattern-blind accent lands somewhere on every card.

---

## Merchant decisions 2026-07-30

### D1 · Create-time only — the swatch row lives on the gallery and nowhere else

> "The swatch row lives on the gallery and nowhere else, exactly like the cards."

Inherits feature 88's create-time-only decision unchanged. **No Style-rail
control, no rail group, and no "re-apply an accent" path.**

✅ **No capability is lost, and this is why it is cheap:** an accent lands in five
**real colour columns** the merchant can already edit individually in the rail's
feature-86 groups. Nothing is locked away — only the shortcut is create-time.

⚠️ **The consequence, accepted:** a merchant rebranding blue → green edits five
swatches per template by hand. Recorded as a known cost, not an oversight; the
question was put and answered.

### D2 · Headers, frame and stripe — five fields

> "Headers and frame. Section titles, the band behind them, the rule under them,
> and the outer border. Stripe joins the accent as a fifth field."

```ts
headerBgColor; // the band, under BANDED
headerTextColor; // the section title, under all three members
headerUnderlineColor; // the 2px rule, under TEXT_ONLY
borderColor; // the outline, the row rules, the column divider
stripeBgColor; // the alternating fill, under STRIPES
```

🚫 **The table body is NOT tinted.** `labelTextColor` / `valueTextColor` /
`labelBgColor` / `valueBgColor` stay out: a whole column of coloured text reads
as a themed widget dropped onto the page rather than part of the merchant's
storefront, and it would multiply D3's risk from two titles to every row.

### D3 · Tint the section title, mid-tone hues

> "Tint it."

⚠️ **This is the feature's one accepted risk and it must not be lost.** Today
**every text colour in the spec table defaults to `inherit`** — the table borrows
the theme's own text colour, so it is legible on a white theme and a black theme
without the app knowing which it is on. There is **no `prefers-color-scheme` rule
anywhere in `spec-table.css`** (verified 2026-07-30). An accent writes an
_absolute_ hex, which opts one string out of that inheritance.

🚫 **And we cannot warn the merchant.** The binding rule of 2026-07-20 — _no
contrast checking ships_ — holds: the app cannot compute contrast against a theme
colour it never sees. Whichever way this goes, it goes silently.

**Mitigation, not a fix:** the six palette hues below are light-optimized by
design, and the title tones are dark inks. A merchant on a dark theme will get a
dark title on a dark ground. Accepted because the alternative (no title tint)
makes Minimal show nothing at all, which is the defect this feature exists to
avoid. Step 98 measures the actual numbers; step 102 observes it on a real
storefront.

### D4 · Blank ignores the accent

> "Blank ignores the accent."

The Blank card's copy is _"Start with your theme's own styles — nothing added."_
Applying an accent would add five colours and make that sentence false — and the
merchant could not see it coming, because Blank is the one card that renders no
preview. Blank keeps meaning _nothing at all_, exactly as it is modelled
everywhere else (no bundle, no `?style=`, `basedOnPreset` null).

🔴 **D4 is a decision about the CARD'S HREF, not about the parser.** The Blank
card simply never emits an `accent` param; `resolveGalleryParams` stays **total**
and still honours `?accent=` without `?style=`. Making the parser reject that
combination would add a validation branch to buy nothing — the gallery never
generates the URL, so only a hand-typed one reaches it, and a working
theme-coloured blank table is a fine answer to a hand-typed URL.

⚠️ **Consequence:** the swatch row visibly does nothing for one of six cards.
Invisible in practice — Blank shows no preview either way.

### D5 · Six fixed accents, plus Theme

Palette approved 2026-07-30 from a 1:1 render study of the banded + stripes +
outline combination. **Every value below is merchant-approved and must be copied
byte-for-byte** — these are not derived at runtime from a hue.

| Accent     | Band      | Title     | Border    | Stripe    |
| ---------- | --------- | --------- | --------- | --------- |
| Graphite   | `#e6ebf7` | `#1c2333` | `#c2c9d8` | `#f3f6fb` |
| Blue       | `#e6effc` | `#0a4e9e` | `#b3cbec` | `#f1f6fd` |
| Teal       | `#ddf3ee` | `#04564a` | `#a6d3c9` | `#f4fbf9` |
| Amber      | `#fbeeda` | `#5f3f06` | `#e5d0a2` | `#fef9f1` |
| Terracotta | `#fbe9e4` | `#79220d` | `#e8c2b5` | `#fdf4f2` |
| Plum       | `#f4e8f8` | `#501760` | `#d5bade` | `#f9f3fb` |

✅ **"Theme" is first and pre-selected, and writes zero colours** (feature 88,
unchanged). Picking a card still inherits the storefront exactly as it does
today, which is the promise the whole module is arranged to protect.

🚫 **No custom hex field in this feature.** It is the honest answer to "match my
brand" — no fixed palette contains a merchant's exact colour — and it is
deliberately deferred: it multiplies D3's risk (a merchant can pick a hue that
vanishes on their own theme) and nothing is blocked without it, since all ten
swatches remain hand-settable in the rail.

⚠️ **`headerUnderlineColor` has no approved value yet.** It is dead in the
banded + stripes combination the palette was approved from, so the study never
produced a hex for it. It **cannot** simply equal `borderColor` — the stylesheet
already falls back that way, so writing the same value twice is a no-op. Working
assumption: **the Title hex**, on the grounds that the underline belongs to the
header and pairs with the title's weight. 🔴 **Owed to step 98** — that step
renders Accordion under all six accents at 1:1 and locks the value from what is
observed. Do not ship a guess.

### D6 · `borderColor`, not `outerBorderColor` — and interior rules tint too

> "Yes — tint them all."

The outline needs **no dedicated field**: the stylesheet already falls back
through `borderColor`, so a value the accent writes anyway colours the frame.

```css
border: var(--appx-spec-outer-border-width, 0) solid
  var(
    --appx-spec-outer-border-color,
    var(--appx-spec-border-color, rgba(0, 0, 0, 0.1))
  );
```

✅ **Two things this buys.** The dedicated `outerBorderColor` swatch stays free
for a merchant who wants a different frame; and the same fallback logic colours
the Accordion underline, so the chain is consistent rather than special-cased.

⚠️ **`borderColor` reaches four surfaces, and the merchant said tint them all.**
Per feature 95 it dresses the row rules, the column divider, the feature-80
collapsible separator, and the outline whenever `outerBorderColor` is unset. The
palette was approved on a combination with **both** interior rule sets switched
off (`STRIPES` kills the row rules, `BANDED` kills the band's), so the study only
ever showed the outline. **Step 98 is what confirms the other four presets** —
Modern's row rules and Classic's column rule in particular have never been seen
under an accent.

### D7 · Accent colours stay OUT of `PRESET_SCOPED_FIELDS`

🔴 **This reverses a forward-reference stated in three places** —
`stylePresets.ts:60` ("Append-only. Feature 93 appends the accent's color
fields"), doc 88 §"`PRESET_SCOPED_FIELDS` is append-only", and
`stylePresets.test.ts:83` ("so feature 93 has exactly one place to revisit when
accent colors join the scope"). All three are wrong and step 97 corrects them.

**Appending recreates the exact bug the constant was invented to prevent.** Doc
88's own argument:

> the moment an accent writes `headerBgColor`, every template reads "Customized"
> the instant it is created, without the merchant touching anything.

Walk it: a merchant picks Modern + Blue, so the row stores
`headerBgColor: #e6effc`. `isCustomizedFromPreset` compares against
`stylePresetValues(preset)`, which resolves **the bundle alone** — Modern's
bundle is `{}`, so its `headerBgColor` is `null`. Different ⇒ "Customized", on a
template nobody has touched.

**It cannot be repaired by a smarter baseline.** Comparing against bundle **+
accent** requires knowing _which_ accent was picked, and doc 88 rules that out:

> an accent needs no provenance column, because its effect lands in real colour
> columns the merchant can see and edit in the rail

No stored accent ⇒ no baseline ⇒ the colour half of the comparison is not wrong,
it is **undefined**. So the scope stays structure-only, `stylePresets.ts:392`
("Changing a COLOR never makes this true, by construction") is correct as
written, and the existing "the comparison scope contains no color field" guard is
**kept, not deleted**.

⚠️ **What is given up:** the app will never be able to answer "has this table
drifted from its original colours". Nothing today consumes that, and nothing in
B3's saved-preset phase needs it — B3 asks "is this still the shared _preset_",
which is the same structure-only question.

---

## What each preset actually shows under an accent

Derived from the bundles in `stylePresets.ts` against the member rules in
`spec-table.css`. 🔴 **This table is a prediction and step 98 must measure it** —
this project has already read a low-contrast fill off a screenshot and got the
wrong answer once (feature 88, the Classic stripe).

| Preset       | Header      | Dividers  | Frame | Live accent fields                         |
| ------------ | ----------- | --------- | ----- | ------------------------------------------ |
| Modern       | `BANDED`    | `LINES`   | —     | band · title · **row rules**               |
| Classic      | `PLAIN`     | `STRIPES` | 1px   | title · stripe · **column rule + outline** |
| Minimal      | `PLAIN`     | `NONE`    | —     | **title only**                             |
| Multi-column | `BANDED`    | `NONE`    | —     | band · title                               |
| Accordion    | `TEXT_ONLY` | `LINES`   | —     | title · underline · **row rules**          |

⚠️ **Minimal showing title-only is expected, not a defect** — it is precisely why
D3 had to be answered before anything was built. If D3 had gone the other way,
Minimal would show nothing at all.

⚠️ **Accordion inherits `LINES`** — its bundle sets `sectionsCollapsible`,
`sectionHeaderStyle` and `sectionGapPx` but not `rowDividerStyle`, so the default
applies and `borderColor` tints its row rules. Its `sectionGapPx: 12` disables
the feature-80 separator rule (`:not(--section-gap)`), so that surface is **not**
live here.

---

## Cost profile

**No migration. No new field in `STYLING_FIELD_NAMES`. No Liquid, no TOML, no
metaobject-definition change, no new CSS rule.** The seventh feature paid for by
"server precomputes `styling_css`; Liquid only prints" — every field an accent
writes is a nullable colour that already serializes to `vars` and already
renders.

⚠️ **The one measured risk is the gallery's five iframes.** Feature 88 measured
them at 130.4 ms to load all five, 24.7 ms first-to-last, 180 KB of `srcDoc`, and
0.09 ms to build all five documents in JS. An accent click re-memos and
**reloads all five frames**. The JS cost is negligible and the total is ~7× under
the 1 s threshold, so no shared-stylesheet fallback is needed — but _flicker on
every swatch click_ is a distinct question the load measurement does not answer,
and step 101 owes it.

---

## Deliberately out of scope

- **A custom hex accent** — D5. Deferred, not rejected.
- **A Style-rail accent control / re-theming an existing template** — D1.
- **Tinting the table body** (`labelTextColor`, `valueTextColor`, the two body
  backgrounds) — D2.
- **Contrast checking or any legibility warning** — the 2026-07-20 binding rule.
- **Corner radius and `columnDividerStyle` as accent fields** — both are
  structure, and both already take `borderColor` for free where they are live.
- **B3 saved presets** (`StylePreset` model, shop-level themes) — steps 15+ of
  the Phase B plan, still cuttable.

---

## Open questions

1. **`headerUnderlineColor`'s value** — assumption recorded in D5, owed to step 98. The only open item that blocks a shipped constant.
2. **Does an accent read acceptably on a dark storefront theme?** D3 accepts the
   risk with mitigation; step 102 is the first time it is _observed_ rather than
   reasoned about. If it reads badly, the fallback is not a code change but a
   palette revision — the six hexes are data, not logic.
