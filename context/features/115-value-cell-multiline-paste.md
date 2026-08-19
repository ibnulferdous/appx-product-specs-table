# Paste refinement Step 5 — Single-column paste is a multiline VALUE, not rows

## Goal in one sentence

Make pasting plain multi-line text into a **Value cell** land as a **multiline
value** in that one cell (`\n` → `LINE_BREAK`) instead of exploding into one row
per line, by gating the value cell's bulk-paste on **column count** (a genuine
multi-*column* table) rather than **total cell count** — while leaving the
container-level paste (paste into the grid → rows) and the spreadsheet-import
flow completely unchanged.

## Why this is now

The value cell became a native `<textarea>` in features 109–114, so a multiline
value is now a first-class edit — except **paste can't reach it**. Merchants have
hit this directly: copying a few lines of spec prose (a supplier feature list, a
multi-line description) and pasting into a Value cell splits it into that many
label-only rows, wrecking the row they were editing.

The cause is a single predicate. Both paste entry points decide "bulk-insert rows
vs. paste in place" with `cellCount(grid) > 1` (feature 21). `cellCount` is *total
cells*, so a single-column, N-line paste (`["a"],["b"],["c"]`) counts as 3 cells
and is treated as a table. That was the deliberately deferred **open question in
feature 21** — *"Single column → line breaks?"* — left for a merchant decision.

The merchant has now made that decision (2026-08-08): **inside a Value cell, a
single-column paste is a multiline value; only a genuine multi-column table
becomes rows.** This is the smallest change that resolves it and preserves every
other paste behavior.

## Current behavior (the trace being fixed)

A merchant focuses a Value cell and pastes three plain lines
(`Waterproof\nBluetooth 5.0\n34 min flight`):

1. `ValueCell.handlePaste` (`ValueCell.tsx`) runs first (inner handler).
   `readClipboardGrid` → `[["Waterproof"],["Bluetooth 5.0"],["34 min flight"]]`.
   `cellCount(grid) = 3 > 1` → **`preventDefault()` + `onBulkPaste(grid)`** → three
   rows created. ❌

The desired outcome: those three lines become **one multiline value** in the
focused cell.

## What changes (architecture)

One pure predicate, one gate swap in the value cell, one marker attribute, and one
target guard in the container handler. **No reducer change, no new dependency, no
schema change, no storefront change, no CSS.** `ValuePart[]` already models a
multiline value (`LINE_BREAK`), and `textToParts` already converts a textarea's
`\n` into `LINE_BREAK` parts — so the "simple paste" path is just the textarea's
existing native paste → `onChange` → `SET_VALUE_PARTS`, undo stack intact.

### 1. Pure predicate — `app/utils/clipboardTable.ts`

- Add **`hasMultipleColumns(grid: string[][]): boolean`** → `grid.some(row =>
  row.length > 1)`. True only when some row carries more than one column (a tab in
  the TSV, or >1 `<td>` in an HTML row) — i.e. genuinely tabular. Pure,
  Node-unit-tested, sits beside `cellCount`.
- `cellCount` stays and keeps its job: the container handler and the
  HTML-vs-TSV source selector in `parseClipboardTable` are unchanged.

### 2. Value-cell gate swap — `app/routes/app.templates_.$id/ValueCell.tsx`

- Import `hasMultipleColumns` instead of `cellCount`.
- In `handlePaste`, replace `if (cellCount(grid) > 1)` with
  **`if (hasMultipleColumns(grid))`**. When true: `preventDefault()` +
  `onBulkPaste(grid)` (unchanged — a real table still becomes rows). When false:
  do nothing, so the textarea's **native paste** runs and the lines land as a
  multiline value via the existing `onChange` → `textToParts` path.
- Add a **`data-value-cell`** attribute to the `<textarea>` so the container
  handler can identify a value-cell paste target (below). Self-documenting and
  robust against a future second textarea (vs. matching the bare tag name).

### 3. Container target guard — `app/routes/app.templates_.$id/useRowEngine.ts`

