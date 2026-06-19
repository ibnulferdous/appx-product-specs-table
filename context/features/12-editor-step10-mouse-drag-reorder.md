# Editor Step 10 — Mouse drag reorder (@dnd-kit)

## Goal in one sentence

Let a merchant **reorder rows by dragging the ⠿ gutter handle with the mouse** —
a `MOVE_ROW` action that array-moves the row within the Step 1 reducer, wired to
`@dnd-kit/core` + `@dnd-kit/sortable` through the gutter handle that has been inert
since Step 2 — with **no change to the persistence contract** (display order is the
array index; row `key`/`id` are untouched, so a reordered save just persists the new
order through the same Step 9.5 path) and **no keyboard / a11y work yet** (that is
Step 11).

## Why this is now (and why mouse-only)

- **The persistence contract is proven, so reorder is safe to layer on.** Step 9.5
  confirmed the `EditorRow[]` shape survives Postgres → metaobject → readback
  unchanged. Reorder is the first of the four remaining editor features
  (Steps 10–13) the roadmap deliberately gated behind that proof, because it changes
  the row array and the array is what gets persisted. It touches **only** display
  order (array index), never the row shape — so it cannot feed back into the
  serialization the spike just locked.
- **The handle has been waiting since Step 2.** The ⠿ gutter `<span>` was built in
  Step 2 as an inert, `aria-hidden` affordance with `cursor: grab`, explicitly
  labelled "Drag-to-reorder is wired in Step 4" (the comment predates the roadmap
  renumber; the owner is now Step 10). This step makes it live.
- **Mouse-only is a deliberate split, not an a11y regression we ship.** Step 11
  (keyboard sensor + focusable handle + screen-reader announcements) is the very
  next step and is a **correctness requirement for Shopify review**. Step 10 lands
  the working mouse base in isolation so the dnd-kit wiring and the `MOVE_ROW`
  reducer can be verified without also debugging the keyboard sensor and live-region
  announcements in the same slice. The handle therefore **stays `aria-hidden` this
  step** (no keyboard affordance is half-built and left dangling); Step 11 makes it
  focusable and reachable **before** the editor is submitted for review.
- **`data-model.md` already designed for this.** §6/§11: "`Template.rows` remains a
  flat JSON array … array index = display order … A flat array maps cleanly to the
  editor's local state and to `@dnd-kit` drag-and-drop reordering." §13 names
  `@dnd-kit` (`core` + `sortable`) as the one new dependency. This step is the
  realization of a decision the data model was built around, not a new architectural
  choice.

A bug in Step 10 is therefore an **array-move / drag-wiring** bug — not a
serialization or caret-model bug. The value-surface (Steps 4–9) and the persistence
boundary (Step 9.5) are frozen; the only new reducer logic is one pure array move.

## Foundation carried from Steps 1–9.5

- **The reducer is the single source of truth for order.** `rowsReducer`
  (`app/utils/rows.ts`) is pure, ids are minted by `newRowId` outside it, and
  `data-model.md` defines array index as display order. `MOVE_ROW` is just one more
  pure case on the same array — the same shape every prior action returns (a fresh
  array, source untouched).
- **Row `key` and `id` are stable and order-independent.** `data-model.md` §12: the
  `key` is the cross-product/cross-template **alignment** mechanism and must not
  change once finalized; `id` is technical identity. Reordering changes **neither** —
  it only permutes the array. So `MOVE_ROW` must **not** touch `key` or `id` (it
  carries no key-finalization concern; Step 9.5's `reconcileRowKeys` keys off the
  persisted `id`, which a reorder leaves intact).
