# Editor Step 14 — Smart paste routing (content-driven paste intent)

> Refines the clipboard-paste feature shipped in **Steps 12–13**. It does **not** add a
> new reducer action, a new dependency, a schema change, or new CSS. It changes **how a
> paste is routed** to one of two existing behaviors — bulk insert (Step 13) vs. in-cell
> single-value paste (Step 4) — by reading the **clipboard's shape** instead of relying on
> where keyboard focus happens to be.

## Goal in one sentence

Decide whether a paste is a **bulk table insert** or a **single-cell edit** from the
**content on the clipboard** (a real multi-cell table → bulk; a lone value → in-cell),
captured in the **capture phase** so the decision is made once at the editor root before
the value cell's own handler runs — so a merchant can paste a spec table from **anywhere
in the editor** (a value cell, a row, a handle) and get rows, while pasting a single value
into a cell still just edits that cell.

## Why this is now (the problem Step 13 left open)

Steps 12–13 shipped a working bulk paste, but its **trigger depends on focus**, which is
invisible to the merchant and brittle (see the Step 13 "Open questions" → document-level
capture, and the post-ship caveat):

- The bulk handler lives on the editor's wrapper `<div onPaste>` and **skips** any paste
  that lands in a value cell (via `event.defaultPrevented`, because `ValueCell.handlePaste`
  calls `preventDefault()` unconditionally) or in a Label/Section field (via a target
  check). So bulk only fires when focus is on a **non-field** element inside the editor
  (e.g. a drag handle).
- The "obvious" merchant gesture — *click an empty spot in the editor, then Ctrl+V* —
  focuses nothing focusable, so the paste fires on `<body>` (an **ancestor** of the
  wrapper) and the wrapper's `onPaste` **never fires**: a silent no-op.
- Conversely, a merchant who is editing a value cell and pastes a real spec table gets it
  **collapsed into one cell** as a space-joined blob (Step 4 behavior) — never what they
  intended.

The root cause is using the **weakest signal (focus)** to infer intent. The **strongest
signal is already computed**: `parseClipboardTable` + `cellCount` (Step 12) tell us the
shape of what was pasted. A 2-D grid is never one cell's content; a lone value never wants
to become rows. **Step 14 makes content the primary signal and focus only the tiebreaker
for the one genuinely ambiguous case.** This matches what spreadsheet-class editors
(Notion, Airtable, Google Sheets) already do: paste a table → it expands into rows.

This is a paste-**routing** change, so a bug here is a **routing / event-phase** bug — not
a parsing bug (Step 12, frozen), not a row-mapping or cap bug (Step 13, frozen — the
`PASTE_ROWS` dispatch + `gridToPastedRows` + the 200-row cap + the summary toast are reused
verbatim), and not an in-cell-edit bug (Step 4, frozen — its single-value paste is reused
verbatim for the non-bulk path).

## The decision model (locked)

Routing is a pure function of two inputs: the **parsed grid's shape** and **whether the
paste landed on an editable field** (a value cell, a Label/Section field, or the modal
search field). `rows = grid.length`, `cols = max row length`, `cells = cellCount(grid)`.

| Clipboard shape                                   | Caret in a Value cell        | Caret elsewhere / on editor chrome |
| ------------------------------------------------- | ---------------------------- | ---------------------------------- |
| **Single value** (`cells <= 1`, incl. empty)      | in-cell paste (Step 4)       | native / no-op                     |
| **Multi-column table** (`cols >= 2`)              | **bulk insert** (Step 13)    | **bulk insert**                    |
| **Single column, ≥2 rows** (`cols == 1, rows ≥ 2`)| in-cell paste (Step 4)       | **bulk insert**                    |

Read as a routing decision (`"bulk"` vs `"inline"`):

- `cells <= 1` → **inline** (a lone value or empty clipboard is never bulk; let the focused
  cell/field handle it, or the browser no-op in non-editable space).
- `cols >= 2` → **bulk**, regardless of where it landed — a 2-D grid is never the content of
  a single cell. (This is the key new capability: a table pasted *into a value cell* now
  bulk-inserts instead of collapsing to a blob.)
- `cols == 1 && rows >= 2` → **bulk only when the paste did NOT land on an editable field.**
  A single-column list dropped on a row/handle/empty area becomes label-only rows (Step 13's
  existing column-of-labels case); the same list pasted *into a value cell* stays an in-cell
  edit, because the merchant is clearly editing that one cell.

Only the bottom-left cell is genuinely ambiguous, and "I'm editing this cell, so keep it
here" is the natural resolution. Everything else becomes **unambiguous and focus-independent**
— which is the whole point.

**Locked: bulk wins on `cols >= 2` even over a value cell.** Rejected: "never override an
active cell edit." A spec table pasted into a cell as a space-joined blob is lossy and is
never the intent; the action is **visible (the "Added N rows" toast) and reversible (the
contextual Save bar / Discard, and undo/redo when that lands)**, so content-wins is safe.