`handleContainerPaste` still gates on `cellCount(grid) > 1`. With the value cell
now *falling through* (not `preventDefault`ing) on a single-column paste, that
paste would bubble to the container, which would see `cellCount = 3 > 1` and
**bulk-insert rows anyway** — cancelling the native paste and re-creating the bug.

- Add, alongside the existing `s-search-field` skip:
  **`if ((event.target as Element | null)?.closest?.("[data-value-cell]")) return;`**
  The value cell is the sole authority for its own paste. This is a no-op for the
  multi-column case (the value cell already `preventDefault`ed, so the container
  would `return` on `event.defaultPrevented` regardless); it exists purely to let
  the single-column fall-through reach the native textarea paste untouched.

**No change to `RowGrid.tsx` / `EditorRowItem.tsx`** — `onBulkPaste` is already
threaded to the value cell (feature 21), and the new attribute is local to the
`<textarea>`.

## Behavior after the change (the scenarios we agreed on)

| Paste | Where | Result |
| --- | --- | --- |
| Multi-line plain text (no tabs) | **Value cell** | one **multiline value** (`\n`→`LINE_BREAK`); native undo works ✅ NEW |
| Multi-**column** table (Excel/Sheets/HTML `<table>`) | **Value cell** | **rows** (col 1 → Label, rest → Value) — unchanged |
| Single value | **Value cell** | pastes in the cell — unchanged |
| Anything | **Label / Section `<input>`** | native input paste (single line) — unchanged |
| Multi-line / table | **grid, no cell focused** | **rows** (container `cellCount > 1`) — unchanged |

**The one gesture that moves:** "single column of lines → label-only rows" is no
longer reachable *from inside a Value cell* — it still works by pasting into the
grid with no value cell focused. The mental model becomes **"where you paste
decides"**: into a value cell → it's a value; into the grid → it's rows.

## Edge cases (accepted)

- **A single line containing a tab** pasted into a value cell (`"12h\t249g"`) is
  read as one 2-column row → bulk-inserts one row. Rare; **no regression** (today's
  `cellCount = 2 > 1` also bulk-inserts). Documented, not guarded.
- **A single-column HTML `<table>`** (some sites wrap a list in a one-column table)
  pasted into a value cell → `hasMultipleColumns` false → multiline value. This is
  the non-destructive, in-cell choice and is fine.
- **Prose with an embedded tab** is the only way "columns = table" can misfire in a
  value cell; acceptable given tabs in typed prose are unusual.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Paste a multi-**column** table into a value cell → rows | **unchanged** — `onBulkPaste` → `PASTE_ROWS` |
| Paste single-column multi-line into a value cell → multiline value | **unchanged path, newly reached** — native textarea paste → `onChange` → `SET_VALUE_PARTS` (`textToParts` maps `\n`→`LINE_BREAK`) |
| Paste into the grid (no cell focused) → rows | **unchanged** — container `cellCount > 1` → `PASTE_ROWS` |

**No reducer action added or changed.**

## Locked decisions

