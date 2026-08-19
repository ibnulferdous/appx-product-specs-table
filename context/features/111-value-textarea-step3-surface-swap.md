# Value textarea — Step 3: swap the value surface to `<textarea>` (the switch)

**Status: ✅ Shipped + browser-verified 2026-08-07.** Part 3 of 6 (features
109–114). The **behavioral switch**: the `contenteditable` surface is replaced by a
native `<textarea>` and the modal-insert path is rewired to string offsets, together
(shared caret contract). Full static gate green (typecheck · lint · 1468 tests ·
build) AND all six live browser checks passed on the dev store (see Verification
below). It **deletes nothing** (old modules/actions stay as a fallback reference);
removal is Steps 112–113 — now unblocked.

## Prerequisite

Features 109 (`valueText.ts` codec) and 110 (`SET_VALUE_PARTS`) are merged. This
step is the first that dispatches `SET_VALUE_PARTS` and imports `valueText`.

## Goal in one sentence

Render each DATA row's value as a native `<textarea>` showing
`partsToText(row.valueParts)`, driving all edits through
`textToParts` → `SET_VALUE_PARTS`, and re-point the "Insert field" modal to splice
a `{% … %}` token string at the textarea caret — so typing, undo/redo, multiline,
bulk paste, and field insertion all work on the new surface.

## The caret contract change (the crux)

Old surface: caret = a **linear slot index** (1 per TEXT char, 1 per atomic part),
computed via `getSelectionLinearRange` / `linearToPartOffset`
([valueParts.ts](app/utils/valueParts.ts), [valueDom.ts](app/utils/valueDom.ts)).

New surface: caret = the textarea's **`selectionStart`** — a plain character
offset into `partsToText(valueParts)`. A token occupies its full string length
(e.g. `{% mf custom.battery_life %}` is ~29 chars, not 1 slot). The modal-insert
path must use this string offset, so it changes in lockstep here.

## ValueCell.tsx — rewrite

Replace the `contenteditable` `<div>` with:

```tsx
<textarea
  className={styles.cellField}           // reuse existing field chrome
  value={partsToText(row.valueParts)}
  aria-label={`Value for ${rowName}`}
  rows={1}                               // auto-grown to content (see below)
  spellCheck={false}
  onChange={(e) => dispatch({ type: "SET_VALUE_PARTS", id: row.id,
                              valueParts: textToParts(e.target.value) })}
  onPaste={handlePaste}                  // keep bulk-table routing (below)
  onFocus={reportCaret}
  onSelect={reportCaret}                 // fires on every caret move in a textarea
/>
```

Keep / adapt:

- **Bulk-table paste** — `handlePaste` still calls `readClipboardGrid`; if
  `cellCount(grid) > 1` → `onBulkPaste(grid)` and `preventDefault`. A single-cell
  paste is left to the textarea's **native** paste (no manual splicing needed — the
  `onChange` reparse handles it), which also keeps it inside the native undo stack.
- **Caret reporting** — `reportCaret` reads `e.currentTarget.selectionStart` and
  calls `onCaretChange(row.id, selectionStart)`. On blur into a label field the
  gate is dropped as today (`onCaretChange(row.id, null)` from `EditorRowItem`).
- **Auto-height** — grow the textarea to its content so multiline values are fully
  visible (the old surface grew naturally). A small effect: reset `height` to
  `auto` then set to `scrollHeight` on value change. Verify it doesn't fight the
  bounded inner scroll.

Remove from the cell (behavior now native): `handleKeyDown` (Enter / Backspace /
Delete atomic logic), `handleClick` (pill edit), the `selectionchange` listener +
caret-on highlighting, the `pendingCaretRef` structural-reconcile layout effect,
composition guards, and the trailing-`<br>` filler. **Leave the imports/modules
themselves on disk** — Step 113 deletes them; here we simply stop calling them.

> IME / composition: a `<textarea>` handles composition natively, so the
> `composingRef` dance is gone. The `onChange` still fires post-composition with the
> committed text — no special handling needed.

## useRowEngine.ts — modal insert + caret refs

- **Caret ref:** `activeCaretRef`/`savedCaretRef` carry `{ rowId, offset }` (string
  offset) instead of `{ rowId, linear }`. `pendingCaretByRowRef` values become
  string offsets. Update the [editorShared.ts](app/routes/app.templates_.$id/editorShared.ts)
  `SavedCaret` type (`linear` → `offset`).
