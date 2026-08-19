# Editor bulk delete — "Undo" toast (recover a bulk delete)

## Goal in one sentence

After a **bulk delete**, show a toast carrying an **"Undo"** action button that puts the deleted
rows back exactly as they were — a cheap, self-contained safety valve that makes the editor's
scariest action reversible **without** any of the risk of the full reducer undo/redo system
(no history stack, no keyboard shortcuts, no contenteditable/caret model).

## Why this is now

`DELETE_ROWS` (feature 29) can remove **up to 200 rows in one gesture**. Today the only safety net
is the count-gated **confirm modal** — and once a merchant confirms, the *only* recovery is the
App Bridge **Discard**, which throws away **all** unsaved work, not just the delete. Feature 29's
own doc names this gap: the confirm modal is "the primary safeguard given **there is no undo
yet**."

The full reducer undo/redo system is **deferred until after the storefront renderer**
(`[[context/undo-redo-plan.md]]`). This slice closes the single most dangerous gap *now* for a tiny
fraction of that work: it is the Gmail/Shopify "Undo" toast pattern, scoped to bulk delete, and is
**superseded** by the full system when it lands.

## Scope

**In this slice**

1. **`RESTORE_ROWS` reducer action** — replace the row array with a previously-captured snapshot,
   in one pure step (restores exact `id` / `key` / `valueParts` / order — which `PASTE_ROWS` cannot,
   as it mints fresh ids/keys).
2. **Snapshot + Undo toast in `handleDeleteSelected`** — capture the pre-delete `rows`, then show
   the existing "Deleted N rows" toast **with** an `action: "Undo"` / `onAction` that dispatches
   `RESTORE_ROWS(snapshot)` and re-toasts "Restored N rows".

**Deferred (explicitly not here)**

- **Full reducer undo/redo** (history stack, keyboard shortcuts, typing coalescing, caret
  restoration) — `[[context/undo-redo-plan.md]]`, post-storefront. This slice adds **no** history.
- **Undo on the single-row ✕** (`onDelete` → `DELETE_ROW`) — a trivial optional extension using the
  same `RESTORE_ROWS` + snapshot, but a one-row delete is far less scary; left out for now.
- **Undo for any other action** (paste, reorder, duplicate, edits) — only bulk delete is covered.

## Why this shape (snapshot-restore, not positional re-insert)

To put back deleted rows you must restore the **exact** rows — same `id`, `key`, `valueParts`, and
positions. Two options were weighed:

- **Full pre-delete snapshot → replace the array (`RESTORE_ROWS`).** Simplest, most robust, and
  composes trivially. **Chosen.**
- **Positional re-insert (`INSERT_ROWS_AT`)** of just the removed rows at their original indices —
  preserves edits made *during* the toast window, but is more code and breaks if rows were
  reordered/deleted meanwhile.

**Trade-off (documented, acceptable for a stopgap):** Undo reverts the table to its exact pre-delete
state, so any edits made **during** the ~10s toast window are dropped. That window is tiny and the
realistic flow is "delete → oops → Undo immediately," so this is fine. The full system
(`[[context/undo-redo-plan.md]]`) supersedes it with a proper linear timeline.

## What changes (architecture)

One new pure reducer action and one modified engine handler. **No server change, no schema change,
no new dependency, no new component.** The App Bridge toast `action`/`onAction` fields are already
supported in the installed `@shopify/app-bridge-types` (`ToastOptions` — verified), so no custom UI
is needed.

### 1. `RESTORE_ROWS` action — `app/utils/rows.ts`

Add alongside `DELETE_ROW` / `DELETE_ROWS`:

```ts
| { type: "RESTORE_ROWS"; rows: EditorRow[] }
```

```ts
case "RESTORE_ROWS":
  // Replace the array with a previously-captured, already-valid snapshot. Used by
  // the bulk-delete "Undo" toast to restore the exact pre-delete rows (same id/key/
  // order). No cap check: a snapshot of a prior valid state already satisfied the cap.
  return action.rows;
```

- **Pure + deterministic**, like every other action; covered by new unit tests (below).
- **No cap check** — the snapshot is a state the array already held, so it cannot exceed the cap.
- The full undo/redo system restores snapshots inside its meta-reducer (not via a `RowsAction`), so
  this action is **specific to this stopgap** and may be removed when the full system lands.

### 2. Snapshot + Undo toast — `app/routes/app.templates_.$id/useRowEngine.ts`

`handleDeleteSelected` (~`useRowEngine.ts:477`) is the **single chokepoint** for both bulk paths —
the 1–2-row immediate delete and the 3+-row confirm-modal delete both call it — so wiring it here
covers **all** bulk deletes for free. Change it to:

```ts
const handleDeleteSelected = useCallback(() => {
  if (saving) return;                          // editor is frozen during a save
  const ids = [...selectedRowIds];
  if (ids.length === 0) return;
  const snapshot = rowsRef.current;            // capture the live pre-delete array
  dispatch({ type: "DELETE_ROWS", ids });
  const removed = new Set(ids);
  cleanupAfterDelete((rowId) => removed.has(rowId));
  clearSelection();
  const n = ids.length;
  const word = n === 1 ? "row" : "rows";
  shopify.toast.show(`Deleted ${n} ${word}`, {
    duration: 10000,
    action: "Undo",
    onAction: () => {
      if (saving) return;                      // toast lives outside the inert freeze (defense in depth)
      dispatch({ type: "RESTORE_ROWS", rows: snapshot });
      shopify.toast.show(`Restored ${n} ${word}`);
    },
  });
}, [saving, selectedRowIds, cleanupAfterDelete, clearSelection, shopify]);
```

Baked-in correctness:

