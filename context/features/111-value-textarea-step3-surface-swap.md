# Value textarea — Step 3: swap the value surface to `<textarea>` (the switch)

**Status: 📋 Planned.** Part 3 of 6 (features 109–114). This is the **behavioral
switch** and the largest step — it replaces the `contenteditable` surface and
rewires the modal-insert path together, because they share one caret contract.
Splitting them would leave the editor half-broken between steps. It **deletes
nothing** (old modules/actions stay in place as a fallback reference); removal is
Steps 112–113.

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