## Foundation reused from Steps 1–13 (unchanged)

- **Parser (Step 12):** `parseClipboardTable({ htmlGrid, text })` + `extractHtmlTableGrid`
  + `cellCount` — consumed as-is. No re-parse, no new clipboard reading.
- **Bulk insert (Step 13):** `gridToPastedRows` + the `PASTE_ROWS` reducer action + the
  200-row cap truncation + the `newRowId()` minting + the summary toast + the
  set-active/scroll-into-view affordance — the entire "build → cap → dispatch → toast" body
  moves under the new routing decision **unchanged**.
- **In-cell paste (Step 4):** `ValueCell.handlePaste` (plain text at a collapsed caret,
  newlines → spaces) — **frozen**; it is now reached only for the `"inline"` route.
- **Persistence + keying (Step 9.5):** untouched. Pasted rows still ride
  `reconcileRowKeys` / `finalizeRowKeys` at Save.
- **Polaris-only, tokens not hex, a11y:** Step 14 adds **no new visible chrome** (Tier 3's
  Import modal is the deferred appendix below). The only merchant-facing surfaces are the
  existing toasts + Save bar.

## What changes (architecture)

One new **pure routing helper** (+ tests) and a **one-line wiring swap** on the editor
wrapper. **No reducer action added or changed; no new dependency; no schema/CSS change.**

### 1. Pure paste-intent classifier — `app/utils/clipboardTable.ts` (Node-unit-tested)

Add one pure function next to `gridToPastedRows`, keeping all paste logic cohesive:

- **`classifyPaste(grid: string[][], opts: { targetIsEditableField: boolean }): "bulk" | "inline"`**
  — implements the matrix above. Pure, deterministic, DOM-free (the caller resolves
  `targetIsEditableField` from the event target and passes a boolean), so it is fully
  Node-testable like `gridToPastedRows`. Reuses the existing `cellCount`; computes `cols`
  as the max row length.

```ts
export function classifyPaste(
  grid: string[][],
  opts: { targetIsEditableField: boolean },
): "bulk" | "inline" {
  if (cellCount(grid) <= 1) return "inline"; // lone value / empty → not a bulk gesture
  const cols = grid.reduce((max, row) => Math.max(max, row.length), 0);
  if (cols >= 2) return "bulk"; // a 2-D table is never one cell's content
  // single column, ≥2 rows: bulk unless the paste landed in an editable field
  return opts.targetIsEditableField ? "inline" : "bulk";
}
```

### 2. Capture-phase wiring — `app/routes/app.templates_.$id/SpecTableEditor.tsx`

Move the bulk capture from the wrapper's **bubble-phase** `onPaste` to its **capture-phase**
`onPasteCapture`, and replace the focus-based skip guards with the content-driven decision:

