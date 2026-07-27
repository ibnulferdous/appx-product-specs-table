# Step 90 — the canned sample + the preset preview card

**Status:** ✅ **complete 2026-07-27** — 1055 → **1072** tests.
**Parent feature:** `88-style-preset-gallery.md` (binding design — read it first).
**Position:** step 2 of 4. Previous `89-style-preset-engine-persistence.md` ✅.
Next `91-style-preset-gallery-route.md`.
**Depends on:** `app/utils/stylePresets.ts`, `renderSpecTablePreviewDocument`
(`specTablePreviewHtml.ts:393`) — both shipped.
**Migration:** none. **No route, no persistence, no merchant-visible change.**

---

## What this step is

Two things and no page to put them on:

1. **The canned sample** — one set of fake spec rows, reused by every card.
2. **The preview card component** — renders one `StylePreset` as a card with a
   live mini-table inside, plus the no-preview **Blank** variant.

Step 91 lays six of these out on a route. Cutting the card out first means the
route step is layout and wiring only, and it means the riskiest thing in the
whole feature — **five scaled iframes on one page** — gets built and measured on
its own rather than discovered during page assembly.

---

## First: delete what the create-time-only decision orphaned

Do this **before** writing anything new, so the new code is not built against
exports that are about to go.

The 2026-07-27 decision — presets are pickable only while creating a template —
cut the planned in-rail picker. Two of step 89's engine exports lost their only
consumer:

| export | in `useRowEngine.ts` | action |
| --- | --- | --- |
| `basedOnPreset` | state → snapshot → payload | ✅ **keep** — still the whole write path |
| `applyStylePreset` | mutator | 🚫 **remove** — the `/new?style=` loader seeds server-side; no client picks |
| `isCustomizedFromStylePreset` | derived flag | 🚫 **remove** — the hint was the rail's |

Removing `applyStylePreset` also drops the `seedStylingFromPreset` /
`normalizeStylePresetStamp` / `isCustomizedFromPreset` imports from the engine.
`resetStyling` still clears the stamp — that behaviour is unrelated to the rail
and stays.

⚠️ **In `app/utils/stylePresets.ts`, KEEP everything.** The domain module is
consumed by the model layer, the loader, and its own tests. Two functions need
their doc comments corrected rather than deleted:

- `isCustomizedFromPreset` — **now has no consumer.** Keep it, and say so in the
  comment: retained for feature 93 (accents) and the B3 saved-preset phase, both
  of which want exactly this comparison. Six tested lines; deleting and
  re-deriving it later costs more than the comment does.
- `PRESET_SCOPED_FIELDS` — its doc comment justifies itself by the hint. Rewrite
  the justification: with the hint gone it earns its place as the **executable
  form of the structure-only rule** (two test guards are stated in terms of it),
  and feature 93 still appends the accent colours to it.

**Expected test movement: none.** Every `stylePresets.test.ts` guard is written
against the domain module, not the engine, so all 1055 must still pass. If a test
breaks here, the deletion went too far.

---

## The canned sample

New file: `app/routes/app.templates_.choose-style/sampleRows.ts` — or wherever
step 91's route directory lands; keep it beside the card, not in `app/utils`,
because it is presentation fixture data and nothing outside the gallery reads it.

**One generic sample reused by all five previews** (doc 88, open question 2).
Not per-category content — that is the starter-content idea the merchant
explicitly rejected, arriving through the back door.

Shape requirements, each with a reason:

| requirement | why |
| --- | --- |
| **2 section headers**, ~3 rows each | Fewer than 2 sections and the section-header axis is invisible — Banded vs Plain vs Text-only is the difference between three of the six cards. |
| **~6–8 value rows total** | Enough tracks for `GRID` to actually flow into columns; a 3-row sample renders Multi-column as one column and the card lies. |
| **One long-ish value** | The wrapping behaviour is half of what distinguishes the layouts (feature 85: narrower tracks wrap more, so smaller is taller). |
| **Generic vocabulary** | "Material", "Weight", "Warranty" — plausible for any store. No electronics, no apparel; a category-flavoured sample is a category starter in disguise. |
| **STATIC row ids** | The preview renderer keys off them. `newRowId()` would produce different markup on every render for no benefit and would defeat any memoisation. |

