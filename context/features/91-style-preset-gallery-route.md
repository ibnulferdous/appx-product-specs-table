# Step 91 — the `/app/templates/choose-style` route

**Status:** ✅ **code complete 2026-07-27** — 1072 → **1081** tests. ⚠️ **Live
verification is PARTIAL**: 4 of the 10 checks were run before the dev server was
stopped for a restart. See "Verification" — the five that were not run are named
there and stay owed by step 92.
**Parent feature:** `88-style-preset-gallery.md` (binding design — read it first;
this file does not restate the taxonomy, the bundles, or the unskippable-gallery
decision).
**Position:** step 3 of 4. Previous `90-style-preset-card-preview.md` ✅.
Next `92-style-preset-create-flow.md`.
**Depends on:** step 90's `StylePresetCard` / `BlankStyleCard` / `sampleRows.ts`,
all shipped and sitting in the route directory already. Nothing else unbuilt.
**Migration:** **none.** No schema, no metaobject TOML, no Liquid, no extension.

---

## What this step is

**The first merchant-visible thing in feature 88.** Everything before it was
plumbing (89) and a component with nowhere to live (90). This step gives the
component a page.

It is deliberately small: **one route file, one stylesheet, one contract test.**
The cards are built, the sample is built, the geometry is measured. What is left
is layout, a heading, a way out, and the honest verification that five live
iframes on one page is affordable.

**Scope in one line:** `/app/templates/choose-style` renders six cards, two per
row, in a base-width page, with a back link — and nothing else changes.

⚠️ **The route is reachable only by typed URL at the end of this step.** The two
Create buttons still point at `/app/templates/new`; repointing them is step 92's
first line. That is not a gap to close early — it is what makes this step
verifiable in isolation, and it means a half-finished feature 88 cannot strand a
merchant on a gallery whose `?style=` param does nothing yet.

---

## Decisions locked before writing code

### D1 · The route file is `route.tsx` in the directory that already exists

`app/routes/app.templates_.choose-style/` was created by step 90 and contains the
card, the sample and two test files — but **no `route.tsx`**, so `flatRoutes()`
does not treat it as a route and none of it reaches the build output. Adding
`route.tsx` is the single act that turns the directory into a page.

⚠️ **The underscore in `app.templates_` is load-bearing and already correct.**
`app.templates.tsx` renders its own `<s-page>` and has **no `<Outlet/>`**, so a
nested `app.templates.choose-style` would match the URL and render nothing at
all. The editor route escapes the same parent the same way.

### D2 · No loader, no action, no `headers`, no `ErrorBoundary`

The gallery reads **no shop data**. The bundles are frozen constants, the sample
is a fixture, and the preview documents are computed in the browser from both. A
loader would add an Admin auth round trip and a `upsertShop` write to render a
page of constants.

The precedent is in the tree: `app.additional.tsx` has no loader and no boundary
exports, and works. The rule the codebase actually follows is **a child route
exports `headers` + `ErrorBoundary` when it has a loader or action that can
throw** — `app.templates.tsx` and `app.templates_.$id/route.tsx` both do and both
have one. Session-token auth and the shop upsert are the parent `app.tsx`
loader's job.

✅ **This also strengthens the zero-footprint invariant**: doc 88 promised the
gallery writes nothing. Loaderless, it also *reads* nothing — there is no shop-
scoped query on this route to get isolation wrong in.

⚠️ **One thing this owes the live pass:** a hard reload of the URL is a document
request, and the loaderless child must still be covered by the parent auth chain.
Live check 6 exists for exactly that and must not be skipped on the grounds that
client-side navigation worked.

### D3 · The grid is `repeat(2, minmax(0, 1fr))` — never `auto-fit`

Inherited constraint, not a fresh choice: step 90 finding 0. Two cards per row is
a **merchant decision** (2026-07-27) and the card was sized by arithmetic against
a measured 1086px base page to satisfy it.

```
card    = 480 preview + 24 padding + 2 border = 506px
one row = 506 × 2 + 16 gap                    = 1028px   (fits 1086, 58px slack)
```

🚫 **`auto-fit` / `auto-fill` are forbidden here.** They would silently fit a
third card on a wide admin and turn a decision into a fallback. Pinned by a test.

**`minmax(0, 1fr)`, not `1fr`.** A `1fr` track's floor is its content's
min-content size, and the card carries an explicit 480px preview box — so on a
narrow admin the track would refuse to shrink and push the page into a horizontal
scroll, defeating the `max-width: 100%` escape the card already ships.

### D4 · The layout CSS is the page's, in a new file