- Change `<div onPaste={handleContainerPaste}>` → `<div onPasteCapture={handlePasteCapture}>`.
- `handlePasteCapture`:
  1. Null-guard `event.clipboardData`.
  2. Parse the grid (`extractHtmlTableGrid` + `parseClipboardTable`) — same as today.
  3. Resolve context from the event target:
     `targetIsEditableField = !!target?.closest?.('[contenteditable], [role="textbox"], s-text-field, s-search-field, input, textarea')`.
  4. `if (classifyPaste(grid, { targetIsEditableField }) !== "bulk") return;` — **do not
     `preventDefault`**, let the event continue to the value cell's `onPaste` (Step 4
     single-value paste) or the field's native paste.
  5. Bulk route: `event.preventDefault()` **and `event.stopPropagation()`** (see "Why
     capture phase" below — this is what prevents `ValueCell.handlePaste` from also running),
     then run the **existing** Step 13 body verbatim: `room` from `rowsRef.current.length`,
     `gridToPastedRows`, `slice(0, room)`, `newRowId()` per row, `dispatch(PASTE_ROWS)`,
     set the last row active + scroll into view, and the `Added N rows` / truncation toast.

- **Remove** the now-obsolete guards from the old handler: the `event.defaultPrevented`
  check (irrelevant in capture phase — the cell handler hasn't run yet) and the
  "skip if target is an in-tree editable" early-return (that decision is now inside
  `classifyPaste` via `targetIsEditableField`).

- **`ValueCell.handlePaste` is unchanged.** For the `"inline"` route the capture handler
  returns without preventing/stopping, so the event reaches the cell and Step 4 runs exactly
  as before.

### Why capture phase (the load-bearing detail)

`ValueCell.handlePaste` is a React **bubble-phase** `onPaste` that `preventDefault()`s
immediately. To override it for a table paste, our decision must run **before** it. React's
**`onPasteCapture`** on the wrapper fires during the capture phase (outermost → innermost),
i.e. **before** any inner `onPaste`. When the wrapper's capture handler calls
`event.stopPropagation()`, React does not dispatch the event to inner bubble handlers, so
`ValueCell.handlePaste` never runs — and `preventDefault()` stops the browser's own paste.
For the `"inline"` route the capture handler does nothing, so the event flows down to the
cell unchanged. This is why the capture phase (not a second bubble handler) is required, and
why it stays a React `onPasteCapture` (idiomatic, auto-scoped to the editor subtree, no
manual `addEventListener`/cleanup).

## Sub-steps (build and verify one at a time)

Each builds clean (`npm run typecheck` + `lint` + `format:check` + `test:run` + `build`).

### 14.1 — Pure `classifyPaste` helper (+ tests)

Add `classifyPaste` to `clipboardTable.ts`. No component change yet.

**Verify (unit tests, Node, in `clipboardTable.test.ts`):**
- `cells <= 1` → `"inline"`: empty grid `[]`; a 1×1 grid; (target field both true/false).
- `cols >= 2` → `"bulk"` regardless of `targetIsEditableField` (true AND false): a 1-row
  2-col table; a multi-row 2-col table; a ragged grid whose max width ≥ 2.
- `cols == 1 && rows >= 2` → `"bulk"` when `targetIsEditableField: false`, `"inline"` when
  `true` (the single-column-list tiebreaker).
- Pure: does not mutate the grid.

### 14.2 — Wire capture-phase routing (browser)

Swap `onPaste` → `onPasteCapture`, call `classifyPaste`, `stopPropagation` + `preventDefault`
on bulk, reuse the Step 13 insert body; delete the old focus guards.

**Verify (browser, real embedded app — manual paste; the editor is a cross-origin iframe so
the gesture can't be automation-delivered, see [[browser-verify-embedded-app]]):**
- **Paste a multi-column spec table while the caret is inside a Value cell** → it
  **bulk-inserts rows** (does NOT collapse into the cell), `Rows: N / 200` climbs, the Save
  bar appears, the `Added N rows` toast shows. *(This is the headline new behavior.)*
- **Paste the same table with focus on a row / drag handle / empty editor area** → identical
  bulk insert. Focus no longer matters.
- **Paste a single value into a Value cell** → unchanged Step 4 in-cell paste at the caret
  (newlines → spaces); **no** bulk insert, **no** toast.
- **Paste a single value into a Label/Section field** → native single-field paste; no bulk.
- **Paste a single-column, multi-row list** (`A⏎B⏎C`): into a Value cell → in-cell edit;
  onto a row/handle → 3 label-only rows.
- **Cap path** still truncates to 200 + toasts the dropped count (Step 13 body reused).
- **Save** → pasted rows persist with provisional keys finalized to label slugs (Step 9.5
  path, Neon-confirmed). **No console errors** (admin top frame).

## Reducer actions

| Interaction                                  | Mechanism                                                        |
| -------------------------------------------- | --------------------------------------------------------------- |
| Route a paste to bulk vs. in-cell            | **new pure `classifyPaste`** (content shape + target context)   |
| Bulk insert from a table paste               | unchanged — Step 13 `PASTE_ROWS` + `gridToPastedRows` + cap      |
| In-cell single-value paste                   | unchanged — Step 4 `SET_VALUE_TEXT` at the caret                 |
| Persist / finalize pasted-row keys           | unchanged — Step 9.5 Save → `reconcileRowKeys`                   |

**No reducer action added or changed.** Step 14 is routing + a pure helper only.

## Locked decisions

- **Content shape is the primary signal; focus is only the tiebreaker** for a single-column
  multi-row paste landing in a value cell. Rejected: focus-only routing (Step 13's brittle
  model — the very thing this fixes).
- **Capture phase + `stopPropagation`** is the mechanism (so the content decision precedes
  `ValueCell.handlePaste`). Rejected: a second bubble handler (runs *after* the cell already
  prevented default — too late) and a manual `document` capture listener (needs manual
  scoping + cleanup; `onPasteCapture` on the wrapper is auto-scoped and idiomatic).
- **A 2-D table bulk-inserts even over an active value-cell edit.** Visible + reversible, so
  content-wins is safe; collapsing a grid into one cell is lossy and never intended.
- **No reducer/dependency/schema/CSS change; Step 4 and Step 13 bodies frozen and reused.**

## What Step 14 does NOT own (boundary with later work)

- **The body-focus / "nothing focused at all" case.** `onPasteCapture` on the wrapper fires
  only for pastes whose target is inside the editor subtree. A paste with focus on the page
  `<body>` (clicked truly-empty space outside any focusable editor element) still won't fire.
  Covered by **Tier 3** (an explicit Import affordance) or, if wanted cheaply, by making the
  editor root focusable — deferred either way.
- **Tier 2 — a confirmation prompt** for the destructive overlap (table pasted while editing
  a cell). Deferred; the toast + Discard make it reversible enough for now. Add only if
  merchant feedback shows accidental overrides.
- **Tier 3 — the dedicated Import modal + preview** (see appendix). The discoverable,
  zero-ambiguity bulk path; built with the import/storefront work.
- **LINE_BREAK-preserving in-cell paste.** Today an in-cell paste collapses newlines to
  spaces (Step 4). Making a multiline in-cell paste produce `LINE_BREAK`s is a separate Step 4
  enhancement, **not** this step (which only routes, it does not change in-cell behavior).
- **Undo/redo.** Deferred from the numbered steps; a paste is a normal reducer transition and
  will compose with it.

## File placement (per `code-standards.md` File Organization)

- Pure `classifyPaste` → **`app/utils/clipboardTable.ts`** (+ tests in
  **`app/utils/clipboardTable.test.ts`**), beside `gridToPastedRows` / `cellCount`.
- Capture-phase wiring → **`app/routes/app.templates_.$id/SpecTableEditor.tsx`**
  (swap `onPaste` → `onPasteCapture`; reuse the Step 13 insert body).
- `app/utils/rows.ts`, `rowsSerialize.ts`, `template.server.ts`, `route.tsx`,
  `metaobjects.server.ts`, `schema.prisma`, `package.json`, the CSS module — **no change.**

## Open questions

- **Should a `cols >= 2` table pasted into a Label/Section field also bulk-insert?** Locked
  to **yes** (content wins) for simplicity; revisit if overriding a label edit surprises
  merchants (the exemption would be: treat a single-line field target like a value cell for
  the `cols >= 2` case too).
- **Body-focus capture** — promote to a `document`-level capture or a focusable editor root
  so "click empty space, then paste" also works? Deferred; Tier 3 covers the discoverable
  path. Re-evaluate with real usage.
- **Confirm the single-column tiebreaker against a real paste** — verify in 14.2 that a
  `A⏎B⏎C` list reads correctly both in-cell (collapsed) and as rows (on chrome).

## Done when

1. Sub-steps 14.1–14.2 each pass their verify check.
2. A new pure **`classifyPaste`** routes paste intent per the locked matrix and is
   **unit-tested**; the bulk body (`PASTE_ROWS` + cap + toast) and the in-cell body (Step 4)
   are reused unchanged.
3. In the embedded app: a multi-column spec table **bulk-inserts from anywhere in the editor,
   including from inside a value cell**; a single value still edits the focused cell; the cap
   path and Save round-trip are unregressed.
4. **No reducer action added or changed**; `rows.ts`, `rowsSerialize.ts`, `template.server.ts`,
   `route.tsx`, `metaobjects.server.ts`, `schema.prisma`, `package.json` untouched; no new
   CSS/hex; no console errors.
5. `npm run typecheck`, `lint`, `format:check`, `test:run`, `build` all pass;
   browser-verified (manual paste) per 14.2.
6. `progress-tracker.md` updated to record the smart-paste-routing refinement and point at
   the deferred Tier 3 import flow.

---

## Appendix — Tier 3 (deferred): dedicated Import / Paste-table modal + preview

Captured now so it isn't lost; **built later, with the import/storefront work** — not part of
Step 14.

**Why:** the discoverable, zero-ambiguity bulk path. A merchant who never thinks to Ctrl+V
still finds it; no focus/permission fragility; and a **preview** de-risks the silent
"column 1 → Label" assumption.

**Shape (to spec when built):**
- A toolbar **"Import rows"** `<s-button>` (icon e.g. `import`/`table`) opens an
  `<s-modal>` (App Bridge, like the Insert-field modal).
- A **paste target** inside the modal — a `<textarea>` / contenteditable "Paste your table
  here", or read directly via `navigator.clipboard.read()` on a button click (with the
  textarea as the no-permission fallback). Parse with the **existing** `parseClipboardTable`.
- A **live preview** of the parsed rows (a small read-only table) using `gridToPastedRows`,
  with: a **"which column is the Label?"** selector (default = first column), a **row count
  vs. the 200-row cap** indicator (warn + show how many would be dropped), and basic
  empty/garbled-clipboard states.
- **Insert** dispatches the **existing `PASTE_ROWS`** (mint ids, cap-truncate) — same reducer
  path as Step 13 — then closes the modal; the contextual Save bar handles persistence.
- Reuses Steps 12–13 wholesale (parser, mapper, reducer, cap); Tier 3 is **UI + preview +
  column mapping** only. No new reducer action expected.

**Boundary:** Tier 3 is additive to Step 14 — inline smart paste (Step 14) and the Import
modal (Tier 3) coexist; the modal is the explicit/discoverable path, inline paste is the
fast path.