- **Rows are React-keyed by `row.id`.** `EditorRowItem` is rendered with
  `key={row.id}` and is memoized. Reordering the array reorders the DOM, but React
  preserves each row's component instance by key — so the caret/focus state inside a
  value cell, the `pendingCaret` map, and `activeRowId` all survive a reorder
  untouched. (This is exactly why dnd-kit's sortable items are keyed by `id`.)
- **The gutter handle exists and is isolated from the value surface.** `RowGutter`
  renders the ⠿ `<span className={styles.dragHandle}>` separate from the
  contenteditable value cell, so drag listeners attach to the handle **only** — a
  drag never competes with text selection / caret placement inside the value cell.
- **Save + dirty-tracking already react to row-array changes.** `SpecTableEditor`'s
  dirty signal is `JSON.stringify(rows) !== savedRowsJson`. A reorder changes that
  string, so the contextual save bar shows automatically and Save persists the new
  order through the **unchanged** Step 9.5 action — no save-path change needed.
- **Section rows are ordinary array elements.** A `SECTION_HEADER` is a row in the
  same flat array, not a container with children (`data-model.md` §6/§11). So it
  drags exactly like a data row and carries nothing with it — confirmed below as a
  locked decision.

## What changes (architecture)

Two pieces, layered **pure reducer → dnd wiring**, each independently verifiable:

### 1. `MOVE_ROW` reducer action (pure, `app/utils/rows.ts`)

- Add **`{ type: "MOVE_ROW"; activeId: string; overId: string }`** to `RowsAction`
  and a reducer case that:
  - finds the source index (`activeId`) and target index (`overId`) via
    `findIndex`; if either is missing, or they are equal, **returns the same array
    reference** (no-op — dnd-kit can fire a drop onto the origin);
  - otherwise returns a fresh array with the source element removed and re-inserted
    at the target index (a standard array-move). Use a small private
    `arrayMove(rows, from, to)` helper (or `@dnd-kit/sortable`'s `arrayMove`,
    re-exported) — **decided in 10.1**; either way the move logic is unit-tested in
    `rows.ts`, not buried in the component.
  - The action is keyed by **ids, not indices** (dnd-kit's `onDragEnd` gives
    `active.id` / `over.id`), so the editor never threads array indices that shift
    under it; the reducer resolves indices from ids at apply time.
- **No cap check** — a reorder never grows the array (`MAX_TEMPLATE_ROWS` is
  irrelevant here; do not add a cap guard that could no-op a legal move).
- **No key/id mutation** — the moved element is the same object reference, just at a
  new index. `normalizeValueParts` / key helpers are **not** called (nothing about
  the row's content changed).

### 2. dnd-kit wiring (`SpecTableEditor.tsx` + `RowGutter`)

- **Install** `@dnd-kit/core` + `@dnd-kit/sortable` (and their peer
  `@dnd-kit/utilities` for the `CSS.Transform` style helper). React 18 compatible
  (verified: project is on React 18.3.1). One new dependency family, as
  `data-model.md` §13 anticipated.
- **`DndContext`** wraps the rows list in `SpecTableEditor`. Configure a
  **`PointerSensor` only** (mouse/touch pointer), with an **activation constraint**
  (`{ distance: 4 }` or similar) so a plain click on the handle does not start a drag
  and a click elsewhere is unaffected. **No `KeyboardSensor` this step** (Step 11).
  `onDragEnd({ active, over })` → if `over` and `active.id !== over.id`, dispatch
  `{ type: "MOVE_ROW", activeId, overId }`.
- **`SortableContext`** wraps the mapped rows with `items={rows.map(r => r.id)}` and
  `verticalListSortingStrategy`.
- **`EditorRowItem` becomes sortable** via `useSortable({ id: row.id })`: apply
  `setNodeRef` + `transform`/`transition` style to the row wrapper `<div>` (the plain
  `<div id={row-${row.id}}>` already there — Polaris `<s-*>` hosts are left alone).
  The hook's `attributes` + `listeners` are passed down to `RowGutter` and spread
  **only on the ⠿ handle**, so dragging starts from the handle and the value cell /
  label field / delete button stay fully interactive. The handle gets `cursor: grab`
  → `grabbing` while dragging (drive from `isDragging`).
  - **Memoization note:** `useSortable` is called **inside** `EditorRowItem`, so its
    per-frame `transform` updates re-render that row from within the hook —
    `React.memo` only gates parent-prop-driven re-renders and does not block this.
    The new props threaded down (handle `attributes`/`listeners`) are stable enough
    not to break the existing "only the edited/active row re-renders" guarantee for
    non-dragging rows; confirm no regression in 10.2.
- **Overlay decision (10.2):** start with the **default in-place transform** (no
  `DragOverlay`) — simplest, and the row's contenteditable tolerates the transform.
  Only reach for a `DragOverlay` clone if the in-place transform visibly fights the
  value surface in-browser; record the outcome. (A `DragOverlay` is a candidate Step
  11 polish regardless.)

## Sub-steps (build and verify one at a time)

Chain: **pure `MOVE_ROW` (tested) → dnd-kit wiring (browser-verified)**. Each builds
clean (`npm run typecheck` + `lint` + `build` + `test:run`).

### 10.1 — `MOVE_ROW` action + tests

Add the `MOVE_ROW` union member + reducer case + the `arrayMove` helper to
`app/utils/rows.ts`. Unit-test in `rows.test.ts` (new `describe("MOVE_ROW")`):
move down, move up, adjacent swap, move to first / last index; **no-op** when
`activeId === overId`, when `activeId` is unknown, when `overId` is unknown (returns
the **same reference**); a **section row** moves like any row (and a data row moves
past a section without absorbing it); **purity** (source array not mutated, fresh
array returned); `key`/`id` of every row unchanged after a move.

**Verify:** `test:run` covers the new case; `typecheck` / `lint` / `build` pass. No
UI change yet (the handle is still inert).

### 10.2 — Wire the gutter handle to dnd-kit

Install the deps; add `DndContext` + `SortableContext`; make `EditorRowItem`
sortable; route the handle `attributes`/`listeners` through `RowGutter`; dispatch
`MOVE_ROW` on `onDragEnd`. Decide the overlay question in-browser.

**Verify (browser, real embedded app):** grab the ⠿ handle of a data row and drag it
above/below others — the row lands where dropped and the `Rows: N / 200` counter is
unchanged; dragging a **section** row moves only that header (no children follow —
sections are not groups); the **value surface is unaffected** — after a reorder a
moved row's caret/pills/multiline value are intact and editable, and clicking into a
value cell still works (drag never hijacks text selection); the **save bar appears**
on reorder and **Save persists the new order** (reload shows the reordered rows via
the loader's `parseRows`; row `key`s are unchanged — a previously-finalized
`battery_life` stays `battery_life`); **Discard** reverts to the saved order;
dropping a row back onto itself is a no-op (no spurious dirty state if nothing moved);
**no console errors** (admin frame included).

## Reducer actions

| Interaction                  | Mechanism                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| Reorder a row by mouse drag  | `MOVE_ROW { activeId, overId }` (pure array-move, by id)    |
| Persist the new order        | unchanged Step 9.5 Save path (order = array index; no key change) |

**One new action (`MOVE_ROW`); no existing action changed.** Everything else in the
reducer, the value surface, the modal, and the persistence boundary is untouched.

## Locked decisions

- **Mouse-only this step; keyboard + a11y is Step 11.** `PointerSensor` only, no
  `KeyboardSensor`; the handle stays `aria-hidden`. Accessibility (focusable handle,
  SR announcements) lands in Step 11 **before** App Store submission — it is split
  out for verifiability, not dropped.
- **`MOVE_ROW` is keyed by row id, not index.** dnd-kit reports ids; the reducer
  resolves indices at apply time, so no index can go stale between dispatch and
  apply.
- **Reorder never touches `key` or `id`.** Display order is the array index only
  (`data-model.md` §6/§12). The cross-product alignment invariant is preserved by
  *not* re-deriving anything on move.
- **Sections drag as ordinary rows.** A `SECTION_HEADER` is a flat-array element, not
  a parent of the rows beneath it; moving it carries no children (`data-model.md`
  §6/§11).
- **Listeners attach to the ⠿ handle only.** Never to the whole row — the value cell
  must keep its caret/selection behavior. Drag activation has a small distance
  constraint so a click ≠ a drag.
- **No cap logic in `MOVE_ROW`.** A reorder cannot exceed `MAX_TEMPLATE_ROWS`; adding
  a guard would risk no-opping a legal move.
- **Persistence path is unchanged.** Reorder rides the existing Step 9.5 Save +
  dirty-tracking; this step adds no model/route/metaobject change.

## What Step 10 does *not* own (boundary with Step 11+)

- **Keyboard reorder, focusable handle, screen-reader announcements** — Step 11
  (`KeyboardSensor`, `aria` on the handle, dnd-kit `announcements` / live region;
  confirm section rows reorder by keyboard).
- **Clipboard paste (Steps 12–13)** — unchanged; this step does not touch paste.
- **A `DragOverlay` floating clone** — only if 10.2 finds the in-place transform
  fights the value surface; otherwise a Step 11 polish.
- **Persistence / metaobject / row shape** — frozen by Step 9.5; reorder changes
  order only.
- **No new pill, no value-surface change, no caret-model change.**

## File placement (per `code-standards.md` File Organization)

- `MOVE_ROW` action + `arrayMove` helper → **`app/utils/rows.ts`** (+ tests in
  **`app/utils/rows.test.ts`**).
- `DndContext` / `SortableContext` / `useSortable` wiring + handle listener routing →
  **`app/routes/app.templates_.$id/SpecTableEditor.tsx`** (and `RowGutter` within it).
- Drag-state cursor / transform styling → **`SpecTableEditor.module.css`**
  (`.dragHandle` already exists; add a dragging state). **Polaris tokens /
  `currentColor` / rem only — no hardcoded hex.**
- New dependencies → `package.json` (`@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`).

## Open questions

- **In-place transform vs. `DragOverlay` with a contenteditable value cell.** The
  default sortable transform animates the live row, whose value cell is a
  contenteditable surface — confirm in-browser it does not blur/jitter or disturb the
  caret; if it does, switch the dragged row to a `DragOverlay` clone. Decide in 10.2.
- **`PointerSensor` activation constraint inside the embedded admin iframe.** Pick a
  `distance` (or `delay`) that cleanly separates a handle *click* from a *drag* in the
  iframe without feeling laggy; verify a stray micro-drag does not mark the editor
  dirty (a no-op `MOVE_ROW` returns the same reference, so a same-spot drop should not
  flip `isDirty`). Confirm in 10.2.
- **Memoization under drag.** Confirm that threading the handle `attributes`/
  `listeners` and the sortable `transform` through `EditorRowItem` does not make
  every row re-render on each drag frame (only the dragged row should). If it does,
  isolate the sortable state so non-dragging rows still skip re-render.
- **dnd-kit + Polaris web-component hosts.** `setNodeRef`/`transform` go on the plain
  wrapper `<div>`, not on `<s-*>` hosts — confirm the `<s-grid>`/`<s-box>` chrome
  inside transforms cleanly (it should; the transform is on the outer div). Watch for
  any shadow-DOM pointer-capture quirk on the `<s-icon>` handle (mirror the
  [[polaris-web-component-gotchas]] caution).

## Done when

1. Sub-steps 10.1–10.2 each pass their verify check.
2. A merchant can **drag the ⠿ gutter handle with the mouse to reorder rows**; the
   row lands where dropped, and a **section header reorders as an ordinary row**
   (carrying no children).
3. `MOVE_ROW` is a **pure, id-keyed array-move** on the reducer: a fresh array, the
   source untouched, **no `key`/`id` change**, no cap involvement; no-ops safely on
   an unknown/equal id pair. Unit-tested.
4. Reordering marks the editor dirty and **Save persists the new order** through the
   **unchanged** Step 9.5 path; a reload shows the reordered rows and **previously
   finalized keys are unchanged**; Discard reverts.
5. The **value surface is unregressed** — caret model, pills, line breaks, the
   Insert-field modal, keyboard delete, and `activeRowId` all behave as before across
   a reorder; clicking into a value cell still works (drag is handle-only).
6. **Mouse-only** is the deliberate scope; the handle stays `aria-hidden` (Step 11
   adds keyboard + announcements before review). `Rows: N / 200` accurate; **no
   hardcoded hex**; **no console errors** (admin console included).
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all
   pass; **browser-verified end to end** in the real embedded app.
8. `progress-tracker.md` updated to mark Step 10 complete and point at Step 11
   (keyboard reorder + accessibility).