Rows must be real `EditorRow`s built through the shared `rows.ts` types — not a
hand-shaped object literal that merely resembles one. If the row contract
changes, this fixture must fail to compile.

---

## The preview card

New component, colocated with the route: one `StylePreset` in, one card out.

### Preview rendering — the pipeline, not a screenshot

Render through **`renderSpecTablePreviewDocument`** (`specTablePreviewHtml.ts:393`),
the same function the editor's device previews use, into an **iframe** — exactly
as `SpecTablePreview.tsx` does. Read that component before writing this one; it
already solved sandboxing, the shared stylesheet, and auto-height (features
51/52/54), and this must not fork a second answer to any of them.

**Why the pipeline and not static thumbnails:** zero drift against the storefront
is the entire reason that pipeline exists. A thumbnail goes stale silently — the
worst possible failure for a gallery, because the card would keep promising a look
the app no longer produces, and nothing would fail.

**The cost is real and this step owns measuring it.** Five iframes on one page is
the single most expensive thing in feature 88. Record on the step's completion
note: how long the gallery takes to become interactive, and whether the frames
render in parallel. If it is bad, the fallback is a shared stylesheet with scaled
`<div>`s rather than per-card documents — but do not pre-emptively optimise;
measure first, on the real page, in step 91.

### Scale, don't shrink

The mini-table must be the **real** table at a real width, visually scaled down —
not the table rendered into a narrow box. Rendering narrow triggers the mobile
and wrapping behaviour and would show every card in its mobile form, which is
precisely not what the card is advertising.

### The card is a control, not a decoration

Whatever wraps the preview must be a **real interactive control** — a link or a
button, reachable by Tab, activated by Enter/Space, with a visible focus ring. A
`<div onClick>` with a preview inside is unreachable by keyboard and unnamed to a
screen reader.

Its accessible name is the preset **label**; the description is associated help
text, not part of the name. **The iframe is decorative** and must be hidden from
assistive tech — the merchant is choosing a look, and a screen-reader user
should hear "Minimal — no bands and no rules, spacing does the work", not the
fake sample's rows read aloud six times over.

⚠️ Feature 70's stacked-layout screen-reader pass is owed on the storefront
table; **do not try to pay it here.** Hiding the iframe is what keeps this card
out of that debt entirely.

### The Blank variant

**Blank is not a `StylePreset` and must not be faked into one** (doc 88). It is a
separate, simpler card:

- **no iframe, no preview** — its output is pixel-identical to Banded's, and two
  identical thumbnails in one grid read as a bug
- text only: a title and one line, e.g. *"Start with your theme's own styles —
  nothing added."*
- it must be visibly a **different kind of choice**, not a sixth look
- it targets `/app/templates/new` with **no `?style=` param**

Implement it as an explicit second variant of the card component (or a sibling
component) rather than a `preset === null` branch threaded through the preview
path — the two share a frame and nothing else.

---

## Tests

jsdom cannot render Polaris web components, so JSX is tested by reading the
source off disk — the established technique
(`styleTabContract.test.ts`, `specTableAriaContract.test.ts`). Strip comments
before matching, as those files do, or the guard counts its own documentation.

**The sample fixture** — real assertions, not shape-echoes:
1. It parses as valid `EditorRow[]` through the shared parser.
2. It contains **at least 2 `SECTION_HEADER` rows** — the axis three cards depend
   on. Assert the count, not "some".
3. It contains at least 6 non-header rows, so `GRID` has something to flow.
4. Row ids are unique and stable across two imports (no `newRowId()` leak).
5. It renders through `renderSpecTablePreviewDocument` **for every one of the five
   presets** without throwing, and the five outputs are **not all identical** —
   the cheapest possible proof that the bundles reach the rendered markup at all.

