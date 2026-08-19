# Feature 81 — Section header typography & spacing (Style tab)

**Status:** ✅ **shipped & fully live-verified 2026-07-26** — rail → Save → Postgres →
metaobject → rendered Horizon storefront, plus a 16-case CSS harness and a genuine ≤749px
reflow. Full gate green, tests 914 → 943.
**Reported:** 2026-07-26, merchant sent five competitor spec tables (Best Buy,
Amazon, Trek, AppleGadgets, a fifth blue-band sample) and asked which of their
section-header treatments this app can reproduce.
**Depends on:** feature 57 Step 8 (section header styles) + Step 9a (collapsible
sections) + Step 10 (the nullable "inherit" vocabulary). Nothing new.
**Migration:** `add_section_header_typography_styling` (5 additive columns).
**Numbering:** this takes **81**, so Reshell Phase B2 starts at **82**.

> **Why this lands before B2.** B2 bakes the knob set into `stylePresets.ts`
> constants. Every knob added afterwards means editing all five bundles. More to
> the point, these five screenshots *are* presets — the lavender-band look, the
> indigo-title look — so shipping these knobs first is what lets B2 encode the
> reference designs as real named presets rather than approximations. The
> tracker already owes the bundles feature 78's five fields plus 79's divider and
> 80's gap; this keeps it to one debt instead of two.

---

## The ask

> "I have attached a few samples of specification tables. Look at their section
> header — background color, font size, weight, border radius etc."

Decomposing the five references against what ships today:

| trait | Best Buy | Amazon | Trek | AppleGadgets | 5th sample | have it? |
| --- | --- | --- | --- | --- | --- | --- |
| band background | none | grey | none | lavender | blue-grey | ✅ `headerBgColor` |
| banded vs text-only | text | banded | text | banded | banded | ✅ `sectionHeaderStyle` |
| header text color | dark | dark | dark | dark | **indigo** | ❌ |
| header text size | **larger** | body | body | body | body | ❌ |
| header weight | bold | bold | bold | bold | bold | ❌ (700 literal) |
| header uppercase | no | no | no | no | no | ❌ |
| band height / padding | roomy | tight | roomy | tight | tight | ❌ |
| zebra rows | ✅ | — | — | — | — | ✅ `STRIPES` |
| hairline rows | — | ✅ | ✅ | ✅ | ✅ | ✅ `LINES` |