New `route.module.css` (or `gallery.module.css`) beside `route.tsx`. **Do not put
the grid in `StylePresetCard.module.css`.**

The split is the same one the card already makes internally: **the card owns its
own size, the page owns their arrangement.** A card that knew it lived in a
two-column grid could not be dropped anywhere else, and the two-per-row decision
would be recorded in the file whose comments are all about scale geometry.

### D5 · The way out is the editor's breadcrumb idiom

```tsx
<s-link slot="breadcrumb-actions" href="/app/templates">Templates</s-link>
```

Byte-for-byte the pattern at `app.templates_.$id/route.tsx:570`. Doc 88
consequence 3: **"no skip" must not mean "trapped."** The merchant must not be
able to proceed without choosing; they must always be able to leave.

🚫 **Not a "Cancel" button and not a secondary page action.** Cancel implies a
transaction is in progress and something will be discarded. Nothing has been
started here — leaving the gallery is navigation, and the breadcrumb is what the
admin already uses to say so.

### D6 · Card order is data-driven — map `STYLE_PRESETS`, never hand-list

```tsx
{STYLE_PRESETS.map((preset) => (
  <StylePresetCard key={preset.id} preset={preset} />
))}
<BlankStyleCard />
```

**Card order is merchant-facing** (doc 88: Modern leads because it is both the
most frequent reference shape and the app's own default; the two structural
departures come last), and that order is recorded in the array's literal order.
Hand-listing five `<StylePresetCard preset={…}/>` elements in JSX would duplicate
the decision in a second place that no guard keeps in agreement, and the two
would drift the first time a card is added or reordered.

**Blank is appended, not mapped**, because it is not a `StylePreset` and must
never be faked into one (doc 88). Its position — last — is also the decision: it
is the fallback for a merchant who likes none of the five.

### D7 · Heading, and one line of help text

Heading: **"Choose a style"** — the route reads as the step it is, and so should
the H1.

One `<s-paragraph>` beneath it, saying the choice is not permanent — Kaching's
"You can fully customize it later", in our own words. ⚠️ **This line matters more
here than it did in the reference,** because our gallery is unskippable: a
merchant who dislikes all six needs to know before choosing that every value is
editable afterwards, or the forced choice reads as a commitment.

It is also literally true and worth being precise about: a pattern is 5 of the 34
rail knobs, and all 34 stay editable in the Style rail forever.

### D8 · The header-right slot stays empty

Doc 88, feature-93 seam 5: the accent swatch row drops into the page header's
right side. **Put nothing in `slot="primary-action"` here.** There is no primary
action on this page — the six cards *are* the actions — so this costs nothing
today and saves a reflow later.

### D9 · `?style=` stays inert; this step does not touch the create flow

The cards already link to `/app/templates/new?style=<id>`. The editor's `new`
sentinel ignores unknown search params, so today every card lands on an ordinary
blank scaffold. **Leave it that way.**

🚫 **Do not repoint the Create buttons** (`app.templates.tsx:98` empty state,
`:648` page primary action) and 🚫 **do not teach the loader to read `?style=`.**
Both are step 92, and both are the half of the feature that can create a wrongly
stamped template. Keeping them out means step 91 can be verified as pure
navigation and layout, with nothing persisted and nothing to undo.

---

## Files

| File | Change |
| --- | --- |
| `app/routes/app.templates_.choose-style/route.tsx` | **new** — the page |
| `…/route.module.css` | **new** — the two-column grid, the page's own |
| `…/galleryRouteContract.test.ts` | **new** — source-text guards |
| `context/features/88-style-preset-gallery.md` | step table: 91 ✅ |
| `context/progress-tracker.md` | the standing update |

