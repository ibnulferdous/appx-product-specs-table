# Value textarea — Step 5: delete the dead contenteditable code

**Status: ✅ Shipped 2026-08-07 (one browser check owed — see below).** Part 5 of 6
(features 109–114). Grep-gated removal of the linear-caret machinery and the
granular reducer actions the textarea made obsolete.

## Shipped (2026-08-07) — with two deviations the grep gate forced

The grep gate did its job: it caught that the plan's "everything is dead"
assumption was **wrong in two places**, so this was NOT pure subtraction.

**Deviation 1 — `tokenLabels` / `TokenLabels` were NOT dead.** The plan's valueDom
export list overlooked them; they are still used by the inline preview
(`specTablePreviewHtml.ts`) to render each dynamic-field token as a labeled pill.
Resolved by **relocating** them (pure, DOM-free) into a new leaf module
`app/utils/tokenLabels.ts` (+ `tokenLabels.test.ts`, tests moved verbatim), then
repointing the preview import. Only after that could `valueDom.ts` be deleted.

**Deviation 2 — a live Step-111 regression.** `useGridKeyboardNav.ts` (the
Ctrl/Cmd+Arrow spreadsheet nav) still located the value cell via `[role="textbox"]`
and set the caret with `setCaretLinear`/`linearLength` — both contenteditable-era.
The Step-111 textarea has no explicit `role="textbox"`, so Ctrl/Cmd+Arrow into/out
of value cells had been **silently broken since Step 111 shipped** (jsdom can't test
it; it wasn't in the six manual checks). Fixed by detecting the cell via `textarea`
and placing the caret with the native `setSelectionRange(len, len)` — the same idiom
the label branch already uses. This *restored* the nav and dropped the two imports.
⚠️ **Browser check owed:** this behavior is browser-only; verify Ctrl/Cmd+Arrow
navigation to/from value cells live (folds into Step 114's sign-off).

**Deletions (all grep-gated empty first):**
- `app/utils/valueParts.ts` + `valueParts.test.ts` — deleted.
- `app/utils/valueDom.ts` + `valueDom.test.ts` — deleted (after `tokenLabels` moved out).
- `rows.ts`: removed the `SET_VALUE_TEXT`, `REMOVE_VALUE_PART`, `SET_VALUE_PART`,
  and `INSERT_VALUE_PART_AT` union members + reducer cases, and the `spaceAfter`
  field. `isAtomicPart` was grep-proven orphaned (only its own test referenced it)
  → removed with its test. Kept `SET_VALUE_PARTS`, `SET_LABEL`, all row-structure
  actions, and `normalizeValueParts`.
- `rows.test.ts`: deleted the four dead-action describe blocks + the `isAtomicPart`
  block; repointed two `isPristineScaffold` tests that used dead actions as a value
  vehicle onto `SET_VALUE_PARTS`.
- `SpecTableEditor.module.css`: removed the orphaned `.token` / `.token:hover` /
  `.token[data-caret-on]` rules. **Kept** `--appx-token-color` + `useCapturedTokenColor`
  — still used by the active-cell outline, active-row highlight, and checkbox accent
  (comment updated to match).

**Static gates (all green):** `npm run typecheck`, `npm run lint`,
`npm run test:run` (1405/1405), `npm run build` (97 modules). Final residual greps
(`valueDom` / `valueParts` imports, deleted symbols, dead-action strings,
`data-caret-on`) all empty in `app/`.

---

## Original plan (below) — retained for reference

Grep-gated removal of the linear-caret machinery and the granular reducer actions
the textarea made obsolete. Pure subtraction — no behavior change if the earlier
steps are correct.

## Prerequisite

Steps 111–112 merged: the textarea is the only value surface, the modal is
create-only, and nothing dispatches the granular value actions anymore. Every
deletion below is **gated on a grep proving zero remaining references** — if a grep
finds a reference, stop and resolve it before deleting.

## Goal in one sentence

Remove `valueParts.ts`, `valueDom.ts` (+ their tests), and the dead reducer actions
(`SET_VALUE_TEXT`, `REMOVE_VALUE_PART`, `INSERT_VALUE_PART_AT`, `SET_VALUE_PART`,
and the `spaceAfter` field), after grep confirms each is unreferenced.

## Deletion checklist (grep FIRST, then delete)

### 1. `app/utils/valueParts.ts` + `app/utils/valueParts.test.ts`
Exports: `linearLength`, `partOffsetToLinear`, `linearToPartOffset`,
`planAtomicDelete`, `planSelectionDelete`, `DeleteDirection`.
- **Grep gate:** none of these symbols appear outside `valueParts.ts` /
  `valueParts.test.ts`. (Step 111 dropped the `useRowEngine` imports; Step 111 also
  removed the `ValueCell` uses.) Delete both files only when the grep is empty.

### 2. `app/utils/valueDom.ts` + `app/utils/valueDom.test.ts`
Exports: `getSelectionLinearRange`, `setCaretLinear`, `updateCaretOnState`,
`renderPartsToHost`, `readPartsFromHost`, `partsEqual`, `sameStructure`,
`syncTrailingFiller`, `partIndexOfElement`, `isIgnoredBreak`, etc.
- **Grep gate:** every export is used **only** by the old `ValueCell` (now
  rewritten) and its own test. Confirm zero references elsewhere, then delete both
  files.

### 3. Dead reducer actions in `app/utils/rows.ts`
Remove the union members and their `case` branches for:
- `SET_VALUE_TEXT`
- `REMOVE_VALUE_PART`
- `INSERT_VALUE_PART_AT` (and drop the `spaceAfter` field with it)
- `SET_VALUE_PART`
- **Grep gate:** each `type: "…"` string has no `dispatch` anywhere in
  `app/` after Steps 111–112. (These were the contenteditable's granular edits;
  the textarea uses only `SET_VALUE_PARTS`.)
- **Keep:** `SET_VALUE_PARTS`, `SET_LABEL`, all row-structure actions (`ADD_ROW`,
  `DELETE_ROWS`, `MOVE_ROW`, `PASTE_ROWS`, `RESTORE_ROWS`, …), and
  `normalizeValueParts` / `isAtomicPart` — but **grep `isAtomicPart`**: if it was
  only used by the deleted caret planners, remove it too; if still referenced,
  keep it.
- Update `rows.test.ts`: delete the tests for the removed actions; keep the
  structure-action and `SET_VALUE_PARTS` tests.

### 4. Residual references
- **Grep** `linearToPartOffset`, `partOffsetToLinear`, `pendingCaretRef`,
  `caret-on`, `data-token`, `data-filler`, `data-line-break` across `app/` — any
  survivor is a missed cleanup from Step 111; resolve before finishing.
- Check `SpecTableEditor.module.css` for now-orphaned token / caret-on / filler
  rules and remove them (the textarea has its own chrome).

## Verify

1. Each grep gate above returns **empty** before its deletion.
2. `npm run typecheck` — no dangling imports/types.
3. `npm run lint` — no unused-symbol or unresolved-import errors.
4. `npm run test:run` — the remaining suite is green (dead tests removed, not
   skipped).
5. `npm run build` passes.
6. Quick editor smoke test: type, undo, insert field, multiline, save — all still
   work (nothing user-facing changed; this was pure removal).

## Files

- **Deleted:** `app/utils/valueParts.ts`, `app/utils/valueParts.test.ts`,
  `app/utils/valueDom.ts`, `app/utils/valueDom.test.ts`.
- **Touched:** `app/utils/rows.ts` (remove 4 actions + `spaceAfter`),
  `app/utils/rows.test.ts`, possibly `SpecTableEditor.module.css`, possibly
  `rows.ts`'s `isAtomicPart` (grep-dependent).

## Boundaries (not this step)

- Docs (`data-model.md`, `progress-tracker.md`) + live browser sign-off — Step 114.

## Done when

1. `valueParts.ts` / `valueDom.ts` (+ tests) are gone; the four dead reducer
   actions and `spaceAfter` are gone; every grep gate was empty before deletion.
2. `isAtomicPart` and any CSS token/caret rules are removed **iff** grep proved
   them orphaned; otherwise kept with a note.
3. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` pass,
   and the editor smoke test is clean.
