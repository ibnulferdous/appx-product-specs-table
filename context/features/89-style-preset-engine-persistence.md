# Step 89 — `basedOnPreset` engine state + write path

**Status:** ✅ **completed 2026-07-27.** Full gate green; tests 1044 → **1055**
(+11). Live verification deliberately deferred to step 90 — see that section.

**Parent feature:** `88-style-preset-gallery.md` (binding design — read it first;
this file does not restate the taxonomy, the bundles, or the structure-only rule).
**Position:** step 1 of 4. Next is `90-style-preset-rail-cards.md`.
**Depends on:** `app/utils/stylePresets.ts` (landed `3714361`). Nothing else unbuilt.
**Migration:** **none.** `basedOnPreset String?` has existed since feature 57
Step 4's migration (`schema.prisma:174`), deliberately unwritten until now.

---

## What this step is

The whole plumbing run for the provenance stamp, and **nothing a merchant can
see**. After this step the column is writable, readable, dirty-tracked and
normalized end to end — but no control writes it yet, so a merchant opening the
editor sees exactly what they see today.

That is the point of cutting it here. Steps 90 and 92 are two different UIs that
both write this one path; building the path first means neither of them has to
carry persistence work, and this step is verifiable without a browser.

**Scope in one line:** a preset id travels merchant → engine → snapshot → payload
→ action → Postgres → loader → engine, and every hop is tolerant of garbage.

---

## Decisions locked before writing code

### D1 · The stamp rides **beside** `stylingToDbColumns`, never inside it

`stylingToDbColumns` obeys a documented round-trip law —
`parseStylingValues(stylingToDbColumns(v))` deep-equals `v`
(`template.server.ts:99`) — and `basedOnPreset` is **not** a member of
`STYLING_FIELD_NAMES`. `parseStylingValues` neither reads nor emits it. Folding
the stamp into that function would either break the law or force the styling
parser to grow a field that is not styling.

✅ Build the upsert columns as a spread instead:

```ts
const columns = {
  ...stylingToDbColumns(parseStylingValues(styling)),
  basedOnPreset: normalizeStylePresetStamp(basedOnPreset),
};
```

**Confirmation this is the right seam:** `template.server.test.ts:362` already
asserts `stylingToDbColumns(...)` has **no** `basedOnPreset` property. Under D1
that assertion stays true and is not edited. If a proposed design requires
deleting that line, the design is wrong.

Only the forward-reference in the doc comment (`template.server.ts:100–101`,
"deliberately NOT emitted — Step 13 (presets) … own those columns") changes, to
say the stamp is merged by the caller and why.

### D2 · The stamp is normalized server-side, never trusted

Add to `stylePresets.ts`:

```ts
export function normalizeStylePresetStamp(value: unknown): string | null
```

Returns `findStylePreset(value)?.id ?? null`. Everything else — an unknown id, a
number, an object, a 10 KB string, a `<script>` — becomes `null`.

Three reasons, in order of weight:

1. **It is an untrusted client value.** The Save payload is JSON the client
   composes; the action must re-validate it the same way `parseRows` and
   `parseStylingValues` re-validate theirs. This is the codebase's standing
   posture, not a new rule.
2. **It self-heals.** A preset removed in a later release leaves stamps behind;
   normalizing on the way in *and* on the way out means those rows quietly read
   as "no pattern" instead of pointing at nothing.
3. **It keeps the column a closed vocabulary,** so a later reader can treat
   `basedOnPreset` as an enum-in-a-string without auditing every writer.

⚠️ `normalizeStylePresetStamp` returns `string | null`, **not** the `StylePreset`.
Callers that need the object call `findStylePreset`. Keeping the normalizer's
return a plain id is what lets the model layer use it without importing a
presentation shape.

### D3 · Full replace, inside the existing `styling !== undefined` branch

The stamp is written in the same nested upsert as the styling columns, for both
`create` and `update`.