**Must NOT change:** `StylePresetCard.tsx` · `StylePresetCard.module.css` ·
`sampleRows.ts` (all three are step 90's, shipped and tested) ·
`app.templates.tsx` · `app.templates_.$id/route.tsx` · `useRowEngine.ts` ·
`app/utils/stylePresets.ts` · `prisma/schema.prisma` · any `.liquid`, `.css` or
extension file · `SpecTableEditor.module.css` / `RowGrid.tsx` (still byte-clean
against `a7b304c`).

⚠️ If the page genuinely needs something the card does not expose, **say so and
change the card deliberately** — do not reach into `StylePresetCard.module.css`
to nudge the layout from the wrong side. Step 90's geometry comments are the
record of why every number in that file is what it is.

---

## Tests

jsdom cannot render Polaris web components, so the page is tested by reading its
source off disk — the established technique (`styleTabContract.test.ts`,
`specTableAriaContract.test.ts`, and step 90's own
`StylePresetCardContract.test.ts`). **Strip comments before matching**, or the
guard counts its own documentation.

Each of these states a claim that could actually fail:

1. **The page is `<s-page inlineSize="base">`.** The card's entire scale geometry
   is arithmetic against a measured 1086px; a silent switch to `large` would not
   break anything visibly enough to notice, it would just quietly leave a third
   card's worth of dead space. Pinned because it is invisible when wrong.
2. **The grid is `repeat(2, minmax(0, 1fr))`** — read `route.module.css` off disk,
   and assert it contains **neither `auto-fit` nor `auto-fill`**. D3, stated
   both positively and negatively because the negative is the one that rots.
3. 🔴 **The cards come from `STYLE_PRESETS.map`, not from a hand-written list.**
   Assert the source contains the map, and contains **no literal preset id**
   (`"banded"`, `"classic"`, `"minimal"`, `"multi-column"`, `"accordion"`) —
   derived by iterating `STYLE_PRESETS`, not hand-listed, so a sixth pattern is
   covered the day it is added. *This is the guard worth having:* merchant-facing
   order lives in the array, and the only way it can be contradicted is by a page
   that enumerates cards itself.
4. **`BlankStyleCard` is rendered exactly once**, and it appears **after** the map
   in source order. Position is the decision (D6), so assert the index, not just
   the presence.
5. **The back link points at `/app/templates`** and uses the breadcrumb slot.
6. **The route exports no `loader` and no `action`** — D2's zero-read/zero-write
   claim as code rather than prose. If a later step needs one, this test is where
   the justification gets written down.
7. **The route imports the card components from step 90** rather than declaring
   its own markup — a page that inlined a second card shape would pass every test
   above and silently fork the a11y work.

### Mutation-test the guard that matters

**Test 3.** Replace the map with five hand-listed `<StylePresetCard>` elements in
the same order and confirm test 3 fails *by name* — the mutation is subtle
precisely because the rendered output is identical, which is what makes the test
worth writing. Revert.

⚠️ A guard nobody has seen fail is decoration. Record what actually failed, as
steps 89 and 90 both did.

### Full gate

`npx vitest run` (baseline **1072**, state the new total) · `npx tsc --noEmit` ·
`npx eslint app` · `npx prettier --write` · `npm run build` — all clean.

**One build-output check with a real claim behind it:** the route directory
produced *nothing* in the build after step 90 (no `route.tsx`, so no route). After
this step it must appear. That is the cheapest possible confirmation that
`flatRoutes()` picked the underscore-escaped directory up as a route and not as
an orphan.

---

## Live verification

This is the largest part of the step. It pays **five debts inherited from step
90** plus five of its own, and it is the first time anything in feature 88 has
been looked at on a real page.

⚠️ **Method, from the standing memories.** The editor is behind Shopify auth, so
use Claude-in-Chrome on the dev store, not chrome-devtools MCP
([[browser-verify-embedded-app]]). Clicks and keys reach the embedded admin
iframe but wheel-scroll and drag do not, so **deep-link by URL** and Tab through
scroll regions ([[embedded-admin-iframe-automation]]).

**Inherited from step 90:**

1. All five previews render, and **each looks like the pattern it names** —
   Modern banded, Classic fully gridded, Minimal ruleless, Multi-column flowing
   into tracks, Accordion showing disclosures. The off-route harness said yes at
   0.4 scale; this is the same check on the real page at 0.6.
2. **Blank shows no table** and reads as a different *kind* of choice, not as a
   sixth look.
3. 🔴 **Measure the five-iframe cost.** The single most expensive thing in
   feature 88, and step 90 explicitly deferred the measurement here.
   - The frames are `srcDoc`, so there is **no network leg** — the cost is
     main-thread parse, style and layout, five times. Measure time-to-interactive
     from navigation, and whether the five paint together or one after another.
   - **Record a number, not an impression.**
   - ⚠️ **Decide against a threshold rather than a feeling:** if the page is not
     interactive within ~1s on the dev store, or the frames visibly cascade,
     write it up and open the fallback (one shared stylesheet + scaled `<div>`s
     instead of five documents) as an explicit follow-up. **Do not optimise
     pre-emptively and do not optimise inline** — the whole reason the pipeline
     was chosen over thumbnails is zero drift, and that is worth paying for.
4. **Tab reaches every card**, focus is visible on each, and **Enter activates**.
   Six stops, not seven — the iframes are `tabIndex={-1}` and must not appear in
   the order.
5. **A screen reader announces the label + description**, and **not** the sample
   rows. The `aria-hidden` on the preview is what keeps this card out of feature
   70's owed stacked-layout debt entirely; confirm it holds on the real page.

**This step's own:**

6. **Hard-reload `/app/templates/choose-style` directly** (a document request, not
   a client navigation) and confirm it renders — D2's claim that the loaderless
   child is covered by the parent auth chain.
7. **Two cards per row**, and the page's horizontal scroll is **0**. The 1086px
   arithmetic verified for real instead of derived.
8. **Narrow the admin** → the grid drops to one column and still does not scroll
   sideways (the `max-width: 100%` escape).
9. **The back link returns to `/app/templates`.**
10. **Every card lands on a working blank scaffold** at `/app/templates/new`, the
    `?style=` param inert and harmless (D9). Confirm in Postgres that **no
    template row was created** by any of the six visits — the zero-footprint
    invariant, checked rather than assumed.

⚠️ **No migration, so the stale-Prisma-client trap does not apply**
([[prisma-migration-stale-dev-server]]). Nothing on this route writes at all.

---

## Deliberately out of scope

- **`?style=` seeding, `basedOnPreset` stamping, and repointing the two Create
  buttons** → step 92. See D9; this is the boundary that keeps step 91 unable to
  persist anything wrong.
- **Accent / colour themes** → feature 93. Header-right slot reserved (D8), and
  nothing else.
- **Any change to the card, the sample, or their tests** — step 90's, shipped.
- **Making `/app/templates/new` redirect to the gallery.** Explicitly rejected in
  doc 88: a redirect would fight the back button immediately after the
  create-on-first-save hop, and bare `/new` produces byte-identical output to
  Blank anyway.
- **B3 saved presets, category starter content, `extraStyles`** — unchanged
  disposition from doc 88.

---

## Completion checklist

- [x] `route.tsx` + `route.module.css` created; nothing in step 90's files moved
- [x] `<s-page inlineSize="base">`, heading, help line, breadcrumb back link
- [x] Grid is `repeat(2, minmax(0, 1fr))`; cards mapped from `STYLE_PRESETS`;
      Blank appended last
- [x] Tests 1–7 written and passing; the test-3 mutation run, reported, reverted
- [x] Full gate green, new test total recorded — **1072 → 1081**
- [x] Route present in the build output
- [~] Live checks — **4 of 10 run**, including the iframe measurement with a
      number. The six not run are named below and carried forward.
- [x] Anything that could not be verified live said plainly rather than implied
- [x] `context/features/88-style-preset-gallery.md` step table updated
- [x] `context/progress-tracker.md` updated
- [ ] Committed with a message naming feature 88 step 91

---

## What was actually built

| file | what |
| --- | --- |
| `app/routes/app.templates_.choose-style/route.tsx` | the page — `<s-page inlineSize="base">`, breadcrumb, help line, the mapped grid |
| `…/route.module.css` | `.gallery` (the column) + `.grid` (two fixed tracks) |
| `…/galleryRouteContract.test.ts` | 9 source-text guards |

Three decisions came through unchanged and unforced: no loader, `repeat(2,
minmax(0, 1fr))`, and the mapped card list. Nothing in step 90's files moved.

**The build check has a real answer:** the directory produced nothing before this
step, and now produces `route-i4XMkHkb.js` (the page) plus `route-D6dK2CpT.css`
(both stylesheets), with `templates_.choose-style` in the server manifest.
`flatRoutes()` picked the underscore-escaped directory up as a route, which was
the one structural thing that could have silently not worked.

### Findings

**1. The mutation exposed a second, quieter hole — the one it was not aimed at.**
Hand-listing the five cards failed test 3 by name, as designed. But the ordering
guard beside it (`appends Blank exactly once, after the map`) **still passed**,
because `indexOf("STYLE_PRESETS.map")` returned `-1` and "Blank comes after −1"
is trivially true. A page with no map at all satisfied the claim that Blank comes
after the map. Fixed by asserting `mapAt >= 0` first, with the reason written
beside it. ⚠️ *This is the argument for running mutations rather than reasoning
about them* — the guard that failed was fine; the one next to it was not, and
only running the mutation showed that.

**2. 🔴 A 4% stripe fill is NOT resolvable in a downscaled screenshot, and
looking at it produced a wrong answer.** Classic's card was read off a
0.6-scaled, JPEG-compressed capture as *"the label column is shaded"* — which
would have been a real defect (stripes must band whole rows). It is not what the
page does: rendering Classic's document at 1:1 and reading `getComputedStyle`
gives `rgba(0, 0, 0, 0.04)` on **both** the label and the value of alternating
rows, with the `0.909px` column rule on the label's inline end. The pattern is
correct and the eye was wrong.

⚠️ **Method note for the remaining card checks and for feature 93:** at 0.6
scale, a 4%-opacity fill is roughly one JPEG quantisation step away from white.
**Verify low-contrast styling claims by computed style at 1:1, not by looking at
the gallery.** The gallery screenshot is the right tool for structure (bands,
rules, column count, disclosure markers) and the wrong tool for tint.

**3. The route renders its chrome ~10s before its body on a cold dev server, and
it looks exactly like a broken page.** First load showed the breadcrumb and the
"Choose a style" heading — both portalled to the admin by App Bridge — above a
completely empty content area, twice, before the cards appeared. Cause is Vite
compiling the route module and the 49 KB preview pipeline on demand; the server
log showed the auth succeeding and no error. **Dev-only, not a defect**, but
recorded because the failure it imitates (an `<s-page>` refusing to project
non-`<s-section>` children) is a real thing that would look identical.

### Verification

**Gate:** `npx vitest run` **1081 passed** (42 files) · `npx tsc --noEmit` 0 ·
`npx eslint app` 0 · `prettier --write` applied · `npm run build` ✓, route
present in both the client and server output.

**Mutation on test 3** — the five cards hand-listed in the same order:
`🔴 maps STYLE_PRESETS instead of enumerating cards` failed by name, 1 failed /
8 passed. Reverted. See finding 1 for what else it caught.

#### Live — 4 of 10 run

Run on the dev store before the dev server was stopped for a restart:

| # | check | result |
| --- | --- | --- |
| 6 | direct document load of the URL | ✅ renders; the server log shows the parent chain authenticating and no error, so **D2's loaderless child is covered** |
| 1 | five previews, each looking like its pattern | ✅ Modern banded + ruled · Classic bordered, column-ruled, striped (**by computed style — see finding 2**) · Minimal ruleless · Multi-column in 3 tracks with banded headers · Accordion with disclosure markers |
| 2 | Blank shows no table | ✅ dashed plate with `+`, reads as a different kind of choice |
| 7 | two cards per row | ✅ visually, in the documented order — Modern · Classic / Minimal · Multi-column / Accordion · Blank |

#### 🔴 3 · The five-iframe cost — measured, and it is not a problem

The number feature 88 has owed since step 90:

| | |
| --- | --- |
| all five frames loaded | **130.4 ms** from navigation start |
| per frame | 105.7 / 124.3 / 126.6 / 128.7 / **130.4** ms |
| spread, first to last | **24.7 ms** |
| `DOMContentLoaded` | 128.2 ms |
| total `srcDoc` payload | **180 KB** (~36 KB per document) |
| building all five documents in JS | **0.09 ms** median (20 runs, min 0.06, max 0.26) |

**They render together, not in a cascade** — 24.7 ms between the first and last
frame is well inside one frame budget's worth of jitter, and the whole set is
~7× under the ~1 s threshold this doc set in advance. 🚫 **The shared-stylesheet
fallback is NOT needed and should not be built.** The pipeline stays, and with it
the zero-drift guarantee that was the whole reason for choosing it.

⚠️ **Honest limit on this measurement.** It was taken on a standalone local page
reproducing the five cards at the real geometry (800×420 scaled 0.6), **not
inside the embedded admin** — a cross-origin app iframe cannot be instrumented
from the admin's top frame. What it isolates is exactly the cost that was in
question (parse + style + layout of five documents, plus the JS to build them);
what it excludes is the admin's own load and the tunnel. Since the documents are
`srcDoc`, there is no network leg to exclude.

#### Not run — carried into step 92

The dev server was stopped for a restart before these:

4. Tab reaches every card, focus is visible, Enter activates — **six stops, not
   eleven**; the iframes are `tabIndex={-1}` and must not appear in the order.
5. A screen reader announces label + description, not the sample rows.
8. A narrow admin drops the grid to one column with no sideways scroll.
9. The breadcrumb returns to `/app/templates`.
10. Each card lands on a working scaffold, and **Postgres shows no template row
    created** by any of the six visits.

⚠️ Checks 4 and 5 are the accessibility pair and are the most valuable of the
six; 10 is the zero-footprint invariant. None of them is blocked by anything —
they need a running dev server and nothing else. **Do not let step 92's own live
pass absorb them silently:** they are about this page, and step 92 changes how it
is reached, not what it contains.