- **`saving` guard in `onAction`.** The toast portals to the admin chrome, **outside** the editor's
  `inert` freeze (like the modals), so re-guard on `saving` — mirroring the existing guards in
  `handleDeleteSelected` / `handleConfirmBulkDelete`.
- **Dirty flag stays correct for free.** `RESTORE_ROWS` returns the *exact* snapshot array, so
  `JSON.stringify({ rows, name, status })` returns to its pre-delete value; `isDirty` (a JSON
  compare, not a reference check) flips back exactly as it should — not dirty if the pre-delete
  state was the saved baseline, still dirty if it was already dirty.
- **Selection stays cleared** on restore (rows reappear deselected) — clean, no extra work. The
  existing "prune `selectedRowIds` to live ids" effect handles the array growing back.
- **Active-row / Insert-field gates** are untouched by restore; `cleanupAfterDelete` already ran on
  delete, and the reappearing rows don't re-arm any gate. Acceptable for the stopgap.

**Optional polish (cheap):** in `onAction`, set `scrollTargetRef.current` to the first restored
row's id and `setActiveRowId(...)` so Undo scrolls the restored block back into view (reuses the
existing scroll affordance). Skip for the absolute minimum.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| Bulk delete (1–2 immediate, or 3+ confirmed) | unchanged — `DELETE_ROWS` (feature 29) |
| **Undo the bulk delete** (toast action) | **new** — `RESTORE_ROWS` with the captured snapshot |
| Per-row delete ✕ | unchanged — `DELETE_ROW`; **no** Undo toast in this slice |

One new reducer action (`RESTORE_ROWS`); the snapshot + toast wiring lives in the engine.

## Locked decisions

- **Snapshot-restore, not positional re-insert.** Full pre-delete snapshot → `RESTORE_ROWS`; the
  ~10s-window edit-loss trade-off is accepted for a stopgap.
- **Bulk delete only.** The single-row ✕ is intentionally not covered (less scary; trivial to add
  later with the same mechanism).
- **No history stack.** This is one snapshot held in a closure per delete, not a timeline. The full
  system (`[[context/undo-redo-plan.md]]`) owns the timeline and supersedes this.
- **Toast duration 10s.** Long enough to react; the App Bridge default is 5s. Tune from feedback.
- **`RESTORE_ROWS` is a stopgap action.** The full system restores snapshots in its meta-reducer,
  not via a `RowsAction`; this action may be removed when that lands.
- **Mid-save safety.** `onAction` is `saving`-guarded; the toast cannot mutate rows during an
  in-flight save.

## What this slice does *not* own (boundary)

- **Full undo/redo** — `[[context/undo-redo-plan.md]]`, post-storefront.
- **Single-✕ undo, paste/reorder/duplicate/edit undo** — out of scope.
- **The confirm modal** (feature 29) — unchanged; Undo complements it (confirm prevents the obvious
  mistake, Undo recovers the one that slips through).
- **Persistence / keying / metaobject sync** — unchanged; restore is a client-side reducer edit that
  rides the existing Save path. A restore can only return the array to a prior valid size, so the
  server cap / validation are untouched.
- **Template-level Delete** (feature 20 header "Delete template") — a different, route-level action.

## File placement (per `code-standards.md`)

- `RESTORE_ROWS` action + reducer case → **`app/utils/rows.ts`** (+ tests in `rows.test.ts`).
- Snapshot capture + Undo toast wiring → **`app/routes/app.templates_.$id/useRowEngine.ts`**
  (`handleDeleteSelected`).
- `template.server.ts`, `schema.prisma`, `rowsSerialize.ts`, `metaobjects.server.ts`, the route
  action, every presentational component, and `SpecTableEditor.module.css` — **no change**.

## Testing

Follow the existing strategy (`[[testing-strategy]]`): unit-test the pure reducer; the toast wiring
is **browser-verified** (App Bridge toasts do not render in jsdom).

- **`RESTORE_ROWS`** unit tests in `rows.test.ts`:
  - returns exactly the provided snapshot array (content + order + each row's `id`/`key`);
  - round-trip `DELETE_ROWS(ids)` → `RESTORE_ROWS(snapshot)` yields rows deep-equal to the original;
  - restoring an empty snapshot yields `[]` (delete-all then undo path is coherent).
- **Manual browser checks:**
  - delete 1–2 rows → toast shows **Undo** → click → exact rows return, "Restored N rows" toasts;
  - delete 3+ via the confirm modal → same Undo behavior;
  - **Select all → Delete** (empty template, "No rows yet") → Undo restores the full table;
  - after restore, the SaveBar dirty state is correct (not dirty if it matches the saved baseline);
  - Undo is inert during an in-flight save (the `onAction` guard holds);
  - letting the toast expire without clicking leaves the delete in place (normal behavior).

## Open questions

- **Toast duration.** 10s default; tune from merchant feedback.
- **Extend Undo to the single-row ✕?** Cheap follow-up; decide if merchants expect it.
- **Optional scroll-to-restored** affordance — include the cheap polish or keep the minimum?

## Done when

1. `RESTORE_ROWS` lands in `rows.ts` with unit tests (verbatim restore + delete→restore round-trip +
   empty snapshot) green.
2. After a bulk delete (both the 1–2 immediate and 3+ confirm paths), the toast shows an **Undo**
   action that restores the exact pre-delete rows and re-toasts the restored count.
3. The restore's dirty/SaveBar state is correct; Undo is `saving`-guarded; no mutate-during-save path.
4. `npm run typecheck`, `lint`, `format:check`, `test:run`, and `build` all pass; no server, schema,
   or dependency change.
5. `context/progress-tracker.md` reflects the completed work; **browser-verified** in the embedded
   app.
