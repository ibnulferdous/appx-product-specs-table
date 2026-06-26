# Paste refinement Step 1 — Content-first paste intent

## Goal in one sentence

Decide bulk-insert-vs-in-cell paste by the **clipboard's content** (is it a genuine
multi-cell table?) instead of by **where focus is**, so pasting a table while a value or
label cell is focused bulk-creates rows (today it is silently flattened into one cell),
and a paste whose clipboard holds only a single value never triggers a surprise bulk
insert — **without changing the insertion point (still append; that is Step 2/file 22) or
the new-template scaffold handling (Step 3/file 23)**.

## Why this is now (and why it's the first of three)

The bulk-paste feature (Steps 12–13) gates the gesture on **focus/target**: the container
`onPaste` skips any paste whose target matches `s-text-field, s-search-field, input,
textarea, [contenteditable]`, and `ValueCell.handlePaste` unconditionally `preventDefault`s
and inserts flattened plain text. Two merchant-visible problems follow:

1. **Paste a table while a cell is focused → it is mangled.** `ValueCell.handlePaste`
   (`ValueCell.tsx`) flattens the whole clipboard (`\r?\n` → `" "`) into the **one** focused
   cell; the container handler then skips it via `event.defaultPrevented`. A merchant who
   clicks a value cell and pastes a spec table gets a single run-on cell, not rows.
2. **The focus/target gate is fragile** — a paste that bubbles from a **focusable
   non-field element inside the editor** (the ⠿ drag handle `<button>`, the delete
   `<button>`, the inter-cell padding) is **not** caught by the field skip-guards, so it
   reaches the bulk path. Combined with the browser keeping focus on the last-focused
   in-editor button when the merchant clicks non-focusable page chrome, this is why a
   paste that *looks* like it happened "outside the editor" can still bulk-insert (the
   reported grey-margin surprise).

Both collapse to one fix: **intent should come from the clipboard shape, not the focus
target.** A genuine multi-cell table → bulk insert (wherever focus is); a lone value →
the normal in-cell / native field paste. This is the smallest of the three refinements
and de-risks the other two by establishing the single "is this a bulk table?" decision
they both build on.

This is also the decision the merchant explicitly chose (2026-06-26): **content-first
intent** — "if the clipboard is a genuine multi-cell table, always bulk-insert rows even
if a cell is focused."

## Foundation carried from Steps 12–13

- **The grid parse is frozen and correct.** `extractHtmlTableGrid` (`clipboardTableDom.ts`,
  DOM glue) + `parseClipboardTable` / `normalizeGrid` / `cellCount` (`clipboardTable.ts`,
  pure, unit-tested) already turn a `DataTransfer` into a normalized `string[][]` and
  measure it. Step 1 **reuses** them; it adds no parsing.
- **`cellCount(grid) > 1` is already the "bulk gesture" test** (Step 13's ignore-guard).
  Step 1 promotes it from a late guard to **the** intent decision, applied at every paste
  entry point.
- **`gridToPastedRows` + `PASTE_ROWS` are frozen** — the build → dispatch → toast core is
  unchanged in Step 1; only *who calls it and when* changes. The append-at-end behavior is
  preserved here (the insertion point moves in file 22).
- **The value cell owns its own paste.** `ValueCell.handlePaste` already intercepts paste
  for the contenteditable. Step 1 makes it **route a table to the shared bulk handler**
  instead of flattening it, and keep today's text-at-caret behavior for a single value.

## What changes (architecture)

One new DOM-glue reader, one extracted engine helper, and a content test swapped in at the
two paste entry points (the container wrapper and the value cell). **No reducer change, no
new dependency, no schema change, no CSS, no change to `gridToPastedRows` / `PASTE_ROWS`,
and no change to the Step 9.5 persistence contract.**

### 1. `DataTransfer` → grid reader — `app/utils/clipboardTableDom.ts` (DOM glue)

- **`readClipboardGrid(data: DataTransfer | null): string[][]`** — the single place that
  turns a paste payload into a normalized grid: null-guards `data`, then
  `parseClipboardTable({ htmlGrid: extractHtmlTableGrid(data.getData("text/html")), text:
  data.getData("text/plain") })`. Lives in `clipboardTableDom.ts` (it touches
  `DataTransfer.getData` + `DOMParser` via `extractHtmlTableGrid`), alongside its
  module-mate; **browser-verified, not Node-unit-tested** (no `jsdom`), exactly like
  `extractHtmlTableGrid`. Both paste entry points call it, so they can never disagree on
  what counts as a table.

### 2. Shared bulk-insert core — `app/routes/app.templates_.$id/useRowEngine.ts`

- Extract the body of today's `handleContainerPaste` (room → `gridToPastedRows` → slice →
  mint ids → `dispatch(PASTE_ROWS)` → set last row active + scroll → summary toast) into a
  reusable **`pasteGrid(grid: string[][])`** `useCallback` (deps `[shopify]`; it reads
  `rowsRef.current`, so no `rows` dependency — append behavior unchanged in this step).