- **Inside a Value cell, "table" means multi-COLUMN, not multi-cell.** A
  single-column paste is a multiline value. (Merchant decision, 2026-08-08 —
  resolves feature 21's deferred "single column → line breaks?" open question.)
- **This AMENDS, not reverses, feature 21's content-first intent.** Content still
  drives the decision (not focus). The container handler keeps `cellCount > 1`
  (content-first for the grid); only the value cell's own definition of "a table"
  narrows to columns. A genuine table still bulk-inserts from a value cell.
- **The value cell owns its paste and only `preventDefault`s when it consumes a
  table.** On a single-column paste it deliberately does NOT `preventDefault`, so
  the native textarea paste + native undo run; the container guard keeps the
  container from re-grabbing it.
- **Simple paste rides the native path — no manual text-splicing.** We do not
  re-implement "insert at caret" (the reason the earlier two-button-modal idea was
  heavier); letting the browser paste is what preserves the undo stack.

## What this step does NOT own (boundary)

- **The clipboard parse** — `parseClipboardTable` / `extractHtmlTableGrid` /
  `normalizeGrid` / `readClipboardGrid` are frozen; this reuses them.
- **`gridToPastedRows` / `PASTE_ROWS` / the 200-row cap + confirm modal (feature
  24) / insert-after-active (feature 22) / scaffold replace (feature 23)** — all
  unchanged; the bulk path is reached exactly as before, just by a narrower gate.
- **Container-level paste behavior** — pasting a column into the grid still makes
  rows.
- **A "Bulk paste" button or a disambiguation modal** — both considered and set
  aside (2026-08-08). The button hits the embedded-iframe clipboard-read
  permission wall; the modal adds per-paste friction and manual-insert code. Do
  not reintroduce without a new decision.

## File placement (per `code-standards.md`)

- `hasMultipleColumns` → **`app/utils/clipboardTable.ts`** (pure) + tests in
  **`app/utils/clipboardTable.test.ts`**.
- Gate swap + `data-value-cell` → **`app/routes/app.templates_.$id/ValueCell.tsx`**.
- Container target guard → **`app/routes/app.templates_.$id/useRowEngine.ts`**.
- Doc comment touch-up in **`app/utils/clipboardTableDom.ts`** (its header says
  "callers decide bulk-vs-in-cell via `cellCount`" — now the value cell uses
  `hasMultipleColumns`; one-line correction, no code change).
- `rows.ts`, `valueText.ts`, `rowsSerialize.ts`, `template.server.ts`,
  `metaobjects.server.ts`, `schema.prisma`, the storefront Liquid, the CSS —
  **no change**.

## Tests

Pure unit tests for `hasMultipleColumns` (the browser paste handlers stay
browser-verified, consistent with feature 21 — no component test):

- `[]` → false; `[[]]` → false
- `[["a"]]` (1×1) → false
- `[["a"],["b"],["c"]]` (single column, multi-row) → **false** (the fix's core case)
- `[["a","b"]]` (one row, two columns) → **true**
- `[["a","b"],["c","d"]]` → true
- ragged `[["a"],["b","c"]]` → true (any row with >1 column)

Full gate must pass: `npm run typecheck`, `lint`, `format:check`, `test:run`,
`build`.

## Browser verification (real embedded app, `appx-dev`)

Per [[browser-verify-embedded-app]] — the editor is behind Shopify auth; verify on
the `shopify app dev` preview.

1. Focus a Value cell, paste 3+ plain lines → **one multiline value** in that cell
   (renders as stacked lines in the Desktop preview); **Ctrl+Z undoes it in one
   step** (native undo intact); no extra rows created.
2. Paste a 2-column table (from Sheets) into a Value cell → **rows** as before
   (col 1 → Label, col 2 → Value).
3. Paste a single value into a Value cell → lands in the cell (unchanged).
4. Paste into a Label / Section field → native single-line input paste (unchanged).
5. Paste multi-line text into the grid with **no** cell focused → **rows**
   (container path unchanged).
6. Save → reload → the multiline value round-trips (already covered by the
   `ValuePart[]` contract; confirm once).
7. No console errors in the admin top frame.

## Docs to update on completion

- `context/data-model.md` §7 (Multiline values) — note that a single-column paste
  into a value cell produces a multiline value, and that "where you paste decides"
  bulk-vs-in-cell.
- `context/features/21-paste-content-first-intent.md` — mark the "Single column →
  line breaks?" open question **resolved** (pointer to this doc).
- `context/progress-tracker.md` — Recently Shipped entry; if a binding rule
  restates content-first intent, add the value-cell column-count amendment.

## Done when

1. `hasMultipleColumns` added + unit-tested; value cell gates on it; container
   skips a `[data-value-cell]` target.
2. All six browser checks pass on `appx-dev`; the reported bug (multiline paste →
   rows) is gone and native undo works.
3. Full gate green (typecheck · lint · format · test · build).
4. No reducer / schema / storefront / dependency change.
5. Docs updated (data-model §7, feature 21 open question, progress-tracker).