**Absent means `null`**, not "leave it alone". That is the law
`template.server.ts` already states for styling ("the write is a full replace,
never a partial patch") and the stamp follows it rather than inventing a second
rule beside it.

🚫 **Not an independent branch.** A `basedOnPreset`-only save would still need a
complete column set for the upsert's `create` arm and would have to invent one
out of defaults — silently clobbering styling on a template that had some. The
coupling to `styling` is the smaller cost, and it is safe because there is
exactly one client and it always sends both. **Document the coupling in the
function's doc comment** so a second caller cannot get it wrong by omission.

### D4 · One engine mutator, so a pick is one undo unit

`applyStylePreset(id)` sets **both** the 34 styling values and the stamp in a
single action. Two separate writes would make SaveBar Discard and the dirty
snapshot see a pick as two changes, and a merchant would have a state where the
values moved but the stamp did not.

The other two mutators are defined by what they *don't* touch:

| mutator | styling values | `basedOnPreset` |
| --- | --- | --- |
| `applyStylePreset(id)` | ← the bundle, resolved | ← `id` |
| `setStylingField(f, v)` | one field | **untouched** |
| `resetStyling()` | ← `DEFAULT_STYLING_VALUES` | ← **`null`** |

`setStylingField` leaving the stamp alone is what makes **"Customized"** reachable
at all — it is the entire mechanism. `resetStyling` clearing it is gap 2 from
doc 88: reset means "no pattern", and a reset template that still claims one would
show a selected card for a look that is gone.

### D5 · The loader resolves the stamp once, server-side

Same shape as `styling`: the server hands the client a settled value, so the
client never decodes a DB row. Normalize on read too — defence at both ends, and
the read path is where a stamp written by an older release actually surfaces.

`/app/templates/new` returns `null` today. **Step 92 changes exactly this line**
to read `?style=` — which is why the loader gets an explicit `basedOnPreset` key
now rather than letting the client dig it out of `template.styling`.

### D6 · The storefront never sees the stamp

No metaobject field, no TOML change, no Liquid, no CSS. `basedOnPreset` is admin
provenance; the storefront gets `styling_css`, which is computed from the 34
values the bundle already copied in. Stated because "add a column" reflexively
suggests "add it to the sync" — here that would leak an implementation detail
into a merchant's published theme data for no reader.

---

## Files to change

| File | Change |
| --- | --- |
| `app/utils/stylePresets.ts` | add `normalizeStylePresetStamp` |
| `app/utils/stylePresets.test.ts` | its tests |
| `app/models/template.server.ts` | `saveTemplateForShop` accepts + writes the stamp; fix the stale doc comment |
| `app/models/template.server.test.ts` | write-path tests |
| `app/routes/app.templates_.$id/route.tsx` | loader returns it; action passes it through **both** branches |
| `app/routes/app.templates_.$id/editorSnapshot.ts` | snapshot carries it |
| `app/routes/app.templates_.$id/editorSnapshot.test.ts` | incl. the Banded case |
| `app/routes/app.templates_.$id/useRowEngine.ts` | state, `applyStylePreset`, `isCustomized`, payload |

**Must NOT change:** `stylingToDbColumns`'s body · `parseStylingValues` ·
`serializeStylingOverrides` · `STYLING_FIELD_NAMES` · `StyleTab.tsx` ·
`prisma/schema.prisma` · any `.liquid`, `.css` or extension file ·
`SpecTableEditor.module.css` / `RowGrid.tsx` (still byte-clean against `a7b304c`).

### The action's two branches both need it

`route.tsx` has a create branch and an edit branch and they are easy to half-do:

- **edit** (`saveTemplateForShop(shop.id, templateId, {...})`) — add
  `basedOnPreset: payload.basedOnPreset`.
- **create-on-first-save** (`route.tsx:264–276`) — the second, styling-only
  `saveTemplateForShop` call after `createTemplateForShop`. Add it there too, or
  a preset picked on a brand-new template is lost on its very first save, which
  is the single most likely path a merchant takes through this feature.

`duplicateTemplateForShop` needs **no change** — it already copies
`basedOnPreset` in full (`template.server.ts:477`, covered by the existing test at
`template.server.test.ts:821`). Re-read that test rather than assuming; do not add
a duplicate of it.

---

## Tests required before this step is "completed"

New tests, each stating a claim that could actually fail:

**`stylePresets.test.ts`**
1. `normalizeStylePresetStamp` returns the id for every member of
   `STYLE_PRESETS` — derived by iterating the array, not hand-listed.
2. It returns `null` for `null`, `undefined`, `""`, `"  "`, `"Banded"` (wrong
   case), `"bordered"` (a withdrawn card), `42`, `{}`, `[]` and a long string.
3. Its output is always `null` or a member of the id set — the closed-vocabulary
   claim from D2, asserted rather than assumed.

**`editorSnapshot.test.ts`**
4. Two snapshots differing **only** in `basedOnPreset` are different strings.
5. 🔴 **The load-bearing one.** With styling left at `DEFAULT_STYLING_VALUES`
   (so `serializeStylingOverrides` is `{}` in both), a snapshot with
   `basedOnPreset: null` differs from one with `basedOnPreset: "banded"`.
   *This is the test that proves picking Banded on an untouched template can open
   the SaveBar at all.* Write the comment explaining that, because a future reader
   will otherwise see it as a duplicate of test 4 and delete it.
6. The existing snapshot tests still pass unedited — adding a key must not change
   what any other field means.

**`template.server.test.ts`**
7. A save carrying `basedOnPreset: "minimal"` writes `"minimal"` into **both**
   arms of the nested upsert (`create` and `update`).
8. A save carrying garbage writes `null`.
9. A save carrying `styling` and **no** `basedOnPreset` writes `null` (D3's
   full-replace law, pinned so a later "leave it alone" refactor fails here).
10. A rows-only / rename-only save (`styling: undefined`) touches the styling
    relation **not at all** — no upsert in `data`. The existing invariant, now
    re-asserted with the stamp in play.
11. `stylingToDbColumns` still emits no `basedOnPreset` (the existing assertion at
    `:362`, confirmed still passing, **not** rewritten).

### Mutation-test the two guards that matter

Tests 5 and 9 are the ones with something to prove. Before marking the step
complete, break each and confirm the *expected* test fails by name:

- Remove `basedOnPreset` from `editorMetaSnapshot`'s object → test 5 fails.
- Change the write to skip the stamp when it is absent → test 9 fails.

Revert both. A guard that has never been seen to fail is decoration.

### Full gate

- `npx vitest run` — all green. Baseline entering this step: **39 files,
  1044 tests**. State the new total in the completion note.
- `npx tsc --noEmit` clean · `npx eslint` clean · `npx prettier --write` applied
- `npm run build` exit 0

---

## Live verification — deliberately deferred to step 90

**There is nothing to click.** No control writes `basedOnPreset` until the rail
cards land, so any "live check" at this step would be a hand-crafted POST, which
tests what a merchant will never do while proving nothing about what they will.

Say so plainly in the completion note rather than reporting a verification that
did not happen. Step 90 owns these, and they are listed here so the debt is
visible from this file:

1. Pick a card → Save → re-read `TableStyling.basedOnPreset` in Postgres.
2. Pick **Banded** on an untouched template → the SaveBar opens (the test-5
   claim, confirmed for real).
3. Save → reload → the same card still reads as selected.
4. Move one knob → "Customized"; move a **colour** → **not** customized.
5. Reset styling → the stamp clears and no card reads as selected.
6. Create-on-first-save: pick a card on `/app/templates/new`, Save once, confirm
   the stamp survived the create → redirect → remount.

⚠️ **No migration, so the stale-Prisma-client trap does not apply** — no dev
server restart is needed before the first save. (It has fired on features
78/79/80/81; it needs a schema change, and there isn't one here.)

---

## Completion checklist

- [x] `normalizeStylePresetStamp` exists, exported, documented
- [x] Both action branches pass the stamp (create-on-first-save included)
- [x] `resetStyling` clears it; `setStylingField` does not touch it
- [x] Tests 1–11 written and passing; mutations 5 and 9 run and reverted
- [x] Full gate green, new test total recorded — **1044 → 1055**
- [x] `stylingToDbColumns` body unchanged; `:362` assertion unedited
- [x] `context/progress-tracker.md` updated
- [x] Committed with a message naming feature 88 step 89

### What the two mutations actually reported

Recorded because a guard nobody has seen fail is decoration:

| mutation | expected | observed |
| --- | --- | --- |
| drop `basedOnPreset` from `editorMetaSnapshot` | test 5 fails | **3 failed** — incl. `🔴 sees a Banded pick even though it moves no styling value` |
| write the stamp only when it is provided | test 9 fails | **3 failed** — incl. `CLEARS the stamp when a styling save omits it` |

Both mutations reverted; suite back to 1055 green.

### Two things worth knowing before step 90

- **The edit branch needed no change.** `route.tsx` passes `payload` wholesale to
  `saveTemplateForShop`, so widening the payload type carried the stamp through
  on its own. Only the create-on-first-save call, which builds its options object
  by hand, had to name the field.
- **`ALL_DEFAULT_COLUMNS` in `template.server.test.ts` deliberately does NOT
  carry `basedOnPreset`.** It is shared with the `stylingToDbColumns` tests,
  where the stamp's absence is the assertion. The save tests spread it and add
  the stamp at the call site instead, which is what makes D1's "beside, not
  inside" split visible in the tests rather than only in a comment.