**The Multi-column guard, stated by name:**
6. The sample rendered under `multi-column` emits `--layout-grid` in the
   document's classes. This is the one bundle that touches markup-adjacent
   behaviour, and a sample too small to flow would silently render it as a
   single column.

**The card:**
7. The card source contains no `<div onClick` / `onClick` on a non-interactive
   element — it is a link or a button.
8. The iframe carries an aria-hidden (or equivalent) attribute.
9. The Blank variant renders **no iframe** — asserted against the Blank branch
   specifically, since a global "there is an iframe somewhere" check would pass
   on the pattern card alone.

**Regression:**
10. Full suite green at **1055** after the engine deletions, minus nothing. Any
    drop means a live guard was removed with the dead code.

### Mutation-test the one guard that matters

Test 6. Shrink the sample to 2 rows and confirm the `--layout-grid` / flow
assertion fails — a sample too small to demonstrate Multi-column is the specific
way this fixture goes quietly wrong. Revert.

### Full gate

`npx vitest run` · `npx tsc --noEmit` · `npx eslint app` · `npx prettier --write`
· `npm run build` — all clean, new total recorded.

---

## Live verification — deferred to step 91

**There is no page to open.** The card has no route until step 91 mounts it, and
a throwaway harness route would verify a thing we are about to delete.

Step 91 owns these, listed here so the debt is visible from this file:

1. All five previews render, and each looks like the pattern it names.
2. **Blank shows no table** and reads as a different kind of choice.
3. **Measure the five-iframe cost** — time to interactive, parallel or serial.
4. Tab reaches every card; focus is visible; Enter activates.
5. A screen reader announces the label + description, **not** the sample rows.

---

## Deliberately out of scope

- The route, the layout, the back link, `?style=` seeding → step 91/92.
- Per-category sample content — the rejected starter-content idea.
- Any change to `SpecTablePreview.tsx` or the device previews. If this card needs
  something that component has, **extract it**; do not edit the editor's preview
  to suit the gallery.
- `SpecTableEditor.module.css` / `RowGrid.tsx` — still byte-clean against
  `a7b304c`.

---

## Completion checklist

- [x] `applyStylePreset` + `isCustomizedFromStylePreset` removed from the engine
- [x] `isCustomizedFromPreset` + `PRESET_SCOPED_FIELDS` doc comments corrected
- [x] Canned sample built from real `EditorRow` types, static ids
- [x] Card renders via `renderSpecTablePreviewDocument`, iframe hidden from AT
- [x] Blank variant renders no preview
- [x] Tests 1–10 passing; mutation on test 6 run and reverted
- [x] Full gate green, new test total recorded
- [x] `context/progress-tracker.md` updated
- [x] Committed with a message naming feature 88 step 90

---

## What was actually built

| file | what |
| --- | --- |
| `app/routes/app.templates_.choose-style/sampleRows.ts` | the canned table — 2 section headers, 7 data rows, static `sample-*` ids |
| `…/StylePresetCard.tsx` | `StylePresetCard` (live preview) + `BlankStyleCard` (no preview) |
| `…/StylePresetCard.module.css` | card frame, focus ring, the scale geometry |
| `…/sampleRows.test.ts` | 8 tests — fixture shape + the pipeline |
| `…/StylePresetCardContract.test.ts` | 9 source-text tests — control, a11y, Blank |
| `app/routes/app.templates_.$id/useRowEngine.ts` | two exports removed; three comments rewritten |
| `app/utils/stylePresets.ts` | doc comments only — no behaviour change |

The directory contains **no `route.tsx`**, so `flatRoutes()` does not turn it into
a route. Nothing imports the card yet, so it is absent from the build output
entirely — verified, and expected until step 91.

### Three findings worth carrying forward

**0. The card is sized by the page it will sit on** (merchant decision
2026-07-27: **two cards per row**, in an `inlineSize="base"` `<s-page>`).

