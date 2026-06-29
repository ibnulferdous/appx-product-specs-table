# Editor bulk delete — multi-select rows + Delete selected / Select all + confirm

## Goal in one sentence

Give the editor a **multi-select delete** so a merchant can remove **several rows (or all
of them) in one gesture** — a per-row **checkbox**, a contextual **bulk-action bar** (selection
count + Select all / Deselect all + a critical **Delete** button) that takes over the row toolbar
while a selection exists, and a **confirmation modal** for large/all deletes — closing the
asymmetry where up to **200 rows can be added in one paste** but can only be removed **one ✕ at a
time**.

## Why this is now

The editor is **add-heavy and remove-light**. A bulk table paste can add up to `MAX_TEMPLATE_ROWS`
(200) rows in a single gesture (`PASTE_ROWS`, features 22–24), but the only way to remove rows is
the per-row delete ✕ in `RowGutter` (`onDelete` → `DELETE_ROW`, one row per click). A merchant who:

- pastes the **wrong** spreadsheet, or
- imports a large table and decides to **start over**, or
- just wants to clear a block of stale rows,

has no recovery except clicking ✕ dozens of times. There is **no undo/redo today** (it is named as
a future feature in `rows.ts`'s header comment but does not exist), so this is the *only* fast way
back from a large unwanted insert.

This slice ships the **safety valve**. A real reducer **undo/redo** is a separate, soon-to-follow
slice; it is the better long-term answer to "I deleted the wrong rows," and this feature is
designed to compose cleanly with it (a single `DELETE_ROWS` action is exactly one undoable step).

## Scope

**In this slice**

1. **`DELETE_ROWS` reducer action** — remove N rows by id in one pure, same-reference-safe step.
2. **Selection state in the engine** — a `selectedRowIds: Set<string>` kept *separate* from the
   existing single-focus `activeRowId`, plus toggle / select-all / clear / delete-selected handlers.
3. **Per-row checkbox** in `RowGutter`, left of the drag handle.
4. **Contextual bulk-action bar** — replaces the normal `RowActionsToolbar` content while a
   selection exists: `"N selected"`, **Select all (N)** / **Deselect all**, and a `tone="critical"`
   **Delete** button; the `Rows: N / 200` counter stays visible.
5. **Confirm modal** for destructive bulk deletes (gated on count), reusing the App-Bridge modal
   pattern and the hide-on-save guard already used by the Insert-field and Paste-cap modals.

**Deferred (explicitly not here)**

- **Undo/redo** — the next slice. This feature only needs to emit one clean `DELETE_ROWS` step that
  a future history stack can capture; it adds no history itself.
- **Range select** (`Shift+click`) and a **`Delete`/`Backspace` keyboard shortcut** on the selection
  — power-user niceties; can land as a small follow-up once the core multi-select ships.
- **Bulk operations other than delete** (bulk duplicate, bulk move, bulk `hideWhenEmpty` toggle) —
  out of scope; the bar holds **Delete only** for now.

## Why this shape (not a standalone "Delete all" button)

Select-all is just the degenerate case of multi-select, so **one mechanism covers both** the
"delete these few" ergonomics and the "clear everything" safety valve — no second control competing
for toolbar space. Entry point for delete-all is **Select all → Delete**, not a separate always-on
"Delete all" button. This also matches the standard Shopify/Polaris resource-list bulk pattern
merchants already know (the "N selected" contextual bar).

## What changes (architecture)

A new reducer action, new **selection** state in the engine (orthogonal to `activeRowId`), a
checkbox in the gutter, a conditional bulk bar, and one confirm modal. **No server change, no schema
change, no new dependency.** Delete is a client-side reducer edit that only persists through the
existing Save path (`saveTemplateForShop`), which already enforces shop isolation, the cap, and
per-row validation server-side — and a delete can only **shrink** the array, so nothing new is
needed there.

### 1. `DELETE_ROWS` action — `app/utils/rows.ts`

Add alongside the existing single `DELETE_ROW` (which **stays** — the per-row ✕ is unchanged):

```ts
| { type: "DELETE_ROWS"; ids: string[] }
```

```ts
case "DELETE_ROWS": {
  if (action.ids.length === 0) return rows;          // nothing selected — same-ref no-op
  const remove = new Set(action.ids);
  const next = rows.filter((row) => !remove.has(row.id));
  // Return the SAME array reference when nothing matched, so a stale/foreign id set
  // never flips the editor's dirty flag — mirroring MOVE_ROW / PASTE_ROWS no-ops.
  return next.length === rows.length ? rows : next;
}
```

- **No cap check** — like `MOVE_ROW`, a delete can never grow the array.
- **Allowed to empty the template.** The data-model imposes no minimum row count (emptiness is a
  per-row `hideWhenEmpty` concern, not a template constraint), and `ContentTab` already renders a
  "No rows yet" empty state for `rows.length === 0`. So **Select all → Delete leaves an empty
  template**, which Save persists; the merchant rebuilds with Add row. (See Locked decisions — no
  forced reseed.)
- **Pure + deterministic**, like every other action; covered by new unit tests (below).

### 2. Selection state + handlers — `app/routes/app.templates_.$id/useRowEngine.ts`

Selection is **separate** from `activeRowId`. `activeRowId` is single-focus and drives caret /
insert-after-active / scroll affordances; conflating it with a multi-select would break those. Add:

```ts
const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
const selectedCount = selectedRowIds.size;
const allSelected = rows.length > 0 && selectedCount === rows.length;

const toggleSelected = useCallback((id: string) => {
  setSelectedRowIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}, []);
const selectAll = useCallback(
  () => setSelectedRowIds(new Set(rows.map((r) => r.id))),
  [rows],
);
const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);
```

**Delete handler — reuse the existing post-delete cleanup.** `onDelete` (the single-row path)
already clears `activeRowId` and the saved caret/`hasActiveCaret` gate when the deleted row held
them (`useRowEngine.ts`). Factor that cleanup into a small shared helper so single and bulk delete
**cannot drift**, then:

```ts
const handleDeleteSelected = useCallback(() => {
  if (saving) return;                       // editor is frozen during a save
  const ids = [...selectedRowIds];
  dispatch({ type: "DELETE_ROWS", ids });
  // If the active row or the saved caret was in the deleted set, null them out
  // (shared helper with onDelete) so the toolbar/Insert-field gates can't target
  // a row that no longer exists.
  clearSelection();
  shopify.toast.show(`Deleted ${ids.length} ${ids.length === 1 ? "row" : "rows"}`);
}, [saving, selectedRowIds, /* shared cleanup deps */]);
```

**Selection must survive structural edits without dangling ids.** Reorder (`MOVE_ROW`) keeps ids, so
selection is unaffected. After any delete, `selectedRowIds` is cleared. A paste does **not** clear
selection but adds rows the merchant did not select — acceptable (the bar shows the unchanged count).
Because the bulk bar derives `allSelected` from `rows`, a `selectedRowIds` that contains an id no
longer present (defensive) still deletes cleanly (the reducer set-filters), but prefer to keep the
set pruned to live ids on delete to avoid a stale "N selected" count.

Expose on the returned engine: `selectedRowIds`, `selectedCount`, `allSelected`, `toggleSelected`,
`selectAll`, `clearSelection`, `handleDeleteSelected`, plus the confirm-flow handlers (below).

### 3. Confirm modal flow — `useRowEngine.ts` + `BulkDeleteModal.tsx` (new) + `editorShared.ts`

Mirror the Paste-cap modal (feature 24) exactly:

- **Gate the modal on count.** Deleting **1–2** selected rows is already a deliberate toolbar action
  → delete immediately, no modal. Deleting **3+** (and therefore Select all → Delete) → open a
  confirmation modal first. (Threshold is a named constant in `editorShared.ts`, e.g.
  `BULK_DELETE_CONFIRM_THRESHOLD = 3`, never a hardcoded literal — same convention as
  `MAX_TEMPLATE_ROWS`.)
- `requestDeleteSelected()` — if `selectedCount >= threshold`, `shopify.modal.show(BULK_DELETE_MODAL_ID)`;
  else call `handleDeleteSelected()` directly.
- `handleConfirmBulkDelete()` — `shopify.modal.hide(...)`, then `if (!saving) handleDeleteSelected()`.
  Guards on `saving` (the modal portals **outside** the editor's `inert` freeze, like every other
  editor modal, so Continue must not mutate rows mid-save).
- `handleCancelBulkDelete()` — hide only; deletes nothing, selection preserved.
- **`BulkDeleteModal.tsx`** (new, presentational) — `<s-modal id={BULK_DELETE_MODAL_ID}>` mounted in
  `ContentTab` beside `InsertFieldModal` / `PasteCapModal`. Body: a `tone="warning"` banner —
  *"Delete {selectedCount} rows? This can't be undone."* (note it also discards them from the
  unsaved working set; they are only gone for good after Save). Primary **Delete {selectedCount} rows**
  (`tone="critical"`) → `handleConfirmBulkDelete`; secondary **Cancel** → `handleCancelBulkDelete`.
- **New modal id** in `editorShared.ts`: `BULK_DELETE_MODAL_ID = "bulk-delete-modal"`.

### 4. Hide-on-save — `useRowEngine.ts`

Add `BULK_DELETE_MODAL_ID` to the existing "hide modals when a save begins" effect (the one that
already hides `INSERT_FIELD_MODAL_ID` and `PASTE_CAP_MODAL_ID` and clears `pendingPaste`). Same
reason: it portals outside the freeze, so a save starting while it is open must not leave its
critical Delete button live. Defense in depth alongside the `saving` guard in
`handleConfirmBulkDelete` / `handleDeleteSelected`.

### 5. Per-row checkbox — `RowGutter.tsx` + `EditorRowItem.tsx`

- `RowGutter` gains `selected: boolean` + `onToggleSelected: () => void` and renders an
  `<s-checkbox>` (or a native checkbox styled in the CSS module to match the muted gutter
  affordances) **left of the drag handle**, with an accessible label `"Select row {rowNumber}"`.
- **Visibility:** the gutter controls are muted-at-rest and revealed on `:hover` / `.rowActive` /
  `:focus-within` (CSS module `.gutter`). The checkbox follows the same rest-muting **but stays
  visible whenever the row is selected** (a checked box can't be hidden, or the selection becomes
  invisible while scrolling). Drive this with a `data-selected`/class hook on the gutter, like the
  drag handle's `data-dragging`.
- **Gutter width:** `GUTTER` is currently `"4rem"` sized for *two* controls (drag handle + ✕). Adding
  a third control means widening `GUTTER` in `editorShared.ts` (`DATA_COLUMNS` / `SECTION_COLUMNS`
  derive from it, so the header, data rows, and section rows stay aligned automatically). Retune the
  one constant; do not hardcode per-row widths.
- `EditorRowItem` threads `selected={selectedRowIds.has(row.id)}` and a memo-stable
  `onToggleSelected` (curried per row like `handleDelete`) into `RowGutter`. Keep `EditorRowItem`'s
  `memo` win intact: `selected` is a boolean, and the toggle callback must be stable, so only
  selection-changed rows re-render.

### 6. Bulk-action bar — `RowActionsToolbar.tsx` (or a sibling `BulkActionsBar.tsx`)

`RowActionsToolbar` is already a pinned `<s-grid gridTemplateColumns="1fr auto">` above the bounded
scroller (reshell A3), so the bar inherits the "always in view while rows scroll" win. When
`selectedCount > 0`, **swap the left cell** (Add row / Add section / Duplicate / Insert field) for
the bulk controls; keep the right cell `Rows: N / 200` counter:

- `"{selectedCount} selected"` text,
- **Select all ({rows.length})** when `!allSelected`, else **Deselect all** (`clearSelection`),
- **Delete** `<s-button tone="critical">` → `requestDeleteSelected`,
- a way to exit selection (Deselect all doubles as it; Esc could also clear).

Keep it presentational — all state + handlers come from the engine, matching the existing toolbar.
Whether this is an `if (selectedCount > 0)` branch inside `RowActionsToolbar` or a separate
`BulkActionsBar` component swapped in by `ContentTab` is an implementation detail; prefer the
component split if the conditional makes the toolbar hard to read.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Per-row delete ✕ (existing) | unchanged — `DELETE_ROW` (one row) |
| Delete 1–2 selected rows | **new** — `DELETE_ROWS` applied immediately, no modal |
| Delete 3+ selected rows | **new gate** — confirm modal first; on Confirm, `DELETE_ROWS` |
| Select all → Delete | **new** — confirm modal (count ≥ threshold), then `DELETE_ROWS` with every id → empty template |
| Toggle / select-all / clear selection | engine state only (`selectedRowIds`) — **no reducer action** |

One new reducer action (`DELETE_ROWS`); all selection lives in the engine + presentational UI.

## Locked decisions

- **Multi-select, not a standalone "Delete all" button.** Select-all → Delete covers the clear-all
  case; one mechanism, one critical button.
- **Selection is separate from `activeRowId`.** `selectedRowIds` (a Set) is orthogonal to single
  focus, so caret / insert-after-active / scroll affordances are untouched.
- **Confirm large/all deletes, skip tiny ones.** Modal fires at `selectedCount >= threshold`
  (default 3); 1–2 deletes apply immediately. The confirm modal is the primary safeguard given
  there is no undo yet.
- **Delete may empty the template.** No forced scaffold reseed — the data-model has no minimum-row
  invariant and `ContentTab` already shows a "No rows yet" empty state. (Revisit only if a future
  data-model rule requires ≥1 row.)
- **`DELETE_ROW` (single ✕) stays.** Bulk delete is additive, not a replacement; the per-row control
  is the fast path for one row.
- **Mid-save safety mirrors the other modals.** `BULK_DELETE_MODAL_ID` hides on save-start and
  Confirm/Delete are `saving`-guarded — no mutate-during-save path.
- **One clean `DELETE_ROWS` step.** Designed so the upcoming undo/redo slice captures a bulk delete
  as exactly one undoable history entry.

## What this slice does *not* own (boundary)

- **Undo/redo** — next slice; this adds no history stack.
- **Range select / keyboard-delete shortcut** — deferred follow-ups.
- **The cap** — `MAX_TEMPLATE_ROWS` and its enforcement are untouched; delete only shrinks.
- **Persistence / keying / metaobject sync** — unchanged; bulk delete rides the existing Save path
  (`saveTemplateForShop` → `syncTemplateToMetaobject`).
- **Template-level Delete** (feature 20's header "Delete template") — a different action (removes the
  whole template); this is row-scoped and lives in the editor body.

## File placement (per `code-standards.md`)

- `DELETE_ROWS` action + reducer case → **`app/utils/rows.ts`**.
- Selection state + handlers + confirm flow + hide-on-save → **`useRowEngine.ts`**.
- New confirm modal → **`BulkDeleteModal.tsx`**, mounted in **`ContentTab.tsx`**.
- New modal id + confirm threshold constant → **`editorShared.ts`**; widen `GUTTER` there too.
- Checkbox → **`RowGutter.tsx`**, threaded via **`EditorRowItem.tsx`** (and `RowGrid.tsx` if it
  passes the new props through).
- Bulk bar → **`RowActionsToolbar.tsx`** (or new `BulkActionsBar.tsx`).
- Checkbox rest-muting + selected-visible + widened gutter → **`SpecTableEditor.module.css`**.
- `template.server.ts`, `schema.prisma`, `rowsSerialize.ts`, `metaobjects.server.ts`, the route
  action — **no change**.

## Testing

Follow the existing strategy (`[[testing-strategy]]`): unit-test the pure reducer; the engine/UI
wiring (App Bridge modal, checkbox, bulk bar, Polaris web components) is covered by **manual browser
verification** (jsdom can't render Polaris web components, and the selection handlers are
App-Bridge-imperative with little extractable pure logic).

- **`DELETE_ROWS`** unit tests in `rows.test.ts`:
  - deletes exactly the listed ids, preserves order of the rest;
  - **empty `ids` → same array reference** (no dirty flip);
  - **all-foreign / stale ids → same array reference** (no dirty flip);
  - **all ids → empty array** (delete-all leaves `[]`);
  - mixed live + foreign ids deletes only the live ones;
  - never touches `key`/`id` of surviving rows.
- **Manual browser checks:** checkbox toggles selection and stays visible while scrolling; the bulk
  bar appears with the right count and Select all / Deselect all; deleting 1–2 applies with no
  modal; deleting 3+ / Select all → Delete opens the confirm modal, Cancel/Esc/outside-click delete
  nothing, Confirm deletes exactly the selection and toasts the count; Select all → Delete leaves the
  "No rows yet" empty state; the modal hides if a save starts while open; **Discard restores the
  persisted rows**; the active-row/Insert-field gates don't point at a deleted row afterward.

## Open questions

- **Confirm threshold value.** Default 3; tune from merchant feedback. (No "don't ask again"
  preference in MVP, consistent with the Paste-cap modal's open question.)
- **Esc-to-clear-selection.** Nice-to-have; confirm it doesn't collide with the modal's own Esc or
  the keyboard-reorder Escape-cancel before wiring it.

## Done when

1. `DELETE_ROWS` lands in `rows.ts` with the same-reference no-op guards and unit tests (incl.
   empty-ids, all-foreign, delete-all) green.
2. A per-row checkbox appears in the gutter (label "Select row N"), stays visible while selected,
   and the gutter stays aligned (header/data/section) after the `GUTTER` retune.
3. Selecting ≥1 row swaps the toolbar for the bulk bar ("N selected", Select all / Deselect all,
   critical Delete); the `Rows: N / 200` counter stays visible.
4. Deleting 1–2 rows applies immediately; deleting 3+ (and Select all → Delete) confirms first;
   Cancel/Esc deletes nothing; Confirm deletes exactly the selection and toasts the count.
5. Select all → Delete leaves an empty template showing "No rows yet"; Discard restores the
   persisted rows.
6. The confirm modal hides on save-start and Confirm is `saving`-guarded; no mutate-during-save path.
7. After a bulk delete, the active-row and Insert-field gates never target a deleted row (shared
   cleanup with `onDelete`).
8. `npm run typecheck`, `lint`, `format:check`, `test:run`, and `build` all pass; no server, schema,
   or dependency change.
9. `context/progress-tracker.md` reflects the completed work; **browser-verified** in the embedded
   app.
