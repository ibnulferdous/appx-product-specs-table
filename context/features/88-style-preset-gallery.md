# Feature 88 — Style preset gallery (Reshell Phase B2, steps 13–14)

**Status:** 🛠️ **in progress.** Specced 2026-07-27; taxonomy, bundles, route
contract and comparison scope settled by merchant decision. **This file is the
binding design; it is not an implementation plan.** The build is split into four
step files, each with its own build instructions and completion gate:

| Step | File | Scope | Merchant-visible |
| --- | --- | --- | --- |
| 89 ✅ | `89-style-preset-engine-persistence.md` | `basedOnPreset` state + write path | no |
| 90 ✅ | `90-style-preset-card-preview.md` | canned sample + preview card component | no |
| 91 ✅ | `91-style-preset-gallery-route.md` | `/app/templates/choose-style`, six cards | ✅ |
| 92 | `92-style-preset-create-flow.md` | repoint Create buttons, `?style=` seeding | ✅ |

Step 13a of the Phase B plan (the pure domain module `app/utils/stylePresets.ts`)
landed 2026-07-27 in `3714361` and is **not** re-covered by those files.

### 🔴 Merchant decision 2026-07-27: presets are CREATE-TIME ONLY

> "The merchant will only have the option to pick a preset card while he is
> creating a brand new template. Once they selected a preset card and proceed to
> `/app/templates/:id`, there is no way to choose a preset card again."

**A planned fifth step — preset cards in the Style rail, plus the "Customized"
hint — was CUT by this decision.** Everything below that describes an in-rail
picker is superseded; the rail keeps its eight feature-86 tuning groups and
gains nothing.

Three consequences, all simplifications:

1. **No capability is lost.** A pattern is 5 of the 34 rail knobs, so a merchant
   who wants Minimal on an existing template still gets there in three selects.
   Only the *shortcut* is create-time.
2. **"Does a pick overwrite a tuned template?" is moot.** A preset can only land
   on a brand-new scaffold, where all 34 values are already at their defaults —
   so writing 5 fields and writing 34 produce byte-identical results. No merge
   rule, and no confirm dialog, because nothing destructive can happen.