- **`handleCommit` (create mode):** build the token string
  (`selection.kind === "native"` → `formatFieldToken(field)`; else
  `formatMetafieldToken(namespace, key)`), take `text = partsToText(row.valueParts)`,
  splice `token + " "` in at the saved `offset`, dispatch
  `SET_VALUE_PARTS { valueParts: textToParts(spliced) }`. Set the pending caret to
  `offset + token.length + 1` (after the token and the trailing space — the same
  smart-pill "keep typing" affordance the old `spaceAfter` gave).
- Drop the `linearToPartOffset` / `partOffsetToLinear` imports from this file.
- **Edit-in-place (pill click):** now unreachable (textarea has no pill click). The
  `editTarget` branch of `handleCommit`, the `onEditPart` handler, and the
  `SET_VALUE_PART` dispatch are **left in place but dead** here; Step 112 prunes
  them so this step stays a clean surface swap.

## Pending-caret restore

After a `SET_VALUE_PARTS`-driven re-render, restore the textarea caret from the
pending string offset: a layout effect in `ValueCell` reads
`pendingCaret.get(row.id)`, and after focus sets
`textarea.setSelectionRange(offset, offset)`. This is far simpler than the old
`setCaretLinear` — no DOM walking, just a character index. The modal-close focus
race handled by `MODAL_TRANSITION_MS` still applies (defer the focus/caret set past
the modal transition, same as today).

## Prop threading (unchanged this step)

`onCaretChange`, `onBulkPaste`, `pendingCaret` keep flowing
`RowGrid → EditorRowItem → ValueCell`. `onEditPart` is still threaded but now never
fires (pruned in Step 112).

## Verify (browser — the whole point)

On the `shopify app dev` preview (embedded editor behind Shopify auth — use
Claude-in-Chrome per the browser-verify memory):

1. **Ctrl+Z / Ctrl+Y work** — type, undo, redo across many keystrokes; the native
   stack is intact (the original bug is gone).
2. **Insert field (create mode)** drops `{% field vendor %}` / `{% mf ns.key %}` at
   the caret, with a trailing space, and the caret lands after it ready to type.
3. **Enter** inserts a real newline; multiline values show fully (auto-height).
4. **Bulk paste** of a multi-cell table still becomes rows (not a flattened blob).
5. **Live preview** still renders *resolved* values (unchanged — it reads
   `valueParts`, which `SET_VALUE_PARTS` keeps canonical).
6. **Save + reload** round-trips the value (serialize/deserialize unchanged).

## Files

- **Rewritten:** [ValueCell.tsx](app/routes/app.templates_.$id/ValueCell.tsx).
- **Touched:** [useRowEngine.ts](app/routes/app.templates_.$id/useRowEngine.ts)
  (caret refs + `handleCommit` create path + imports),
  [editorShared.ts](app/routes/app.templates_.$id/editorShared.ts) (`SavedCaret`
  type), [SpecTableEditor.module.css](app/routes/app.templates_.$id/SpecTableEditor.module.css)
  (textarea chrome / resize).
- **Not deleted here:** `valueParts.ts`, `valueDom.ts`, the old reducer actions,
  the `onEditPart`/`editTarget`/`SET_VALUE_PART` wiring — Steps 112–113.

## Boundaries (not this step)

- Pruning the edit-pill plumbing — Step 112.
- Deleting `valueParts.ts` / `valueDom.ts` / dead reducer actions — Step 113.
- Docs + final sign-off — Step 114.

## Implementation notes (2026-08-07)

What actually landed, and two decisions worth recording:

- **Uncontrolled textarea, reconciled on divergence** (not a controlled `value=`).
  `ValueCell` renders `defaultValue={partsToText(valueParts)}`; a
  `useBrowserLayoutEffect` sets `textarea.value` **only when `ta.value !== desired`**.
  During normal typing (and native undo) the DOM already equals state, so the
  element is never rewritten — which is exactly what keeps the native undo stack
  intact (the old bug was `host.textContent = ""` nuking it). This also sidesteps
  the controlled-textarea + IME hazard, so no `compositionstart/end` guard is
  needed. `onChange` → `textToParts` → `SET_VALUE_PARTS`; `autoSize` grows/shrinks
  height to `scrollHeight`.
- **Caret = `selectionStart`** reported via `onFocus`/`onSelect` (`onCaretChange`).
  The `SavedCaret` type changed `linear` → `offset` in `editorShared.ts`.
  `handleCommit` (create mode) now splices `` `${token} ` `` into
  `partsToText(row.valueParts)` at the saved offset, reparses, and dispatches
  `SET_VALUE_PARTS`; the pending caret is `offset + insert.length`. Restore uses
  `setSelectionRange` after the `MODAL_TRANSITION_MS` focus defer.
