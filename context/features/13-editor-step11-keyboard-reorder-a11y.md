# Editor Step 11 — Keyboard reorder + accessibility

## Goal in one sentence

Make the row reorder shipped in Step 10 **fully keyboard-operable and screen-reader-announced** —
add a `KeyboardSensor` to the existing `DndContext`, make the ⠿ gutter handle a real
**focusable control** (spread the dnd-kit `attributes` Step 10 deliberately withheld,
drop its `aria-hidden`, give it an accessible name + a visible focus ring), and wire
**live-region announcements** (dnd-kit `accessibility={{ announcements, screenReaderInstructions }}`)
so a sighted-mouse-only feature becomes an accessible one — with **no reducer change**,
**no new dependency**, and **no change to the Step 9.5 persistence contract** (keyboard drop
fires the same `MOVE_ROW` → same Save path as a mouse drop).

## Why this is now (and why it's a separate step)

- **Accessibility is a Shopify App Store review correctness requirement, not polish.**
  `code-standards.md` ("Spec Table Editor") is explicit: *"Use `@dnd-kit` for drag-and-drop
  row reordering. Keep reordering keyboard-accessible (`@dnd-kit` supports this) — **do not
  ship mouse-only drag.**"* and ("Admin UI — Polaris"): *"Accessibility is non-negotiable:
  all interactive Polaris components must be keyboard navigable and screen-reader labelled."*
  Step 10 shipped mouse-only **by deliberate design** to land and verify the `MOVE_ROW`
  reducer + dnd-kit wiring in isolation; Step 11 is the committed follow-up that closes the
  a11y gap **before** the editor is submitted for review. This is the step that pays back the
  debt Step 10 explicitly took on.
- **The mouse base is proven, so the keyboard path is a thin, low-risk layer.** Step 10
  browser-verified the `PointerSensor` + `SortableContext` + `useSortable` wiring, the
  in-place transform's non-interference with the contenteditable caret, and the
  `MOVE_ROW` → Save round trip (confirmed directly in Postgres — keys never re-derived). A
  `KeyboardSensor` is **the same `DndContext` with a second sensor**; it produces the **same
  `onDragEnd({ active, over })`** event, which already dispatches `MOVE_ROW`. So the keyboard
  drop reuses the entire Step 10 pipeline unchanged — Step 11 adds **input + announcement
  surfaces only**, never new move logic.
- **The handle was built waiting for this.** Step 10 wired the sensor `listeners` +
  `setActivatorNodeRef` onto the ⠿ handle but **deliberately did not spread the dnd-kit
  `attributes`** (which add `role`/`tabIndex`) and kept the handle `aria-hidden="true"`,
  precisely *to avoid an aria-hidden-plus-focusable conflict until the keyboard sensor
  existed* (see the inline comment in `RowGutter` and [[polaris-web-component-gotchas]]).
  Step 11 is the other half of that decision: now that a `KeyboardSensor` makes the handle
  do something from the keyboard, it becomes focusable and reachable.

A bug in Step 11 is therefore an **input-wiring / ARIA / announcement-copy** bug — not a
move bug. The reducer (`MOVE_ROW`), the value surface (Steps 4–9), and the persistence
boundary (Step 9.5) are all frozen.

## Foundation carried from Steps 1–10

- **One `DndContext` already owns reorder.** It wraps the mapped rows in `SpecTableEditor.tsx`
  with `collisionDetection={closestCenter}` and `onDragEnd={handleDragEnd}`, where
  `handleDragEnd` dispatches `MOVE_ROW { activeId, overId }` only when `over` exists and
  `active.id !== over.id`. A `KeyboardSensor` slots into the **same** `useSensors(...)` array
  and fires the **same** `onDragEnd` — no new dispatch path.
- **`MOVE_ROW` is a pure, id-keyed array-move (frozen).** It resolves both indices from ids
  via `findIndex`, returns the **same array reference** on any no-op, and **never touches
  `key`/`id`** (display order is the array index — `data-model.md` §6/§11/§12). Keyboard drops
  and mouse drops are indistinguishable to it. **Step 11 adds no reducer case and changes none.**
