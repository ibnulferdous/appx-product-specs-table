# Feature 88 — Style preset gallery (Reshell Phase B2, steps 13–14)

**Status:** 📋 **specced 2026-07-27, not built.** Taxonomy, bundles, route contract
and comparison scope are settled by merchant decision; no code written.
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

| Card | Bundle | References |
| --- | --- | --- |
| **Banded** | `{}` | #1 startech, #2 techlandbd |
| **Simple** | `{ sectionHeaderStyle: "PLAIN" }` | — (the safe middle) |
| **Minimal** | `{ sectionHeaderStyle: "PLAIN", rowDividerStyle: "NONE" }` | #4 |
| **Multi-column** | `{ rowLayout: "GRID", sectionHeaderStyle: "PLAIN", rowDividerStyle: "NONE" }` | #5 Samsung, #6 Lazada |
| **Accordion** | `{ sectionsCollapsible: true, sectionHeaderStyle: "TEXT_ONLY", sectionGapPx: 12 }` | #7 Trek |

Every card differs from every other on at least one axis a merchant can see at a
glance. Ordering is by observed frequency: **Banded leads** (2 of 7, and the
dominant electronics-retail shape), Multi-column is next (2 of 7).

### Banded is `{}` — the app's default already IS the dominant retail pattern

`BANDED` + `LINES` + no frame is exactly `DEFAULT_STYLING_VALUES`. So the Banded
card and the planned **"Start with your theme's styles"** card would produce
byte-identical output. **They merge**: five cards, no sixth option. The skip path
is a quiet text link, not a card.

This is a genuine simplification, not a coincidence — the app's defaults were
chosen from the same kind of reference tables two phases ago.

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
| **`/app/templates/styles`** | **the gallery — 5 cards + Skip** |
| `/app/templates/new?style=<id>` | editor scaffold, seeded, `basedOnPreset` stamped |
| `/app/templates/new` | editor scaffold, unstyled, **not stamped** |
| `/app/templates/:id` | editor (unchanged) |

The two **Create template** buttons (`app.templates.tsx:98`, `:648`) repoint from
`/new` to `/styles`. Nothing else moves.

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

⚠️ **This is the one decision in Step 13 that would foreclose Step 89, and it is
not the obvious implementation.**

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
Next step it is the difference between additive and a rewrite.

---

## Step 89 — accent themes (forward compatibility)

**Merchant decision 2026-07-27:** the colour-theme swatch row is **not** in this
feature, but **is** the next step, so build for it now.

Six seams to cut in Step 13/14 so Step 89 is purely additive:

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

Two things that do **not** change in Step 89: `basedOnPreset` stays the *structure*
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
  guard that keeps the two lists in agreement: a bundle setting a field outside
  the comparison scope is invisible to the "Customized" hint forever.
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

**Step 13 (in-rail cards):**
1. Each of the five cards restyles **both device previews** instantly.
2. SaveBar Discard is the undo (no confirm dialog) and returns every one of the
   34 fields to its pre-pick value.
3. Save persists values + `basedOnPreset`; re-read from Postgres.
4. Tweaking one knob after a pick shows **"Customized"**; tweaking a **colour**
   does **not** (the scoped-comparison decision, verified rather than asserted —
   this is the check that would have caught a 34-field compare).
5. Banded reads as Banded, not as "Customized", on a template that was never
   touched.

**Step 14 (gallery route):**
6. Both paths end to end: pick a card → editor seeded; Skip → editor unstyled.
7. **Reload of `/app/templates/new?style=multi-column` keeps the seed**; a garbage
   `?style=` value degrades to unstyled with no error.
8. Back button from the editor returns to the gallery.
9. No stray templates in the list after abandoning either path (the zero-footprint
   invariant, checked in Postgres, not by eye).
10. The dashboard's "Create your first template" entry point also reaches the
    gallery.

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

- **Accent / colour themes** — Step 89, seams cut above.
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

## Open questions

1. **Gallery path name** — `/app/templates/styles` (recommended, shortest) vs
   `/app/templates/choose-style` (reads as a step). Not blocking; one string.
2. **Card preview content.** The cards need canned sample rows — **one generic
   sample reused by all five** (2 sections, ~6 rows), not per-category content.
   Rendering them through `renderSpecTablePreviewDocument`
   (`specTablePreviewHtml.ts:393`) gives zero drift against the storefront at the
   cost of five scaled iframes on one page; static thumbnails are cheaper and can
   go stale. **Recommend the iframes** — the drift guard is the reason the preview
   pipeline exists.
3. **Does the skip link need to exist at all**, given Banded is `{}` and a merchant
   can simply pick it? Keeping it costs one link and distinguishes "chose the
   default look" from "did not choose", which is what makes `basedOnPreset`
   meaningful.
