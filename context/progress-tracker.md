# Progress Tracker

Update this file after every meaningful implementation change.

> **Forward-looking status doc, kept compact.** Per-step detail (verification logs,
> file lists, decisions) lives in `context/features/NN-*.md` and git history — link
> there, don't re-narrate. Each completed item is one line + its feature-doc pointer.

---

## Current Phase

Building the MVP.

> ✅ **COMPLETE 2026-07-27 — feature 88 (style preset gallery).** The design is
> `context/features/88-style-preset-gallery.md`; the build ran as four step
> files, each with its own instructions and completion gate.
>
> | Step | File                                    | Scope                                     | Status                                                    |
> | ---- | --------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
> | 13a  | —                                       | pure domain (`app/utils/stylePresets.ts`) | ✅ `3714361`, 1021 → 1044 tests                           |
> | 89   | `89-style-preset-engine-persistence.md` | `basedOnPreset` state + write path        | ✅ **2026-07-27**, 1044 → **1055**                        |
> | 90   | `90-style-preset-card-preview.md`       | canned sample + preview card              | ✅ **2026-07-27**, 1055 → **1072**                        |
> | 91   | `91-style-preset-gallery-route.md`      | `/app/templates/choose-style`, six cards  | ✅ **2026-07-27**, 1072 → **1085**, live 10/10            |
> | 92   | `92-style-preset-create-flow.md`        | repoint Create buttons, `?style=` seeding | ✅ **2026-07-27**, 1085 → **1097**, live 8/9 + storefront |
>
> **What shipped:** Create template → an unskippable gallery of six cards → a
> scaffold already styled like the card and stamped with which card it was,
> through to `styling_css` on the rendered storefront. Six saved rows in the dev
> store carry five distinct `basedOnPreset` values and one NULL, **with no colour
> column written by any card** — the zero-config theme-inherit promise survived a
> preset pick on real data.
>
> ⚠️ **Dev-store baseline moved: 6 → 13 templates.** Seven "Untitled template"
> DRAFT rows from step 92's live pass were left in place deliberately (the
> evidence is re-readable); the one that was set ACTIVE was reverted to DRAFT, so
> the storefront is unchanged.
>
> 🔴 **A test file directly in `app/routes/` is a ROUTE** and breaks
> `npm run build` while leaving the whole suite green (step 92 finding 1).
> `app/routes.ts` now passes `ignoredRouteFiles: ["**/*.test.{ts,tsx}"]`.
>
> 🔴 **Merchant decisions 2026-07-27 — presets are CREATE-TIME ONLY.** A planned
> in-rail preset picker (+ the "Customized" hint) was **cut**: a merchant picks a
> pattern only while creating a template, and the Style rail keeps its eight
> feature-86 groups and gains nothing. No capability is lost — a pattern is 5 of
> the 34 rail knobs. Three more decisions the same day: the gallery lives at
> **`/app/templates/choose-style`** and is **unskippable** (both Create buttons go
> straight there, the Skip link is deleted); a **sixth "Blank" card** replaces it,
> modelled as the ABSENCE of a preset (`basedOnPreset` stays NULL, no
> `STYLE_PRESETS` entry, no preview — its output is pixel-identical to Banded's);
> and card order stays Banded · Simple · Minimal · Multi-column · Accordion ·
> Blank. Step 90 removes the two engine exports these cuts orphaned.
>
> **Step 89 landed 2026-07-27.** A preset id now travels merchant → engine →
> dirty snapshot → Save payload → action → Postgres → loader → engine, normalized
> at both ends by `normalizeStylePresetStamp` (an unknown id or a non-string
> stores NULL). `resetStyling` clears the stamp, `setStylingField` deliberately
> does not. **No control writes it yet**, so a merchant sees no change — live
> verification is owed by the gallery steps and listed in the step-89 file. No
> migration (the column has existed since feature 57 Step 4), so the
> stale-Prisma-client trap does not apply.
>
> **Step 90 landed 2026-07-27.** Two things, and no page to put them on:
> `sampleRows.ts` (the one canned table every card previews — 2 section headers +
> 7 data rows, static ids) and `StylePresetCard.tsx` (`StylePresetCard` +
> `BlankStyleCard`). The preview renders through `renderSpecTablePreviewDocument`
> — the SAME pipeline as the editor's device previews, so a card can never drift
> from the storefront the way a static thumbnail would — into a `sandbox=""`
> iframe, hidden from AT, inside a real `<Link>`. It also removed the two engine
> exports the create-time-only decision orphaned (`applyStylePreset`,
> `isCustomizedFromStylePreset`); `isCustomizedFromPreset` +
> `PRESET_SCOPED_FIELDS` stay in the domain module with corrected comments — the
> latter is now justified as the executable form of the structure-only rule, which
> never depended on the cut hint. **Nothing imports the card yet**, so it is
> absent from the build until step 91 mounts it.
>
> 🔴 **Card revision 2026-07-27, after looking at the rendered gallery.** Three
> of the four changes were spotted by eye, not by a test. **Banded → "Modern"**
> (label only — the `id` stays `banded`, since the id names the pattern and is a
> wire format while the label is branding). **Simple → "Classic", and it became
> the full grid** — outer border, column rule, stripes, from the merchant's
> ACEFAST YF4 reference; its `id` DID change (`simple` → `classic`) because
> `simple` had become misleading on the most decorated card, and no
> `basedOnPreset` has ever been written outside tests, so this was the last free
> moment for that rename. **Multi-column gained BANDED section headers** by
> dropping `sectionHeaderStyle` from its bundle — a GRID header spans every track,
> so a plain one floats over the flow with nothing tying it to the items beneath.
> Minimal / Accordion / Blank untouched.
>
> ⚠️ **`PRESET_SCOPED_FIELDS` gained `columnDividerStyle` + the two frame
> fields.** Not a widening of the structure-only rule — the frame has been
> **pattern axis 4** in `stylePresets.ts`'s taxonomy since the module was written
> and no bundle had ever used it. Typography, density, widths and
> `gridMinColumnWidthPx` stay off-limits and are still named field-by-field in a
> test that now says why the others left.
>
> 🔴 **Layout decision 2026-07-27: TWO CARDS PER ROW, in an
> `inlineSize="base"` `<s-page>`.** ⚠️ The width recorded here at the time
> (1086px, counted off a screenshot) was **wrong — it is 966px**; see the step-91
> correction above for the real arithmetic. The decision itself stands, and
> **step 91's grid is `repeat(2, minmax(0, 1fr))`, not `auto-fit`.**
>
> **Step 91 landed 2026-07-27 — the gallery is LIVE at
> `/app/templates/choose-style`,** and it is the first merchant-visible piece of
> feature 88. One route file + one stylesheet + 9 source-text guards; nothing in
> step 90's files moved. `<s-page inlineSize="base">`, a breadcrumb back to
> `/app/templates` ("no skip" must not mean trapped), one help line saying the
> choice is not permanent, and a `repeat(2, minmax(0, 1fr))` grid of the six
> cards **mapped from `STYLE_PRESETS`** — never hand-listed, because the card
> order is merchant-facing and lives in the array. **No loader, no action**: the
> page renders frozen constants, so it has no shop-scoped query to get isolation
> wrong in and no DB footprint at all. ⚠️ Reachable **by typed URL only** until
> step 92 repoints the two Create buttons — deliberate, so the half of the
> feature that can persist a wrong stamp lands on its own.
>
> ✅ **The five-iframe cost is measured and it is not a problem** — the number
> feature 88 has owed since step 90. **All five frames loaded 130.4 ms** after
> navigation, spread **24.7 ms** first-to-last (they render together, not in a
> cascade), 180 KB of `srcDoc` total, and building all five documents in JS costs
> **0.09 ms**. That is ~7× under the 1 s threshold set in advance, so 🚫 **the
> shared-stylesheet fallback is not needed and must not be built** — the pipeline
> stays and so does its zero-drift guarantee. Measured on a standalone local page
> at the real geometry, not inside the embedded admin (a cross-origin app iframe
> cannot be instrumented from the admin's top frame).
>
> 🔴 **A 4% stripe fill is not resolvable in a downscaled screenshot, and looking
> at it gave the wrong answer.** Classic was read off the gallery capture as "the
> label column is shaded" — which would have been a real defect. Rendering its
> document at 1:1 and reading `getComputedStyle` shows `rgba(0,0,0,0.04)` on both
> the label AND the value of alternating rows, plus the column rule. **Verify
> low-contrast styling claims by computed style at 1:1; use the gallery
> screenshot for structure (bands, rules, column count, disclosures), not tint.**
> Relevant to feature 93, which is entirely about colour.
>
> 🔴 **`inlineSize="base"` is 966px, NOT the 1086px step 90 recorded — so
> two-per-row had never actually fit.** Step 90's figure was counted off a
> screenshot; step 91 asked the page itself (a temporary ladder of
> `@container (width >= Npx)` rules, each printing its own threshold) and got 966,
> **capped** — identical at a 1600px and a 2400px window. Two 506px cards + a
> 16px gap need 1028: the grid still made two tracks, every card overran its
> track by ~26px, and every preview was cropped on the right, invisibly, because
> the crop landed in the table's empty margin. Fixed by scaling to the real
> width — **`--appx-preset-scale` 0.6 → 0.55**, card 466, row 948 in 966; label
> text ~9.6px → ~8.8px, still readable. ⚠️ **Measure a container by querying it,
> not by counting pixels in a screenshot** — that number was wrong by 120px and
> survived two sessions and a merchant review because everything downstream was
> derived consistently from it.
>
> 🔴 **`max-width: 100%` does not stop a content-box card overflowing its grid
> track.** The narrow-admin check produced a sideways scroll; `/app/additional` at
> the same window size did not, which is what proved it was ours. The card boxes
> are content-box, so `max-width: 100%` caps the CONTENT at the track and lets the
> border box overrun by the padding and border — 26px per card. Each box now
> subtracts its own chrome. And below 948px the grid drops to **one column** via a
> `@container` query — two cards that no longer fit do not shrink, they CROP, and
> one full card beats two slices. 🚫 Still not `auto-fit`, which would also seat a
> third card on a wide admin.
>
> ✅ **Live verification complete — 10 of 10.** Direct document load (the
> loaderless child is covered by the parent auth chain); five previews each
> looking like the pattern they name; Blank showing no table; two per row with
> grid overflow 0; narrow admin → one column, `docOverflowX: 0`; breadcrumb back
> to the list; **Tab gives six stops, not eleven** (frames are untabbable), focus
> is a visible ring, Enter navigates; a click in the MIDDLE of a preview activates
> the card (`pointer-events: none` earning its comment); every card lands on the
> blank scaffold with `?style=` inert; and **Postgres unchanged throughout — 6
> templates before and after**. The accessible name was verified on the real
> component's server-rendered output (the admin's cross-origin iframe cannot be
> read from outside): name = the label alone, description associated, preview
> `aria-hidden`. ⚠️ An actual screen reader was not run — no AT in this
> environment; the mechanism is verified, the announcement is not observed.
>
> 🔍 **The scale geometry is measured, not guessed.** The preview is the real
> table at **800px** scaled to **0.55** — 800 because below the storefront
> stylesheet's **749px mobile breakpoint** every card renders in its identical
> phone form and the gallery stops distinguishing anything. The viewport height
> was cut 470 → **420px** after a static harness showed a band of dead white under
> every card. The scale rose 0.4 → 0.6 with the two-per-row decision and was
> corrected to **0.55** in step 91 once the base width was measured properly —
> preview label text ~6.4px → **~8.8px**, readable rather than merely textured.
> All six cards were rendered and inspected: five visibly distinct, Multi-column
> flows into 3 columns, Blank reads as a different kind of choice.
>
> ⚠️ **The accent/colour-theme feature renumbered 89 → 93** when the step files
> took 89–92. Doc 88 and `stylePresets.ts` were updated; the design is unchanged.
>
> 🔴 **Card follow-up 2026-07-28 — the cards now STATE their action, and they are
> still one link each.** The merchant compared the gallery to Kaching's, which
> puts a **Choose** button on every card, and asked whether ours should too. The
> observation was right (nothing on the card said it was clickable — the only
> signal was a hover border, invisible until the pointer arrives and **absent on
> a touch admin**); the proposed fix was not. 🚫 **A button was rejected**: their
> preview is interactive (radios, dropdowns) so they have no choice, ours is a
> `pointer-events: none` iframe so the whole card can be the target. A button
> means dropping the whole-card link — interactive content inside an anchor is
> invalid HTML — shrinking the target ~36× and leaving the preview a merchant
> aims at **inert**. Shipped instead: an admin-blue action line inside the same
> anchor (`Use this style →`, `Start blank` on Blank — ⚠️ per-card, since "use
> this style" is false on the absence of a style), `aria-hidden` because the link
> role already announces the action, arrow nudge guarded by
> `prefers-reduced-motion`. Full reasoning + the trade table: doc `88-…`
> §"A card is ONE LINK". Tests 1097 → **1101**; ✅ **mutation-tested** — swapping
> the line for a `<button>` fails two guards. Gate green (typecheck · lint ·
> format · 1101 tests · build).
>
> ✅ **Live-verified in the embedded admin 2026-07-28** — all six cards carry the
> line, the blue reads as interactive against the white card, and the rhythm
> (title → muted description → gap → action) does **not** crowd the description
> at 0.55 scale. Blank reads **"Start blank →"**, visibly different from its five
> neighbours, so the per-card copy decision is confirmed by eye and not only by
> the test. The hover nudge fires (arrow gap visibly wider than an un-hovered
> card). 🔴 **The click test is the one that mattered**: clicking the ACTION LINE
> on Accordion navigated to `/app/templates/new?style=accordion` — correct card,
> correct param — proving the line is inside the anchor rather than dead text
> beside it. Nothing saved; no DB write (create-on-save).
> ⚠️ **NOT re-checked: the narrow-admin one-column state.** `resize_window`
> reports success on this window and the viewport never changes, so the pass
> could not be run — it is **owed**, not passed. Low risk by construction (the
> line adds no width and the grid's 948px `@container` breakpoint is untouched),
> but the step-91 overflow bug was also invisible until the window was squeezed.
> ⚠️ The accessible name still cannot be read live — the app's cross-origin
> iframe is absent from the top frame's a11y tree, as in step 91. Unchanged by
> this work regardless: the new span is `aria-hidden` and outside the
> `aria-labelledby` target.

## Current Goal

**Reshell Phase B2 — the built-in preset gallery (Style tab feature 57, steps 13–14).**

Everything upstream is done and live-verified on the dev store:

- **Custom spec-table editor** — 13-step build + Step 9.5 (features 02–15).
- **Reshell Phase A** — editor reshelled to the mockup (features 16–18).
- **Editor / templates-list slices** — paste refinements, list polish, bulk delete +
  Undo, keyboard cell navigation, lifecycle / create-on-save (features 19–33).
- **Storefront pipeline** — Theme App Extension renders a product's assigned spec table
  live; dynamic `SHOPIFY_FIELD` / `METAFIELD` parts resolve (features 34–35).
- **Product assignment engine (37–48)** — merchant-complete end to end: broad +
  multi-value scopes (PRODUCT / COLLECTION), EXCLUDE carve-outs, block-on-conflict
  activation gate, shop-level routing metafield, 3-tier storefront resolution, dynamic
  assigned-product count.
- **Reshell Phase D — device previews (49–56)** — read-only Desktop / Mobile storefront
  previews in the editor (tablet removed 2026-07-22).
- **Reshell Phase B1 — Style tab knobs / rail / rendering (57–69, steps 1–12), COMPLETE
  2026-07-20** — every field in `STYLING_FIELD_NAMES` has a control, rides the SaveBar,
  persists to `TableStyling`, serializes to the metaobject, and renders on the storefront;
  rail a11y pass done; Reset-to-theme-defaults ships; docs reconciled.

Test suite **1138 tests / 43 files** (was 1021 at B1 sign-off); full gate
(typecheck · lint · format · test · build) green as of 2026-07-28.

Since B1: the Style tab's width surface — the collapsible rail (feature 76). Feature 75's
full-size preview modal shipped the same day and was **removed 2026-07-25**; see Completed.

**Next:** 🟡 **feature 96 (Underline color) is BUILT 2026-07-28, gate green, LIVE
VERIFICATION OWED** — doc
`96-…`. A dedicated colour for the `Underlined` section-header rule, which today is
`borderColor` (the `Divider color` swatch) and so cannot differ from the row rules,
column divider and outline. Same shape as `outerBorderColor` (feature 78): a nested
`var(--appx-spec-header-underline-color, var(--appx-spec-border-color, currentColor))`,
so a null value repaints nothing. Hidden unless `Header style` is `Underlined`
(merchant decision (b) 2026-07-28) — the third `ColorKnob.visibleWhen`, predicate count
9 → 10, JSX guards still 7. **No empty-state help text** (decision (a)): the fallback
chain ends in `currentColor`, not a literal, so the empty state has a two-level truth
no short string can tell — which makes `ColorKnob.helpText` / `emptyHelpText` optional,
exactly as feature 86 did to `StylingOption.helpText`. ⚠️ **The first Style-tab unit to
need a MIGRATION since feature 86** — features 87 / 94 / 95 all avoided one, so the
silent-save-failure-until-`shopify app dev`-restart trap is live again. Liquid / TOML /
metaobject definition unchanged.

**Built the same day. Tests 1147 → 1158 (+11); gate green (typecheck · lint · format ·
1158 · build).** Migration `20260728083021_add_header_underline_color_styling` applied —
one additive nullable column, no backfill; the `EPERM` on `prisma generate` did not stop
the client regenerating (verified in the generated types). **Eight existing guards failed
on the first run and all eight were predicted**; six needed only a number moved, because
they were derived from the domain rather than hand-listed — the `stylePresets` colour
probe in particular had said in a comment that a tenth colour would need no edit, and it
did not, so the preset gallery's zero-colour promise held by construction. ✅
**Mutation-tested three ways** (flatten the fallback chain → only the 2 new CSS-contract
tests; unwire `visibleWhen` → the wiring guard + the BAR; weaken the predicate to
`!== "BANDED"` → both `SECTION_HEADER_STYLES`-derived assertions, no hand-listed one).
🔴 **Two deviations, both narrowing:** only `emptyHelpText` became optional, not
`helpText`; and the `visibleWhen` bar was **reworded from "one live RULE" to "one
SURFACE"** — a section header has two markup shapes, so both header gates feed two rules
apiece and a rule-count bar would have disqualified the two gates that exist.
✅ **LIVE-VERIFIED 6 of 8 the same day, rail → Postgres → metaobject → REAL STOREFRONT**
(not the editor mirror — the embedded admin's iframe would not accept the interactions
needed to drive the rail this session, so the merchant set the colour and every
downstream leg was measured by query and by `getComputedStyle` at 1:1). 🔴 **The two
claims that mattered are now measurements, not arguments.** Before the write, with the
field null, both custom properties were absent and the section rule computed
`1.81818px solid rgb(0,0,0)` — the chain resolving to `currentColor`, i.e. byte-for-byte
the pre-96 rendering. After the merchant set `#E47272` on the ACTIVE `Motorola Moto G45
5G`: all five section headers compute `rgb(228,114,114)` while the row rules stay
`rgba(0,0,0,0.1)` — **the underline moved and the row rules did not**, which is the whole
feature. Postgres touched **exactly one column** (every other colour still NULL, every
pre-existing value byte-identical); `styling_css.vars` carries the new declaration and
**`classes` is unchanged** — the "nullable ⇒ custom property, never a modifier class"
rule holding for the tenth colour. The live CDN extension asset is byte-identical to the
local file, and its `@media` block never mentions the new var, so **mobile is
breakpoint-independent by construction** rather than needing feature 87's 390px walk.
⚠️ **Still owed (2):** the Banded/Plain hide transitions with preserve-on-hide, and the
collapsible `<summary>` shape (the verified template has collapsing off) — both
unit-tested and mutation-tested, neither observed. ⚠️ **`Motorola Moto G45 5G` still
carries `#E47272` and was deliberately NOT reverted** — the merchant chose it on their
own live template.

Then: ✅ **feature 87 (plain section header) is COMPLETE 2026-07-27** — built,
live-verified rail → Postgres → metaobject, and all three remaining legs (rendered
storefront on the ACTIVE `Unikyy Blade Pro Turbo Fan` template / product `Motorola Edge
60 Fusion 5G`, mobile ≤749px on the real storefront tab, and `AGX TF36 Handheld Turbo
Fan` loading with `TEXT_ONLY` correctly read as "Underlined") closed the same day — a
third `SECTION_HEADER_STYLES` member plus a relabel; doc `87-…`. It was item 1 of a
five-item merchant report and blocked two of the five reference tables; items 2–5 are
still unscoped. Zero-cost by construction (no migration, no new field, no hide
predicate, no `StyleTab.tsx` edit), so it never moved B2.

Then: ✅ **feature 86 (Style tab reorganization) is COMPLETE** — all six steps, shipped
2026-07-26, and it landed BEFORE B2 by merchant decision so presets arrive onto an
organised rail rather than adding a group to a disorganised one. The rail now carries
**eight groups on one axis** (the object being styled), each ending with its own colors.
Doc `86-…`. B2's preset cards slot in ABOVE all eight.

Then: ⚠️ **feature 85 (multi-column row flow) is BUILT but not signed off** — the
feature-70 screen-reader pass it was gated on was skipped at the merchant's instruction
and is still owed, plus two small live checks (see Next Up item 4). It cleared B2's
`ROW_LAYOUTS` blocker, so B2 = steps 13–14 can proceed. **Specced 2026-07-27 as
feature 88, doc `88-…`** — `stylePresets.ts` constants, rail preset cards, and a
gallery **route** (`/app/templates/styles`, NOT a modal) reached from Create template.
**Copy** semantics into real `TableStyling` columns, `basedOnPreset` as provenance
only. `basedOnPreset` / `extraStyles` exist in the schema, deliberately unwritten
until Step 13. Then Phase C (Settings display rules) → E
(assignment folded into the reshell) → F (top-bar status/save model + cleanup). 14-step
plan: `~/.claude/plans/style-tab-phase-b-implementation-plan.md` (1–12 = B1, 13–14 = B2,
15+ = B3 saved presets, cuttable).

### Binding rules (do not violate)

- 🚫 **The Edit grid never reflects merchant styling.** It is a fixed editing surface; the
  Desktop / Mobile previews are the _only_ place Style / Settings changes appear (they are
  storefront-faithful). Step 11 as originally planned ("live styling on the editing grid")
  was built, rejected on review, and fully reverted — see `context/features/67-…`.
  `SpecTableEditor.module.css` + `RowGrid.tsx` are tripwired byte-clean against sign-off `a7b304c`.
- **No contrast checking ships** (decided 2026-07-20): the app can't compute contrast (null
  colours inherit unknown theme values; alpha is enabled on background knobs), so any signal
  would be a guess. Don't reintroduce without a new decision.
- **Server precomputes styling; Liquid only prints** — the sync writes derived
  `styling_css {classes, vars}`; the Liquid block carries no styling logic, so a new knob
  needs no storefront work (the pipe is total over `StylingValues`).

---

## Completed

> One line per unit. Detail → the linked `context/features/` doc + git history.

**The two dead colour swatches hide themselves (feature 95, doc `95-…`)
— ✅ COMPLETE 2026-07-28, live-verified in the embedded admin, 10 of 10**

- **Two parts, one mechanism.** (1) `Stripe background` hides unless `Row
dividers` is Stripes — the reported item. (2) `Header background` hides unless
  `Header style` is Banded — the open question part 1 closed with, answered by
  the merchant the same day. Both are `ColorKnob.visibleWhen` entries; nothing
  else in the rail changed. Predicates **7 → 9**, JSX guards unchanged at 7.
- **Part 2's CSS check is the same shape, and the specificity is the point.**
  `--appx-spec-header-bg` appears in FOUR rules, but the two BASE ones
  (`__section`, and `__section-summary` under `--collapsible`) are
  **unreachable**: `stylingToModifierClasses` emits a section-header class
  unconditionally (defaults included, by its own stated rule), every member
  selector outspecifies the base, and `TEXT_ONLY` / `PLAIN` both hardcode
  `background: transparent`. Only the two `--section-banded` rules read it. So
  the predicate is a bare `sectionHeaderStyle === "BANDED"` — **no collapsing
  clause**, because feature 87's fix (mirror every member rule onto the
  `<summary>`) is exactly what lets one predicate cover both shapes. Asserted
  over every member × both shapes so it stops reading as obvious if a future
  member is ever added to one shape only.
- 🔴 **Part 2 reverses a comment in `stylingControls.ts` itself** ("a composition
  fact rather than a reason to hide the swatch: the merchant may legitimately set
  it before switching"). Weaker than it sounds, and the difference from the
  stripe case is worth keeping: **`BANDED` is `SECTION_HEADER_STYLES[0]`, the
  DEFAULT**, so the swatch is visible on an untouched template and only vanishes
  once a merchant actively picks Underlined or Plain — set-before-switching is
  not an order anyone arrives in. Pinned in a test, since the argument rests on
  it. ✅ `Title color` stays ungated (the base rule's `color:` is never
  overridden, so a title is coloured under all three members), which is also what
  keeps that grid from painting empty. 🚫 NOT extended to "the template has no
  section header rows": that is row DATA, and no rule in the file has ever read
  it — the rail would start hiding controls in response to merchant content.
- 🚫 **`borderColor` is now a THREE-PLACE permanent no** (feature 86 decision 3,
  the `ColorKnob.visibleWhen` doc, and a test listing the two gated fields BY
  NAME rather than counting them). It is a no-op under Row dividers = None too,
  so it is the obvious next candidate and it must never join: it also dresses the
  column divider, the feature-80 separator, and the outline whenever
  `outerBorderColor` is unset. **The bar is a fact about the stylesheet** — the
  field must feed exactly one live rule — not a judgement about tidiness.
- **Report item 1 (the stripe):** should only show while `Row dividers` is
  `Stripes`. Correct as reported, and it is the narrowest referent in the rail —
  `stripeBgColor` feeds **exactly one declaration** in `spec-table.css` (the
  `--dividers-stripes` even-row fill) and `--appx-spec-stripe-bg` appears nowhere
  else. Outside Stripes the knob has no referent at all, which is the bar
  `showsGridMinColumnWidthControl` set for earning a hide.
- 🔴 **This REVERSES feature 86 decision 4** ("Stripe background stays visible too"),
  and the reversal is sound: decision 4 was made in the same breath as decision 3
  (`Divider color` stays visible) and inherited its reasoning without the surface
  count being checked. `borderColor` dresses FOUR surfaces (row rules · column
  divider · the f80 separator · the outline whenever `outerBorderColor` is unset),
  so at `NONE` rows it is still the only control for two live surfaces.
  🚫 **Decision 3 is NOT reopened** — the asymmetry inside one 2-up grid IS the
  feature: one field / one surface / one rule is what earns a hide.
- **An AND, and the second clause is not defensive.** `rowDividerStyle ===
"STRIPES" && rowLayout !== "GRID"`. Grid does not OFFER Stripes (f85), but
  `GRID` + `STRIPES` is reachable from stored data — the orphan — and the
  stylesheet stands that fill down to `transparent`. A naive `=== "STRIPES"` would
  put a live colour picker directly under a select reading **"Stripes — not
  available in Grid"**. `!== "GRID"` rather than a membership test, same call as
  feature 94: the excluded case is the one with a reason.
- ⚠️ **The first hide rules over COLORS, so they have no JSX line to wrap.** The
  other seven are `{showsX(styling) && <control/>}`; all nine swatches are one
  `.filter(…).map(…)` over `COLOR_KNOBS`, so the guard rides a new optional
  `ColorKnob.visibleWhen` and is applied inside `colorGrid`. The predicates still
  live with the other seven and are registered in `VISIBILITY_PREDICATES`, so
  they inherit the preserve-on-hide law unchanged — only the attachment point
  differs. **JSX guards stay at 7** (the contract test now says why it is not 9).
- ⚠️ **The hazard that opened, guarded:** `colorGrid` renders its `<s-grid>`
  unconditionally, so a group whose swatches were ALL gated would paint an EMPTY
  grid — dead space, plus a silent hole in the "no group collapses to a bare
  heading" count, which treats `colorGrid(…)` as one always-rendering control.
  Pinned from the data. Both gated swatches sit in groups whose OTHER swatch is
  unconditional (`Title color`, `Divider color`), which is what keeps that true.
- **Both help texts had to change too** — `"Alternating rows — needs Row
dividers set to Stripes."` → `"The fill on alternating rows."`, and `"The band
behind a section title — needs Header style Banded."` → `"The band behind a
section title."` The caveat and the hide are two answers to one problem, and
  shipping both leaves the weaker one on screen: a condition a merchant can only
  read while it already holds is not information. A test pins this as a property
  OF GATING, not a ban on caveats — `Divider color` is ungated and keeps its
  coupling text, and must.
- **Zero storefront diff, feature-87 cost profile.** No migration, no field, no
  CSS/Liquid/TOML/markup — hiding is rail-only and a hidden value still
  serializes and still renders. **Tests 1120 → 1147 (+27)**, including the two
  domain-derived "exactly one member shows it" assertions, the frozen-input round
  trips, and one deriving the Grid answer FROM `rowDividerOptionsFor` so the
  select's filter and the swatch's hide cannot drift into contradicting each
  other on screen. ✅ **Mutation-tested three ways:** dropping the `!== "GRID"`
  clause fails 2 and the diff names the orphan; dropping the `visibleWhen` clause
  from `colorGrid` fails exactly the guard written for it and nothing else;
  weakening the header predicate to `!== "PLAIN"` fails the
  `SECTION_HEADER_STYLES`-derived assertion rather than a hand-listed one.
- ✅ **Live-verified 2026-07-28, 10 of 10**, on the DRAFT scaffold
  `cms3avu6f000gvpf40o9t3hqd` (0 assigned, 6 rows incl. a section header).
  **Nothing saved — every change rode the SaveBar and ended in `Discard`.**
  Part 2: Banded shows both swatches → **Underlined** and **Plain** each hide
  `Background` while `Title color` stays and reflows to a lone half-width cell →
  `#E6F4EA` survives Banded → Plain → Banded → and **with collapsing ON, Plain
  still hides it**, so one predicate really does cover both shapes (feature 87's
  hazard, confirmed rather than assumed). Part 1: **Lines** leaves `Divider
color` ALONE → **Stripes** brings the pair back → **None** hides the stripe
  **while Divider color stays**, which puts feature 86 decision 3 and feature 95
  side by side in one screenshot → `#F9B8B8` survives the round trip.
  🔴 **The ORPHAN is the check that mattered**: Row layout → Grid with `STRIPES`
  stored shows the select reading **"Stripes do not apply in Grid layout"** with
  the swatch **absent** — a naive `=== "STRIPES"` would have put a live pink
  picker directly beneath that sentence — and switching back to Two-column
  returned the swatch still holding `#F9B8B8`.
  **Both new help texts observed live**, and they double as proof the value
  committed (the non-empty gloss only renders when the field is non-null).
  ✅ **Postgres untouched, measured**: after Discard the row's `updatedAt` is
  still `2026-07-27T14:06:40Z` and all four columns are NULL.
- ⚠️ **NOT observed: the storefront paint** — the scaffold's data rows have empty
  values, so there is no visible band or stripe in the preview. Acceptable here
  in a way it was not for 87/94: this feature is **zero storefront diff by
  construction** (it hides controls; no CSS, no Liquid, no serialization), so
  there is no rendering claim to falsify. What needed observing was the rail.
- 🔬 **Method correction, worth carrying:** clicking an option inside an OPEN
  native `<select>` popup **does nothing and silently clicks the page
  underneath** — the first attempt left Header style on Banded and moved focus to
  the field below. Recipe that then worked ~10× without a miss: click the select
  → `Escape` → arrow keys. And wheel-scroll DID reach the rail throughout, so the
  older "use Tab, not scroll" note is session-dependent exactly as it says.
- ✅ **The feature-87 open question is CLOSED** — `headerBgColor` was the "hiding
  it would be an 8th hide predicate + a feature-86 group change" item; it cost
  neither (the group is unchanged and the predicate rides `visibleWhen`).

**Section gap in the flat block layouts (feature 94, doc `94-…`) — ✅ COMPLETE
2026-07-28, live-verified rail → preview → Postgres across all three row layouts**

- Merchant report + DevTools screenshot: `margin-top: 30px` on
  `tr.appx-spec-table__section-row` opens a real gap on their live storefront. It does —
  and the knob it wanted **already existed** (`sectionGapPx`, feature 80). The rail simply
  hid it unless `sectionsCollapsible` was on. This feature moved that fence.
- 🔴 **Root cause: one true sentence over-generalised, repeated in three places**
  (`spec-table.css`, `stylingControls.ts`, `data-model.md`): "a flat section header is a
  `<tr>` and a `<tr>` takes no margin." True **only under `TWO_COLUMN`**. What a `<tr>`
  DISPLAYS as is the row-layout rules' call — `table-row` there, but `block` under
  `STACKED` and a `block` grid item under `GRID`, and margin applies in both. The
  merchant's screenshot was a **GRID** table, which is exactly why their CSS worked. The
  thing that cannot express a gap is a **table formatting context**, not the flat shape.
- **Feature-87 cost profile, as specced.** No migration, no new field, no Liquid/TOML/
  markup, no repaint (every new declaration gated on the `--section-gap` presence class),
  and **no new hide predicate** — `showsSectionGapControl` changed its CONDITION to
  `sectionsCollapsible || rowLayout !== "TWO_COLUMN"`, so the pinned count stays **7** and
  feature 86 Step 5's 2⁷ empty-group test keeps its shape.
- **`!== "TWO_COLUMN"`, not a `STACKED`/`GRID` membership test** — inverting the call
  `showsMobileLayoutControl` makes: the EXCLUDED case is the one with a reason, so a fourth
  `ROW_LAYOUTS` member inherits "the gap works", which is right (`TWO_COLUMN` is the only
  member keeping `display: table`). And an **OR, not a replacement** — `TWO_COLUMN` +
  collapsible still works through feature 80's untouched `<details>` rule.
- **One CSS rule, two layout-scoped selectors.** Written bare it would be a _silent no-op_
  under `TWO_COLUMN`; naming the layouts makes the selector state its own constraint.
  `:not(:first-child)` does double duty — no leading gap, and under `STACKED` it stops a
  first-child top margin collapsing out through the block `tbody` and pushing the whole
  table down. ⚠️ Two mechanisms, one result: collapsing block margin under `STACKED`, a
  never-collapsing grid-item margin under `GRID`; they agree only because every
  neighbouring margin is 0 today.
- ⚠️ **The control MOVED group** — feature 86's axis deciding its own placement:
  `Collapsible sections` (→2) → `Section headers` (→8), last structural knob before the
  colors, so Title spacing (padding INSIDE a header) sits beside the gap (margin OUTSIDE
  one). Neither group empties; Collapsible still leads with its ungated switch. Help text
  dropped "collapsible". `admin-screen-plan.md` §Tab 2 amended at the head of its list.
- 🚫 **`TWO_COLUMN` with collapsing off stays excluded**, and the rejection was already on
  file at `stylingControls.ts` before this report: a transparent `border-block-start` loses
  the `border-collapse: collapse` width contest and silently deletes the previous row's
  divider. Padding grows the band instead of opening a gap; a spacer `<tr>` would put a
  cell-less row into the `role="table"` chain. The one uncosted option
  (`border-collapse: separate`, scoped to the knob) is an **open question**, not a gap.
- ✅ **No mobile asymmetry, and the predicate is why.** The worrying state — a
  `TWO_COLUMN` table gapped on a phone and flat on desktop — is unreachable: the control
  is hidden there, so no value exists to disagree across the breakpoint.
- **Tests 1101 → 1120 (+19).** The feature-80 guard that pinned "exactly ONE
  `margin-block-start` in the file" was **rewritten rather than bumped to 2** — a count of
  2 would be an arithmetic accident; it now asserts the actual law (every such declaration
  sits in a rule gated on `--section-gap`), which is scale-free. Plus the flat rule naming
  both layouts and never two-column, `:not(:first-child)` on both shapes, the predicate's
  full OR matrix derived from `ROW_LAYOUTS`, the group-placement pin in
  `styleTabContract.test.ts` (the one thing that file says it _cannot_ see, asserted for
  the one control that moved), and a renderer pin that the two markup shapes are mutually
  exclusive — so the no-double-gap claim is measured, not argued.
  ✅ **Mutation-tested:** dropping the `--layout-grid` selector fails 2 tests and the diff
  names it; reverting the predicate to `sectionsCollapsible` fails 4 including
  `STACKED`-with-collapsing-off.
- ✅ **`.harness/` matrix run (8 cases, measured not eyeballed).** `STACKED` first-child
  gets `0px` with the table's top offset **identical to the no-gap control** — the
  margin-collapse hazard closed by measurement; rows-before-first-section gaps at BOTH
  boundaries (the case `+` would skip); `GRID` 30px; **`TWO_COLUMN` measures `-0.0px`**,
  the deliberate no-op. 🔍 **The stranded-`LINES`-rule question is answered NO, by computed
  style at 1:1** (the feature-88 lesson): the last row before a gap keeps
  `0.909px solid rgba(0,0,0,0.1)` — _identical to the same table with no gap_ — so the gap
  changes spacing only. `STRIPES`/`NONE` have no rule to strand.
- ✅ **Live-verified** on `Untitled template (copy)` (DRAFT, 0 assignments). Two-column +
  collapsing off → **control absent** from Section headers. Stacked → control appears
  under Section headers reading "No gap between sections."; set 30 → preview separates and
  help text reads **"Space between each section."** Grid → two tracks with the gap spanning
  both, the merchant's own case driven by the knob instead of hand-edited DevTools CSS.
  🔴 **The round trip is the one that mattered**: Two-column hides it, and switching
  collapsing ON brings it back **still reading 30** — preserve-on-hide observed live, not
  only unit-tested, with feature 80's `<details>` rule painting the gap.
  Postgres after save: `sectionGapPx = 30`. **Fully restored afterwards** — `rowLayout`
  and `sectionGapPx` both back to `null`, every other column byte-identical.
  ⚠️ **Left in place:** the content rows added to that throwaway scaffold to give it a
  second section (`Basic Information` / Weight / `Physical Description` / Dimensions).
  ⚠️ **NOT run: the real-storefront leg.** It needs an ACTIVE template, and the two
  obvious candidates are in merchant use. Owed, low risk by construction (the preview
  renders through the same renderer and a byte-mirrored stylesheet).
- 🔴 **Method note, learned the hard way.** Blind `Shift+Tab` repeats in the embedded admin
  walk focus out of the iframe unobserved. Worse, I read a template's DRAFT→ACTIVE change
  as self-inflicted and raised a false alarm; it was the merchant's own concurrent work.
  **Check the mechanism against how the app saves (SaveBar-gated, explicit Save) before
  attributing a write.** Tab in small batches with a screenshot after each.

**Plain section header (feature 87, doc `87-…`) — ✅ COMPLETE 2026-07-27, live-verified
rail → Postgres → metaobject → storefront (all 3 legs closed same day)**

- Merchant report item 1 of 5: there is no **plain** section header, and `TEXT_ONLY`
  **is not text-only** — it drops the band but keeps `border-block-end: 2px solid`
  (`spec-table.css:218`). Both reference tables (JBL, Samsung) show a bare bold title with
  no rule, so nothing the rail offered could reproduce them. Fix is a third
  `SECTION_HEADER_STYLES` member, `PLAIN`. Tests 1012 → 1021.
- **The cheapest unit the Style tab has had, and it is the Step 2 rule paying out again.**
  `sectionHeaderStyle` is a non-null keyword ⇒ modifier class, so: **no migration** (a
  third legal string in an existing `String?` column), **no new field** in
  `STYLING_FIELD_NAMES` (feature 86's drop guard and the `COLOR_KNOBS` grids untouched),
  **no hide predicate** (count stays 7), **no Liquid / TOML / markup** — the sixth feature
  running that "server precomputes `styling_css`; Liquid only prints" pays for — and
  **no `StyleTab.tsx` edit at all**, because `SECTION_HEADER_OPTIONS` is a `.map` over the
  domain. Appended, never inserted, so `BANDED` stays `[0]` and nothing repaints.
- **It is a member AND a relabel** (merchant decision 2026-07-27). `TEXT_ONLY`'s LABEL
  becomes **`Underlined`** ("Bold title with a rule beneath it"); `PLAIN` reads `Plain`
  ("Bold title, nothing else"). Every label now names the look and **no label is reused
  across values.** 🚫 Giving `PLAIN` the freed "Text only" string was rejected: it is the
  strongest label for the new member but points the same words at a different value, so a
  merchant who remembers picking "Text only" would find "Underlined" selected. Renaming a
  choice is honest; silently re-pointing its name is not. The wire value is unchanged.
- **Two CSS rules, one per shape**, because the collapsible `<summary>` is a **sibling** of
  the section table carrying its own copy of every header declaration — a member styling
  only the flat shape hands the rule back the moment Collapsible is enabled (the Step 9a
  composition hazard). `border-block-end: none`, not a transparent or zero-width border:
  those still occupy the box. ⚠️ **No source-order hazard, unlike feature 79** — the three
  members are mutually exclusive at matching specificity, so they never contest a property.
- **The new guard is the one that would have caught the original defect**, and it is
  derived from the domain rather than hand-listed: **each member states BOTH its
  `background` and its `border-block-end`**, in both shapes (3 × 2). A member declaring
  only one silently inherits the other from the base rule — precisely how "text only" ended
  up underlined. ✅ **Mutation-tested:** dropping `TEXT_ONLY`'s `border-block-end` fails it,
  so it bites on an existing member and not only on the new one. Selector lookups anchor on
  the CLASS and walk to the brace, because all three collapsible selectors wrap at
  prettier's 80 columns and hardcoding the wrap would make reformatting a test failure.
- ⚠️ **Two consequences accepted in writing.** (1) Collapsible + Plain + all closed is a run
  of bare titles with **no separator** — the feature-80 hairline is deliberately NOT
  extended, since it exists because BANDED _drops_ an edge and two closed bands merge into
  a slab; a plain title has no fill to merge with, and the absent edge IS the member.
  `sectionGapPx` is the answer, and a test pins the banded-only scope so a later change has
  to revisit the decision rather than drift into it. (2) **`headerBgColor` does nothing
  under Plain** — the rule hardcodes `transparent`, exactly as `TEXT_ONLY` always has.
  Pre-existing; the swatch already self-reports ("needs Header style Banded"). Hiding it
  would be an 8th hide predicate + a feature-86 group change — **open question, not done.**
  ✅ **CLOSED 2026-07-28 by feature 95 part 2** — the swatch now hides unless Banded, and
  the estimate above was wrong on the second half: it cost **no group change at all**,
  because a swatch's guard rides `ColorKnob.visibleWhen` rather than a JSX wrapper.
- ✅ **Live-verified on the DRAFT `Motorola Moto G45 5G`** (0 assigned; merchant added a
  `Phone Details` section header for the purpose). All three options walked by keyboard;
  🔴 **the reported defect reproduced en route** — `Underlined` paints the heavy 2px rule
  with the band gone, which is the state a merchant reached by picking the option that
  said "Text only". `Plain` renders a bare bold title in the flat shape **and** as a
  native disclosure once collapsing is toggled on — the composition hazard the second
  rule exists for, confirmed rather than assumed. Postgres `sectionHeaderStyle="PLAIN"`
  (only column touched). **Measured on the wire:** `styling` overrides-only,
  `styling_css.classes` carries `--section-plain` in field order with the **count
  unchanged at 7**, and **`vars` is EMPTY** — the no-custom-property claim measured, not
  asserted. Left saved on Plain; collapsing discarded back off.
- ✅ **All three legs closed 2026-07-27**, on the real storefront domain rather than the
  editor mirror. Set `Header style` → Plain on the already-ACTIVE `Unikyy Blade Pro
Turbo Fan` template (assigned to product **Motorola Edge 60 Fusion 5G**) and Saved:
  all 4 real section headers render bare bold, no band, no rule, live at
  `appx-dev.myshopify.com/products/motorola-edge-60-fusion-5g`. Resized that same real
  tab (not the admin iframe, which can't be measured — see `browser-verify-embedded-app`
  memory) to 390px: identical bare-header rendering holds at mobile width, GRID collapsed
  to one column. Opened `AGX TF36 Handheld Turbo Fan` (stored `sectionHeaderStyle =
"TEXT_ONLY"` beforehand, confirmed via Neon) and its rail read **"Underlined"** with the
  correct help text on a cold load, not only after an in-session pick. Unikyy reverted to
  Banded and re-saved afterward; Postgres confirms `sectionHeaderStyle` back to `null` and
  every other `TableStyling` column byte-identical to its pre-test values.
  🚫 The `.harness/` CSS matrix was **skipped** (recorded as a deviation): two
  declarations with no specificity or source-order interaction to explore, unlike
  79/80/85 where the harness caught real plan errors first.
- ⚠️ **The stale-Prisma-client trap does NOT apply** (no migration), so the dev server
  needs no restart before the first save. Numbering: takes **87**; 82/83/84 stay reserved.
  Report items 2–5 are **unscoped** — feature 86's lesson was not to bundle boundaries.

**Style tab reorganization (feature 86, doc `86-…`) — ✅ COMPLETE, all 6 steps
2026-07-26**

- Merchant reported the Style rail as unorganized and sent two Shopify theme-editor
  screenshots as the target. Root cause: the rail's six groups are cut on **two axes at
  once** — four by OBJECT (Layout / Size & frame / Sections / Rows), two by CSS PROPERTY
  (Colors / Typography). So `headerBgColor` sits ~20 controls from the band it paints,
  `stripeBgColor` sits away from the switch that makes it visible, and `fontWeight` /
  `labelCase` sit in Typography with no Labels group to belong to. Fix: one axis, the
  object axis — **8 groups**, Colors and Typography dissolved, every group ending with its
  own colors 2-up ("structure knobs, then colors" as one learnable rule).
- **Six merchant decisions (2026-07-26)**, all recorded in `86-…`: Table layout leads (not
  Size & frame — Row layout gates four other controls); Sections **splits** into Section
  headers (7) + Collapsible sections (3); **Divider color stays always-visible** (🚫 the
  proposed hide-unless-LINES is a functional regression — `borderColor` also dresses the
  column divider, the feature-80 separator, and the outline whenever `outerBorderColor` is
  unset); Stripe background likewise; **short labels inside groups** (`Weight`, `Title
size`); and it lands **before B2**.
- **Three structural calls, not preferences.** (1) `labelCase` goes to Labels, NOT the
  merchant's "Table text" — verified against the stylesheet, `--appx-spec-label-transform`
  and `-font-weight` sit on `.appx-spec-table__label` while size/style/line-height sit on
  `__table`; filing case as table-wide is falsifiable in one click. (2) Short labels are
  safe only because every group keeps `role="group"` + `aria-labelledby` — the "do not
  rename Label weight" lock in `stylingControls.ts` is satisfied by a different mechanism
  and its comment must be updated (Step 6). (3) The Colors group's "leave a swatch empty to
  inherit" note has no home once the swatches scatter, so **each swatch reports its own
  state** instead (the idiom six number fields already use) — better than the group note
  even for sighted users, and this is the feature's a11y answer rather than repeating one
  sentence five times.
- **Zero storefront diff, by construction.** No column added/renamed/dropped, no schema, no
  migration, no CSS, no Liquid, no TOML, no `tableStylingCss.ts`, no metaobject change.
  Every rename is a merchant-facing LABEL — `borderColor` stays `borderColor` on the wire.
  No new hide predicates either: the count stays **7**.
- ✅ **Step 1 — the drop guard** (`styleTabContract.test.ts`, 5 tests, 981 → 986). Nothing
  stopped a Style-tab edit from silently dropping a control: the knob would vanish from the
  rail while its column, CSS var, serialization and storefront rule all stayed live, so it
  would keep round-tripping and rendering the last saved value while being unreachable —
  no failing test, no type error, detectable only by eye. Tolerable when adding one
  control; not when relocating all 34, so the guard was built **first and against the
  pre-move rail**. Pins: every `STYLING_FIELD_NAMES` member is reachable from a control,
  and **no field is reachable from two** (a field on both routes would render twice, each
  control silently overwriting the other). Two routes because the rail has two — a literal
  `setStylingField("field", …)` for the 24 non-colors, and a `COLOR_KNOBS` entry for the 9
  colors, whose call passes a VARIABLE and is invisible to a text scan. Reads the real file
  off disk with comments stripped, same technique + same reason as
  `specTableCssContract` / `specTableAriaContract` (jsdom cannot render Polaris web
  components, so text is the only handle on JSX).
  ⚠️ **Mutation-tested, not assumed:** removing Density's literal call and the `COLOR_KNOBS`
  render both failed the guard, and the first named `density` in the diff. The
  `COLOR_KNOBS` check counts **≥2 occurrences** rather than `toContain` — the import alone
  would satisfy a presence check, so a rail that imported the list and rendered none of it
  would have passed.
  🚫 **Deliberately NOT asserted:** that every scanned name is a real field.
  `setStylingField` is generic over `keyof StylingValues` (`useRowEngine.ts:223`), so a typo
  is already a compile error — a runtime check would be a weaker second copy of the type
  system. And the guard proves **reachability, not correctness**: it cannot see a control in
  the wrong group or a wrong label, which is why steps 4–5 are live verification.
- ✅ **Step 2 — the copy and data pass** (986 → 1004 tests). Copy only: no control moved,
  no group changed, no value changed. Eleven control labels shortened + two swatches
  renamed (`Table outline` → `Outline color`, `Border` → `Divider color`) + four shortened
  to bare `Background` / `Text color`. `StylingOption.helpText` became **optional**, which
  cut ten always-on descriptions; the surviving glosses are mostly `Inherit` and
  empty-state lines, so **the rail's help text is now state-reporting throughout** —
  it speaks in the states that need explaining and stays quiet otherwise, which makes one
  idiom out of what were two. `COLOR_KNOBS` gained `group` + `emptyHelpText`, and
  `STYLE_GROUP_HEADINGS` is the new one table of truth for the eight groups.
- ⚠️ **The `stylingControls.ts` scope lock was NOT broken, it changed mechanism.** It
  forbade renaming "Label weight" because "the control names its own scope"; the control
  now reads "Weight" and the `Labels` group heading states the scope instead — wired with
  `role="group"` + `aria-labelledby`, so it is announced, not merely seen. What still
  holds: a table-wide "Font weight" would require moving the var off
  `.appx-spec-table__label` and repainting every live table. **Dropping a group wrapper
  would silently break the lock**, which is why `STYLE_GROUP_HEADINGS` says so too.
- ⚠️ **The old Colors group note was WRONG about four of nine swatches, and per-swatch
  state text is what exposed it.** "Leave a swatch empty to inherit that color from your
  theme" holds for five; the band (`rgba(0,0,0,0.06)`), the stripe (`0.04`) and the row
  rules (`0.1`) fall back to this app's own literals, and **`outerBorderColor` inherits
  nothing** — it falls back THROUGH `borderColor`, so its empty state is "follows another
  control on this screen" ("Follows Divider color."), which no group-level sentence could
  have said. A test pins which five may say "theme".
- 🔴 **One defect found LIVE that the character count had passed.** `Header background`
  (17 chars) wrapped in the 2-up color grid and pushed its swatch below its neighbour's,
  misaligning the row — while `Stripe background`, the _same 17 characters_, fits, because
  "Stripe" sets narrower than "Header". The usable cell is right at the boundary and the
  real limit is nearer 15. Shortened to `Background` and re-verified. **Method note:
  measuring labels analytically filters but does not substitute for looking at the rail.**
- 🚫 The two feature-81 header `Record`s are now character-identical to their Labels-group
  twins (the "titles" prose was cut on both sides) and are **deliberately not merged**: the
  guard asserting the header lists never say "label" can only fail while they are
  separable. A vacuous guard is worse than four lines of duplication. A second test pins
  that the two `Inherit` glosses still differ.
- **Live-verified** top to bottom on the DRAFT `Motorola Moto G45 5G` (0 assigned; nothing
  saved, SaveBar never appeared): every rename, `On mobile`/`Density` with no help line and
  **no leftover gap** (the `undefined` mapping works — `""` would paint a blank grey row),
  and every empty-swatch state line.
  ⚠️ **The rail is transiently worse in one spot until Step 4** — short labels landed
  before the groups that justify them, so the still-undivided `Colors` group shows three
  `Background`s and two `Text color`s in one run. Consequence of the step order, not a
  defect; the per-group uniqueness test already asserts the post-Step-4 grouping.
- ✅ **Step 3 — the separation treatment** (1004 → 1006 tests). Visual only: nothing moved
  between groups, no control and no copy changed, so the step answers _does the separation
  read well at 300px_ on its own rather than inside Step 4's 34-control diff. Outer stack
  `gap="base"` → **`large-200`**, inner per-group stacks stay **`base`**, and an
  `<s-divider>` between each pair of groups plus one above Reset. The pair is the point:
  proximity alone already reads as groups **before a rule is drawn**, and the dividers
  restate that boundary for anyone reading structure rather than rhythm. `large-200`
  verified as a real `SizeKeyword` against `polaris-types`; its px value is not shipped in
  the package, so the amount was settled by looking (~20px). Reset lost its
  `paddingBlockStart="base"` — it only ever existed to buy space the stack and rule now
  supply twice over — and takes a rule despite not being a group, because it acts on
  everything above it.
- 🔢 **Count correction: the rail has SIX groups, not seven.** Earlier notes here (and the
  root-cause line above) say seven; `role="group"` in `StyleTab.tsx` counts **six** —
  Layout · Size & frame · Sections · Rows · Colors · Typography. That is exactly what the
  two-axes diagnosis predicts (four by object + two by CSS property), so seven was a
  miscount. The target is still 8. It mattered concretely: it set the divider count.
- **The Step 3 guard is scale-free on purpose** (+2 tests in `styleTabContract.test.ts`),
  so Step 4 can add two groups and move all 34 controls without editing either assertion.
  (1) **`dividerCount === groupCount`** — not a coincidence: N−1 rules between groups plus
  one closing rule above Reset means N groups always want N dividers, six today and eight
  after the move. A group added later without its rule is invisible to every other test in
  the repo and reads as a rendering glitch rather than a missing line of JSX. (2) **the two
  gap scales stay different** — outer matches `large-\d+`, every inner stack is `base`;
  collapsing them would delete the proximity signal, not merely tighten the rail.
- **Live-verified** on the DRAFT `Motorola Moto G45 5G` (nothing saved, SaveBar never
  appeared): all six boundaries reading cleanly, even spacing either side of each rule, and
  Reset now sitting at the same rhythm as a group heading. The rule is a faint hairline
  inset to the control width — correct here, since `s-divider`'s default `base` keeps
  whitespace primary where `strong` would read boxy.
  ⚠️ **"Both rail widths" was a non-question:** the rail is a fixed `18.75rem` track
  (`EditorShell.tsx:252`) or hidden outright (`railCollapsed` → `1fr`). No intermediate
  width exists, so window size cannot change the treatment.
  ⚠️ **Tooling correction:** mouse-wheel scroll does **not** reach the rail inside the admin
  iframe — the earlier session note claiming it did was wrong. Click a control and `Tab`;
  the scroll container follows focus. Each `s-color-field` takes **two** tab stops.
- ✅ **Step 4 — the move** (1006 → 1010 tests). Six groups became **eight**, `Colors` and
  `Typography` dissolved, all 34 controls now on one axis — the object being styled:
  Table layout (4) · Table size & frame (5) · Table text (4) · Section headers (7) ·
  Collapsible sections (3) · Rows (5) · Labels (4) · Values (2). Every group ends with its
  own colors, which is the one rule a merchant learns once: **structure knobs, then
  colors.** Headings render FROM `STYLE_GROUP_HEADINGS`, so the Step 2 vocabulary finally
  has a consumer instead of drifting unobserved.
- **`colorGrid(group)` is a plain function, not a component.** The nine swatches were one
  `.map` and are now five FILTERED grids — filtering, never reordering, which is what lets
  `COLOR_KNOBS` stay in `STYLING_FIELD_NAMES` order. Called as `{colorGrid("labels")}`
  rather than `<ColorGrid/>` because a component declared inside `StyleTab` is a new type
  every render and would remount its subtree, losing focus and any half-typed hex; not
  hoisted to module scope either, since it closes over `styling` + `setStylingField`.
  `tableFrame`'s single swatch still renders 2-up (half width, gap beside it) — a
  full-width lone swatch would make Outline color the only differently-sized color input in
  the rail.
- ⚠️ **The move opened a hole the Step 1 drop guard cannot see, and it is closed.** That
  guard proves a color is reachable via `COLOR_KNOBS`, which was airtight while ONE `.map`
  rendered the whole list; with five filtered grids, deleting a single
  `{colorGrid("values")}` strips two swatches while `COLOR_KNOBS` still appears five times
  and every pre-Step-4 test passes. Four tests added, all derived from data rather than
  hand-listed: every `STYLE_GROUP_HEADINGS` id has a group; every heading is taken FROM the
  vocabulary rather than retyped (a hardcoded `<s-heading>Labels` renders fine today and
  silently disagrees the first time a heading is reworded); every group with swatches
  renders its grid; and the Colors note is gone. ✅ **Mutation-tested** — deleting
  `{colorGrid("values")}` fails and the diff names `values`.
- **Live-verified** top to bottom on the DRAFT `Motorola Moto G45 5G` (nothing saved,
  SaveBar never appeared; storefront preview pixel-identical to before the move, which is
  the zero-diff claim holding in practice). ✅ **The Step 2 transient regression is
  resolved** — the three `Background` and two `Text color` swatches now each sit under
  their own announced heading, and Labels' pair vs Values' pair reads cleanly across a
  heading plus a rule, which is exactly the bet the short-label decision made. ✅ `Outline
color` sits under Outline width reading **"Follows Divider color."**
  ⚠️ **`Collapsible sections` collapses to a heading + one switch** while collapsing is
  off, and the heading nearly restates the switch label. It earns itself at three controls
  when on. **Step 5 decides** — recorded as a live observation, not acted on.
- ✅ **Step 5 — conditional state + a11y** (1010 → 1012 tests). The move redistributed the
  seven hide-gated controls — `showsCustomFontSizeInput` into a group of four, BOTH
  `sectionsCollapsible` rules into a group of three — so the new risk was a group whose
  every control is gated rendering as **a heading and a divider fencing nothing**: an empty
  section a merchant reads as broken, and a `role="group"` with no members. Pinned as a
  static test over all **2⁷ combinations**, which beats live toggling (that only samples).
  Counted rather than parsed, and the soundness condition — each guard wraps exactly one
  control — is itself asserted at 7 against the registry count; without it the first
  assertion decays from a real check into an arithmetic accident.
- **All seven predicates toggled LIVE and correct**, count unchanged at 7 (feature 86 added
  none, and the rail-side guard now cross-checks the number from the JSX as well as the
  registry): Stacked/Grid hide On mobile + Label column width · Grid shows Minimum column
  width · Maximum width 960 shows Alignment · Text size Custom shows Custom size seeded 16
  · Enable collapsing shows Sections start + Gap. Thinnest state seen live is `Table
layout` under Stacked — heading + `Row layout` alone — and it reads as a group, not an
  empty section. **All changes discarded; nothing saved.**
- ✅ **`Collapsible sections` KEPT** (the Step 4 open question). At three controls it is
  unambiguously a group; at one it is a heading plus a switch that nearly restates it. Kept
  because the redundancy is the standard settings idiom (a section named X whose first
  control enables X), the thin state is the one where the merchant has least to do there,
  and merging back would rebuild the eight-control group the merchant asked to split.
- ⚠️ **Two Polaris limits found and accepted.** `s-heading` takes **no level prop** (only
  `accessibilityRole`), so the panel title and all eight group headings are peers rather
  than nested — pre-existing, not an 86 regression, and `role="group"` + `aria-labelledby`
  is what carries the structure; wrapping groups in `s-section` to get levels would add
  card chrome the rail does not want. `s-divider` extends only `GlobalProps` (no
  `accessibilityVisibility`), so it cannot be marked decorative — Polaris's call, and a
  separator between groups is semantically honest anyway. Also: **`s-number-field` commits
  on blur, not per keystroke** — worth knowing before reading a hide rule as broken.
- ✅ **Step 6 — lock reconciliation + docs.** `StyleTab.tsx`'s header comment narrated the
  rail as a sequence of feature-57 steps ("first three groups — Layout · Sections · Rows",
  "Step 10a adds the Colors group") and described a rail that no longer exists. Rewritten
  around the **organising rule** plus the four invariants a future knob must respect: one
  axis (the object), every group ending with its colors; placement decided by **where the
  CSS var lands**, checked against `spec-table.css`; the headings are load-bearing; and no
  group may consist entirely of hide-gated controls. Still-true material kept (no contrast
  checking, no generic control wrapper, the `""`-to-null rule, the a11y decisions).
  The two `stylingControls.ts` locks needed no work — Step 2 rewrote them when the labels
  actually shortened; re-read and correct as written.
- **`admin-screen-plan.md` §Tab 2 amended, not rewritten.** Its "Style rail (top → bottom)"
  list is the original grouping — now wrong about structure, still right about every knob —
  so a superseding note was added at the head of the list (the convention the doc already
  uses for its 2026-07-19 amendments) carrying the eight-group table and the var-placement
  rule. It also fixes two drifts the list had accumulated independently of feature 86:
  ⚠️ it says **"seven" colors when there are NINE** (`headerTextColor` from feature 81 and
  `outerBorderColor` both post-date the spec), and it records that **Style presets still
  sits ABOVE all eight groups** when B2 lands — the reason 86 deliberately preceded B2.

**Style tab — Reshell Phase B1 (feature 57, steps 1–12; docs `57-…`–`69-…`)**

- Step 1 (`57-…`): pure styling domain `app/utils/tableStyling.ts` — allowed-value arrays,
  `StylingValues`, `DEFAULT_STYLING_VALUES`, tolerant `parseStylingValues` (never throws),
  overrides-only `serializeStylingOverrides`, `stylingEquals`.
- Step 2 (`58-…`): pure presentation mapping `app/utils/tableStylingCss.ts` —
  `stylingToCssVars` (nullable→CSS var) / `stylingToModifierClasses` (knob→BEM modifier) /
  `formatCssVarDeclarations` / frozen `SPEC_TABLE_CSS_VARS`; one translation layer, no drift.
- Step 3 (`59-…`): storefront `spec-table.css` rewritten to `var(--appx-spec-*, <literal>)`
  - one dormant rule set per modifier + the `--mobile-stacked` @media default; byte-exact
    drift guard (`specTableCssContract.test.ts`, `previewStyles.ts` copy).
- Step 4 (`60-…`): `add_table_styling` migration + server persistence — `TableStyling`
  (override columns, NULL=default), `stylingToDbColumns`, nested shop-scoped upsert, lazy row.
- Step 5 (`61-…`): engine styling state + Row-dividers control + Save round-trip;
  `editorSnapshot.ts` unifies the dirty baseline + submit snapshot.
- Step 6 (`62-…`): live styling in the device previews (first consumer of the Step 2 mapping).
- Step 7 (`63-…`): metaobject serialization + Liquid emission — pipe complete to the live
  storefront; new metaobject `styling_css` field; status-change re-sync hazard closed.
- Step 8 (`64-…`): the four remaining non-structural keyword knobs (row layout / on-mobile /
  section headers / density) — zero non-UI diff.
- Step 9 (`65-…`): collapsible sections — the only B1 step to change markup
  (`<details>/<summary>`, one `<table>` per section, native keyboard, per-section `aria-label`).
- Step 10 (`66-…`): Colors + Typography — the last knob-adding step; nullable "inherit"
  vocabulary; `FONT_SIZE_PX_MAX` raised 40→184; every `STYLING_FIELD_NAMES` field now has a control.
- Step 11 (`68-…`): reveal a preview when the merchant opens the Style / Settings tab
  (per-tab view memory, `tabViewMemory.ts`). _(NOT the withdrawn "style the grid" step — `67-…`.)_
- Step 12 (`69-…`): Reset-to-theme-defaults + rail a11y (help text on `details`, real group
  headings, named landmark) + docs reconciliation. **Phase B1 complete.**
- Resolved en route: the section-header BANDED band is the intended default becoming
  reachable, not a regression (accept; Step 7 signed off).

**Multi-column row flow (feature 85, doc `85-…`) — 🛠️ BUILT & live-verified
2026-07-26, ⚠️ NOT SIGNED OFF (feature-70 screen-reader pass still owed)**

- Merchant sent five competitor spec tables laying rows out in 2–3 side-by-side tracks.
  Ships "Type A" only (the unit laid out is one label/value pair); section-level flow is
  out of scope with a recorded reason. `GRID` joins `ROW_LAYOUTS` (appended, never
  inserted) + one nullable `gridMinColumnWidthPx` (160–640, null = the stylesheet's
  240px). Migration `20260726100927_add_grid_min_column_width_styling`, confirmed
  non-repainting (6 rows, 0 affected). **No Liquid, no TOML, no markup change** — the
  fifth feature running that the "server precomputes `styling_css`; Liquid only prints"
  pipe paid for. Tests 943 → 981.
- ⚠️ **Built ahead of its own blocker at the merchant's instruction.** The doc gates this
  on feature 70's screen-reader pass (item 3 in Next Up) because GRID is the THIRD
  departure from `display: table` riding on an ARIA chain no assistive tech has ever
  confirmed. The pass is still owed. One new data point in its favour: Chrome's
  accessibility tree was read on the live storefront under `display: grid` and still
  exposes table/rowgroup/row/rowheader/cell — the roles survive the display change.
  That is not the same as a screen reader ANNOUNCING the pairs, which is what feature 70
  actually owes.
- **A minimum column width, never a column count** — `repeat(auto-fit, minmax(min(var(…,
240px), 100%), 1fr))`. Responsiveness with no media query, no unreadable 3-tracks-in-a-
  600px-theme case, and it is what keeps the ~640px editor preview honest (a count knob
  would render "3 columns" there and on a 1400px storefront while looking nothing alike).
- 🔴 **Three plan corrections, all found by the CSS harness and all invisible when
  broken** — the full write-up is the build log at the top of `85-…`:
  (1) the **stripe stand-down LOST on specificity**, not source order — the plan's "they
  tie" math missed the fill rule's `:nth-child` and `__row`, so the specced 3-part
  selector never won and the checkerboard painted anyway; the shipped rule mirrors the
  fill rule's shape (5 parts) and additionally stops the broad form wiping a merchant's
  own `labelBgColor` / `valueBgColor`; (2) a bare `minmax(<min>, 1fr)` **overflows** when
  the minimum exceeds the container — measured 25px at 400 and 265px at 640 in a 375px
  container, both reachable from the rail's range — fixed with `min(…, 100%)`;
  (3) the **`--outer-border` last-row exception is wrong in grid** (it assumes the last
  DOM row is the row against the frame; measured `1px,1px,1px,0px` across the final track
  row), so it now stands down via `:not(--layout-grid)` on all three of its selectors.
- **The height win is real but ~half the plan's claim, and it peaks at the default.**
  Measured on the live 44-row DJI storefront, all sections open, 1440px: TWO_COLUMN 3963px
  → GRID@240 **2848px (−28%, ~1100px, about one screen)**. Not the "44 rows becomes ~15"
  the plan assumed, because **a grid row is as tall as its tallest member** and this
  catalog is ragged (value heights median 43px, max 536px). ⚠️ Going BELOW 240 makes it
  worse (@160 = 2893px): narrower tracks wrap long values more. Empirical vindication of
  the 240 default, and the guidance to give a merchant who assumes narrower = shorter.
- **Rail:** third Row layout option; new **Minimum column width** box (blank = 240, the
  blank-box idiom — 0 clamps UP to the floor rather than meaning "off", unlike Outline
  width); hide-rule count **6 → 7** (`showsGridMinColumnWidthControl`, registered in
  `VISIBILITY_PREDICATES` so it inherits preserve-on-hide); `showsMobileLayoutControl`
  narrowed `!== "STACKED"` → `=== "TWO_COLUMN"`; `showsLabelWidthControl` hides for GRID
  for free. **Stripes is hidden in Grid** (merchant call) via `rowDividerOptionsFor`, the
  rail's first per-option hide — deliberately NOT in `VISIBILITY_PREDICATES`, which
  governs whole controls. Its orphan case (a merchant already on Stripes who switches to
  Grid) keeps the entry visible and labelled rather than blanking the select or coercing
  the value.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save →
  Postgres → metaobject (`styling` overrides-only carrying `rowLayout`/`gridMinColumnWidthPx`;
  `classes` carrying `--layout-grid` in field order and the **same length as before** —
  the no-new-presence-flag claim measured on the wire; `vars` carrying
  `--appx-spec-grid-min-column: 400px`) → rendered Horizon storefront (3 × 480px tracks
  in 1440px, page overflow 0, 9 disclosures intact). Section header spanning every track,
  stripe stand-down, and the dropped column divider all re-verified against the production
  stylesheet. An all-`TWO_COLUMN` control measured **394px before and after**.
  **Left saved with Grid + minimum 400** (revert = two controls; consider clearing the
  400, since 240 measured materially shorter).
- ✅ **Both deferred live checks closed on a second pass 2026-07-26.** (1) The **Stripes
  orphan renders as specced** on the Moto G35 template (saved `TWO_COLUMN` + `STRIPES`):
  switching to Grid leaves the select reading "Stripes" with "Stripes do not apply in Grid
  layout. Pick Lines or None." rather than going blank, the orphan is the TRAILING entry
  after Lines/None (walked with the keyboard), picking another member **drops it for
  good**, and the preview's stripe fill vanished the moment Grid was picked — the CSS
  stand-down is visible in the preview surface too. Template left untouched via Discard,
  re-read from Postgres to confirm. (2) **Mobile measured at a genuine narrow viewport**
  (the storefront sends `frame-ancestors 'none'`, so the probe is the real markup + the
  real CDN-deployed stylesheet in a `srcdoc` iframe): **overflow 0 at every width**, and
  the doc's "no media query" claim **splits in two** — above 749px `auto-fit` genuinely
  collapses on its own (1 track at 800px), but at/below 749px the pre-existing
  `--mobile-stacked` rule is later in the file, wins, and turns the grid OFF in favour of
  the stacked layout. Same look, different mechanism. On the `--mobile-same-as-desktop`
  path (rule-less, and reachable because the rail hides that control without clearing it)
  the grid DOES stay on and `min(…, 100%)` holds it to one 356px track at 375px and one
  301px track at 320px even with a 640px minimum — which is what makes build-log fix 2 a
  real shipping guard rather than a theoretical one.
- ⚠️ **The backtick trap fired for the second feature running** (81 recorded it first): a
  comment written for the stripe rule contained a backticked snippet, which breaks the
  `previewStyles.ts` mirror. The mirror is now regenerated by a script that REFUSES to run
  when the CSS contains a backtick, rather than relying on remembering.
- ⚠️ **The stale-Prisma-client trap did NOT fire this time, because the dev server was
  restarted before the first save** — the discipline works. Restarting also let
  `prisma generate` complete without the usual `EPERM … query_engine-windows.dll.node`,
  since the running server was what held the lock.
- Numbering: takes **85**; 82/83/84 stay reserved. ⚠️ **Superseded by feature 88
  (2026-07-27):** the "must land in the B2 preset bundles" claim repeated across 78–85
  is wrong — bundles set **structure only** (4 axes + collapsible, 0–3 fields each), so
  every colour, typography and frame field stays a rail knob and is deliberately absent
  from every bundle. `GRID` DOES land (Multi-column's bundle); `gridMinColumnWidthPx`
  does not — null = the stylesheet's 240px, which measured shortest. **No bundle ships
  `GRID` + `STRIPES`** still holds and now falls out of the rule for free, since no
  bundle names a divider style other than `NONE`.

**Section header typography & spacing (feature 81, doc `81-…`) — ✅ shipped & fully
live-verified 2026-07-26**

- Merchant sent five competitor spec tables (Best Buy, Amazon, Trek, AppleGadgets, a fifth
  blue-band sample) and asked which section-header treatments the app can reproduce. Five
  were missing; all five ship here as **nullable `TableStyling` columns** — `headerTextColor`,
  `headerFontSizePx`, `headerFontWeight`, `headerCase`, `headerPaddingBlockPx`. Migration
  `20260726054441_add_section_header_typography_styling`. Band radius / chevron position /
  open-close animation from the same report are **82 / 83 / 84**, each split out for a
  recorded technical reason. Per-row ⓘ icons are content, not styling → Phase C.
- **The cheapest unit the Style tab has had, and that is a consequence of the Step 2 rule,
  not a coincidence.** Nullable ⇒ CSS custom property, so: **no modifier class, no presence
  flag, no hide predicate (count stays 6), no markup, no Liquid, no TOML.** Fourth feature
  running that "server precomputes `styling_css`; Liquid only prints" paid for. Three tests
  now pin the no-class claim, and it was **measured on the wire**: after saving three knobs
  to the ACTIVE DJI template the metaobject's `styling_css.classes` string is byte-identical
  to before the feature, while `.vars` gained three declarations.
- ⚠️ **`headerFontSizePx` is absolute px, NOT an em keyword — structural, not taste.** The
  collapsible `<summary>` is a **sibling** of the `<table>` that carries
  `--appx-spec-font-size`, so an em multiplier would resolve against a different base in each
  shape and silently resize when a merchant toggled Collapsible. px resolves identically in
  both. This also collapsed the control from a five-option tri-state to a plain number box.
- **`headerPaddingBlockPx` is the ONE integer knob with a 0 floor** (merchant's call). Feature
  78's minimum-of-1 law governs knobs where null already means off; here null means the
  `0.75rem` literal, so 0 is a _first_ spelling of a genuinely different render, nothing keys
  a presence flag on it, and the mapping guard is `!== null` rather than falsiness so a stored
  0 emits `0px` instead of falling through to the fallback. **Block axis only** — the inline
  padding stays welded to the row cells' `0.75rem`, or a 24px title would indent past its own
  labels. Written as `padding-block`/`padding-inline` longhands: a var inside a shorthand is
  IACVT and would drop **all four sides** to zero.
- **Live-verified end to end** on the ACTIVE DJI template: rail → Save → Postgres → metaobject
  → rendered Horizon storefront, all 9 sections at `22px / 700 / uppercase / 18px block`, with
  **`padding-inline` still `12px`** (the block-only decision in production) and `font-weight:
700` coming from the _literal fallback_ since `headerFontWeight` is null. Features 79/80
  undisturbed (`margin-block-start` 0/25px, every `border-block-start` 0px). Row labels stay
  `text-transform: none` — `headerCase` never touches `labelCase`'s surface. Mobile checked at
  a genuinely reflowed `innerWidth: 502` (`labelDisplay: block` proves the @media fired): all
  five identical to desktop. A 16-case CSS harness against the real stylesheet ran **first**;
  its all-null control measured `12px/16px/700/none` — the pre-feature literals, so the
  no-repaint claim is measured, not asserted. Migration non-repainting (6 rows, 0 non-null).
  Tests 914 → 943.
- ⚠️ **Two traps worth carrying forward.** (1) A **backtick in a `spec-table.css` comment**
  breaks the `previewStyles.ts` mirror — the file header says so and the first comment written
  here violated it; use plain words for CSS syntax in that file. (2) The **stale-Prisma-client
  trap hit for the fourth consecutive feature** (78/79/80/81) and presented at its sharpest:
  Save wrote nothing and left the SaveBar reading "Unsaved changes" — no toast, no error. The
  discriminator settled it in one command (a fresh `node -e` writes fine ⇒ the server is just
  stale). Also: `prisma generate` can report `EPERM … query_engine-windows.dll.node` while
  still having rewritten the types and client JS, so typecheck/build pass on a "failed"
  generate — the engine binary is version-, not schema-specific. Don't loop on it.
- **Left saved with** Section title size 22 · case Uppercase · padding 18 (revert = two boxes
  - one select). `headerFontWeight` / `headerTextColor` deliberately left null, which is what
    made "absent from the wire when null" a real check.
- Numbering: this takes **81**. ⚠️ **Superseded by feature 88 (2026-07-27):** these five
  do **not** join any preset bundle — header typography is tuning within a pattern, not a
  pattern. They remain what lets the reference tables be reproduced rather than
  approximated; that reproduction now happens in the rail after a card is picked.

**Section separation + section gap (feature 80, doc `80-…`) — ✅ shipped & fully
live-verified 2026-07-26**

- Merchant collapsed every section on the ACTIVE DJI template and the banded headers
  rendered as **one unbroken grey slab** — no edge between adjacent bands. Root cause is
  one Step 8 rule doing exactly what it says: `--section-banded` drops the summary's
  `border-block-end` because "the band edge IS the separator", which is true when a band
  is followed by ROWS and false when it is followed by ANOTHER BAND — a state only
  collapsible sections can reach. **Not a regression from 77–79.** Two halves shipped
  together: **A** a base-rule separator (no knob), **B** a `sectionGapPx` knob.
  Migration `20260725181733_add_section_gap_styling`. **No Liquid change** — third
  feature running that the "server precomputes, Liquid only prints" pipe paid for itself.
- **A — `border-block-START`, not `-end`, and that is the whole trick.** The banded rule
  owns the bottom edge of the very same element, so claiming the opposite side means the
  two rules never contest a property: no specificity tie, **no source-order dependency**
  (contrast feature 79, where the tie made file order load-bearing), no `!important`.
  Reads `--appx-spec-border-color`, so it matches the row rules by construction — the
  feature-79 call made again, no new swatch.
- ⚠️ **`:not([open])` on the PRECEDING section is a no-repaint device, not a nicety.**
  `ALL_OPEN` is the default initial state, so an unconditional rule would add a second
  hairline above every band on every collapsible banded table already live. Scoped this
  way, only the broken state changes — **measured**: a banded ALL_OPEN table renders
  `border-block-start: 0px` throughout, exactly as before. Free bonus: `[open]` is a live
  attribute, so the separator appears/disappears as a shopper toggles a section, with
  **zero JavaScript** — verified on the storefront by clicking (`0px → 0.909091px` on
  close, and back).
  **Accepted gap:** an OPEN but EMPTY section (Step 9a's empty collapsible / feature 74
  R3) renders a zero-height table, so its band still abuts the next. Closing it means
  dropping `:not([open])` and repainting every default table — the law wins.
- **B — `sectionGapPx Int?` (1–48, null = no gap)**, in **Sections** under "When the page
  loads", as a **zero-means-off** box (the third, joining Outline width and Corner
  radius). px not a keyword: nothing here can clash the way a column-rule width could, and
  matching a theme's rhythm needs a number. `showsSectionGapControl` is the **6th** hide
  rule and the second gated on `sectionsCollapsible` — for a harder reason than the
  initial-state control: a gap is not merely meaningless in the flat shape, it is
  **unexpressible**, since a flat section header is a `<tr>` and a `<tr>` takes no margin.
  (🚫 The transparent-`border-block-start` approximation is rejected in writing: under
  `border-collapse: collapse` the wider border wins the shared edge and would delete the
  previous row's divider.) Inherited the preserve-on-hide law by adding one row to
  `VISIBILITY_PREDICATES`.
- **The third presence flag `--section-gap` earns its keep twice**, and one of those was a
  **plan correction found during the build**: the gap rule is gated on the class rather
  than left to `var(--…, 0)`, because an always-declared `margin-block-start: 0` from a
  two-class selector **beats a theme's own element-level `details` margin** — inert as a
  value, not as a declaration. Its other job is telling A's hairline to stand down once
  whitespace already separates the bands. A test pins that the file declares
  `margin-block-start` exactly once, inside that rule.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save →
  Postgres `sectionGapPx=12` → metaobject (`styling` overrides-only, `styling_css.classes`
  ending `--section-gap`, `vars` = `--appx-spec-section-gap: 12px;`) → rendered Horizon
  storefront (first section `margin-block-start: 0px`, all 8 others `12px`, every
  `border-block-start` `0px`). Frame interaction probed live without saving: with
  `--outer-border`/`--outer-radius` on, gaps survive inside the frame, `overflow: hidden`
  engages, the last summary's bottom rule was already `0px` so nothing doubles, and width
  stays 1440px (feature 77 unaffected). Mobile ≤749px checked in the editor's Mobile
  preview: stacked, gap intact, no artifacts. Migration confirmed non-repainting (6 rows,
  0 non-null). An isolated 6-case CSS harness against the real stylesheet ran **first**, so
  the storefront pass was a confirmation rather than an exploration. Tests 892 → 914.
  ⚠️ **`s-number-field` commits on blur, not per keystroke** — typing a value leaves the
  help text and SaveBar untouched until focus leaves. Pre-existing (all three px boxes do
  it); knowing it saves a false "the knob is dead" diagnosis.
  **The DJI template is left saved with `Banded` + `Gap = 12`** (it had been on `Text
only`, which was the workaround for this bug). Revert = two controls.
- Numbering: this takes **80**. `sectionGapPx` is the ONE tuning value feature 88 keeps in
  a bundle (`Accordion`, at 12px) — a Trek-style accordion needs whitespace between
  disclosures to read as separate blocks. ⚠️ **Corrected 2026-07-27:** the Accordion preset
  is collapsible + **`TEXT_ONLY`** + a gap, not banded — a clickable header wants the 2px
  rule, and banded is its own card.

**Column divider (feature 79, doc `79-…`) — ✅ shipped & fully live-verified 2026-07-26**

- Merchant sent two competitor spec tables (techlandbd, AppleGadgets) rendering a full
  **grid** and asked for a column border. Only ONE edge was actually missing: rows already
  had `LINES` (57 Step 5) and the frame shipped in 78, so the vertical rule between label
  and value — **the only interior column edge a 2-column table has** — is one knob, and it
  completes the grid. One column `columnDividerStyle String?` (`NONE` default / `LINE`),
  migration `20260725161912_add_column_divider_styling`. **No Liquid change** — second
  feature running that the "server precomputes, Liquid only prints" pipe paid for itself.
- **Three merchant decisions (2026-07-26), all narrowing the knob deliberately:**
  a **style keyword, NOT a px width** (row-divider width is not configurable, so a width box
  would let a 4px column rule sit on 1px row rules — the knob that cannot express the ugly
  case is the right knob); **no dedicated color swatch** (reads `--appx-spec-border-color`,
  so it matches the row rules by construction — `columnDividerColor` stays addable later);
  and **not hidden on stacked layouts**, deliberately declining a 6th hide predicate. That
  last one has a cost: `Line` on a stacked table does nothing, so the caveat lives in the
  option's help text and is a **shipped requirement pinned by a test**, not prose.
- Non-null keyword ⇒ **modifier class**, per the locked Step 2 rule; `NONE` emits a real
  `border-inline-end: none` rule rather than being the absence of one. The rule hangs off
  the **label's `border-inline-end`**, which is the whole design: a section header is a
  `th[colspan=2]` so the rule stops at every band (the look both references have); each
  collapsible section owns its own `<table>` so it is per-section for free; and it is
  INTERIOR, so `border-collapse` has nothing to resolve and it can never double against the
  outer frame — no analogue of feature 78's three last-row selector cases. Logical property,
  so RTL is correct for free.
- ⚠️ **The one hazard is SOURCE ORDER, not specificity.** Both stacked shapes must drop the
  rule (a block label has no seam; a survivor paints as a stray vertical stub), and all three
  selectors are two classes — a **tie**, so order alone decides. The ON rule sits with the
  dividers block _before_ the layout block, making the file's existing documented ordering
  rule load-bearing for one more knob. Breaking it is invisible: previews and storefront
  regain the stub together and it reads as a design choice. Three tests pin it (the 1px
  literal, both `none` rules, and the ordering). No `!important` anywhere. Tests 879 → 887.
- **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save → Postgres
  `columnDividerStyle="LINE"` → metaobject (`styling` overrides-only; `styling_css.classes`
  carries `--column-divider-line` in field order, **`vars` empty** — the knob rightly emits no
  custom property) → rendered Horizon storefront, rule stopping at every section band. The
  "matches the row rules by construction" claim is **measured, not argued**: the label's
  computed `border-inline-end` and `border-block-end` are both `0.727273px solid
rgba(0,0,0,0.1)`. The source-order hazard was verified **observably** — swapping the layout
  class on the live page dropped the border `0.727273px → 0px` with the divider class still
  present, and restored it. Mobile ≤749px checked in the editor's Mobile preview (a real
  ~375px iframe): stacked, no rule, **no stray right-edge stub**. Migration confirmed
  non-repainting (every pre-existing row read `null`).
  ⚠️ **`resize_window` is not a usable responsive check here** — it reports success but the
  viewport never reflows (`innerWidth` stayed 1397); the Mobile device preview is what gives a
  genuine narrow render. The DJI template is **left saved with `Line`**.
- Numbering: this takes **79**. ⚠️ **Superseded by feature 88 (2026-07-27):**
  `columnDividerStyle` lands in **no** bundle, and the "Bordered / Grid" preset it was
  meant to enable was **withdrawn**. The two banded references (startech, techlandbd)
  differ only on the frame and column-rule axes, which is evidence those are tuning
  _within_ Banded rather than a look a merchant starts from. The knob is unaffected —
  it is two clicks from the Banded card.

**Table width + outer border (features 77–78, docs `77-…` / `78-…`) — ✅ shipped 2026-07-25**

- **77 — the block now fills its container (CSS-only bug fix, live-verified).** Merchant
  report: the storefront table's width followed its CONTENT, so opening a collapsible
  section resized the whole table. Measured on the dev store: **206px closed ↔ 1264px open**
  inside 1438px of space. Cause is one level ABOVE our markup — a theme section that centres
  its children (`align-items: center` on a column flex container) makes **Shopify's**
  `.shopify-app-block` wrapper a shrink-to-fit flex item. 🚫 **`width: 100%` on
  `.appx-spec-table` is a no-op** — measured — because a percentage resolves against the
  already-shrunk parent and does not feed back into its intrinsic sizing. Fix is
  `.shopify-app-block:has(> .appx-spec-table) { align-self: stretch; justify-self: stretch }`.
  **`align-self`, NOT `width: 100%`:** both fill a column-flex parent, but align-self targets
  the CROSS axis, so in a row-flex theme it touches the height and leaves the width alone
  (verified — no overflow). Base rule, not a knob: a table that resizes when a shopper opens
  a section is wrong in every theme. Live-verified on the storefront — **jitter 0px**.
  _Note the previews never showed this and never could:_ the preview document has no
  `.shopify-app-block` ancestor, so "storefront-faithful" has a hole exactly where the
  surrounding theme wraps the block.
- **78 — five Style-tab knobs**, new **Size & frame** rail group: `tableMaxWidthPx`
  (240–1600, null = full width), `tableAlign` (LEFT/CENTER/RIGHT), `outerBorderWidthPx`
  (1–12), `outerBorderRadiusPx` (1–48), `outerBorderColor` (swatch, in **Colors**).
  Migration `20260725143916_add_table_container_styling`. **No Liquid change** — the
  "server precomputes, Liquid only prints" pipe paid off exactly as designed.
  Three locks: **null = the default, not inherit** (no theme value exists for an outline),
  so **every integer minimum is 1, never 0** — a 0 would be a second spelling of "off" that
  serializes as a bogus override; **max-width, not width**, so the cap shrinks on a phone
  and cannot collide with the 749px breakpoint; the outline colour falls back **through**
  `--appx-spec-border-color`, so one swatch dresses rules + frame until a merchant splits
  them. Two presence flags (`--outer-border`, `--outer-radius`) exist because CSS cannot
  branch on whether a var is set: one drops the last row's rule where it would double against
  the frame (**three** selector cases — flat, last section open, last section CLOSED, where
  the summary is the last thing painted), the other turns on `overflow: hidden` so a radius
  actually clips the band and stripes. `showsTableAlignControl` is the **5th** hide rule and
  inherited the preserve-on-hide law by adding one row to `VISIBILITY_PREDICATES`.
  **Round-trip live-verified end to end** on the ACTIVE DJI template: rail → Save → all five
  Postgres columns → metaobject `styling_css` (classes `--align-center --outer-border
--outer-radius`, vars with px units + hex) → rendered storefront (900px, centred 203/203,
  `2px solid rgb(192,38,211)`, 12px radius, last-row rule dropped, jitter still 0). The cap
  shrinks rather than overflows — measured 900/700/360 in 1438/700/360px containers.
  ⚠️ **A migration mid-`shopify app dev` needs the dev server restarted:** the first save
  failed silently because Vite HMR reloads app code but NOT `@prisma/client` (require cache),
  so the server called a client without the new columns — the same reason `prisma generate`
  reported `EPERM ... query_engine-windows.dll.node`. Tell it apart from a real bug by running
  the upsert from a fresh `node -e`: if that writes, the server is just stale.
  ⚠️ B2 note **superseded by feature 88 (2026-07-27)**: none of these five lands in a
  preset bundle. Frame and width are tuning within a pattern, not a pattern — and the
  frame is the one axis that can collide with the merchant's theme (startech's apparent
  "frame" is the theme's own section card, not the table's).
- **Follow-up 2026-07-26 — Outline width and Corner radius show `0` for off; neither box is
  ever blank.** Merchant report: reaching "no outline" meant _removing the text_, which is a
  poor gesture on a knob whose whole vocabulary is a px number. So for these two knobs
  **display and storage disagree, in one direction only**: the box always shows a number,
  `null` renders as `0` (`toZeroMeansOffControlValue`), and anything rounding to ≤ 0 reads back
  as `null` (`fromZeroMeansOffControlValue` — so `0`, `0.4`, `-5` _and_ an emptied box all mean
  off, while `0.6` still clamps up to the minimum). Both fields take the shared
  `ZERO_MEANS_OFF_CONTROL_MIN = 0` so the **stepper can walk down to off**; the domain
  minimums stay 1 as the smallest _stored_ values. Off-state help text now reads "No outline.
  Set 1 or more to frame the table." / "Square corners. Set 1 or more to round them."
  ⚠️ **The minimum-of-1 lock above is NOT relaxed — it is what makes this safe.** 0 is never
  stored, so `serializeStylingOverrides` still has nothing to write, and the reason is
  load-bearing rather than tidiness: **both** knobs carry a presence flag keyed on non-null, so
  a stored 0 would trip it while painting nothing — `--outer-border` drops the last row's own
  bottom rule (no frame **and** a lost divider), `--outer-radius` turns on `overflow: hidden`
  (no rounding **and** an over-wide table starts clipping, the exact trade that flag exists to
  avoid taking unasked). Keeping 0 out of the model makes both unreachable by construction
  instead of by a second guard downstream — a test pins that no input reaches the model as `0`.
  Server `parseStylingValues` untouched. Tests 887 → 892.
  **Maximum width deliberately keeps its blank box** — 0 is not a spelling of "full width", so
  the same trick would be a lie there. Confirmed against the Polaris docs en route: `min`/`max`
  on `s-number-field` are display affordances only — "Users can still type values lower than
  the minimum using the keyboard. Implement validation to enforce this constraint." — which is
  why every bound in this file is enforced in the converter, not the markup.

**Collapsible Style / Settings rail (feature 76, doc `76-…`) — ✅ shipped & verified 2026-07-25**
**— and, since the modal below was removed, the ONLY answer to the Style tab's width problem.**

- The **other** option the same merchant offered for the same report that produced feature
  75, built at their request. One toggle in the control row
  collapses the 18.75rem Style/Settings rail to **zero width**, handing the stage the full
  editor card. Feature 75's doc had rejected this idea on width grounds; that half is
  **wrong and is retracted** — it modelled the preview off the raw admin viewport instead of
  the `<s-page inlineSize="large">` card, and the measured chain (`iframe − 64 − 48 − 2`,
  −300 more with the rail open) clears the 749px breakpoint by ~300px on the reporter's own
  window. Live-verified at the exact reporting size (`innerWidth` 1397 → iframe 1141):
  Style + Desktop rendered stacked, one click rendered it two-column.
- **Collapse to zero, not to an icon stub** — which is what forces the button into the
  control row beside the tabs rather than into the rail: the tight measured case clears the
  breakpoint by only 18px, so a ~48px surviving strip would put the preview back under it.
  One stable icon in a fixed position, `aria-expanded` carrying the state. Hidden, not
  unmounted, so the rail's scroll position and StyleTab's UI memory survive.
- **Both Step 0 platform checks came back negative** and both fallbacks were taken.
  (a) `className` on an `<s-box>` is a **`tsc` error** — Polaris's JSX types accept only a
  component's own props plus `key`/`ref`/`slot`/`children` — so the hide rule hangs off a
  hyphenated `data-` attribute (hyphenated JSX attribute names skip excess-property
  checking, which is also why the ARIA typechecks) rather than the planned wrapper `<div>`,
  which would have demoted the rail from grid item to nested child and re-entered the
  unpainted-sliver bug. (b) `<s-button>` **drops `aria-expanded`/`aria-controls`** — measured
  against the live CDN build: only `accessibilityLabel` reaches the shadow `<button>`, and
  the host carries no role at all — so the toggle is a plain
  `<button className={styles.segBtn}>`, the same imported chrome the tab segments use.
  Shipping a sighted-users-only toggle state into the one rail that spent feature 57 Step 12
  closing that gap was not acceptable.
- **One defect the plan did not predict:** collapse/expand drifted the rail's scroll offset
  ~36px _per cycle_. Not the zero-rect `getBoundingClientRect()` hazard the plan named (that
  is real, is now guarded in `useScrollRegionHeight`, and did **not** move the drift) — it is
  Chrome **scroll anchoring** re-compensating a re-laid-out hidden subtree. `overflow-anchor:
none` on `.railScroller` fixes it; pixel-identical across six cycles.
- **The honest limit stands, and is now the whole story:** under ~1420px the
  Style tab still cannot show a truthful desktop table _and_ the knobs at once. Collapse
  trades the knobs for width; it is look-then-adjust, not adjust-and-watch. If the friction
  is reported again the answer is a
  fixed-1100px `transform: scale()` preview, **not** a second panel and **not** a re-added
  modal — recorded in `76-…` so it is not re-derived. Tripwired files untouched; no
  rows/styling/assignment changed (the SaveBar never appeared). Details + three corrections
  in `76-…`.

**Full-size preview modal (feature 75, doc `75-…`) — 🗑️ REMOVED 2026-07-25 (shipped &
verified earlier the same day)**

- **Removed at the merchant's request** after they used both surfaces: the collapsible rail
  (feature 76) answered the width problem on its own, so the modal was carrying a second
  way to do one thing — a second surface to explain, keep truthful, and re-verify on every
  preview change. Deleted: `PreviewModal.tsx`, the control-row trigger + `PREVIEW_MODAL_ID`,
  `deviceView.ts`'s `modalPreviewHeight` / `MODAL_CHROME_PX` / `MODAL_PREVIEW_*`,
  `tabViewMemory.ts`'s `setPreviewDevice`, `SpecTablePreview`'s `availableHeight` override
  and the `preview` render prop's `options` argument, and their 13 unit tests (883 → 870).
  **Kept:** `SegmentedControl.tsx`, the verbatim extraction feature 75 made — `EditorShell`
  uses it for both its tab group and its device toggle, so it survives as a plain shared
  component. Full gate re-run green; `SpecTableEditor.module.css` / `RowGrid.tsx` still
  byte-clean. The doc `75-…` is kept as the record (its root-cause analysis is what feature
  76 is built on) with a REMOVED banner; everything below its "The design" heading
  describes code that no longer exists.
- **What the removal does NOT change — the root cause, which is why feature 76 exists:**
  `previewDeviceWidth("desktop")` is `"100%"`, so "Desktop" is only as wide as the leftover
  editor column (viewport − admin chrome − the 18.75rem Style rail − `.stage` padding ≈ 640px
  at 1277 CSS px), genuinely under `spec-table.css`'s 749px mobile breakpoint. The preview was
  telling the truth about a 640px desktop. **🚫 Never fix this by lowering 749** — Dawn's
  breakpoint, drift-guarded, and it would change what real shoppers see on phones. The two
  height-budget rules the modal used (`useScrollRegionHeight` is meaningless in a centred
  dialog; a ResizeObserver on the modal body is circular, since an `<s-modal>` sizes to its
  content) are recorded in `75-…` should a dialog-hosted preview ever be revisited.

**Content-free tables render nothing (feature 74, doc `74-…`) — ✅ shipped & verified 2026-07-23**

- Merchant report: a brand-new template's Style/Settings preview showed a bare grey box.
  Root cause was **not** the preview — the starter scaffold's blank SECTION_HEADER had no
  emptiness gate at all, so it rendered as a content-free `__section` band (BANDED default =
  `rgba(0,0,0,.06)`), and a merchant who saved + activated + assigned it would ship that band
  to a live product page. Two render-time gates, hand-mirrored in `spec_table.liquid` and
  `specTablePreviewHtml.ts`: **R1** a section header whose label is blank after trimming is
  skipped (tested trimmed, emitted untrimmed); **R2** if no row survives its gate, emit
  nothing — no wrapper, no empty `<table>`. The Liquid **captures the body first** and emits
  the wrapper only if a `has_content` flag was set, because the `<div>` used to open before
  the loop and a data cell's emptiness is undecidable without rendering it against the live
  product; one pass, no double-render. Rows JSON is untouched — suppression is render-time
  only, so blank rows still round-trip into the editor grid.
- Also closed a **latent preview/storefront divergence**: the empty-state gate was
  `fragment.includes("<tr")`, which wrongly replaced a legitimate named-but-empty collapsible
  section (a `<details>` with no `<tr>`) with the empty state. Emptiness now decides once,
  upstream in `renderSpecTableHtml`, where both renderers agree.
- **Out of scope (R3):** a section with a REAL label whose rows are all hidden still renders —
  authored content, and suppressing it would contradict the locked Step 9a empty-collapsible
  decision. Logged under Open Questions; a test pins it so it can't leak in.
- Live-verified end to end on the dev store, storefront included (a temporary probe proved
  `assign`-inside-`capture` survives on the real Liquid runtime, and that all 9 authored
  sections of the 44-row DJI template are kept). Details + two plan corrections in `74-…`.

**Desktop preview inner scroll (feature 73, doc `73-…`) — ✅ shipped & verified 2026-07-23**

- The Desktop browser mockup no longer grows without bound: the shim-measured content
  height is **clamped** to the available viewport (pure `browserScreenHeight` in
  `deviceView.ts`), so a long table scrolls INSIDE the window like a real browser while a
  short one still hugs its content exactly as in feature 72 (clamp, not fit — merchant's
  call; always-filling would put dead space under a short table). Both mockups now share
  one `useScrollRegionHeight` ref; Desktop measures `.browserScreen` (below the chrome
  bar) so no `BROWSER_CHROME_PX` constant can drift against the CSS. Preview documents get
  `html { scrollbar-width: thin }` (preview-only ambient, outside the drift-guarded
  `SPEC_TABLE_CSS`). Iframe pipeline, `DevicePreview.module.css`, and the tripwired files
  untouched.

**Editor device-preview mockups (feature 72, doc `72-…`) — ✅ shipped & verified 2026-07-22**

- The Desktop/Mobile previews now render inside a device mockup: Desktop = a browser
  window (traffic-light dots + faux address pill, fills the column; auto-height until
  feature 73 clamped it to the viewport); Mobile =
  a light, thin phone frame (subtle border + speaker pill) whose screen fits the available
  viewport height (`useScrollRegionHeight`), capped at a phone-shaped max (2026-07-23
  follow-up: pure `phoneScreenHeight` + `PHONE_SCREEN_MAX_PX` 812 in `deviceView.ts`, so a
  tall monitor no longer stretches the phone), and scrolls internally. Device shadows are
  sized to fade out INSIDE `.stage`'s padding (it clips: `overflow-x: auto` ⇒ both axes),
  geometry centralized as `--appx-device-shadow-offset/-blur`. Chrome wraps the iframe
  in a new `DevicePreview.module.css` (all colours as centralized custom props);
  the iframe pipeline (renderer, height shim, sandbox, live styling) and the tripwired
  `SpecTableEditor.module.css` are untouched. Live-verified on the dev store.

**Editor sidebar inner-scroll (feature 71, doc `71-…`) — ✅ shipped & verified 2026-07-22**

- Style/Settings rail now scrolls internally (bounded to the iframe viewport via the
  reused `useScrollRegionHeight` + a new `EditorShell.module.css` `.railScroller`) so the
  long Style rail no longer scrolls the preview off-screen. **Only the rail scrolls**
  (merchant choice); preview keeps natural height. Tripwired `SpecTableEditor.module.css`
  / `RowGrid.tsx` untouched. Full gate green; live-verified on the dev store (Style rail
  scrolls to "Reset to theme defaults" with preview anchored; Settings same; Content unchanged).
- **Follow-up 2026-07-23 — rail scrollbar rides the panel edge.** A scrollbar paints on its
  scrolling element's _border_ edge, so while the wrapping `s-box` owned `padding="base"` on
  all four sides the rail's scrollbar floated ~1rem inside the grey panel with a dead strip to
  its right. The box now sets `paddingInlineEnd="none"` and `.railScroller` owns that one
  gutter itself (`padding-inline-end: var(--s-space-base, 1rem)`), so the scrollbar hugs the
  panel edge while the controls stay inset exactly as before. The rail also takes
  `scrollbar-width: thin` — a full-width platform scrollbar reads as a window edge against a
  18.75rem rail; same standard property, same no-`::-webkit-scrollbar`-fork call as the device
  previews' `PREVIEW_AMBIENT` (feature 73). Landmark, `useScrollRegionHeight`,
  and the tripwired files unchanged. Full gate green; live-verified on the dev store.
  _(The editor's OTHER visible gutter — the empty ~16px right of the app's own document
  scrollbar — is Shopify's, not ours: admin's `.Polaris-Scroll` sets `scrollbar-gutter: stable`
  and lays the app iframe inside `\_ScrollbarSafeArea_`, 16px narrower. Not removable from
inside the iframe; it only stops being visible if the app document itself stops scrolling —
today it overflows by roughly the `.tipsFooter`height, which`useScrollRegionHeight`'s flat
`BOTTOM*PAD_REM = 3` does not budget for. Unfixed; see Next Up.)*

**Device previews — Reshell Phase D (feature 49, steps 1–8; docs `49-…`–`56-…`)**

- Read-only Desktop / Mobile storefront previews in the editor: toggle swaps the stage (1),
  pure storefront-markup renderer (2), sandboxed iframe (3), shared `spec-table.css` via a
  drift-guarded string copy (4), device-width sizing (5), content-driven auto-height via
  `allow-scripts` + `postMessage` (6), a11y / read-only / empty-state / dynamic-pill (7),
  docs + sign-off (8). **Tablet removed 2026-07-22.**

**Product assignment engine — features 37–48 (merchant-complete)**

- 37 (`37-…`): data foundation — `add-assignment` migration, `ProductAssignment(Index)`,
  `assignmentScope.ts`, shop-scoped `assignment.server.ts`.
- 38 (`38-…`): pure scope-overlap resolver (`assignmentOverlap.ts`, set-algebra).
- 39 (`39-…`): cross-dimension existence probe (`assignmentConflict.server.ts`,
  `products(query,first:1)`, fails closed, injection-safe).
- 40 (`40-…`): routing-projection builder + `add-routing` migration (`ShopStorefrontRouting`).
- 41 (`41-…`): shop routing metafield writer + `[shop.metafields.app.routing]` TOML (deployed).
- 42 (`42-…`): activation pipeline + DRAFT→ACTIVE dry-run gate wired into both status surfaces
  (atomic block on conflict, routing rebuild on ACTIVE-set change).
- 43 (`43-…`): storefront 3-tier resolution (`spec-table-resolve.liquid`: override →
  byProduct → exclude gate → broad tiers → default handle).
- 44 (`44-…`): scope-picker UI + rich conflict banner (`SettingsTab.tsx`; gate over PENDING scope).
- 45 (`45-…`): EXCLUDE carve-outs (all-products-except-X; gate subtraction; storefront reorder).
- 46 (`46-…`): multi-value scopes — server (1..N INCLUDE for PRODUCT/COLLECTION; Decision C).
- 47 (`47-…`): multi-value scopes — UI (multi-select picker → chip cards, full-set loader).
- 48 (`48-…`): templates-list dynamic assigned-product count (per-scope, batched Admin query, fail-soft). _Live-render on the dev store still pending._

Design lock (2026-07-07, `data-model.md` §5/§9): **rigid block-on-conflict**, one scope per
template (all / product / type / vendor / collection), no `priority`; broad rules via one
shop-level routing metafield resolved in Liquid by handle; per-product `metaobject_reference`
only for bounded overrides. Materialization (`ProductAssignmentIndex`) deferred post-MVP.
Multi-value applies to PRODUCT + COLLECTION only. No migrations needed for the 45–48 series.

**Storefront (features 34–35)**

- 34 (`34-…`): Theme App Extension first pixel — `extensions/product-specs-table/`, declarative
  TOML metaobject + `metaobject_reference` product metafield (both `public_read`), semantic `<table>`.
- 35 (`35-…`): value-part resolution — `spec-table-value.liquid` resolves
  `SHOPIFY_FIELD` / `METAFIELD` / `TEXT` / `LINE_BREAK`; whole-cell `hideWhenEmpty`; 50-row chunking.

**Editor build — 13-step order + Step 9.5 (features 02–15)**

- Step 1 (`02-…`): `app/utils/rows.ts` reducer + static rows + add/delete/duplicate + 200-row cap (`MAX_TEMPLATE_ROWS`).
- Step 2 (`03-…`): segmented value cell + pills + toolbar + row gutter; `afterId` insert; `ADD_SECTION`.
- Step 3 (`04-…`): review & harden Steps 1–2 (comment-only fixes; not-fixed items → "Step 3 Follow-ups").
- Step 4 (`05-…`): single contenteditable value surface — linear caret model (`valueParts.ts` + `valueDom.ts`); inline pills; `LINE_BREAK`; `INSERT_VALUE_PART_AT`.
- Step 5 (`06-…`): "Insert field" modal shell + caret save/restore (App Bridge `shopify.modal`).
- Step 6 (`07-…`): native Shopify fields list (`shopifyFields.ts`) + create/edit modal; `SET_VALUE_PART`.
- Step 7 (`08-…`): modal search/filter (`filterNativeFields`); deferred auto-focus.
- Step 8 (`09-…`): fetch product metafield definitions (`metafieldDefinitions.server.ts` + resource route); shop isolation.
- Step 9 (`10-…`): selectable metafield section → real `METAFIELD` pill (`filterMetafieldDefinitions`).
- Step 9.5 (`11-…`): Save → Postgres → app-owned metaobject sync → read-back. `rowsSerialize.ts` (server-authoritative key finalization); `metaobjects.server.ts` (`$app:appx_spec_table`, PUBLIC_READ); contextual SaveBar + dirty baseline.
- Step 10 (`12-…`): mouse drag reorder (`@dnd-kit`; pure `MOVE_ROW`).
- Step 11 (`13-…`): keyboard reorder + a11y (`KeyboardSensor`, SR announcements). Closes reorder.
- Step 12 (`14-…`): parse pasted clipboard tables (`clipboardTable.ts` + `clipboardTableDom.ts`); log only.
- Step 13 (`15-…`): bulk-insert rows from paste (`gridToPastedRows` + `PASTE_ROWS`, cap-truncated). Closes clipboard paste.

**Reshell to the mockup — Phase A (features 16–18)**

- A2 (`16-…`): presentational `EditorShell` chrome (segmented tabs + device toggle + sidebar slots).
- A3 (`17-…`): bounded inner-scroll — only the rows list scrolls (`useScrollRegionHeight` + sticky header).
- A1 (`18-…`): extracted `useRowEngine` + presentational `ContentTab`/`RowGrid`/`RowActionsToolbar`/`InsertFieldModal`; `SpecTableEditor` now a thin wrapper. Behavior-preserving. **Closes Phase A.**

**Template lifecycle + templates-list (features 19–28 + trims)**

- Create-on-first-save (`19-…`): "Create template" opens the editor seeded with a starter scaffold; Postgres row created on first Save.
- Lifecycle actions (`20-…`): header ⋯ Rename/Duplicate/Delete + status badge; `duplicate`/`delete` server fns; metaobject deleted before Postgres.
- Paste refinements 1–4 (`21-…`–`24-…`): content-first intent, insert-after-active, replace-pristine-scaffold, confirm-before-cap.
- List polish (`25-…`–`28-…`): 2-line name clamp, per-row ⋯ menu, immediate Rename, client-side status filter (`templateFilter.ts` + `shouldRevalidate`).
- Name cap raised 100 → 255 (internal-only, not synced to storefront).
- Duplicate in-flight feedback (App Bridge global loading), shared-fetcher `busy` race gate, SaveBar-hide before Delete redirect.

**Editor bulk delete (`29-…`, `33-…`)**

- Per-row select checkbox + contextual bulk bar + count-gated confirm modal; pure `DELETE_ROWS`; tristate "select all" header checkbox; selected-row highlight.
- Undo toast (`33-…`): pure `RESTORE_ROWS` restores the exact pre-delete snapshot; 10s "Undo"; `savingRef` guard so Undo can't mutate during a save.

**Keyboard cell navigation (`30-…`–`32-…`)**

- Pure vertical-nav resolver `gridNav.ts` → keyboard/DOM wiring `useGridKeyboardNav.ts` (`Ctrl/Cmd + Arrow`) → manual-advance editor tips footer (WCAG-safe, no auto-rotate).

**Template status change (`36-…`)**

- Status (DRAFT/ACTIVE/ARCHIVED) changeable from two surfaces (list ⋯ modal + editor Settings tab); both re-sync the storefront metaobject. Shared `validateTemplateStatus`, `setTemplateStatusForShop`, extracted `templateSync.server.ts`.

**MVP UI trims (2026-07-11/12, UI-only projections)**

- Scope picker offers only No products / All products / A specific product (`HIDDEN_SCOPE_KINDS` + `VISIBLE_SCOPE_OPTIONS`; full source of truth unchanged).
- Status picker + list filter offer only Draft / Active (`HIDDEN_STATUS_VALUES`, `STATUS_FILTER_OPTIONS`); `ARCHIVED` re-enable is a one-line removal; badge tone kept.
- Editor page width → `inlineSize="large"` to match the templates list.

**Foundation**

- Shopify app template (React Router / TS) + PostgreSQL (Neon) + Prisma; app installed on the dev store; session + shop record in Neon.
- Shop-scoped `app/models/template.server.ts` (`shopId` in every where/data); `/app/templates` read-only list; single dynamic editor route `app.templates_.$id`.

**Testing & tooling**

- Phase 1 unit tests (Vitest, standalone `vitest.config.ts`); Phase 2 shop-isolation tests (mocked Prisma).
- CI gate (`.github/workflows/ci.yml`: typecheck → lint → format:check → test → build), Dependabot, `context/app-store-review-checklist.md`.
- Dependency security pass (`npm audit` → 0); CodeRabbit review fixes (shop-scoped writes, `:focus-visible` ring, `updateMany`→`update`).

---

## Next Up

1. **Reshell Phase B2** — built-in preset gallery (Style tab steps 13–14), **specced
   2026-07-27 as feature 88, doc `88-…`**. Every blocker is cleared and there is **no
   migration** (`basedOnPreset` already exists, unwritten since Step 4).
   **The plan is derived from SEVEN merchant-supplied reference tables**, not invented:
   four axes define a pattern (pair layout · section headers · row separation · frame)
   plus one behavioural axis (collapsible); everything else in `STYLING_FIELD_NAMES` is
   tuning _within_ a pattern.
   ⚠️ **This overturns the "must land in the preset bundles" note repeated across 78–85.**
   A bundle sets **structure only** — no colour, no typography, no density, no width — so
   bundles are 0–3 fields, all nine swatches stay null after a pick, and the zero-config
   theme-inherit promise survives a preset pick intact. Five cards: **Banded `{}`** (the
   app's default already IS the dominant retail pattern, so it merges with the planned
   "use my theme's styles" option) · Simple · Minimal · Multi-column (`GRID`) · Accordion.
   **No bundle ships `GRID` + `STRIPES`** still holds — now for free, since no bundle
   names a divider style other than `NONE`.
   Two decisions that must be built in Step 13 rather than retrofitted: the gallery is a
   **route** (`/app/templates/styles`), not a modal, and the "Customized" hint compares a
   **fixed `PRESET_SCOPED_FIELDS` set**, NOT `stylingEquals` over all 34 fields (which
   would break the moment Step 89's accent themes write a colour) and NOT the bundle's own
   keys (Banded's `{}` would compare nothing). **Feature 89 = accent / colour themes**,
   deferred by merchant decision with its six seams cut in 88.
   (**Feature 88**; 82/83/84 stay reserved, 86 = Style tab reorganization, 87 = plain
   section header. Before those: 70 = stacked-semantics, 71 = sidebar inner-scroll,
   72 = device-preview mockups, 73 = desktop preview inner scroll, 74 = content-free
   tables, 75 = full-size preview modal (removed), 76 = collapsible Style rail,
   77 = container stretch, 78 = width + outer border, 79 = column divider, 80 = section
   separation + gap, 81 = section header typography, 85 = multi-column row flow — a
   retired number is still spent.) Then C (Settings display rules) → E (assignment into
   the reshell) → F (top-bar status/save + cleanup).
2. **Section band radius / chevron position / animated open-close (proposed 82 / 83 / 84).**
   The rest of the same merchant report feature 81 answered. Each is its own unit for a
   recorded reason — see "Deliberately out of scope" in `81-…`: a radius behaves differently
   on a `th` under `border-collapse` than on a `<summary>` and needs a gap to look right; a
   right-aligned chevron means abandoning `list-style-type` for a pseudo-element, which
   already broke once against Horizon's `summary { list-style: none }`; and height animation
   needs `::details-content` + `interpolate-size`, so it is progressive-enhancement only and
   must be reduced-motion guarded. 🚫 Not the JS `grid-template-rows` trick — that breaks the
   zero-JS `<details>` invariant.
3. **Storefront table semantics in stacked layouts (feature 70)** — code shipped;
   screen-reader pass still owed (see Open Questions). ⚠️ **Now blocking feature 85**
   (below), which would be the third `display`-departure riding on the same unverified
   ARIA chain. Run the pass before building it.
4. **Feature 85 sign-off — one blocker left.** The build is done and fully live-verified
   (see Completed; both deferred checks closed 2026-07-26), but it is deliberately NOT
   marked shipped: ⚠️ the **feature-70 screen-reader pass** (item 3) was its stated
   blocker and was skipped at the merchant's instruction. Run it — and if the roles are
   wrong, feature 70's own instruction is "revert, do not patch", which now costs three
   consumers rather than two. One data point in its favour: Chrome's accessibility tree
   under `display: grid` still exposes table/rowgroup/row/rowheader/cell on the live
   storefront, but that is not the same as a screen reader ANNOUNCING the pairs.
   Also decide whether to clear the DJI template's saved minimum of 400: **240 measured
   511px shorter** on that table.
5. **Editor page should not scroll at the document level** — the app document overflows the
   iframe by roughly the `.tipsFooter` height (it renders BELOW the card, outside
   `useScrollRegionHeight`'s flat `BOTTOM_PAD_REM = 3` budget), producing a stray outer
   scrollbar stranded beside admin's reserved 16px scrollbar gutter. Fix = measure the actual
   footer/card bottom instead of the hardcoded 3rem. Touches the measurer both scrollers share,
   so it is its own unit.
6. **Templates-list Phase 2** — search / sort / pagination (server-side, with pagination) when the list can grow large; multi-select bulk actions later.
7. **Pre-submission** — mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) + Billing (`prd.md`, `context/app-store-review-checklist.md`).

**Deferred:** editor bulk-delete range-select (Shift+click) + Delete/Backspace shortcut; per-product overflow materialization + a bulk apply-to-all styling route.

---

## Step 3 Follow-ups (tracked)

- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops, so they can point at a never-added row. Unreachable today (buttons disabled at cap); guard on `!atCap` if a future keyboard/programmatic add bypasses the disabled button.

---

## Open Questions

- **Can `TWO_COLUMN` express a section gap via `border-collapse: separate`? (raised
  2026-07-28 while speccing feature 94 — the one option nobody has costed.)** The existing
  in-repo rejection at `stylingControls.ts:463` rules out a transparent
  `border-block-start` on the section `th` because collapsed-border width resolution eats
  the previous row's 1px divider — sound, but it assumes `border-collapse: collapse`, which
  `spec-table.css:151` sets unconditionally. Under `separate` there is no shared edge to
  contest, so a transparent top border plus `background-clip: padding-box` would open a
  real gap with the band intact; scoping it to
  `.appx-spec-table--section-gap.appx-spec-table--layout-two-column` means **no existing
  table changes border model**, so the no-repaint law survives. Deliberately NOT in
  feature 94: switching border models re-resolves every row divider, the column rule and
  feature 78's outer border at once (a different system boundary, and feature 86's lesson
  was not to bundle them), and it needs a real `.harness/` matrix first —
  `border-spacing: 0`, the `LINES` rule on a section's last row, the label/value seam, and
  the outer border, across all three header styles. Feature 94 ships `STACKED` + `GRID`
  without it; this decides whether the default layout ever gets the knob.
- **Collapsible section titles do not inherit the table's typography (found 2026-07-26 while
  specing feature 81; pre-existing since Step 9a).** `--appx-spec-font-size` / `-font-style` /
  `-line-height` are declared on `.appx-spec-table__table` (`spec-table.css:141–143`), and the
  collapsible shape is `<details><summary>…</summary><table>…</table></details>` — the summary
  is a **sibling** of the table, not a descendant. So Text size = Large grows flat section
  titles and leaves collapsible ones untouched. Closing it means adding the three vars to the
  summary rule, which repaints every live collapsible table with a non-null `fontSize` — a
  no-repaint-law decision of its own, not a rider on 81. (Feature 81 is unaffected either way:
  `headerFontSizePx` is absolute px on the summary's own rule, which is precisely _why_ it is
  px and not an em-scale keyword — an em multiplier would resolve against two different bases
  depending on the shape.)
- 🔴 **Stacked-mode `<table>` semantics — screen-reader pass NOT run (feature 70).**
  `rowLayout=STACKED` and the mobile stacked layout apply `display: block`, dropping implicit
  table semantics. Code shipped 2026-07-20 (`f6ac4aa`): a static unconditional ARIA role chain
  (`role="table"/"row"/"cell"`) in both hand-mirrored markup sites, plus `specTableAriaContract.test.ts`
  which parses `spec-table.css` for `display: block` rules and fails if any such class lacks a role.
  Attributes are present and inert live (zero visual change by construction). **Done-when #4 of
  `70-…` is unmet:** no assistive tech has confirmed the pairs are announced, and the spec's
  **falsifier** is unchecked — explicit ARIA can _suppress_ native table affordances, so the
  two-column control case must be compared before/after. Needs NVDA or VoiceOver at desktop **and**
  ≤749px. **If it regresses, revert (`<dl>` back on the table) — do not patch.**
- **R3 — orphan titled sections (feature 74, deferred).** A section header with a REAL label
  whose rows are all hidden still renders as a lone titled band. Authored content, so it was
  deliberately left alone: suppressing it would contradict the locked Step 9a decision
  (`spec_table.liquid`: "a section whose rows are all hidden renders as an empty
  collapsible — no new emptiness logic"). Belongs with the Phase C display rules below.
  A test in `specTablePreviewHtml.test.ts` currently pins the render-it behavior.
- **Should activation warn on a content-free template?** Since feature 74 a merchant can set
  an empty template ACTIVE and assign it, and it renders nothing, silently. A DRAFT→ACTIVE
  advisory would be friendlier, but today's activation gate is a hard _block_ mechanism for
  conflicts; adding a soft warning lane is its own unit.
- **Settings-tab "Display rules"** (mockup's `hide rows with empty values` / `show section dividers` / `show on mobile`) are dummy — each needs a real definition + reconciliation with the per-row `hideWhenEmpty` flag before building (Phase C).
- **Style tab B2/B3 build-time details to lock:** the knob-value bundles for the five built-in presets (Classic / Striped / Banded / Stacked / Accordion); the `density` padding-scale values; save-as-preset overwrite UX + copy; whether the creation gallery gets a "don't show again" escape.
- **Top-bar name-edit affordance:** inline title edit vs a Rename ⋯ item — settle when the top bar (Phase F) is built.
- Best storefront event strategy for selected-variant changes across themes.

---

## Key Decisions (still load-bearing)

> Decisions that still constrain future work. Historical/superseded logs were removed in
> compaction — see git history for the originals.

- **Custom React editor — no AG Grid** (2-column, ≤200 rows, `valueParts` token editor). DnD via `@dnd-kit`. Pill model is **pick-then-insert** (modal outside the contenteditable; never an empty placeholder pill). Row cap is the single shared `MAX_TEMPLATE_ROWS` (UI + server).
- **Value model:** `LINE_BREAK` value part for hard breaks (no inline rich formatting/links in MVP). `hideWhenEmpty` is whole-row, never per-line.
- **View toggle:** Edit is the only editable segment; Desktop/Mobile are **read-only storefront previews** (Phase D), no separate WYSIWYG panel. **Tablet removed 2026-07-22.** **Shared preview device (2026-07-22):** the chosen device (Desktop/Mobile) is one value shared across all three tabs; edit-vs-preview is per-tab (`tabViewMemory.ts` `ViewMemory = { device, modes }`) — Content opens on the grid, Style/Settings auto-open a preview, picking a device on any tab moves every _previewing_ tab to it; dropping a tab to Edit affects only that tab and retains the shared device. **Collapsible rail (2026-07-25, feature 76) is the ONE answer to the width problem:** because the inline Desktop preview is narrower than the storefront's 749px breakpoint on a laptop, a toggle beside the tab group collapses the Style/Settings rail to zero width, handing the stage the full card (never an icon stub: the tight case clears 749 by only 18px). ONE boolean shared by Style and Settings, in-memory, resets on reload; hidden not unmounted so the rail's scroll position survives; absent on Content. A **full-size preview modal** (feature 75) shipped as a second answer the same day and was **REMOVED 2026-07-25** — the merchant kept only the rail, so `PreviewModal`, `PREVIEW_MODAL_ID`, `modalPreviewHeight`, and `setPreviewDevice` are gone and the `preview` render prop is back to one argument. Under ~1420px the Style tab still cannot show a truthful desktop table and the knobs simultaneously; the only fix for that is a fixed-1100px `transform: scale()` preview, which is deliberately NOT built and is NOT a re-added modal (see `76-…`).
- **Color policy:** the app _uses_ color via CSS variables as one source of truth (admin mirrors Polaris; storefront inherits theme but is merchant-overridable). The "no hardcoded hex literal" rule is CSS hygiene — use Polaris tokens / `currentColor` / custom properties (e.g. runtime-captured `--appx-token-color` for the pill blue). This rule does **not** encode the Edit-grid-never-styled binding rule (see Binding rules above).
- **Save/status model (mockup):** App Bridge contextual SaveBar (Save/Discard) + header status dropdown + ⋯ menu; no separate "Save as draft". Save freezes the editor (`inert`) in-flight; baseline reset uses the **submitted** snapshot (data-safety race fix).
- **Persistence/keys:** key finalization is **server-authoritative** ("is this row id already persisted?"), never re-derived. Metaobject is **app-reserved** (`$app:appx_spec_table`); deleted _before_ Postgres on delete so a storefront-readable entry can't outlive its template.
- **App-owned definitions are declarative TOML** (slice 1): the `$app:appx_spec_table` metaobject and the `$app:spec_table` product `metaobject_reference` are declared in `shopify.app.toml`, distributed on deploy/install. Runtime `metaobjectDefinitionCreate` removed; `Shop.metaobjectDefinitionGid` vestigial. Metaobject _entries_ are still written at runtime via `metaobjectUpsert`.
- **Assignment model — rigid block-on-conflict + shop-level routing (2026-07-07, `data-model.md` §5/§9).** One scope per template (`scope`+`scopeValue`+`mode`); overlaps between ACTIVE templates are **blocked at DRAFT→ACTIVE** (merchant decides — no silent precedence, no priority knob; `priority` column dormant). Overlap check is O(rules) Postgres set-algebra + `products(query,first:1)` existence tests, never a catalog scan. Broad rules deliver as O(1) entries in one `[shop.metafields.app.routing]` json metafield, resolved in Liquid via `metaobjects["$app:appx_spec_table"][handle]`. Per-product `metaobject_reference` survives only for bounded overrides; `ProductAssignmentIndex` is sparse.
- **Style tab design (2026-07-18 — `admin-screen-plan.md` §Tab 2, `data-model.md` §5/§10, PRD, code-standards).** One spec-table primitive with **orthogonal style knobs** (row layout, mobile behavior, section headers, collapsible sections via native `<details>` zero-JS, row dividers incl. zebra `stripeBgColor`, density). Modal/drawer containers + multi-column flow rejected. **Presets = COPY semantics** (built-ins as code constants; phase-2 merchant-saved `StylePreset`) copy values into per-template `TableStyling` **real columns**, not `extraStyles`; `basedOnPreset` is provenance only. **No shop-level default styling record** (copy keeps edits side-effect-free on live storefronts). Storefront delivery via the metaobject `styling` json field (no TOML change): layout knobs → wrapper modifier classes, colors/typography → CSS variables. **Typography:** `fontSize` = S/M/L theme-relative presets or bounded Custom px (10–184, clamped; JSON number on the wire, digit-string in the DB); `lineHeight` (TIGHT/NORMAL/LOOSE) + `labelCase` (DEFAULT/UPPERCASE, labels only) + `fontStyle` kept; font-family/letter-spacing/wrap/per-side padding rejected.
- **Testing strategy:** Vitest; Phases 1–2 done (unit + shop-isolation, mocked Prisma); reach Phase 4 (route loaders/actions + GDPR webhooks) before App Store submission, E2E (Playwright) fast-follow. Polaris web components don't render in jsdom → editor UI is browser-verified, pure logic unit-tested. Full doc: `~/.claude/plans/there-is-no-automated-encapsulated-yeti.md`.
- **Embedded-app verification:** the editor is a cross-origin iframe (top frame can't read its DOM/AOM/console); verify via Claude-in-Chrome on the `shopify app dev` preview + direct Postgres/Neon checks. Polaris CDN-build gotchas → `polaris-web-component-gotchas` memory. Admin GraphQL runtime is 2025-10 — validate against that, not the TOML's 2026-07.