- **The handle is already a separate element from the value surface.** `RowGutter` renders the
  ⠿ `<span className={styles.dragHandle}>` (with `setActivatorNodeRef` + `listeners`) apart from
  the contenteditable cell, so making *it* focusable cannot disturb the value cell's caret /
  selection. The Step 10 `data-dragging` cursor state and `.rowDragging` lift stay as-is.
- **Rows are React-keyed by `row.id` and `SortableContext items` is `rows.map(r => r.id)`.**
  Keyboard moves permute the same array by the same ids, so React preserves each row's
  instance (caret/focus/`pendingCaret`/`activeRowId` survive a keyboard reorder exactly as
  they survive a mouse reorder).
- **Sections are ordinary flat-array rows.** A `SECTION_HEADER` is `useSortable` like any row;
  keyboard reorder moves it the same way (carries no children). Just re-confirmed for keyboard.
- **Save + dirty-tracking already react to any array change.** A keyboard drop that actually
  moves a row changes `JSON.stringify(rows)`, so the contextual save bar appears and Save
  persists through the unchanged Step 9.5 path. A no-op keyboard drop (or Esc-cancel) returns
  the same array reference → no spurious dirty state.
- **In-place transform, no `DragOverlay`.** Step 10 confirmed the live-row transform does not
  fight the contenteditable; keyboard reorder uses the same in-place animation. (`DragOverlay`
  remains out of scope — only revisit if a keyboard-specific visual problem appears in 11.x.)

## What changes (architecture)

Three wiring surfaces, all in `SpecTableEditor.tsx` (+ `RowGutter`, the CSS module, and one
small pure helper). **No reducer change, no new dependency** — `KeyboardSensor` lives in the
already-installed `@dnd-kit/core` and `sortableKeyboardCoordinates` in `@dnd-kit/sortable`.

### 1. `KeyboardSensor` on the existing `DndContext`

- Import `KeyboardSensor` from `@dnd-kit/core` and `sortableKeyboardCoordinates` from
  `@dnd-kit/sortable`. Add a second sensor to the existing `useSensors(...)`:
  ```ts
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  ```
  `sortableKeyboardCoordinates` is what makes the arrow keys step through a **vertical** list
  correctly (without it, the default keyboard coordinate getter does not understand the sortable
  layout). Default keys are Space/Enter to pick up & drop and Escape to cancel.
- **`onDragEnd` is unchanged** — keyboard produces the same `{ active, over }`. `onDragCancel`
  (Esc) needs no dispatch (the array never changed), but is wired for its **announcement** (see §3).

### 2. The ⠿ handle becomes a real focusable control

`RowGutter` currently receives `dragListeners`, `setActivatorNodeRef`, `isDragging`. Add the
dnd-kit **`attributes`** and an **accessible label**, then:

- **Spread `attributes` on the handle** alongside the existing `listeners` + `setActivatorNodeRef`
  (dnd-kit requires all three on the **same** activator element when using a separate handle).
  `attributes` supplies `role="button"`, `tabIndex={0}`, `aria-roledescription="sortable"`,
  `aria-describedby` (pointing at the instructions dnd-kit auto-renders), `aria-disabled`, and
  `aria-pressed` (true while this handle's item is picked up).
- **Drop `aria-hidden="true"`** — the Step 10 conflict (hidden + focusable) is resolved now that
  the handle is genuinely operable.
- **Make it a native `<button type="button">`** instead of a `<span>` (dnd-kit's own guidance:
  a `<button>` is the most accessible drag handle). Reset its native chrome in the CSS module
  (`appearance/background/border/padding/margin/font/color` → inherit/none) so it stays visually
  the muted ⠿ affordance from Step 10. *Rejected: keep the `<span>` + rely on `attributes`'
  `role="button"` — works, but a real button is the App-Store-review-safe, keyboard-default
  choice and avoids hand-rolling button semantics. Locked to native `<button>`.*
- **Give it an accessible name.** The icon-only handle has no text, so add
  `aria-label={`Reorder ${rowLabel}`}` where `rowLabel` is the row's label (falling back to
  `section N` / `row N` when blank). Pass this label down from `EditorRowItem` (it already
  computes `rowNumber`; it knows `row.label` and `isSection`). Mark the inner `<s-icon>`
  presentational so the button isn't double-announced.