3. **Two of step 89's engine exports are now dead** — `applyStylePreset` (the
   loader seeds server-side; no client picks) and `isCustomizedFromStylePreset`
   (the hint was the rail's). Step 90 removes them. `basedOnPreset` itself stays
   load-bearing: state → snapshot → payload → save.
**Depends on:** nothing unbuilt. Feature 87 (`PLAIN`), feature 85 (`GRID`), features
78–81 (frame, column divider, section gap, header typography) are all shipped and
live-verified — this feature is **composition only**.
**Migration:** **none.** `basedOnPreset String?` already exists
(`schema.prisma:174`), deliberately unwritten since feature 57 Step 4.

---

## The ask

> "In the Kaching bundle app, when we click on 'create bundle deal', it takes us to
> this page. Here we can select a template and the color of the template. Also,
> there are various sample deals from which a merchant can choose and start
> building on top of it. Can we adopt something similar?"

Kaching's *Choose a discount type* screen is a full-page gallery of cards, each a
real rendering of a deal, with a colour-theme swatch row and the line "You can
fully customize it later."

⚠️ **One correction, recorded because it redirected the whole feature.** The first
reading of this ask was **starter content** — an Electronics card landing you on a
table pre-filled with Display / Processor / Battery rows. The merchant rejected it
2026-07-27:

> "We are not going to provide starter templates for common categories. We will
> provide different patterns/types of tables."

That distinction is what makes this feature cheap. Content starters would need
authored spec vocabularies per category — real product work with real downside
risk (a wrong vocabulary is worse than an empty table). **Patterns are styling
only**, and the styling vocabulary is already complete.

---

## The taxonomy

Seven reference tables were supplied. Attribution is honest about its source —
two by visible URL, four by identifiable content, one unattributed:

| # | Reference | Source | Pair layout | Pairs/line | Section headers | Row separation | Frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | startech.com.bd | URL | side-by-side | 1 | banded | lines | none |
| 2 | techlandbd.com | URL | side-by-side | 1 | banded | lines | thin |
| 3 | *(unattributed)* | — | side-by-side | 1 | **none (content)** | lines + column rule | card |
| 4 | audio product, black "SPECS" | content | side-by-side | 1 | plain | none | none |
| 5 | Samsung | content | **stacked** | 3 | plain | none | none |
| 6 | Lazada | logo | **stacked** | 2 | **none (content)** | none | none |
| 7 | Trek | content | side-by-side | 1 | ruled + collapsible | lines | none |

🔴 **A mis-attribution was made and corrected mid-analysis.** #3 was assigned to
techlandbd, reasoning from the site names recorded in the feature-79 notes rather
than from anything the merchant said. The merchant then supplied the real
techlandbd page (#2), which is **banded**, not sectionless. The taxonomy survived;
the tally and one card did not (see "Bordered, withdrawn"). **Method note: a
reference is identified by its URL or by the merchant naming it, never by matching
it to a site mentioned in an older doc.**

### Four axes define a pattern; the other ~30 knobs tune it

| Axis | Values | Field(s) |
| --- | --- | --- |
| **1. Pair layout** | side-by-side · multi-column stacked | `rowLayout` |
| **2. Section headers** | banded · plain · underlined | `sectionHeaderStyle` |
| **3. Row separation** | lines · none | `rowDividerStyle` |
| **4. Frame** | card · none | `outerBorderWidthPx` + `outerBorderRadiusPx` |

Plus one **behavioural** axis, orthogonal to all four because any pattern can be
one: **collapsible** (`sectionsCollapsible` + `sectionGapPx`).

Everything else in `STYLING_FIELD_NAMES` — nine colours, six typography knobs,
density, alignment, widths, padding — is **tuning within a pattern**, not a
pattern.

### Three findings the plot produced

- ✅ **Stacked pairs and multi-track always travel together.** #5 and #6 are the
  only stacked references and both are multi-track; every single-track reference
  is side-by-side. Nobody stacks a label above its value in one full-width column
  — that is only ever a mobile fallback. **Feature 85's decision to weld the two
  into one `ROW_LAYOUTS` member is validated by six independent designs**, not
  only by the plan's reasoning.
- 🚫 **Stripes appear in ZERO of the seven.** The column divider appears in one.
  Both are legitimate knobs; **neither is a pattern**, so no bundle ships either.
  This disposes of the feature-85 "no bundle may ship `GRID` + `STRIPES`"
  requirement for free rather than by a special case.
  ⚠️ startech (#1) *looks* striped at a glance — two rows carry a grey fill — but
  it is not alternating: the tinted rows are the multi-line ones. We have no
  "tint multi-line rows" knob and should not add one; it is a per-row content
  property needing the value's line count at render time.
- **Every colour and type difference across the seven is the site's theme, not the
  table's design.** JBL's condensed display face, startech's indigo headings,
  Lazada's grey labels. A merchant on Horizon gets Horizon's equivalents — which
  is the whole argument for the colour rule below.

---

## The rule: a bundle sets structure, an accent sets colour

**Locked 2026-07-27.** A bundle sets only the four axes (plus collapsible). It
sets **no colour, no typography, no density, no width**.

Four consequences, each of which is why the rule is worth having:

1. **Bundles are 0–3 fields, not 13.** The largest is three.
2. **All nine swatches stay `null` after a pick**, so the zero-config
   theme-inherit promise — the standing regression test since feature 57 Step 1 —
   survives a preset pick completely intact.
3. **Banded needs no hardcoded colour**: the stylesheet's own
   `rgba(0, 0, 0, 0.06)` fallback already paints a sensible band.
4. It is **Kaching's own model** (pattern × colour) and therefore the seam the
   next step needs. See "Step 89".

---

## The five cards

Bundles are **overrides-only wire shapes** — the same shape as `payload.styling`
and the metaobject `styling` field (`serializeStylingOverrides`), so they need no
new serialization path.

| Card | `id` | Bundle | References |
| --- | --- | --- | --- |
| **Modern** | `banded` | `{}` | #1 startech, #2 techlandbd |
| **Classic** | `classic` | `{ sectionHeaderStyle: "PLAIN", rowDividerStyle: "STRIPES", columnDividerStyle: "LINE", outerBorderWidthPx: 1 }` | ACEFAST YF4 |
| **Minimal** | `minimal` | `{ sectionHeaderStyle: "PLAIN", rowDividerStyle: "NONE" }` | #4 |
| **Multi-column** | `multi-column` | `{ rowLayout: "GRID", rowDividerStyle: "NONE" }` | #5 Samsung, #6 Lazada |
| **Accordion** | `accordion` | `{ sectionsCollapsible: true, sectionHeaderStyle: "TEXT_ONLY", sectionGapPx: 12 }` | #7 Trek |

Every card differs from every other on at least one axis a merchant can see at a
glance.

**Card order is the table order above**, and it is merchant-facing. **Modern
leads** — most frequent reference shape (2 of 7, the dominant electronics-retail
look) *and* the app's own default. Then the rest of the side-by-side family
ordered by chrome — Classic (all of it) and Minimal (none), with the default
sitting between them — so the first three cards read as one spectrum; the two
structural departures come last.

### 🔴 Revision, merchant decisions 2026-07-27 (after step 90's first render)

Four changes, made **after looking at the rendered cards**, which is how three of
them were spotted:

1. **"Banded" → "Modern"** — label only. The `id` stays `banded`: it names the
   PATTERN and is a wire format, while the label is merchant-facing branding.
   The two are allowed to diverge and now do.
2. **"Simple" → "Classic", and it became the FULL GRID** — outer border, column
   rule, and stripes instead of hairlines, from a merchant-supplied reference
   (ACEFAST YF4). The `id` DID change (`simple` → `classic`) because `simple` had
   become actively misleading on the most decorated card of the five; safe
   because `basedOnPreset` has never been written outside tests — step 92 has not
   repointed the Create buttons yet. **This is the last moment that rename is
   free.**
3. **Multi-column gets BANDED section headers** — by DROPPING
   `sectionHeaderStyle` from its bundle, so it inherits the default. It matters
   more here than anywhere: a GRID section header spans every track
   (`grid-column: 1 / -1`), so a plain one is a bare line of text floating across
   a wide flow with nothing tying it to the items beneath.
4. Minimal, Accordion and Blank untouched.

⚠️ **Consequence: `PRESET_SCOPED_FIELDS` gained three fields** —
`columnDividerStyle`, `outerBorderWidthPx`, `outerBorderRadiusPx`. This is the
comparison scope catching up with this document's own taxonomy, which has listed
the frame as **pattern axis 4** from the start; no bundle had used it, so the
list had never needed it. The column rule joins for the same reason
`rowDividerStyle` was already there — it is the same kind of thing on the other
axis. What did **not** move, and is still named field-by-field in a test:
typography, density, widths, padding, and `gridMinColumnWidthPx` (feature 85
measured the stylesheet's own 240px shorter than any pinned value).

### Modern is `{}` — the app's default already IS the dominant retail pattern

`BANDED` + `LINES` + no frame is exactly `DEFAULT_STYLING_VALUES`. So this card
and the planned **"Start with your theme's styles"** card would produce
byte-identical output. **They merge as PATTERNS**: five patterns, not six.

This is a genuine simplification, not a coincidence — the app's defaults were
chosen from the same kind of reference tables two phases ago.

### 🔴 …and the sixth card, "Blank" — merchant decision 2026-07-27

> "There will be another one — 'Blank'. It will take you to a clean table like we
> had before preset cards. Blank will use the theme defaults."

The gallery therefore shows **six cards over five patterns**. That is not a
contradiction of the merge finding above, and the distinction is the whole point:

**Blank is not a sixth pattern. It is DECLINING to pick one, made visible as a
card.** It exists because the gallery is unskippable (below), so the old quiet
skip link needed somewhere to go.

✅ **Modelled as the absence of a preset, NOT as a `STYLE_PRESETS` member:**

| | |
| --- | --- |
| in `STYLE_PRESETS` | **no** — the array stays five real patterns |
| `?style=` param | **absent** |
| `basedOnPreset` | **`null`** |
| resolved styling | `DEFAULT_STYLING_VALUES`, via the existing tolerant path |
| domain code needed | **none** — step 89 already handles it |

🚫 **Rejected: a sixth entry with `id: "blank"` and `bundle: {}`.** Its bundle
would be byte-identical to Banded's, so `each pattern differs from every other on
a scoped field` would have to be weakened to exempt it — dismantling the guard
that keeps the gallery's cards genuinely distinguishable, to record a fact `null`
already records.

⚠️ **The stamp gets MORE meaningful, not less.** With no skip path,
`basedOnPreset: null` on a template created after this feature ships means
exactly one thing: the merchant chose Blank. ("We don't know" was only possible
while a skip link existed.) Templates predating the feature are also null, which
is correct — they were never offered a choice.

**Blank's card carries NO preview** (decided 2026-07-27). Every other card shows
a rendered mini-table; Blank's would be pixel-identical to Banded's, and two
identical thumbnails in one grid read as a bug. It renders as text only — a title
and one line — so it reads as a different *kind* of choice, which is what it is.
Owned by step 91.

### `sectionGapPx: 12` is the one tuning value in any bundle

It bends the structure-only rule and is kept deliberately: a Trek-style accordion
needs whitespace between disclosures to read as separate blocks. Recorded as the
single exception so a later reader sees a decision rather than a leak. Strike this
line if the rule is ever wanted absolutely clean.

### Accordion uses `TEXT_ONLY`, not `PLAIN`

The 2px bottom rule gives a clickable header the presence a disclosure needs.
`PLAIN` (feature 87) is right for Minimal and Multi-column, where the header is
not interactive.

### 🚫 "Bordered", withdrawn

A sixth card — `LINES` + column rule + frame — was specced and then withdrawn when
#2 arrived. The two Banded references differ **only** on the frame and column-rule
axes, which is direct evidence those two are *tuning within Banded*, not a look a
merchant would start from. startech-vs-techlandbd is a two-click difference from
the same card.

⚠️ The genuinely distinct thing about #3 was never its frame — it was having **no
section headers at all**. That is the content axis, handled below.

### 🚫 Two gaps found, both now out of scope

| gap | needed by | disposition |
| --- | --- | --- |
| no bare section title | #4, #5 | ✅ **shipped as feature 87** (`PLAIN`) |
| no value font weight | #3 only | 🚫 **dropped** — #3 lost its card, so no bundle needs it. **One migration avoided.** |
| no rule *above* an open section header | #7 Trek | 🚫 **dropped** — widening feature 80's `:not([open])` scope repaints every live banded table to add a hairline. Accordion reads correctly on the bottom rule alone. |

---

## Content shape: cards seed styling only

**Merchant decision 2026-07-27.** Two references (#3, #6) are flat lists with no
section headers, which no styling bundle can produce. Options were to let a bundle
seed a section-less scaffold, or to leave content alone.

✅ **Decided: every card lands on the standard sectioned scaffold**; a merchant who
wants a flat list deletes the section header. Bundles stay purely styling, and the
one place a "pattern" would have reached past styling into rows stays closed.

Verified as expressible before deciding: a template with zero `SECTION_HEADER` rows
renders as a flat table, and `sectionsCollapsible` degrades to the flat shape on
its own (`spec_table.liquid:103–107`). So the flat look is reachable by content,
with no styling support needed.

---

## Route contract (Step 14)

Kaching's gallery is a **route** (`.../app/deal_blocks/templates`), not a modal.
Same call here.

| URL | Renders |
| --- | --- |
| `/app/templates` | list (unchanged) |
| **`/app/templates/choose-style`** | **the gallery — 5 pattern cards + Blank** |
| `/app/templates/new?style=<id>` | editor scaffold, seeded, `basedOnPreset` stamped |
| `/app/templates/new` | editor scaffold, theme defaults, **not stamped** — the Blank landing |
| `/app/templates/:id` | editor (unchanged) |

The two **Create template** buttons (`app.templates.tsx:98` empty state, `:648`
page primary action) repoint from `/new` to `/choose-style`. Nothing else moves.

**The path is `choose-style`, not `styles`** (merchant decision 2026-07-27):
it reads as the step it is. ⚠️ **The route file must be
`app.templates_.choose-style.tsx` — with the underscore.** `app.templates.tsx`
renders its own `<s-page>` and has **no `<Outlet/>`**, so a nested
`app.templates.choose-style.tsx` would match the URL and render nothing at all.
The underscore escapes the parent layout, exactly as the editor route does.

### 🔴 The gallery is UNSKIPPABLE — merchant decision 2026-07-27

> "While you create a new template, it will take you straight to
> `/app/templates/choose-style`. No way to skip this route. If a merchant does not
> like any preset card, we can choose the last one — 'Blank'."

**The skip link is deleted.** Blank does its job as a card, which is why Blank
exists at all. Four consequences:

1. **Duplicate still bypasses the gallery, and should.** A copy inherits its
   source's look and stamp (`duplicateTemplateForShop`), which is the correct
   behaviour for a copy — it is not a hole to close.
2. **Bare `/app/templates/new` stays reachable and stays working** — by typed
   URL, bookmark, or the back button after the create-on-first-save redirect. It
   lands on theme defaults with no stamp, which is byte-identical to what Blank
   produces, so nothing inconsistent can be created. **Deliberately NOT
   redirected to the gallery**: a redirect would fight the back button
   immediately after the create hop.
3. **The gallery still needs a way OUT.** "No skip" means no proceeding without
   choosing; it must not mean the merchant is trapped. A back link to
   `/app/templates` is required, not optional.
4. Doc-88 open question 3 ("does the skip link need to exist at all?") is
   answered by deletion rather than by keeping it.

**Why a route, not a modal**, in order of weight: the five cards carry live
mini-previews and need page width (a Polaris modal would cramp them); the choice
survives reload and the back button, which Step 14 already committed to
("query param survives reload") and a modal cannot deliver; and it matches
Shopify's own full-page *Select discount type* pattern.

**Why the gallery gets a new static path rather than taking over `/new`.**
`/app/templates/new` is the editor's **sentinel mount** — `$id === "new"` in
`app.templates_.$id/route.tsx`, with `useRowEngine` keyed off it
(`useRowEngine.ts:123`). A gallery on that URL would collide two phases on one
route module and force the sentinel to be renamed. A separate static segment costs
one route file and touches nothing else. Static segments outrank dynamic ones in
React Router ranking, so `/styles` can never be read as a template id.

**Zero DB footprint throughout**: the gallery writes nothing, `/new` writes
nothing, the `TableStyling` row appears on first Save. Existing invariant,
unchanged.

---

## The "Customized" hint — a fixed comparison scope

🚫 **THE HINT ITSELF IS CUT** (create-time-only decision, 2026-07-27) — it was a
rail feature and there is no rail picker. `isCustomizedFromPreset` loses its
consumer; step 90 removes the engine wiring and keeps the pure function marked as
having none.

✅ **`PRESET_SCOPED_FIELDS` survives the cut on its own merits**, which is why
this section stays rather than being deleted. Two of the test guards below are
stated in terms of it — "every key any bundle sets is a member of it" and "the
scope contains no colour field" — and together they are the **structure-only rule
made executable**. That value never depended on the hint. Feature 93 also still
appends the accent's colour fields here.

The reasoning below is preserved because it is the record of *why* the constant
is a fixed set rather than derived, and feature 93 will need it if the hint is
ever revived.

⚠️ **This is the one decision in Step 13 that would foreclose accent themes, and
it is not the obvious implementation.**

The Phase B plan says the hint shows when current values ≠ the stamped bundle. The
obvious tool is `stylingEquals` (`tableStyling.ts:605`) — a flat compare over all
34 fields. **Building it that way breaks on contact with accent themes**: the
moment an accent writes `headerBgColor`, every template reads "Customized" the
instant it is created, without the merchant touching anything. The hint dies on
arrival and Step 13 reopens.

✅ **Build instead against a fixed scoped field set:**

```ts
export const PRESET_SCOPED_FIELDS = [
  "rowLayout",
  "sectionHeaderStyle",
  "rowDividerStyle",
  "sectionsCollapsible",
  "sectionGapPx",
] as const satisfies readonly StylingFieldName[];
// Step 89 appends the accent's colour fields here and nothing else changes.
```

🚫 **It cannot be "the keys this bundle sets".** Banded's bundle is `{}`, so that
form compares **zero fields** and a Banded template could never read "Customized"
even after the merchant switched it to `GRID`. A fixed set resolves `{}` against
the defaults and gets it right.

Today this returns the same answers a 34-field compare would, so it costs nothing.
In feature 93 it is the difference between additive and a rewrite.

---

## Feature 93 — accent themes (forward compatibility)

**Merchant decision 2026-07-27:** the colour-theme swatch row is **not** in this
feature, but **is** the next feature, so build for it now.

⚠️ **Renumbered 2026-07-27.** This section said "Step 89" when drafted. Feature 88
is now built as four implementation steps documented in `89`–`92`, so accents move
to **93**. Nothing about the design changed — only the file number.

Six seams to cut in steps 89–92 so feature 93 is purely additive:

1. **Split the vocabulary.** `stylePresets.ts` ships `STYLE_PRESETS` now and gains
   `ACCENT_PRESETS` later — both partial `StylingValues`. **Bundle = structure,
   accent = colour, they compose.**
2. **Seed from a merged overrides object from day one:**
   `parseStylingValues({ ...bundle, ...accent })`, with `accent` always `{}` here.
   One extra spread now; no signature change later.
3. **Card previews render from resolved values, not from a preset id.** The accent
   row must restyle all five cards live with no navigation. Cards keyed on the id
   and rendered server-side would be rework. Preview input is a `StylingValues`;
   the card holds it in client state.
4. **The route contract takes two params** — `?style=<id>&accent=<token>`,
   independently optional, each invalid-or-absent degrading to the same
   "not chosen" state. Nothing to build now beyond not hardcoding a single-param
   parse.
5. **Reserve the gallery header-right slot** (title-left / actions-right), so the
   swatch row drops in without reflowing the page. Kaching puts it there.
6. **`PRESET_SCOPED_FIELDS` is append-only** — see above.

Two things that do **not** change in feature 93: `basedOnPreset` stays the *structure*
id only (an accent needs no provenance column, because its effect lands in real
colour columns the merchant can see and edit in the rail), and the default accent
must be **"Theme", first and pre-selected**, so picking a card still writes zero
colours.

---

## Tests

Guards to build with the constants, all derived from data rather than hand-listed:

- **Every bundle is a fixed point of parse ∘ serialize** —
  `serializeStylingOverrides(parseStylingValues(bundle))` deep-equals `bundle`.
  Catches a typo'd key, a misspelled keyword, or an out-of-range integer being
  silently dropped on the way in. A bundle that fails this ships a card that does
  nothing, with no type error to catch it (bundles are `Record<string, unknown>`
  on the wire by construction).
- **Every key any bundle sets is a member of `PRESET_SCOPED_FIELDS`.** The drift
  guard that keeps the two lists in agreement. Written when it protected the
  "Customized" hint; it outlived the hint because, paired with the colour guard
  below, it is what makes the structure-only rule executable rather than
  remembered.
- **No bundle sets a colour or typography field** — the structure-only rule, pinned
  rather than remembered. Derived by filtering `STYLING_FIELD_NAMES` for the fields
  `parseColor` accepts, so a tenth colour added later is covered automatically.
- **No bundle ships `GRID` + `STRIPES`** (feature 85's explicit requirement). Falls
  out of the rule above but is asserted by name, since that is how it was recorded.
- **Every preset id is unique and stable**, and every card in the gallery renders
  one.
- **`basedOnPreset` is stamped only on an explicit `?style=` pick**, never on the
  skip path.

---

## Verification plan (live)

Follows the house sequence — rail → Postgres → metaobject → rendered storefront —
on a DRAFT template with 0 assigned products, then one ACTIVE template for the
storefront leg.

🚫 **The five in-rail checks that stood here are void** — presets are create-time
only, so there are no rail cards, no live restyle-on-pick, and no "Customized"
hint to verify. Superseded 2026-07-27.

**Steps 90–92 (the gallery and the create flow):**
1. All six cards end to end: each of the five patterns → editor seeded and
   stamped; **Blank → editor at theme defaults, `basedOnPreset` NULL**.
2. Save persists values + `basedOnPreset`; re-read from Postgres — the six saves
   produce five distinct stamps and one NULL.
3. **Reload of `/app/templates/new?style=multi-column` keeps the seed**; a garbage
   `?style=` value degrades to theme defaults with no error and no stamp.
4. Back button from the editor returns to the gallery; the gallery's own back
   link returns to `/app/templates`.
5. No stray templates in the list after abandoning any path (the zero-footprint
   invariant, checked in Postgres, not by eye).
6. **Both** Create entry points reach the gallery — the list's page action and the
   empty state's "Create your first template".
7. Bare `/app/templates/new` (typed) still opens a working unstyled scaffold.
8. Duplicate still bypasses the gallery and carries the source's stamp.

**Storefront leg:** one ACTIVE template saved from **Multi-column**, verified on
the rendered storefront — `--layout-grid` in `styling_css.classes` in
`STYLING_FIELD_NAMES` order, tracks laid out, page overflow 0. Multi-column is the
right card for this leg because it is the only one whose bundle touches markup-
adjacent behaviour.

⚠️ **The stale-Prisma-client trap does not apply** — no migration, so no dev-server
restart is needed before the first save. (It has fired on 78/79/80/81; it needs a
schema change, and there isn't one.)

---

## Deliberately out of scope

- **Accent / colour themes** — feature 93, seams cut above.
- **B3 saved presets** (`StylePreset` model, "Save as preset", shop-level themes) —
  steps 15+, still cuttable to post-MVP without rework.
- **Category starter content** — explicitly rejected 2026-07-27; stays in
  `feature-roadmap.md` → Onboarding Upgrades.
- **`valueFontWeight`** — no card needs it. Addable later as a nullable column.
- **Trek's rule above open section headers** — repaints every live banded table.
- **A "tint multi-line rows" knob** — content, not styling.
- **`extraStyles`** — exists in the schema, stays unwritten. Nothing here needs it.

---

## Invariants respected

- **Copy semantics throughout.** A bundle is copied into real `TableStyling`
  columns; `basedOnPreset` is provenance only and is **never re-read as a live
  link** (`schema.prisma:172–174`, `data-model.md` §5). Changing a bundle constant
  in a future release must not restyle a single existing template.
- **Shop isolation** — `TableStyling` is reached only via a shop-scoped template.
  The gallery reads no shop data at all (bundles are constants), so it adds no new
  read path.
- **Unstyled templates still render byte-equivalently to today.** The skip path
  writes an all-null row; Banded writes an all-null row *and* a `basedOnPreset`
  string.
- **No migration, no metaobject-definition (TOML) change, no Liquid, no CSS.** This
  feature adds no styling capability — it composes shipped ones. Seventh feature
  running that "server precomputes `styling_css`; Liquid only prints" has paid for.
- **The Edit grid still never reflects merchant styling.** Preset cards restyle the
  device previews only. `SpecTableEditor.module.css` / `RowGrid.tsx` stay byte-clean
  against `a7b304c`.

---

## Open questions — all three closed 2026-07-27

1. ✅ **Gallery path name** → **`/app/templates/choose-style`** (merchant
   decision 2026-07-27; an earlier draft of this line recommended `styles` on
   brevity grounds). It reads as the step it is. Owned by step 91.
2. ✅ **Card preview content** → **one generic canned sample reused by all five**
   (2 sections, ~6 rows), rendered through `renderSpecTablePreviewDocument`
   (`specTablePreviewHtml.ts:393`). Zero drift against the storefront is the whole
   reason that pipeline exists; static thumbnails are cheaper and go stale
   silently, which is the failure mode a gallery can least afford. Owned by
   step 90. **Five previews, not six** — Blank's card carries none (above).
   ⚠️ Previews were briefly scoped as gallery-only-vs-rail; **the rail question
   is moot** now that presets are create-time only.
3. ✅ **The skip link is DELETED**, not kept. Superseded by the unskippable-gallery
   decision above: Blank is the card that does that job. An earlier draft of this
   line argued for keeping the link on the grounds that it made `"banded"` mean
   something different from `null` — which is now delivered better, since with no
   skip path `null` means "chose Blank" precisely.

### Two gaps found during the step split (2026-07-27)

Both are resolved in step 89 and recorded here because the design above did not
anticipate them:

- 🔴 **`basedOnPreset` must ride in `editorMetaSnapshot`.** Picking **Banded** on
  an untouched template changes no styling value at all — the bundle is `{}` — so
  a dirty check that watches only `serializeStylingOverrides(styling)` would not
  notice the pick, the SaveBar would not open, and the stamp could never be
  persisted. The Banded-is-`{}` finding reaching a surface nobody checked.
- **Reset clears the stamp.** `resetStyling` returns the 34 values to
  `DEFAULT_STYLING_VALUES`; it must set `basedOnPreset` to `null` in the same
  action, or a reset template keeps claiming a pattern it no longer has and the
  rail shows a selected card for a look that is gone.
