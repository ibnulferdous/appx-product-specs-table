# Step 92 — the create flow: Create → gallery → seeded, stamped scaffold

**Status:** ✅ **complete 2026-07-27.** Gate green — 1085 → **1097** tests (43
files), `tsc` 0, `eslint` 0, `npm run build` 0. Both mutations run and reverted.
**Live checks 8 of 9 run, plus the storefront leg**; check 6's empty-state half
is unreachable on a store with templates and is covered by source text instead.
🔴 The build gate caught a trap the plan created — see finding 1.
**This closes feature 88.**
**Parent feature:** `88-style-preset-gallery.md` (binding design — read it first;
this file does not restate the taxonomy, the bundles, the unskippable-gallery
decision, or the route contract table).
**Position:** step 4 of 4 — **the last step of feature 88.** Previous
`91-style-preset-gallery-route.md` ✅.
**Depends on:** step 89's write path (`normalizeStylePresetStamp`,
`saveTemplateForShop`, both action branches), step 89's `seedStylingFromPreset`,
and step 91's live gallery. All shipped. Nothing unbuilt.
**Migration:** **none.** `basedOnPreset String?` has existed since feature 57
step 4 and has been writable since step 89.

---

## What this step is

**The two ends of the wire.** Steps 89–91 built a write path with no writer and a
gallery with no consumer: today the cards link to `/app/templates/new?style=<id>`
and the editor throws that param away. This step connects them, and in doing so
makes feature 88 real for a merchant for the first time.

It is **two edits and a resolver**:

1. the two **Create template** buttons point at the gallery instead of `/new`;
2. the `/new` loader reads `?style=` and seeds the styling **and** the stamp;
3. one small pure function does the reading, so the thing that must not go wrong
   can be tested without a browser.

**Scope in one line:** a merchant who clicks Create ends up on a scaffold that
already looks like the card they picked and remembers which card it was — and
nothing else in the editor changes.

⚠️ **This is the first step in feature 88 that can persist something wrong.**
Steps 89–91 were each arranged to be unable to: 89 had no writer, 91 had an inert
param. From here on a bad `?style=` read can create a template that is styled one
way and stamped another, and the stamp is provenance — nothing downstream
recomputes it, so a wrong one is wrong forever (copy semantics, `data-model.md`
§5). Most of the decisions below are about making that specific failure
unreachable rather than merely unlikely.

---

## Decisions locked before writing code

### D1 · The preset is applied by the LOADER, server-side, before the engine mounts