- **Left dead on purpose (Step 112 prunes):** the `editTarget` branch of
  `handleCommit`, `handleEditPart`, the `onEditPart` prop (still in `ValueCell`'s
  type so `EditorRowItem`'s pass-through typechecks, but unused), and
  `SET_VALUE_PART`. `partOffsetToLinear` is still imported by the dead `editTarget`
  branch; `linearToPartOffset` was dropped. Bulk-paste routing is unchanged; a
  single-value paste now falls through to native textarea paste.
- **CSS:** `.surface` reworked for a textarea (`resize:none`, `overflow:hidden`,
  auto-height via JS); the `[data-empty]::before` placeholder rule was removed
  (native `placeholder` now). The `.token*` rules are orphaned but left for Step
  113's CSS sweep.

## Known edge (accepted)

Hand-typing a token with non-canonical spacing (e.g. `{%mf custom.x%}`) reparses
and re-serializes to the canonical `{% mf custom.x %}` on the keystroke that
completes it, so `ta.value !== desired` fires once and the caret jumps to the
reconciled position. Tokens inserted via the modal are already canonical, and
plain text/partial tokens round-trip exactly, so normal editing is unaffected.
Revisit only if merchants hand-type tokens in practice.

## Verification (2026-08-07) — ✅ all six checks passed

Browser-verified via Claude-in-Chrome on the `shopify app dev` preview (dev store
`appx-dev`), on a fresh "Modern"-style template. The `dev previews (1)` badge
confirmed the live dev build was serving.

1. ✅ **Undo/redo** — typed "Up to 18 hours"; `Ctrl+Z` removed characters one at a
   time (7× → "Up to 1"), `Ctrl+Y` redid them back to the full string. Native
   textarea undo stack is intact — the original broken-Ctrl+Z bug is gone.
2. ✅ **Insert field at caret** — with the caret at Home (offset 0), Insert field →
   Snowboard length metafield produced `{% mf test_data.snowboard_length %} ` at the
   **start** of the value (trailing space, caret after it), proving string-offset
   splicing (not append). Matches the merchant's original grammar example exactly.
3. ✅ **Multiline** — `End` → Enter → "1600 nits peak brightness" rendered two lines
   in one cell; the textarea auto-grew and the row expanded.
4. ✅ **Bulk paste** — a real 2×2 TSV on the OS clipboard pasted into a blank cell →
   "Added 2 rows" toast; became Weight | 1.24 kg and Display | 14.2-inch Liquid
   Retina (counter 6→8), not a flattened blob.
5. ✅ **Preview parity** — the Storefront preview rendered from `valueParts`: the
   metafield as a "Metafield · snowboard_length" chip (editor preview has no live
   product), the line break as two lines, the pasted rows present. No raw `{% … %}`
   text leaked into the preview — the delivery/preview path is untouched.
6. ✅ **Save + reload round-trip** — Save created the template
   (`…/templates/cmsieep34…`); after a full reload the value cell showed the exact
   same `{% mf test_data.snowboard_length %} Up to 18 hours` / `1600 nits peak
   brightness` and the pasted rows persisted. The METAFIELD part survived
   serialization and re-serialized to the identical token.

Console: no app-side errors/warnings (no React controlled/uncontrolled warning, no
textarea/valueParts errors). The only console exceptions were
`ApolloError: Failed to fetch` from `cdn.shopify.com/shopifycloud/*` — Shopify's own
admin-shell telemetry, unrelated to the app bundle.

**Test artifact:** left a draft template "Untitled template"
(`cmsieep340001vptwi9mbgglv`) on `appx-dev` — safe to delete.

## Done when

1. The value cell is a native `<textarea>` bound to `partsToText(valueParts)`,
   dispatching `SET_VALUE_PARTS` via `textToParts` on change.
2. All six browser checks pass — **Ctrl+Z / redo work**, modal insert lands a
   token at the caret, multiline works, bulk paste still makes rows, preview and
   save/reload are unchanged.
3. Caret is tracked as `selectionStart` end-to-end; the modal splices at that
   string offset; the pending-caret restore uses `setSelectionRange`.
4. The cell no longer calls any `valueDom` / `valueParts` linear-caret helper (the
   modules remain on disk, unused).
5. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` pass.