🔴 **SUPERSEDED — the number below is WRONG, and step 91 corrected it. Left in
place because the mistake is the lesson.** Base is not documented in pixels, so
it was measured on the dev store by reading `/app/additional` off a screenshot:
**1086px**. Step 91 asked the page itself instead — a temporary ladder of
`@container (width >= Npx)` rules, each printing its own threshold — and got
**966px**, capped there at both a 1600px and a 2400px window. 120px out.

The original arithmetic, and what it produced:

```
card    = 480 preview + 24 padding + 2 border = 506px
one row = 506 × 2 + 16 gap                    = 1028px   (does NOT fit 966)
```

So `--appx-preset-scale: 0.6` **never fit**: the grid still made two tracks, each
card overran its track by ~26px, and every preview was cropped on the right where
the crop happened to land in the table's empty margin. The corrected figures are
**scale 0.55**, card 466, row 948 in 966 — see
`91-style-preset-gallery-route.md` findings 4–6, which also fix the separate
`max-width: 100%` overflow bug this hid behind.

⚠️ **The method is the takeaway.** A container's width is a question the browser
answers exactly if you ask it in CSS. Counting pixels in a scaled screenshot gave
a number that was wrong by 120px and survived two sessions and a merchant review,
because everything downstream was derived consistently from the same mistake.

The scale change from the 0.4 first shipped is not only about fit: preview label
text goes from ~6.4px to **~8.8px**, which is the difference between seeing that
a pattern has rows and being able to read them.

⚠️ **This constrains step 91**: the gallery grid is
`repeat(2, minmax(0, 1fr))` inside `<s-page inlineSize="base">`. Do not use
`auto-fit` — the two-per-row layout is a decision, not a fallback. (Step 91 adds
a `@container` one-column fallback below 948px, which is not the same thing:
`auto-fit` would seat a *third* card on a wide admin.)

**1. `800px` is a hard floor, not a taste call.** The render width has to clear
the storefront stylesheet's **749px mobile breakpoint**. Below it every card —
Banded, Simple, Multi-column alike — renders in its `--mobile-stacked` form, so
all five thumbnails converge on one stacked shape and the gallery distinguishes
nothing. This is the whole "scale, don't shrink" rule reduced to one number, and
it is recorded in the CSS beside the value.

**2. The viewport height was wrong on the first try, and only looking caught
it.** 470px left a visible band of dead white under every card. Cut to **420px**
— the tallest pattern (Banded, ~395px) plus slack. No test could have found this;
it was found by rendering all six into a static harness page and looking at them.

**3. Test 6's class check is not sufficient on its own, and the doc's framing hid
that.** `appx-spec-table--layout-grid` is emitted from `styling` alone, so it
appears on a two-row sample just as readily — the class cannot see that the card
is showing a single column. The test therefore also counts RENDERED data rows
(`scope="row"` occurrences, so a `hideWhenEmpty`-dropped row does not count). The
mutation confirms it: shrinking the sample to 3 rows fails the 🔴 test, and the
class assertion inside it still passes.

### Verification

`npx vitest run` **1072 passed** · `npx tsc --noEmit` 0 · `npx eslint app` 0 ·
`prettier --write` · `npm run build` ✓.

**Mutation on test 6** — sample sliced to 3 rows: the 🔴 Multi-column test failed
on the rendered-row count (as did the ≥2-sections and ≥6-data-rows guards).
Reverted.

**Looked at, off-route.** All six cards were rendered into a throwaway static
page (deleted) and inspected: five visibly distinct; Banded's bands vs Simple's
plain titles vs Minimal's ruleless rows all legible at 0.4 scale; Multi-column
flows into **3 columns**; Accordion shows disclosure markers and the section gap;
Blank reads as a different kind of choice. This is not the step-91 live check —
it verified the geometry, not the page.

**Live, on the dev store:** an existing template was opened after the engine
deletions and the editor loaded and hydrated normally — the one regression
surface the deletions could have had. The Style rail itself was not exercised:
its segmented control does not respond to synthetic clicks inside the embedded
admin iframe ([[embedded-admin-iframe-automation]]). It is covered by `tsc` +
the build + the rail's own coverage contract test, and by step 91's live pass.