- **Tab order note:** the handle joins the tab order as the first focusable in each row's gutter
  (handle → delete → label → value). Focusing it bubbles to the existing
  `onFocusCapture={handleActivate}`, so tabbing onto a handle marks that row active (subdued bg +
  accent) — benign and arguably correct; confirm it's not visually noisy in 11.1.

### 3. Screen-reader announcements + instructions

- Pass `accessibility={{ announcements, screenReaderInstructions }}` to the `DndContext`.
  dnd-kit renders the visually-hidden live region and the `aria-describedby` instructions element
  automatically; we only supply the **copy**, made row-aware (the defaults say "draggable item",
  which is useless to a merchant reordering named spec rows).
- **`announcements`** is an object of callbacks (`onDragStart`, `onDragOver`, `onDragEnd`,
  `onDragCancel`) that receive `{ active, over }` (ids) and return a string. They must read the
  **current** `rows` to map an id → 1-based position + label, e.g.:
  - start: `"Picked up row Battery Life. Use the arrow keys to move it, space to drop, escape to cancel."`
  - over: `"Row Battery Life is now over position 3 of 9."`
  - end: `"Row Battery Life dropped at position 3 of 9."`
  - cancel: `"Reordering cancelled. Row Battery Life returned to its position."`
- **Pure copy helper (testable):** extract the message strings into a small pure module —
  `app/utils/reorderAnnouncements.ts` — exporting the position/label resolution and the four
  message builders over `(rows, activeId[, overId])`, returning plain strings (importing the
  `EditorRow` **type** only — no `@dnd-kit` dependency in `utils/`). The component assembles the
  dnd-kit `announcements` object from these (thin glue), mirroring how `shopifyFields.ts` owns the
  match rule while the component owns the wiring. This keeps the SR wording **unit-tested** (label
  fallback, section vs data, position numbers, cancel/drop phrasing) so a copy regression is caught
  without a browser, and follows `code-standards.md`'s "prioritize pure logic" testing rule.
  - **Avoid stale `rows` in the callbacks.** The announcement object reads `rows`; build it fresh
    each render referencing the current `rows`, or read a `rowsRef` kept current (mirror the
    existing `rowsJsonRef` pattern). Either is fine — callbacks only fire during a drag; just don't
    close over a stale snapshot.
- **`screenReaderInstructions`** (`{ draggable: string }`): a one-line, row-specific instruction,
  e.g. *"To reorder a row, press space or enter on its drag handle, move with the arrow keys, then
  press space or enter to drop or escape to cancel."*

### 4. Focus-ring CSS (`.dragHandle`)

- Add a visible **`:focus-visible`** outline to `.dragHandle` (Polaris token / `currentColor`,
  **no hex** — the surrounding cell sets `outline: none`, so the handle needs its own ring).
  Bump the handle's `opacity: 0.5` toward full when focused (a faint focused control is a contrast
  smell). Add the `<button>` chrome reset described in §2. The Step 10 `cursor: grab/grabbing`,
  `touch-action: none`, and `.rowDragging` rules are unchanged.

## Sub-steps (build and verify one at a time)

Chain: **keyboard input + focusable handle (browser-verified) → announcements (SR/AOM-verified)**.
Each builds clean (`npm run typecheck` + `lint` + `build` + `test:run`).

### 11.1 — `KeyboardSensor` + focusable handle

Add the `KeyboardSensor` (with `sortableKeyboardCoordinates`); convert the handle to a native
`<button>`; spread `attributes`; drop `aria-hidden`; add `aria-label`; add the focus-ring +
button-reset CSS. No new pure logic here (so no new unit test in this sub-step).