- Expose `pasteGrid` from the engine as **`onBulkPaste`** so the value cell can call it.
- Rewrite **`handleContainerPaste`** to be content-first:
  - null-guard `clipboardData`; return on `event.defaultPrevented` (the value cell already
    handled its own paste — table or text);
  - `const grid = readClipboardGrid(event.clipboardData)`;
  - **`if (cellCount(grid) <= 1) return;`** — not a table → let the native field/text paste
    run (this **replaces** the old `closest("s-text-field, …")` target skip-guard: a single
    value pasted into a Label/Section `<input>` falls through to the native input paste; a
    single value pasted with a button/padding focused does nothing);
  - else `event.preventDefault()` (we are consuming a table — this also stops the native
    flatten when the table was pasted into a Label/Section `<input>`) and `pasteGrid(grid)`.

### 3. Value-cell table routing — `app/routes/app.templates_.$id/ValueCell.tsx`

- New prop **`onBulkPaste: (grid: string[][]) => void`**.
- In `handlePaste`, before the existing flatten path: `const grid =
  readClipboardGrid(event.clipboardData)`; **if `cellCount(grid) > 1`**, `event.preventDefault()`,
  `onBulkPaste(grid)`, and **return** — the table becomes rows, not text in the cell.
  Otherwise the existing Step 4 behavior is unchanged (plain text at a collapsed caret,
  newlines→spaces). Either branch still `preventDefault`s, so the container handler always
  sees `defaultPrevented` for a value-cell paste and never double-handles it.

### 4. Thread the prop — `RowGrid.tsx` → `EditorRowItem.tsx` → `ValueCell.tsx`

`onBulkPaste` flows engine → `RowGrid` (destructure from `engine`) → `EditorRowItem` (new
prop) → `ValueCell` (new prop). `EditorRowItem` is `memo`'d; `onBulkPaste` is a stable
`useCallback`, so the "only the edited/active row re-renders" guarantee holds (same shape
as the existing `onEditPart`/`onCaretChange` props).

## Sub-steps (build and verify one at a time)

### 21.1 — `readClipboardGrid` + extract `pasteGrid` (builds; no behavior change yet)

Add `readClipboardGrid` to `clipboardTableDom.ts`; extract `pasteGrid` from
`handleContainerPaste` and have the existing handler call it (still target-gated). Gates
green; the editor behaves exactly as Step 13 (pure refactor).

### 21.2 — Swap in the content test at both entry points (browser)

Rewrite `handleContainerPaste` to the content-first form (drop the target skip-guard, add
the `cellCount(grid) <= 1` content gate) and add the `onBulkPaste` routing to
`ValueCell.handlePaste`; thread the prop through `RowGrid` → `EditorRowItem`.

**Verify (browser, real embedded app):**
- Focus a **value cell** and paste a multi-cell table → rows **bulk-insert** (appended this
  step), the cell is **not** flattened; the Save bar appears; the summary toast shows.
- Focus a **Label / Section `<input>`** and paste a table → rows bulk-insert; the input is
  not left holding a flattened blob.
- Paste a **single word/phrase** into a value cell → text lands at the caret (Step 4
  unchanged); into a Label input → native input paste (unchanged).