Not by the gallery (it cannot reach the editor's state), not by an effect in
`useRowEngine`, not by the card's link carrying a serialized bundle.

Four reasons, in order of weight:

1. **Reload survives.** Doc 88 committed to it ("the query param survives
   reload") and the route contract is the mechanism. A client-side apply keyed on
   first mount would be re-applied — or not — on every remount, and the editor
   remounts on Discard and on create-on-first-save.
2. **The seed becomes the dirty BASELINE, not a change.** See D5.
3. **`useRowEngine` already refuses this job**, in a comment written for exactly
   this step: *"There is deliberately NO `applyStylePreset` mutator here… it is
   applied by the `/new?style=` LOADER via `seedStylingFromPreset` before the
   engine ever mounts"* (`useRowEngine.ts:253`). Adding a client apply now would
   contradict a shipped decision rather than extend it.
4. **The bundles never reach the client as data.** The client receives 34 resolved
   values and one id — the same shape it receives for a saved template — so the
   editor keeps having exactly one styling vocabulary.

The seam was cut for this: step 89's loader comment (`route.tsx:136–142`) says
**"Step 92 changes EXACTLY these two lines"**, and it should stay true.

### D2 · One pure resolver, taking `URLSearchParams`, returning BOTH outputs

Add to `app/utils/stylePresets.ts`:

```ts
export function resolveGalleryParams(params: URLSearchParams): {
  styling: StylingValues;
  basedOnPreset: string | null;
};
```

One `findStylePreset` call inside; both outputs derived from its single result.

**Why a function and not four lines in the loader** — two independent reasons,
either of which would be enough:

- 🔴 **It makes the agreement STRUCTURAL.** The failure this step exists to
  prevent is a template seeded from one bundle and stamped with something else
  (or stamped with nothing). Two separate calls — `seedStylingFromPreset(raw)`
  beside `normalizeStylePresetStamp(raw)` — agree today only because both happen
  to be tolerant in the same way, which is a property a future edit can break
  silently. One lookup, two derived outputs, cannot disagree at all.
- **The loader is not unit-testable and this is.** `app.templates_.$id/route.tsx`
  needs `authenticate.admin`, so no test in this repo calls a loader (the only
  route tests are source-text contracts). A pure resolver moves the branch that
  matters into the tested half of the codebase, where every degenerate input can
  be enumerated cheaply.

**It takes `URLSearchParams`, not a `string | null`** — doc 88 seam 4: the route
contract becomes `?style=<id>&accent=<token>`, *"each invalid-or-absent degrading
to the same not-chosen state"*, and the instruction is **not to hardcode a
single-param parse**. With this signature feature 93 adds one line inside the
resolver and changes no call site. The cost is that the tests construct a
`new URLSearchParams("style=classic")` instead of passing a string — trivial, and
it exercises the real decode (a `+`, a `%2D`, a repeated key) rather than a
pre-cleaned value.

🚫 **It does not take the `Request` or the URL string.** Parsing the URL is the
loader's job; the resolver stays framework-free and client-safe like the rest of
`stylePresets.ts`, which is the property that lets one module serve the route,
the seed and the model layer.

✅ **Reuse `seedStylingFromPreset` inside it** rather than reaching for
`parseStylingValues(preset.bundle)` directly. That function is where the accent
merge order lives (`{ ...bundle, ...accent }`); bypassing it would put feature 93
back to retrofitting two places.

### D3 · The read lives INSIDE the `params.id === "new"` branch

`/app/templates/<real-cuid>?style=classic` must be **completely inert** — same
page, same styling, same stamp as without the param.

⚠️ **This is the one way this step could corrupt a saved template.** If the seed
were applied after the branch, a typed or shared URL would hand the editor
styling values that are not what is in Postgres; the merchant's next Save — of
anything, a rename — would write them, and the stamp with them. Silent,
destructive, and indistinguishable from the merchant having restyled the table.

Putting the read inside the branch makes it structurally impossible rather than
conditionally avoided, because the branch `return`s. **Pinned by an index guard
in a contract test** (see Tests), not by a comment.

### D4 · Both Create buttons repoint; nothing else on the list route changes

```
app/routes/app.templates.tsx:98   empty state   → /app/templates/choose-style
app/routes/app.templates.tsx:648  page action   → /app/templates/choose-style
```

Confirmed by grep to be the **only** two links to `/app/templates/new` in `app/`
and `extensions/` outside the gallery's own card component and comments.

🚫 **Do not change the button labels.** "Create template" and "Create your first
spec table template" still describe what the merchant is starting; the gallery is
a step inside that, not a different destination. Renaming to "Choose a style"
would leak an implementation step into the list page's vocabulary.

**`s-button href` carries no new risk here.** `/app/templates/choose-style` is
underscore-escaped exactly like `/app/templates/new`, which these same buttons
already navigate to, so the App Bridge navigation path is unchanged.

### D5 · The seed is the dirty BASELINE — picking a card creates nothing

`useRowEngine` sets `savedMetaJson` from the initial props at mount
(`useRowEngine.ts:429–442`), and `SaveBar open={engine.isDirty}`
(`SpecTableEditor.tsx:83`). So on `/new?style=classic` the editor opens with the
Classic values already in place and the **SaveBar closed** — exactly as bare
`/new` opens today with defaults and no SaveBar.

Three consequences, all of them wanted:

1. **Choosing a card writes nothing to Postgres.** The zero-footprint invariant
   (doc 88) survives the create flow intact: a merchant who picks Classic, looks,
   and leaves creates no row. Verified in Postgres, not by eye (live check 5).
2. **A pick alone is not savable, and should not be.** The merchant must change
   something before create-on-first-save fires. That is existing behaviour of
   `/new`, not a new rule this step introduces, and it is right: a template with
   no content is not a thing to persist.
3. **Discard reverts to the PRESET, not to defaults.** Discard remounts against
   the loader, the URL still carries `?style=`, so the scaffold comes back
   styled. Consistent with Discard's meaning everywhere else ("back to what this
   editor started from") and it falls out of D1 rather than needing code.

⚠️ **`resetStyling` still clears both** (step 89 D4) — a merchant who picks
Classic and then hits Reset before the first save gets theme defaults and a null
stamp. Correct: they no longer have that pattern, so they should not carry its
provenance.

### D6 · An invalid `?style=` degrades silently — no error, no toast, no redirect

`?style=zzz`, `?style=`, `?style=Classic` (wrong case), `?style=bordered` (the
withdrawn card) and a 10 KB string all produce **theme defaults with a null
stamp** — byte-identical to the Blank landing.

`findStylePreset` was built tolerant for exactly this ("never throws, never
guesses"), so this decision costs nothing to honour and only has to be *not
undone*. 🚫 **Do not add a 404, a redirect back to the gallery, or a toast.** The
param is not merchant-authored — it comes from a card — so a bad one means a
stale bookmark or an id removed in a later release, and the right answer to both
is a working blank scaffold rather than an error about a concept the merchant
never saw.

### D7 · Bare `/app/templates/new` is still NOT redirected to the gallery

Restated here rather than left in doc 88, because **this is the step where the
temptation actually lands**: once Create points at the gallery, `/new` looks like
a hole to close. It is not one.

Doc 88's reasoning holds unchanged — a redirect would fight the back button
immediately after the create-on-first-save hop — and there is a second reason now
visible: bare `/new` produces byte-identical output to Blank, so there is no
inconsistent state it could create. It stays reachable by bookmark, typed URL and
back button.

### D8 · Duplicate keeps bypassing the gallery, and keeps the source's stamp

No change. `duplicateTemplateForShop` already copies `basedOnPreset` in full
(`template.server.ts:513`, tested at `template.server.test.ts:930`). A copy
inherits its source's look and provenance, which is what a copy means. Listed as
a decision because "every template now goes through the gallery" is the natural
misreading of the unskippable rule, and it is wrong.

---

## Files

| File | Change |
| --- | --- |
| `app/utils/stylePresets.ts` | **add** `resolveGalleryParams` |
| `app/utils/stylePresets.test.ts` | its tests |
| `app/routes/app.templates_.$id/route.tsx` | the `new` branch reads the param (D1/D3) |
| `app/routes/app.templates.tsx` | two hrefs (D4) |
| `app/routes/createFlowContract.test.ts` | **new** — source-text guards over both files |
| `context/features/88-style-preset-gallery.md` | step table: 92 ✅ |
| `context/progress-tracker.md` | the standing update |

**Must NOT change:** `app/routes/app.templates_.choose-style/*` (step 91's,
shipped and live-verified — the cards already link correctly) ·
`useRowEngine.ts` (D1) · `editorSnapshot.ts` · `template.server.ts` (the write
path is step 89's and is complete) · `stylingToDbColumns` · `parseStylingValues`
· `prisma/schema.prisma` · any `.liquid`, `.css` or extension file ·
`SpecTableEditor.module.css` / `RowGrid.tsx` (still byte-clean against
`a7b304c`).

⚠️ **One guard file is new and it lives at `app/routes/`, not in a route
directory**, because it makes a claim spanning two route files that no single
directory owns: *the Create buttons go to the gallery, and the gallery's param is
honoured by the editor.* Splitting it in two would let one half be deleted with
its route while the other kept asserting a wire that no longer exists.

---

## Tests

Baseline **1085**. State the new total in the completion note.

### `stylePresets.test.ts` — the resolver

Derived from `STYLE_PRESETS` by iteration wherever possible, never hand-listed.

1. **Every preset id round-trips.** For each member: `?style=<id>` yields styling
   deep-equal to `stylePresetValues(preset)` **and** `basedOnPreset === preset.id`.
2. 🔴 **The agreement invariant, over a table of inputs.** For absent, `""`,
   `"zzz"`, `"Classic"`, `"bordered"`, a 10 KB string, `"%2D"`-style encodings and
   every real id: **either** the stamp is a known id *and* the styling equals that
   preset's resolved values, **or** the stamp is `null` *and* the styling equals
   `DEFAULT_STYLING_VALUES`. Never any other combination. *This is the test the
   whole step is arranged around* — it states "seeded but unstamped" and "stamped
   but unseeded" as the same forbidden thing, without naming either.
3. 🔴 **`banded` is stamped even though it changes nothing.** `?style=banded`
   yields styling deep-equal to `DEFAULT_STYLING_VALUES` **and**
   `basedOnPreset === "banded"`. The sibling of step 89's test 5: the Modern card
   is observable *only* through the stamp, so a resolver that skipped stamping
   when the bundle is empty would pass every other test here.
4. **Absent param and unknown param are the Blank landing** — both deep-equal the
   result for a `URLSearchParams()` with nothing in it, which is the same thing
   the bare `/new` loader returns today.
5. **Unrelated params are ignored, including `accent`.**
   `?style=classic&accent=blue&foo=1` resolves exactly as `?style=classic`.
   Feature 93's seam, asserted as "degrades, does not throw" while `accent` is
   still unread.
6. **A repeated `style` key takes the first value** (`URLSearchParams.get`
   semantics), pinned because it is the one place URL decoding could surprise a
   later reader.

### `createFlowContract.test.ts` — the wiring

Source-text guards, comments stripped (the established technique; step 91's
`galleryRouteContract.test.ts` is the nearest model).

7. **`app.templates.tsx` contains exactly two `/app/templates/choose-style`
   hrefs** and, after stripping comments, **no `/app/templates/new` href at all.**
   Both halves matter: the positive count catches a half-done repoint, the
   negative catches a third entry point added later that skips the gallery.
8. 🔴 **The `?style=` read is inside the `new` branch (D3).** Assert the index of
   the `resolveGalleryParams` call falls between the index of `params.id === "new"`
   and the index of `getTemplateByIdForShop`, and that it occurs **exactly once**
   in the file.
   ⚠️ **Assert every index is `>= 0` first.** This is step 91 finding 1 applied
   without having to rediscover it: an ordering guard written on `indexOf` alone
   passes trivially when the thing it is ordering has been deleted.
9. **The loader returns both keys from the resolver**, i.e. the `new` branch's
   `styling` and `basedOnPreset` are no longer the literals
   `DEFAULT_STYLING_VALUES` and `null`. Cheap, and it is what makes guard 8 mean
   "the seed is applied here" rather than "a function is called here".

### Mutation-test the two guards that matter

Both mutations are shaped like a plausible refactor, not like vandalism:

| mutation | expected to fail |
| --- | --- |
| stamp the id but leave `styling` at `DEFAULT_STYLING_VALUES` | test 2 (and 1, 3) |
| move the resolver call above the `params.id === "new"` branch and merge it into both returns | test 8 |

Revert both, and **record what actually failed by name** — including anything
that failed which was not aimed at, the way step 91's mutation exposed the
vacuous neighbouring guard. A guard nobody has seen fail is decoration.

### Full gate

`npx vitest run` (baseline **1085**) · `npx tsc --noEmit` · `npx eslint app` ·
`npx prettier --write` · `npm run build` — all clean.

---

## Live verification

**This step inherits doc 88's whole live plan**, because it is the step where the
plan finally has something to click. The house sequence applies — rail →
Postgres → metaobject → rendered storefront — on DRAFT templates with 0 assigned
products, then one ACTIVE template for the storefront leg.

⚠️ **Method, from the standing memories.** The editor is behind Shopify auth, so
use Claude-in-Chrome on the dev store, not chrome-devtools MCP
([[browser-verify-embedded-app]]); deep-link by URL and Tab through scroll
regions rather than wheel-scrolling ([[embedded-admin-iframe-automation]]); read
Postgres directly rather than trusting the list page ([[neon-cold-start-prisma-connect-timeout]]
if the first query times out).

1. 🔴 **All six cards end to end.** Each of the five patterns → the editor opens
   *already looking like the card*, and the device preview shows the pattern (this
   is the first time a bundle is seen anywhere but a 0.55-scaled thumbnail).
   **Blank → theme defaults, no stamp.**
2. **Save persists both.** Add content, Save, then re-read `TableStyling` in
   Postgres for all six: **five distinct `basedOnPreset` values and one NULL**,
   with the override columns matching each bundle. Check the *create-on-first-save*
   path specifically — it is the branch that had to name the stamp by hand
   (`route.tsx:293`).
3. **Reload `/app/templates/new?style=multi-column`** → the seed is still there
   (D1). Then `?style=zzz` → theme defaults, **no error, no toast** (D6).
4. 🔴 **`/app/templates/<real-id>?style=classic` changes nothing** — D3's claim on
   a real saved template. Compare the Style rail before and after, and confirm no
   SaveBar opens. *If any check in this step is skipped, it must not be this one:*
   it is the only one that guards against corrupting an existing template.
5. **Zero footprint.** Visit all six cards and abandon each without saving;
   confirm in **Postgres** that no template row was created. Count before, count
   after.
6. **Both Create entry points reach the gallery.** The page action is directly
   clickable. ⚠️ **The empty state needs a shop with zero templates**, which the
   dev store is not — if it is not reached, say so plainly and note that guard 7
   covers it by source text rather than implying it was clicked.
7. **Bare `/app/templates/new` (typed)** still opens a working unstyled scaffold
   with no stamp (D7).
8. **Duplicate still bypasses the gallery** and the copy carries the source's
   stamp — read both rows in Postgres (D8).
9. **Back button from the editor returns to the gallery**; the gallery's
   breadcrumb returns to `/app/templates`.

**Storefront leg** (doc 88): one **ACTIVE** template saved from **Multi-column**,
verified on the rendered storefront — `--layout-grid` present in
`styling_css.classes` in `STYLING_FIELD_NAMES` order, tracks laid out, page
overflow 0. Multi-column is the right card for this leg because it is the only
one whose bundle touches markup-adjacent behaviour.

⚠️ **Clean up after check 2.** Six saved templates plus the storefront one are
real rows in the dev store; either delete them or record that they were left, so
the next step's counts start from a known number.

⚠️ **No migration, so the stale-Prisma-client trap does not apply**
([[prisma-migration-stale-dev-server]]).

⚠️ **The Cloudflare quick tunnel drops under heavy local work** (step 91 finding:
Error 1033, twice, both during a full `npm run build`). It looks exactly like an
app crash from inside the admin and is not one — recognise it rather than
debugging the route.

---

## Deliberately out of scope

- **Accent / colour themes** → feature 93. The resolver's `URLSearchParams`
  signature (D2) and the reserved header-right slot (step 91 D8) are the only
  preparation this step makes.
- **Any in-editor preset picker** — cut by the create-time-only decision; D1.
- **Redirecting bare `/new` to the gallery** — D7.
- **Changing the empty state's copy or the buttons' labels** — D4.
- **A "you can change this later" reminder inside the editor.** The gallery's
  help line (step 91 D7) says it at the moment the merchant chooses, which is
  when it is needed.
- **B3 saved presets, category starter content, `extraStyles`** — unchanged
  disposition from doc 88.

---

## Completion checklist

- [x] `resolveGalleryParams` added, exported, documented; one lookup, both outputs
- [x] Loader seeds inside the `new` branch only; step 89's "Step 92 changes
      exactly these two lines" comment updated to say what happened
- [x] Both Create buttons repointed; no `/app/templates/new` href left in the
      list route
- [x] Tests 1–9 written and passing; both mutations run, reported by name,
      reverted
- [x] Full gate green, new test total recorded — **1085 → 1097**
- [x] Live checks run — **8 of 9 plus the storefront leg, including check 4**;
      check 6's empty-state half is unreachable on this store
- [x] Anything not verifiable said plainly rather than implied
- [x] Dev-store rows **recorded, not deleted** (13 templates now); the ACTIVE
      assignment reverted to DRAFT so the storefront is unchanged
- [x] `context/features/88-style-preset-gallery.md` step table: 92 ✅, feature
      status → complete
- [x] `context/progress-tracker.md` updated
- [x] Committed with a message naming feature 88 step 92

---

## What was actually built

| file | what |
| --- | --- |
| `app/utils/stylePresets.ts` | `resolveGalleryParams` — one `findStylePreset`, both outputs |
| `app/utils/stylePresets.test.ts` | 7 resolver guards |
| `app/routes/app.templates_.$id/route.tsx` | the `new` branch resolves `?style=`; `DEFAULT_STYLING_VALUES` import dropped (now unused) |
| `app/routes/app.templates.tsx` | both Create buttons → `/app/templates/choose-style` |
| `app/routes/createFlowContract.test.ts` | 5 wiring guards across the two route files |
| `app/routes.ts` | 🔴 **not planned** — `ignoredRouteFiles` (finding 1) |
| `…/choose-style/route.tsx`, `route.module.css`, `galleryRouteContract.test.ts` | 🔴 **not planned** — stale 1086px comments (finding 4) |

All eight decisions came through unchanged. The step is as small as it was
specced to be: the resolver is 8 lines, the loader change is one destructuring
statement, and the list route changed two attribute values.

### Findings

**1. 🔴 A test file directly in `app/routes/` IS a route, and it broke the
build.** `createFlowContract.test.ts` was placed at the top of `app/routes/` on
purpose (it makes a claim spanning two route directories, so it belongs to
neither). `flatRoutes()` treats **every** file directly under `app/routes/` as a
route module regardless of name or extension, so Vite tried to bundle it *for the
browser*:

```
app/routes/createFlowContract.test.ts (21:9): "readFileSync" is not exported
by "__vite-browser-external"
```

⚠️ **The whole suite stayed green while this was true.** Vitest reads the file
happily; only `npm run build` fails. That is the worst possible split — the
signal arrives at the last gate, and a session that ran tests but not the build
would have committed a repo that cannot ship.

It never fired before because every other contract test lives *inside* a route
directory (`app.templates_.$id/`, `app.templates_.choose-style/`), where
flat-routes only ever looks at `route.tsx`. Fixed at the root rather than by
moving the file, because moving it would have re-attached the guard to one of the
two routes it spans and left the trap armed for the next person:

```ts
export default flatRoutes({ ignoredRouteFiles: ["**/*.test.{ts,tsx}"] });
```

Confirmed after the fix: build exit 0, `createFlowContract` absent from
`build/server/index.js`, and all three real routes still present in the manifest.

**2. Mutation A did not fail the test the doc predicted it would, and the reason
is worth keeping.** Stamping the id while leaving `styling` at the defaults
failed tests 1 and 2 — but **not** test 3 (`banded` is stamped even though it
changes nothing), which the doc listed as expected collateral. Test 3 is
*by construction* insensitive to that mutation: banded's resolved styling **is**
`DEFAULT_STYLING_VALUES`, so a resolver that always returns the defaults still
satisfies it exactly. That is not a weak test — it is aimed at the opposite
failure (a resolver that skips stamping when the bundle is empty) — but the
prediction was wrong and the run is what showed it.

| mutation | predicted | observed |
| --- | --- | --- |
| stamp the id, leave `styling` at the defaults | tests 2, 1, 3 | **2 failed** — `round-trips every preset id — styling AND stamp` + `🔴 never seeds without stamping, and never stamps without seeding` |
| hoist the resolver above the `new` branch | test 8 | **2 failed** — `🔴 resolves INSIDE the new branch, before any template lookup` + `returns the resolved pair, not the old literals` |

Both reverted; suite back to 1097.

**3. "Reads the param exactly once" survived mutation B, and should have.** The
hoisted version still called the resolver once — that guard's job is to stop a
*second* read appearing outside the branch, and the ordering guard is what
catches a read in the wrong place. Two guards, two distinct failures, neither
redundant. Recorded because the pair looks redundant until you watch them
disagree.

**4. Three stale `1086px` comments were still asserting the number step 91
disproved.** Step 91's live pass corrected the base page width from 1086 to 966
and rescaled the cards, but the correction only landed in
`StylePresetCard.module.css` (which narrates it) and in the docs.
`choose-style/route.tsx`, `route.module.css` and `galleryRouteContract.test.ts`
each still stated the old figure and the old 480/506/1028 arithmetic as current
fact. Fixed to 440/466/948 with a pointer to the card file's account of the
correction.

⚠️ **This is the same failure mode the original mis-measurement had**: a number
copied into several places, corrected in one. Worth a rule — when a measured
constant changes, grep the figure, not the file you remember writing it in.

### Verification

**Gate:** `npx vitest run` **1097 passed** (43 files, from 1085) · `npx tsc
--noEmit` 0 · `npx eslint app` 0 · `prettier` clean · `npm run build` **exit 0**
after finding 1.

**Postgres baseline, taken before any live work:** **6 templates**, newest
`2026-07-19`, and **every one of them `basedOnPreset = null`** — so the store has
no pre-existing stamp that a live pass could mistake for one of its own.

#### Live — 8 of 9, plus the storefront leg

| # | check | result |
| --- | --- | --- |
| 6 | Create → gallery | ✅ the list's **page action** navigates to `/app/templates/choose-style`. ⚠️ **The empty-state button was NOT clicked** — it renders only on a shop with zero templates and the dev store has 13. Guard 7 covers it by source text; recorded rather than implied |
| 1 | each card seeds its pattern | ✅ Classic clicked from the gallery → the rail reads **Outline width 1 · Header style Plain · Row dividers Stripes · Column divider Line · collapsing off**, i.e. all four bundle fields. Multi-column → **Row layout Grid**, min column width blank (the stylesheet's 240px). All five confirmed again in Postgres below |
| 2 | Save persists values + stamp | ✅ **five distinct stamps and one NULL**, each row carrying exactly its bundle and nothing else. Via create-on-first-save every time — the branch that names the stamp by hand |
| 3 | seed survives a document load; garbage degrades | ✅ `/new?style=multi-column` typed fresh → Grid. `?style=zzz` → Two-column defaults, **no error, no toast, no redirect** |
| 4 | 🔴 `?style=` inert on a SAVED template | ✅ **the decisive one.** `/app/templates/cms3avu6f…?style=classic` on a saved unstamped template: Outline width **0**, Row dividers **Lines**, Column divider **None** — every value still the template's own, and **no SaveBar opened at any point** |
| 5 | zero footprint | ✅ gallery → Minimal card → back, all without saving: **12 templates before, 12 after** |
| 7 | bare `/new` | ✅ opens a working unstyled scaffold; its save wrote a styling row with **no `basedOnPreset` at all** |
| 8 | duplicate bypasses the gallery | ✅ More actions → Duplicate went straight to the copy's editor, and the copy carries `basedOnPreset: "classic"` plus the full styling |
| 9 | the way out | ✅ browser Back from the editor → the gallery; the gallery's breadcrumb → `/app/templates` |

**The six saved rows, read from Postgres:**

| stamp | non-null override columns |
| --- | --- |
| `classic` | `sectionHeaderStyle: PLAIN`, `rowDividerStyle: STRIPES`, `columnDividerStyle: LINE`, `outerBorderWidthPx: 1` |
| `banded` | **none** |
| `minimal` | `sectionHeaderStyle: PLAIN`, `rowDividerStyle: NONE` |
| `accordion` | `sectionHeaderStyle: TEXT_ONLY`, `sectionsCollapsible: true`, `sectionGapPx: 12` |
| `multi-column` | `rowLayout: GRID`, `rowDividerStyle: NONE` |
| **`null`** (bare `/new`) | none |

🔴 **The `banded` row is the one worth looking at:** a stamp and not one
override. Doc 88 predicted exactly that ("only the `basedOnPreset` stamp
distinguishes it from Blank"), and it is now a real row rather than an argument.
The Blank row beside it is the same styling with no stamp — which is what makes
`null` mean "chose Blank".

✅ **Not one colour column was written by any card.** The zero-config
theme-inherit promise — the standing regression since feature 57 step 1 —
survived a preset pick on six real rows.

#### The storefront leg

The multi-column template set ACTIVE and assigned to one product, then read off
the **rendered storefront** (`appx-dev.myshopify.com`, Horizon):

```
DIV.appx-spec-table appx-spec-table--layout-grid appx-spec-table--mobile-stacked
    appx-spec-table--section-banded appx-spec-table--dividers-none
    appx-spec-table--column-divider-none appx-spec-table--density-default
    appx-spec-table--align-left
tbody: display grid, grid-template-columns 435.636px 435.636px 435.636px
document overflow-x: 0
```

`--layout-grid` present, classes in `STYLING_FIELD_NAMES` order, **three real
tracks** laid out for three rows, page overflow 0 — Material / Dimensions /
Weight side by side, each label above its value. `--section-banded` is there too,
which is multi-column's *deliberate omission* (doc 88 revision 3) arriving on a
live page.

⚠️ **A one-element mis-read, worth recording.** The first probe asked the
`<table>` for its `grid-template-columns` and got `display: block` / `none`,
which reads exactly like "the grid silently failed". The grid is on the **tbody**
— the table element is only the wrapper. Query the element the CSS actually
targets before concluding a layout is broken.

#### Store state — restored, rows left in place

⚠️ **The ACTIVE assignment was reverted to DRAFT** after the storefront leg and
the product page re-checked: **no spec table, overflow 0**. The store's rendered
output is back to what it was before this session.

**The 7 rows created for this pass were left, not deleted** (6 saves + 1
duplicate, all named "Untitled template", all DRAFT, dated 2026-07-27), so the
evidence above is re-readable. Baseline for the next step is therefore **13
templates**, not 6. Deleting them is a one-click row action each if the clutter
is not wanted.

---

## What closing this step closes

Feature 88 ends here. Two claims made three steps ago were only checkable now,
and both were checked:

- ✅ **`basedOnPreset: null` now means something precise** — "the merchant chose
  Blank". The six saved rows are the proof: five distinct stamps and one null,
  with the null row byte-identical in styling to the `banded` row beside it.
- ✅ **The zero-config theme-inherit promise survived a preset pick.** Not one
  colour column was written by any of the six saves. It is the standing
  regression since feature 57 step 1, this was the first feature that could have
  broken it without anyone noticing, and it now has a real row behind it rather
  than a unit test.

What feature 88 shipped, end to end: a merchant clicks **Create template**,
lands on an unskippable gallery of six cards, picks one, and gets a scaffold that
already looks like the card and remembers which card it was — through to
`styling_css` on the rendered storefront.