**Verify (browser, real embedded app — keyboard only, no mouse):** Tab to a data row's ⠿ handle
(visible focus ring); press Space/Enter to pick it up; Arrow Down/Up to move it; Space/Enter to
drop — the row lands where left and `Rows: N / 200` is unchanged; **Escape mid-drag cancels** and
the row returns to its original position with **no dirty state**; a keyboard drop that actually
moves a row **shows the save bar** and **Save persists the new order** (verify the reordered rows
after reload via the loader's `parseRows`; row `key`s unchanged — a finalized `battery_life` stays
`battery_life`, confirmed in Postgres as in Step 10); a **section** row reorders by keyboard,
moving only that header (no children follow); the **mouse drag from Step 10 still works** (the
`PointerSensor` is unaffected); the **value surface is unregressed** (after a keyboard reorder a
moved row's caret/pills/multiline value are intact and editable); **no console errors** (admin
top frame — watch especially for any focus/`InvalidStateError` chatter à la the Step 7 modal
gotcha).

### 11.2 — Announcements + instructions

Add the pure `reorderAnnouncements.ts` helper + its tests; wire `accessibility={{ announcements,
screenReaderInstructions }}` on the `DndContext`.

**Verify:** unit tests cover the message builders (label present, label blank → `row N` /
`section N` fallback, position `k of n`, the over/start/end/cancel variants). **In-browser /
assistive tech:** with a screen reader (Windows: NVDA or Narrator) or via the browser
**accessibility tree / live-region inspection** (chrome-devtools a11y skill), confirm pick-up,
each arrow move, drop, and Escape-cancel each announce the **row's label and its position**, and
that the drag-handle button exposes its accessible name + `aria-roledescription="sortable"` +
the `aria-describedby` instructions. Re-confirm a **section** row announces with section wording.
**No console errors.**

## Reducer actions

| Interaction                         | Mechanism                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| Reorder a row by **keyboard**       | `MOVE_ROW { activeId, overId }` via the **same** `onDragEnd` (Step 10) |
| Cancel an in-progress keyboard drag | none — Escape; the reducer never ran (array unchanged)            |
| Persist the new order               | unchanged Step 9.5 Save path (order = array index; no key change) |

**No new reducer action; no existing action changed.** Step 11 is input + ARIA + announcements
only. The reducer, value surface, modal, and persistence boundary are all untouched.

## Locked decisions

- **No reducer change and no new dependency.** Keyboard reorder rides the existing `MOVE_ROW` +
  `onDragEnd`; `KeyboardSensor`/`sortableKeyboardCoordinates` ship in the `@dnd-kit` family added
  in Step 10. `package.json` is unchanged.
- **The handle is a native `<button type="button">`** with reset chrome — the dnd-kit-recommended,
  review-safe accessible activator. `attributes` + `listeners` + `setActivatorNodeRef` all on it.
- **`aria-hidden` is removed and the handle is focusable** (resolving the Step 10 hidden+focusable
  split). It gets an explicit `aria-label` ("Reorder <row label>") because it is icon-only.
- **Announcement copy is row-aware and lives in a pure, unit-tested helper** (`utils/` owns the
  wording rule; the component does the dnd-kit glue). No `@dnd-kit` import in `utils/`.
- **In-place transform, still no `DragOverlay`.** Keyboard reorder reuses Step 10's visual; revisit
  only if a keyboard-specific visual issue surfaces.
- **Persistence path unchanged.** Keyboard drop = mouse drop to Postgres + the metaobject; keys
  are never re-derived; the 200-cap is irrelevant (reorder never grows the array).

## What Step 11 does *not* own (boundary with Step 12+)

- **Clipboard paste parsing (Step 12)** and **bulk-insert rows from paste (Step 13)** — unchanged;
  Step 11 does not touch paste or `PASTE_ROWS`.
- **A `DragOverlay` floating clone** — still out of scope (Step 10 confirmed it unnecessary).
- **Persistence / metaobject / row shape** — frozen by Step 9.5.
- **`MOVE_ROW` / any reducer logic, the value surface, the smart-pill modal, the caret model** —
  all frozen; no new pill, no value-surface change.