- Paste a table with **no field focused** (click a row's empty area) → bulk-insert
  (unchanged from Step 13).
- **Surprise resolved:** with a drag handle / delete button focused, paste a **single
  value** → nothing happens (no bulk insert); paste a **table** → bulk-insert (intended —
  a table on the clipboard is the gesture).
- **No console errors** (admin top frame).

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Paste a multi-cell table (any focus) → bulk-create rows | **unchanged** `PASTE_ROWS` via the shared `pasteGrid`, now reached by content, not target |
| Paste a single value into a value cell | unchanged — Step 4 text-at-caret (`SET_VALUE_TEXT`) |
| Paste a single value into a Label/Section field | unchanged — native `<input>` paste (container falls through) |
| Decide bulk vs in-cell | **new** — `cellCount(readClipboardGrid(data)) > 1` at both entry points |

**No reducer action added or changed in Step 1.**

## Locked decisions

- **Intent is content-first.** A genuine multi-cell table (`cellCount > 1`) bulk-inserts
  regardless of focus; a single value pastes in-cell / natively. (Merchant decision,
  2026-06-26.)
- **The value cell still owns its paste and still `preventDefault`s** — it routes a table to
  `onBulkPaste` and keeps text-at-caret for a single value, so the container never
  double-handles a value-cell paste.
- **Drop the target-based skip-guard** (`closest("s-text-field, s-search-field, input,
  textarea, [contenteditable]")`) in the container handler; the `cellCount(grid) <= 1`
  content gate replaces it. This is what fixes the "focused button / grey margin" surprise:
  only an actual table triggers an insert. **Exception added in 21.2 (browser-driven):** the
  `s-search-field` portion of the old guard was **kept** — the Insert-field modal's search
  box does *not* portal outside the editor wrapper in this App Bridge build, so without it a
  table pasted to filter the field list bulk-inserts rows. See the resolved "Modal search
  field paste" open question.
- **Insertion point and scaffold handling are out of scope** — this step keeps append-at-end
  and does not special-case the new-template scaffold (files 22 and 23).
- **No new pure logic to unit-test.** The decision reuses the already-tested `cellCount`;
  `readClipboardGrid` is DOM glue (browser-verified like `extractHtmlTableGrid`). The suite
  count is unchanged (still 219); the change is verified in-browser, consistent with the
  reshell steps.

## What Step 1 does *not* own (boundary)

- **The clipboard parse** (Steps 12) — `parseClipboardTable` / `extractHtmlTableGrid` /
  `normalizeGrid` are frozen; `readClipboardGrid` only composes them.
- **`gridToPastedRows` / `PASTE_ROWS` / the toast / cap** — unchanged here.
- **Insertion point** — append stays; insert-after-active is file 22.
- **New-template scaffold replace** — file 23.
- **Single-cell `\n`→space flatten** — left as Step 4 behavior unless the merchant opts into
  a "single column → `LINE_BREAK`s" change (tracked as an open question, not built here).

## File placement (per `code-standards.md`)

- `readClipboardGrid` → **`app/utils/clipboardTableDom.ts`** (DOM glue, browser-verified).
- `pasteGrid` + content-first `handleContainerPaste` → **`useRowEngine.ts`**.
- `onBulkPaste` routing → **`ValueCell.tsx`**; prop threading → **`RowGrid.tsx`**,
  **`EditorRowItem.tsx`**.
- `clipboardTable.ts`, `rows.ts`, `rowsSerialize.ts`, `template.server.ts`, `route.tsx`,
  `metaobjects.server.ts`, `schema.prisma`, the CSS — **no change**.

## Open questions

- **Single column → line breaks?** A single-column, multi-row paste into a value cell is a
  table (`cellCount > 1`) and so bulk-inserts as label-only rows. A single-column paste of
  lines *intended as one multiline value* would currently flatten (Step 4) or, if it has >1
  cell, become rows. Decide with the merchant whether an in-cell multiline paste should map
  `\n` → `LINE_BREAK` instead of flattening — deferred, not built here.
- **Modal search field paste — RESOLVED (assumption was wrong; minimal guard added,
  2026-06-26).** This bullet assumed the Insert-field `<s-search-field>` portals outside the
  editor wrapper (App Bridge), so its paste would not reach the container handler and **no
  guard** would be needed. **Browser-verified false** in this App Bridge / Polaris-web-component
  build: pasting a multi-cell table into the open modal's search box reached
  `handleContainerPaste` and **bulk-inserted rows** (the search field kept its text, rows
  24→28) — violating "Done when" #3's intent. Fix in 21.2: re-add **only** the
  `s-search-field` skip at the top of `handleContainerPaste`
  (`if (event.target?.closest?.("s-search-field")) return;`). This is the lone piece of the
  old target skip-guard that is still wanted — it protects the field *picker* (not table
  data); the value-cell / label-input / contenteditable skips stay dropped, so a genuine
  table still bulk-inserts from those (content-first intent intact). Re-verified: a table
  pasted into the search box now lands as **text** (no bulk insert), a single value still
  lands in the field, and the core value-cell table paste still bulk-inserts.

## Done when

1. Sub-steps 21.1–21.2 pass their checks.
2. `readClipboardGrid` turns a `DataTransfer` into a normalized grid; both paste entry
   points decide bulk-vs-in-cell via `cellCount(grid) > 1`.
3. Pasting a table while a value/label cell is focused **bulk-inserts** (not flattened);
   pasting a single value pastes in-cell / natively; a table with no field focused still
   bulk-inserts; a single value with a button/padding focused does nothing.
4. `npm run typecheck`, `lint`, `format:check`, `test:run` (219), and `build` all pass;
   **browser-verified** in the real embedded app. No console errors.
5. **No reducer action added or changed; no new dependency / schema / CSS.** Insertion point
   (append) and scaffold handling are untouched (files 22 and 23).
6. `progress-tracker.md` updated to record Step 1 of the paste refinement complete and the
   content-first decision.