The five ❌ rows are this feature. Band **radius** and the **chevron/animation**
asks from the same report are deliberately separate units (see "Deliberately out
of scope") — this one is the pure knob-adding slice.

## Why it is the cheapest possible unit

All five fields are **nullable**, so by the locked Step 2 organizing rule
(`tableStylingCss.ts`: nullable → CSS custom property, non-null knob → modifier
class) every one of them travels as a var. That means:

- **no new modifier class, and no presence flag** — the first styling unit since
  Step 10 with neither. Nothing in `stylingToModifierClasses` changes.
- **no markup change** in either hand-mirrored renderer.
- **no Liquid change and no extension TOML change** — the fourth feature in a row
  the "server precomputes `styling_css`; Liquid only prints" pipe pays for.
- **no hide predicate.** All five apply to both the flat and the collapsible
  shape, so the count stays at **6** (`showsMobileLayoutControl`,
  `showsSectionsInitialStateControl`, `showsCustomFontSizeInput`,
  `showsLabelWidthControl`, `showsTableAlignControl`, `showsSectionGapControl`).
- **no repaint.** Every fallback is the literal that ships today, so an untouched
  table renders byte-identically.

---

## Vocabulary — 5 new `TableStyling` columns

All nullable; `null` = **inherit the current literal**, which is the colors /
typography vocabulary (Step 10), *not* the container knobs' "null = off"
(feature 78). Nothing here has an "off" state to collide with.

| field | type | null means | CSS var |
| --- | --- | --- | --- |
| `headerTextColor` | `String?` hex | inherit the theme's text color | `--appx-spec-header-color` |
| `headerFontSizePx` | `Int?` 10–184 | the size the title already renders at | `--appx-spec-header-font-size` |
| `headerFontWeight` | `String?` keyword | the literal `700` | `--appx-spec-header-font-weight` |
| `headerCase` | `String?` keyword | as typed | `--appx-spec-header-transform` |
| `headerPaddingBlockPx` | `Int?` 0–48 | the literal `0.75rem` | `--appx-spec-header-padding-block` |

### The `header*` prefix is not a new convention — it is the existing one

`headerBgColor` already means "the section header band" throughout the schema and
the rail ("Section header background"). The table has no `<thead>`, so `header`
is unambiguous here. Five new fields on the same prefix keep the schema
self-grouping, and `headerTextColor` pairs with `headerBgColor` by name.

Var names follow the same shape as the label knobs
(`--appx-spec-label-color` / `--appx-spec-label-transform`), so the mapping
reads as one family.

### Reuse the existing keyword domains, do not mint new ones

- `headerFontWeight` reuses **`STYLING_FONT_WEIGHTS`** (`REGULAR`/`MEDIUM`/`BOLD`)
  and **`FONT_WEIGHT_SCALE`**.
- `headerCase` reuses **`LABEL_CASES`** (`DEFAULT`/`UPPERCASE`) and
  **`LABEL_CASE_TRANSFORMS`**.
- `headerFontSizePx` reuses **`FONT_SIZE_PX_MIN`/`MAX`** (10–184). The floor is
  the same accessibility guard; the ceiling was already matched to the Horizon
  theme editor's own maximum, and a merchant should be no more constrained
  sizing a section title than sizing body text.

Three shared scales instead of three parallel copies that can drift apart. Only
`headerPaddingBlockPx` needs its own bounds constant pair.

---

## Three decisions worth the ink

### 1. `headerFontSizePx` is absolute px, NOT a theme-relative keyword scale

This looks like it contradicts the Step 1 typography lock ("S/M/L multiply the
theme's base font, so they survive a theme switch; only Custom is absolute").
It does not, and the reason is structural rather than aesthetic.

**Verified in the markup, 2026-07-26:** the collapsible shape is
`<details><summary>…</summary><table class="appx-spec-table__table">…</table></details>`
(`specTablePreviewHtml.ts:255`). The summary is a **sibling** of the table, not a
descendant. And `--appx-spec-font-size` is declared on `.appx-spec-table__table`
(`spec-table.css:141`), deliberately — "typography vars sit on the table, not the
wrapper, so em-based sizes multiply the theme's base font exactly once."

So an `em` multiplier on a section title would resolve against **two different
bases depending on the shape**: the table's computed size in the flat shape (a
`<th>` inside the table), and the theme's ambient size in the collapsible shape
(a `<summary>` outside it). Same knob, same value, two different rendered sizes,
switching silently when a merchant toggles Collapsible. A px number resolves
identically in both. That is decisive; taste does not enter into it.

Consequence: the control is a plain bounded-integer box (the `tableMaxWidthPx` /
`labelWidthPct` idiom, clearing it = back to default), **not** the five-option
tri-state the table's `fontSize` uses. No `Custom` mode, no remembered-px UI
memory, no fifth hide predicate.

> Free bonus: the disclosure marker is `list-style-position: inside`, so it sits
> in the text flow and scales with the title's font size. Sizing the header sizes
> its triangle to match, with no extra rule.

### 2. `headerPaddingBlockPx` is BLOCK-only; the inline padding stays `0.75rem`

The literal today is the shorthand `padding: 0.75rem` — all four sides, in both
shapes. Row cells use `padding: 0.5rem 0.75rem`, so the section title and the
label column line up on the inline axis at exactly `0.75rem`.

A knob over all four sides breaks that alignment the moment it is used: at 24px
the title indents 24px while every label below it indents 12px, and the table
reads as broken. What the references actually vary is **band height** (Amazon
tight, Trek roomy) — the block axis. So the knob owns the block axis and the
inline axis stays welded to the row cells' `0.75rem`.

Written as **longhands, not a shorthand with a var in it**:

```css
padding-block: var(--appx-spec-header-padding-block, 0.75rem);
padding-inline: 0.75rem;
```

`padding: var(--x, 0.75rem) 0.75rem` would work, but a shorthand containing a var
is invalid-at-computed-value-time if the var is ever malformed — and IACVT
resolves the **whole shorthand** to its initial value, i.e. zero padding on all
four sides. The var can only ever be a validated `Npx` today, so this is defense
in depth rather than a live hazard; longhands make the failure mode impossible
instead of unlikely, and they match the logical-property vocabulary the file
already uses everywhere else.

### 3. `0` is a legitimate stored value for the padding — the min-1 law does not apply

Feature 78 locked "every integer minimum is 1, never 0 — a 0 would be a second
spelling of the same off state". That law is about knobs where **null already
means off** (no outline, square corners, no gap): there, 0 and null render
identically, so storing 0 writes a bogus override and trips a presence flag that
paints nothing.

Here null means **`0.75rem`**, not off. `0` and null are genuinely different
renders, so 0 is a first spelling, not a second. It is also safe downstream:
nothing keys a presence flag on this field, and `var(--x, 0.75rem)` needs no
class to gate it.

⚠️ **This is the one decision in this doc that needs merchant sign-off**, and it
is logged as an open question rather than assumed. A `0` floor makes the empty
box ("default 12px") and a typed `0` ("no padding") two states a merchant has to
tell apart from help text alone. A floor of `1` would cost the ability to set a
title tight against its rows — plausible for **Text only** headers, useless for
**Banded** ones. Ship 0–48 only if the merchant wants the tight case; otherwise
1–48 and the box behaves exactly like Maximum width.

---

## The rules

Every var is added to **two** selectors — the flat shape and the collapsible
shape — because the two are separate rule blocks in the same file. Both fallbacks
are the literal that ships today.

```css
/* Flat: the section header <th colspan=2>. */
.appx-spec-table__section {
  padding-block: var(--appx-spec-header-padding-block, 0.75rem);
  padding-inline: 0.75rem;
  text-align: left;
  font-size: var(--appx-spec-header-font-size, inherit);
  font-weight: var(--appx-spec-header-font-weight, 700);
  text-transform: var(--appx-spec-header-transform, none);
  color: var(--appx-spec-header-color, inherit);
  background: var(--appx-spec-header-bg, transparent);
  border-block-end: 2px solid var(--appx-spec-border-color, currentColor);
}

/* Collapsible: the <summary>. Same five additions, same fallbacks. */
.appx-spec-table--collapsible .appx-spec-table__section-summary {
  /* …existing list-style / cursor declarations unchanged… */
  padding-block: var(--appx-spec-header-padding-block, 0.75rem);
  padding-inline: 0.75rem;
  font-size: var(--appx-spec-header-font-size, inherit);
  font-weight: var(--appx-spec-header-font-weight, 700);
  text-transform: var(--appx-spec-header-transform, none);
  color: var(--appx-spec-header-color, inherit);
  /* …background / border-block-end unchanged… */
}
```

The `--section-banded` / `--section-text-only` variants of both selectors
override **only** `background` and `border-block-end`. They do not touch any of
the five new properties, so the two knob families compose without a specificity
contest — no source-order hazard of the feature-79 kind.

---

## The controls

**Four go in the Sections group** (`StyleTab.tsx`), inserted directly after
"Section headers" and **before** the Collapsible toggle, so the group reads
appearance-then-behavior:

| control | shape | help text (null → set) |
| --- | --- | --- |
| Section title size | `s-number-field` suffix `px`, blank = default | "Matches the table's text size." → "An exact size in pixels (10–184)." |
| Section title weight | select, `Inherit` first | "Use the standard bold section title." |
| Section title case | select, `Inherit` first | "Titles appear as you wrote them." |
| Section header padding | `s-number-field` suffix `px`, blank = default | "Standard space above and below a title." |

Both selects use the existing `withInheritOption` helper. Both number boxes use
`toBoundedIntControlValue` / `fromBoundedIntControlValue` — the **blank-box**
idiom, deliberately not the zero-means-off idiom, because for these two `0` is
either invalid (a 0px font) or a distinct real value (0 padding), never a
spelling of "default".

**`headerTextColor` goes in the Colors group, and its position is forced.**
`stylingControls.test.ts:337` pins `COLOR_KNOBS` field order to
`STYLING_FIELD_NAMES` order, derived by filtering for fields
`parseStylingValues` accepts a hex for. So the field **must** be inserted in
`STYLING_FIELD_NAMES` inside the color block — immediately after `headerBgColor`
— and `COLOR_KNOBS` gains a matching entry in the same position, or that test
fails. Label "Section header text", `alpha: false` (a text color; the two
existing text swatches are opaque-only by the 2026-07-19 lock, and translucent
title text is a contrast bug rather than a design choice).

This split — colour in Colors, the other four in Sections — is the same one
Step 10a already imposed on `headerBgColor`, so it is consistent with the rail a
merchant already knows rather than a new inconsistency.

---

## Interaction checklist (verify each; none expected to need code)

| interaction | expectation |
| --- | --- |
| `--section-banded` / `--section-text-only` | compose cleanly — those rules own `background` + `border-block-end` only |
| feature 80 separator (`border-block-start`) | untouched; a third property on a fourth side |
| `sectionGapPx` | orthogonal — margin outside the box, padding inside it |
| `--outer-radius` + `overflow: hidden` | a taller band still clips to the frame; unchanged |
| `--column-divider-line` | stops at every band already (the band is `th[colspan=2]`); unaffected |
| `--density-*` | owns **row-cell** padding only — verified, no overlap with the band |
| `--dividers-stripes` | stripe parity is per section; band height does not enter it |
| `labelCase` UPPERCASE | label column only — `headerCase` is the section's own knob, they do not interact |
| `fontSize` (table) | see the latent divergence below — this feature does not change it |
| `--layout-stacked` / mobile ≤749px | the band is full-width in every shape; all five apply unchanged |
| RTL | `padding-block` / `padding-inline` are logical; correct for free |
| blank section header (feature 74 R1) | skipped before any band is emitted; nothing to style |
| Edit grid | unchanged — the binding rule holds, tripwired files untouched |

### ⚠️ Latent divergence found while specing this — NOT fixed here

`--appx-spec-font-size`, `--appx-spec-font-style` and `--appx-spec-line-height`
are declared on `.appx-spec-table__table` (`spec-table.css:141–143`). In the flat
shape the section header is a `<th>` **inside** that table and inherits all
three. In the collapsible shape the `<summary>` is a **sibling** of the table and
inherits **none** of them.

So today: a merchant who sets Text size = Large sees flat section titles grow and
collapsible section titles stay put. Pre-existing, shipped since Step 9a, and
**out of scope here** — closing it means adding the typography vars to the
summary rule, which changes the live rendering of every collapsible table that
already has a non-null `fontSize`. That is a no-repaint-law decision of its own,
not a rider on this one. Logged under Open Questions in the tracker.

This feature is unaffected either way: `headerFontSizePx` is absolute px on the
summary's own rule, so it lands identically in both shapes (decision 1 above).

## What must NOT change

- **No Liquid change, no extension TOML change.**
- **No modifier class, no presence flag, no hide predicate.** If the build wants
  one of these, something in the plan is wrong — stop and re-read decision 1.
- **No `!important`, anywhere.**
- `SpecTableEditor.module.css` / `RowGrid.tsx` stay byte-clean against `a7b304c`.
- `previewStyles.ts` is a **verbatim mirror** of `spec-table.css` — every CSS edit
  must be copied across or the byte-exact drift guard in
  `specTableCssContract.test.ts` fails. That guard is the point; do not relax it.

## Build order

Each step ends green on the full gate (typecheck · lint · format · test · build).

1. **Domain** — `tableStyling.ts`: `HEADER_PADDING_BLOCK_PX_MIN/MAX`; the five
   fields in `StylingValues`; `STYLING_FIELD_NAMES` (`headerTextColor` inside the
   colour block right after `headerBgColor`, the other four after
   `sectionHeaderStyle`); `DEFAULT_STYLING_VALUES` all `null`;
   `parseStylingValues` via `parseColor` / `parseBoundedInt` /
   `parseNullableKeyword`.
2. **Mapping** — `tableStylingCss.ts`: five `SPEC_TABLE_CSS_VARS` entries;
   `headerTextColor` into the `colorFields` loop; `headerFontSizePx` +
   `headerPaddingBlockPx` into the `pxFields` loop; two keyword emissions reusing
   `FONT_WEIGHT_SCALE` / `LABEL_CASE_TRANSFORMS`. `stylingToModifierClasses`
   **untouched**.
3. **CSS** — the two rule blocks above in `spec-table.css`, `previewStyles.ts`
   mirror regenerated, contract tests updated.
4. **Persistence** — `prisma/schema.prisma` five columns + migration
   `add_section_header_typography_styling`; `template.server.ts` column types +
   five `stylingToDbColumns` lines.
5. **Rail** — `stylingControls.ts`: `HEADER_FONT_WEIGHT_OPTIONS` /
   `HEADER_CASE_OPTIONS` via `withInheritOption`,
   `fromHeaderFontSizeControlValue` / `fromHeaderPaddingBlockControlValue` via
   `fromBoundedIntControlValue`, `COLOR_KNOBS` entry; `StyleTab.tsx` four
   controls in the Sections group.

> ⚠️ **Restart `shopify app dev` after step 4.** Vite HMR reloads app code but not
> `@prisma/client` (require cache), so the first save after a migration fails
> silently against a stale client — feature 78's trap, hit again in 79 and 80.
> Tell it apart from a real bug by running the upsert from a fresh `node -e`: if
> that writes, the server is just stale.

> ⚠️ **`s-number-field` commits on blur, not per keystroke** (feature 80
> correction 2). Typing a value leaves the help text and the SaveBar untouched
> until focus leaves the field. Both new px boxes will do this. Not a bug.

## Tests to add

| file | assertions |
| --- | --- |
| `tableStyling.test.ts` | all five default `null`; hex whitelist on `headerTextColor`; clamps on both integers; non-integer / NaN / string → null; keyword membership; omitted from overrides when null; round-trip law |
| `tableStylingCss.test.ts` | each var emitted iff non-null, with `px` suffix on the two integers and the shared scales on the two keywords; **`stylingToModifierClasses` output unchanged** for every combination — the "no new class" claim, pinned |
| `stylingControls.test.ts` | `COLOR_KNOBS` order still equals the derived list (existing test, will fail until the field is placed correctly); `alpha: false` on the new swatch; blank → null and `""`/junk handling on both boxes; **no new entry in `VISIBILITY_PREDICATES`** |
| `specTableCssContract.test.ts` | all five vars present in **both** the flat and the collapsible rule with the literal fallbacks (`0.75rem`, `700`, `none`, `inherit`); `padding-inline: 0.75rem` still literal in both; previewStyles drift (existing, automatic) |
| `templateSync.test.ts` | the all-fields fixture gains the five keys as `null` |

Expect roughly **914 → ~940**.

> Test-authoring trap inherited from features 79/80: anchor selector assertions on
> `selector + " {"`, not the bare selector — several selectors appear twice in the
> file, once inside a grouped list.

## Live verification plan

Same shape as 78/79/80 — an isolated CSS harness **first**, so the storefront
pass is a confirmation rather than an exploration.

1. Migration is non-repainting: count `TableStyling` rows with any of the five
   non-null — must be **0**.
2. Harness against the real `spec-table.css`: all five knobs, in both the flat
   and the collapsible shape, plus an all-null control case measured
   byte-identical to today.
3. Rail: four controls in the Sections group, swatch in Colors, help text in the
   null state.
4. Round trip on the ACTIVE DJI template: rail → Save → five Postgres columns →
   metaobject (`styling` overrides-only, `styling_css.vars` carrying five
   declarations, **`classes` unchanged** — the "no new class" claim, measured) →
   rendered Horizon storefront.
5. Reproduce sample 5 end to end (lavender band + indigo bold title) as the
   acceptance case, and Best Buy's larger text-only title as the second.
6. Mobile ≤749px in the editor's **Mobile device preview** — ⚠️ `resize_window`
   does not reflow the viewport (feature 79), the device preview is what gives a
   genuine narrow render.
7. Edit grid unchanged; tripwired files byte-clean against `a7b304c`.

## Open decisions — SETTLED 2026-07-26

- ✅ **`headerPaddingBlockPx` floor = 0** (merchant's call). Decision 3 shipped as
  written: 0 is a real stored value, the box distinguishes empty from 0, and the
  help text carries the difference ("Space above and below a title. 0 removes
  it.").
- ✅ **No `LIGHTER` weight.** Shipped the existing `STYLING_FONT_WEIGHTS`.

## Build log (2026-07-26)

Built in the planned five-step order; every step ended green. **Tests 914 → 943**
(the estimate was ~940). Full gate — typecheck · lint · format · test · build —
green. Migration `20260726054441_add_section_header_typography_styling`, five
additive nullable columns, **measured non-repainting: 6 `TableStyling` rows, 0
with any of the five non-null.**

### The plan held — no design corrections

Nothing in the three decisions needed revising, and the two claims most at risk
were both confirmed by measurement rather than argument:

- **No modifier class, no presence flag, no hide predicate.** Pinned by three
  separate tests now (`tableStylingCss.test.ts`, `specTableCssContract.test.ts`,
  and a `VISIBILITY_PREDICATES` length assertion), so the "cheapest possible
  unit" claim is enforced rather than merely stated.
- **No repaint.** The harness renders the all-null control at `12px` padding /
  `16px` / `700` / `none` — byte-identical to the pre-feature literals.

### Four things worth knowing next time

1. ⚠️ **A backtick in a `spec-table.css` comment breaks the build, and the file
   says so.** The header warns the file is mirrored verbatim into a TS template
   literal, so comments must avoid backticks — and the first comment written for
   this feature used them for `padding: A B`. The mirror regeneration refused
   before writing anything. Cheap to fix, invisible if it had slipped into a
   hand-edited mirror instead. Prose in that file uses plain words for CSS
   syntax.
2. **Eight pre-existing totality guards fired on the first test run**, all
   "all-fields fixture" tests across five files. That is the designed behaviour
   — each one is a list that must not silently go stale — and updating them is
   how a new knob announces itself. Budget for it; it is not breakage.
3. **`COLOR_FIELDS` in `tableStyling.test.ts` had already drifted**: it was
   missing `outerBorderColor` (feature 78), so that swatch's hex parsing and
   injection-rejection were never swept. Adding `headerTextColor` made the gap
   visible; both are in the list now.
4. ⚠️ **The stale-Prisma-client trap struck for the FOURTH consecutive feature**
   (78, 79, 80, 81). Symptom this time was the sharpest yet: Save left the
   contextual SaveBar reading "Unsaved changes" and wrote **nothing** — no toast,
   no console error. The doc's own discriminator settled it in one command: a
   fresh `node -e` reads and writes the new columns fine, so the running server
   is merely holding a pre-migration client. Restarting `shopify app dev` is not
   optional after a migration.
   Related: `prisma generate` reported `EPERM … query_engine-windows.dll.node`,
   but **the TypeScript types and client JS were still rewritten** — only the
   engine binary rename failed, and the engine is version-, not schema-specific.
   So typecheck and build pass on a "failed" generate. Do not assume otherwise
   and do not re-run it in a loop.

### Live verification — complete

| step | result |
| --- | --- |
| migration non-repainting | ✅ 6 rows, **0** with any feature-81 value |
| isolated CSS harness, 16 cases, both shapes | ✅ all correct (see below) |
| rail renders, four controls in Sections, spec order | ✅ |
| null-state help text on all four | ✅ |
| `headerTextColor` swatch position in Colors | ✅ directly after Section header background, forced by the derived-order test |
| help text flips on commit | ✅ both px boxes |
| SaveBar arms on change | ✅ |
| live preview updates | ✅ titles resize, bands grow, marker scales with the title |
| Save → Postgres | ✅ `headerFontSizePx=22`, `headerCase="UPPERCASE"`, `headerPaddingBlockPx=18` |
| → metaobject | ✅ see below — **`.classes` unchanged**, three new `vars` |
| → rendered Horizon storefront | ✅ all 9 sections measured |
| mobile ≤749px, genuine reflow | ✅ see below |

**Harness measurements** (real `spec-table.css`, computed styles, Chrome). The
flat `th` and the collapsible `<summary>` returned **identical values in every
case**, which is the whole point of duplicating the declarations into two rule
blocks:

| case | measured |
| --- | --- |
| control, both shapes | `12px` block + `12px` inline, `16px`, `700`, `none`, banded `rgba(0,0,0,0.06)` — the pre-feature literals |
| title size 24 | `24px` both shapes; the disclosure marker scales with it |
| weight REGULAR | `400` both shapes |
| uppercase | `uppercase` both shapes |
| indigo title | `rgb(67, 56, 202)` both shapes |
| padding 20 | block `20px`, **inline still `12px`** — the block-only decision, measured |
| padding **0** | block `0px`, **inline still `12px`** — the 0-floor case, and the var is emitted as `0px` rather than omitted |
| acceptance: sample 5 | lavender `rgb(238,242,255)` band + indigo `700` 17px title, `10px` block padding |
| acceptance: Best Buy | text-only, transparent band, `22px` title, `18px` padding, its own `1.81818px` bottom rule intact |

> Harness caveat: its `.shopify-app-block` wrapper models feature 77's centring
> one level too shallow, so the tables render shrink-to-fit. Irrelevant here —
> the computed section-header styles are unaffected by table width — but do not
> read the harness as evidence about feature 77.

### The wire — "no new class", measured

Metaobject `template-cmrqedsff0001vpjs4hdjmyz8` (type
`app--378906640385--appx_spec_table`, Admin GraphQL 2025-10), after saving three
of the five knobs:

```
styling  (overrides-only — headerFontWeight and headerTextColor ABSENT, being null)
{ "headerFontSizePx": 22, "headerCase": "UPPERCASE", "headerPaddingBlockPx": 18,
  "sectionsCollapsible": true, "sectionsInitialState": "FIRST_OPEN",
  "sectionGapPx": 25, "columnDividerStyle": "LINE", "density": "SPACIOUS" }

styling_css.classes   ← IDENTICAL to before this feature. Nine classes, no tenth.
  …--layout-two-column …--mobile-stacked …--section-banded …--collapsible
  …--dividers-lines …--column-divider-line …--density-spacious …--align-left
  …--section-gap

styling_css.vars
  --appx-spec-header-font-size: 22px; --appx-spec-header-padding-block: 18px;
  --appx-spec-section-gap: 25px; --appx-spec-header-transform: uppercase;
```

That unchanged `classes` string is the whole design claim, checked on the wire
rather than only in a unit test: five knobs reached a live storefront and the
modifier-class surface did not move.

### Rendered storefront (Horizon, DJI Fly More Combo, 9 sections)

Every summary measured `font-size: 22px`, `font-weight: 700`, `text-transform:
uppercase`, `padding-block: 18px`, **`padding-inline: 12px`**.

Three things that assertion proves at once:

- **The fallback works.** `headerFontWeight` is null, and the weight computes to
  `700` — the literal the rule falls back to, not a var.
- **The block-only decision holds in production.** Padding-block moved to 18,
  padding-inline stayed at the 12px literal, so the titles still line up with
  the label column.
- **Features 79/80 are undisturbed.** `margin-block-start` is `0px` on the first
  section and `25px` on the other eight; every `border-block-start` is `0px`
  (the feature-80 separator correctly standing down under a gap).

And the interaction claim, measured rather than argued: a sample row label reads
`text-transform: none` / `font-size: 14px` while the section title above it is
uppercase at 22px — `headerCase` and `headerFontSizePx` touch section titles
only, never the label column.

### Mobile ≤749px

⚠️ The editor's Mobile toggle would not accept synthetic clicks this session, so
the reflow was measured in the harness instead at `innerWidth: 502` — a real
narrow viewport, with `labelDisplay: block` proving the `--mobile-stacked`
@media rule actually fired. **All five knobs render identically to desktop**
(control `12px`, pad-0 `0px` block with inline still `12px`, sample 5 indigo
17px, collapsible 24px). Expected: the stacked rules touch
`.appx-spec-table__label` / `__value`, never the section-header selectors, so
there is no @media variant for any of these five to disagree with.

### What the DJI template is left saved with

**Section title size 22 · Section title case Uppercase · Section header padding
18** (on top of its pre-existing Banded + collapsible + gap 25 + column divider
Line + Spacious). Revert = clear the two px boxes and set the case back to
Inherit. `headerFontWeight` and `headerTextColor` were deliberately left null —
both are covered by the harness and unit tests, and leaving them unset is what
made the "absent from the wire when null" check above meaningful.

## Deliberately out of scope

- **Section band `border-radius`** — the merchant's "border radius" ask. Its own
  unit (proposed **82**): a radius on a `th` under `border-collapse: collapse`
  behaves differently from one on a `<summary>`, and a radiused band with no
  `sectionGapPx` shows the page through its bottom corners. Real decisions, not a
  rider here.
- **Chevron position / custom icon** (proposed **83**) — moving the marker to the
  right means abandoning `list-style-type` for a pseudo-element, and the comment
  at `spec-table.css:218` records that themes shipping `summary { list-style:
  none }` (Horizon does) already broke this affordance once on the live store.
  Needs its own live theme-collision check. Carries the free win: a
  `transform: rotate()` + `transition` on the marker gives a smooth chevron
  animation in every browser.
- **Animated open/close height** (proposed **84**) — needs
  `interpolate-size: allow-keywords` + `::details-content` +
  `transition-behavior: allow-discrete`, which is Chrome 131+ / Safari 18.4+ /
  Firefox 139+. Progressive enhancement only (older browsers keep today's snap)
  and must be guarded by `prefers-reduced-motion: reduce`. 🚫 The JS alternative
  (animating `grid-template-rows`) would break the zero-JS `<details>` invariant
  locked in Step 9a — not on the table.
- **Per-row ⓘ info icons** (Best Buy, sample 5) — that is *content*, not styling:
  it needs a new per-row help-text field in the row JSON. Belongs with the Phase
  C display rules, not the Style tab.
- **A separate section-header border color.** The band reads
  `--appx-spec-border-color` by construction, exactly as features 79 and 80 do.
  Splittable later if asked.
- **Fixing the collapsible-shape typography divergence.** See the ⚠️ above — its
  own no-repaint decision.

## Docs to update when this ships

- `context/progress-tracker.md` — Completed entry; **Next Up: B2 starts at 82**;
  the collapsible typography divergence added under Open Questions.
- `context/data-model.md` §5 (`TableStyling` columns) + §10 (styling delivery).
- **B2 preset bundles**: these five join feature 78's five, 79's divider and 80's
  gap. `headerTextColor` + `headerFontWeight` are what make the reference looks
  reproducible as named built-in presets rather than approximations.