- **Broader editor a11y audits beyond reorder** (e.g. label-field labelling, modal focus order) —
  those were addressed where they arose in earlier steps; Step 11 scopes to the reorder handle +
  the drag live region.

## File placement (per `code-standards.md` File Organization)

- `KeyboardSensor` + `sortableKeyboardCoordinates`, `accessibility={{...}}`, handle `attributes`
  routing, and the assembled `announcements`/`screenReaderInstructions` →
  **`app/routes/app.templates_.$id/SpecTableEditor.tsx`** (and `RowGutter` within it).
- Pure announcement copy (position/label resolution + the four message builders) →
  **`app/utils/reorderAnnouncements.ts`** (+ tests in **`app/utils/reorderAnnouncements.test.ts`**).
- Focus-ring + `<button>` reset on the handle → **`app/routes/app.templates_.$id/SpecTableEditor.module.css`**
  (`.dragHandle`). **Polaris tokens / `currentColor` / rem only — no hex.**
- `package.json` — **no change** (no new dependency).

## Open questions

- **Native `<button>` chrome reset inside the Polaris `<s-grid>` gutter.** Confirm in-browser the
  reset button renders identically to the Step 10 `<span>` ⠿ (size, alignment, the `data-dragging`
  cursor) and that wrapping an `<s-icon>` in a light-DOM `<button>` has no shadow-DOM
  pointer/focus quirk (mirror the [[polaris-web-component-gotchas]] `<s-icon>` caution). Decide in 11.1.
- **`aria-pressed` on the handle vs. App Bridge / Polaris semantics.** dnd-kit's `attributes` set
  `aria-pressed` while dragging; confirm a screen reader reads the pick-up state sensibly alongside
  the `announcements` (no double/confusing narration). Adjust copy in 11.2 if it conflicts.
- **Live-region timing during App Bridge view transitions.** The embedded admin plays view
  transitions (the Step 7 modal `InvalidStateError`); confirm the dnd-kit live region updates fire
  cleanly during keyboard moves without console chatter in the admin top frame. Watch in 11.2.
- **Focus return after a keyboard drop.** Confirm focus stays on (or returns to) the moved row's
  handle after drop so a merchant can chain reorders without re-Tabbing. If dnd-kit drops focus,
  decide whether to restore it (small effect keyed on the dropped id) — verify in 11.1.

## Done when

1. Sub-steps 11.1–11.2 each pass their verify check.
2. A merchant can **reorder rows with the keyboard alone**: Tab to a focusable ⠿ handle (visible
   focus ring + accessible name), Space/Enter to pick up, arrows to move, Space/Enter to drop,
   Escape to cancel — and a **section header reorders by keyboard as an ordinary row**.
3. The keyboard drop dispatches the **same `MOVE_ROW`** and **Save persists the new order** through
   the **unchanged** Step 9.5 path; a reload shows the reordered rows; **previously finalized keys
   are unchanged** (confirmed in Postgres, as in Step 10); Escape-cancel and a no-op drop leave the
   editor **not dirty**.
4. Each drag phase (pick up / move / drop / cancel) is **announced via a live region with the
   row's label and 1-based position**, and the handle exposes `role`/`aria-roledescription`/an
   accessible name/`aria-describedby` instructions. The announcement copy is **pure and unit-tested**.
5. **Mouse drag from Step 10 is unregressed**, and the **value surface is unregressed** — caret
   model, pills, line breaks, the Insert-field modal, keyboard delete, and `activeRowId` all behave
   as before across a keyboard reorder.
6. **No mouse-only gap remains** — `code-standards.md`'s "do not ship mouse-only drag" is satisfied.
   `Rows: N / 200` accurate; **no hardcoded hex**; **no console errors** (admin console included).
7. `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:run` all pass;
   **browser-verified end to end** in the real embedded app (keyboard-only + screen-reader / AOM).
8. `progress-tracker.md` updated to mark Step 11 complete and point at Step 12 (parse pasted
   clipboard tables).
