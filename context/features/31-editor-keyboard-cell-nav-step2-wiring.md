# Editor keyboard cell navigation — Step 2: keyboard + DOM wiring

## Goal in one sentence

Wire the Step 1 resolver to the live editor: a single `onKeyDown` on the rows scroller that, on
`Ctrl/Cmd + Arrow Up/Down`, reads the **source** cell from `event.target`, asks `resolveGridTarget`
where to go (carrying the **sticky `preferredColumn`** through section rows), **focuses** the target
cell and **places the caret at its end**, and `preventDefault`s — so a merchant moves between rows in
the same column like a spreadsheet, **without touching** the value-cell caret engine, the label/section
inputs, the reducer, or the dnd reorder.

## Why this is now (and what Step 1 already proved)

Step 1 landed and unit-tested the **pure navigation rules** (`app/utils/gridNav.ts`): which row, which
column, when to no-op, and the section pass-through that yields the locked **Scenario 1 → Label,
Scenario 2 → Value**. Step 2 is the **DOM/keyboard half** — the part jsdom can't model
(`contenteditable` selection, focus, caret), so it is **browser-verified** in the real embedded app,
exactly the pure-logic / DOM-glue split the codebase already uses (`valueParts.ts` pure + Node-tested;
`valueDom.ts` DOM-touching + browser-verified — see [[testing-strategy]],
[[editor-value-surface-architecture]]). Step 3 then adds a discoverability hint + docs.

The risky surface here is **focus + caret placement**, not navigation logic (that's frozen in Step 1
and proven). The reducer, the value surface, and the inputs stay untouched — Step 2 only *moves focus*.

## Foundation carried (the DOM this leans on)

All of these already exist; Step 2 reads them, it does not change them:

- **Each row wrapper has `id="row-${row.id}"`** (`EditorRowItem.tsx`) — the anchor for finding the
  source row and the target row.
- **The value cell is the only `[role="textbox"]` in a row** (`ValueCell.tsx`, the `contentEditable`
  surface with `tabIndex={0}`), and **the Label / Section cells are the row's only `<input type="text">`**
  (`EditorRowItem.tsx`) — the gutter's select control is `<input type="checkbox">` (feature 29), so
  `input[type="text"]` cleanly excludes it. These two **stable, explicit-in-JSX** selectors replace the
  Step 1 doc's `input.cellInput` / `input.cellSection` sketch, which are **CSS-module-hashed at runtime**
  (`styles.cellInput` → `_cellInput_xxx`) and so are *not* usable as literal selectors. **No markup
  change is needed:** a DATA row's only text input is its Label and a SECTION row's only input is its
  title, so Label-vs-Section is disambiguated by the source row's `rowType`, not by class.
- **`ValueCell.handleKeyDown` ignores arrow keys** — it acts only on Enter / Backspace / Delete and
  returns for everything else **without `preventDefault` or `stopPropagation`**, so a `Ctrl/Cmd+Arrow`
  bubbles past it to the scroller untouched. The Label / Section `<input>`s have no keydown handler, so
  their keydowns bubble too. **This is why the handler can live above the cells and leave the caret
  engine alone.**
- **Caret helpers exist:** `setCaretLinear(host, linear)` (`valueDom.ts`) places a collapsed caret in
  the value surface at a linear index; `linearLength(valueParts)` (`valueParts.ts`) gives a cell's end
  index. Native inputs use `input.setSelectionRange(len, len)`.
- **Focus side effects are already wired:** focusing any cell bubbles to the row wrapper's
  `onFocusCapture` → `onActivate(rowId)` (active-row highlight / insert-after-active / scroll target),
  and the value cell's `onFocus` arms the Insert-field caret gate while a Label/Section `onFocus` drops
  it. So programmatic focus keeps all of those honest **for free** — Step 2 adds no extra bookkeeping.
- **The editor is `inert` during a save** (`SpecTableEditor.tsx` freeze wrapper), which removes the
  whole card from focus/keyboard interaction — so navigation is **naturally frozen mid-save** with no
  extra `saving` guard.

## What changes (architecture)

**One new hook + a one-line attach in `RowGrid`. No reducer, no CSS, no new dependency, no change to
`ValueCell` / `EditorRowItem` / the inputs.**

### `app/routes/app.templates_.$id/useGridKeyboardNav.ts` (new — DOM glue, browser-verified)

A small hook that owns the `preferredColumn` ref and returns the scroller's keydown handler. It reads
live rows through a ref (mirroring the engine's `rowsRef` pattern) so the handler is stable and never
stale. Illustrative shape:

```ts
import { useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { EditorRow } from "../../utils/rows";
import { linearLength } from "../../utils/valueParts";
import { setCaretLinear } from "../../utils/valueDom";
import { resolveGridTarget, type GridColumn } from "../../utils/gridNav";

const ROW_ID_PREFIX = "row-";

export function useGridKeyboardNav(rows: EditorRow[]) {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Remembers the merchant's last DATA-cell column so it survives a pass THROUGH
  // a section row (which has no column) — the sticky-column mechanism. Default
  // "label" for the rare first-press-while-on-a-section case.
  const preferredColumn = useRef<GridColumn>("label");

  return useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Our chord only: Ctrl/Cmd + ArrowUp/Down, no Shift/Alt. Plain arrows (in-cell
    // caret), Ctrl/Cmd+Left/Right (word-jump / line-home-end), Tab (horizontal),
    // and dnd's pick-up arrows are all left untouched.
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
    const direction =
      event.key === "ArrowDown" ? "down" : event.key === "ArrowUp" ? "up" : null;
    if (!direction) return;

    const target = event.target as HTMLElement;
    const rowEl = target.closest<HTMLElement>(`[id^="${ROW_ID_PREFIX}"]`);
    if (!rowEl) return;

    // SOURCE cell: value = the stable role; label/section = the row's only text
    // input (the gutter checkbox is type=checkbox, excluded). Anything else
    // (drag handle, ✕, checkbox, padding) is not a navigable cell → leave it.
    const inValue = !!target.closest('[role="textbox"]');
    const inTextInput = !!target.closest('input[type="text"]');
    if (!inValue && !inTextInput) return;

    const rowId = rowEl.id.slice(ROW_ID_PREFIX.length);
    const liveRows = rowsRef.current;
    const sourceRow = liveRows.find((r) => r.id === rowId);
    if (!sourceRow) return;

    // Column intent: a DATA value/label source updates the sticky column; a
    // SECTION source leaves it unchanged so the column survives the section.
    let column = preferredColumn.current;
    if (sourceRow.rowType === "DATA") {
      column = inValue ? "value" : "label";
      preferredColumn.current = column;
    }

    const result = resolveGridTarget(liveRows, rowId, column, direction);
    event.preventDefault(); // claim the chord — even on a first/last-row no-op
    if (!result) return;

    const targetRowEl = document.getElementById(`${ROW_ID_PREFIX}${result.rowId}`);
    if (!targetRowEl) return;

    if (result.cell === "value") {
      const host = targetRowEl.querySelector<HTMLElement>('[role="textbox"]');
      const targetRow = liveRows.find((r) => r.id === result.rowId);
      if (!host || targetRow?.rowType !== "DATA") return;
      host.focus(); // browser auto-scrolls it into view
      setCaretLinear(host, linearLength(targetRow.valueParts)); // caret at end
    } else {
      // "label" or "section" → the target row's single text input.
      const input = targetRowEl.querySelector<HTMLInputElement>('input[type="text"]');
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end); // caret at end
    }
  }, []);
}
```

### `app/routes/app.templates_.$id/RowGrid.tsx` (attach)

`RowGrid` already destructures `rows` from `engine`. Call the hook and attach its handler to the
existing `.rowsScroller` wrapper:

```tsx
const onGridKeyDown = useGridKeyboardNav(rows);
// ...
<div ref={scrollerRef} className={styles.rowsScroller} style={{ maxHeight }} onKeyDown={onGridKeyDown}>
```

Keydowns from any cell bubble to the scroller; the handler self-filters to our chord + a real text
cell, so non-matching keys and non-cell targets (header, the bottom Add-row button, gutter controls)
pass through unchanged.

## Reducer actions

| Interaction | Mechanism |
| --- | --- |
| `Ctrl/Cmd + Arrow Up/Down` | **none** — `resolveGridTarget` (pure) + DOM focus/caret, no dispatch |
| Active-row / Insert-field-gate / scroll updates on arrival | **existing** focus side effects (`onFocusCapture`, cell `onFocus`) — not re-implemented |

**No reducer action added or changed.** Navigation is focus-only; `rows.ts` is untouched.

## Locked decisions

- **Chord is `(ctrlKey ‖ metaKey) && !shiftKey && !altKey` + `ArrowUp/Down`.** No platform sniffing —
  Windows merchants press Ctrl, Mac merchants press Cmd; both match. (On Mac, `Ctrl+Arrow` is eaten by
  the OS for Spaces/Mission Control, so Cmd is the natural Mac key anyway.)
- **Vertical only.** `Left/Right` are never intercepted, so in-cell word-jump (Win) / line-home-end
  (Mac) and `Tab`/`Shift+Tab` horizontal movement are fully preserved.
- **Source detection by stable selectors, not CSS-module classes.** Value = `[role="textbox"]`;
  Label/Section = the row's only `input[type="text"]` (gutter checkbox excluded), with Label-vs-Section
  resolved by the source row's `rowType`. No markup change.
- **Sticky column via the `preferredColumn` ref.** Updated from a **DATA** value/label source; **left
  unchanged on a SECTION source**, so the column survives a pass through a section row — locking
  **Scenario 1 → Label, Scenario 2 → Value**. Default `"label"` if the very first press happens on a
  section row.
- **Caret lands at the END of the target cell** — `setCaretLinear(host, linearLength(valueParts))` for
  the value surface, `input.setSelectionRange(len, len)` for inputs (the merchant's locked choice).
- **First/last-row press is a no-op but still claims the chord** (`preventDefault` runs before the
  null-return), so `Ctrl/Cmd+Up` on row 1 / `Ctrl/Cmd+Down` on the last row never falls through to a
  surprise native page/field scroll. No wrap, no new-row creation.
- **Only text cells are sources.** A press while a gutter control (drag handle, ✕, select checkbox) or
  the scroller padding is focused is ignored (not `preventDefault`ed), so it can never collide with the
  dnd `KeyboardSensor` (which uses **plain** arrows, and only after a Space/Enter pick-up) or other
  controls.
- **Synchronous focus — no `setTimeout`.** Unlike the modal Insert path (which defers past App Bridge's
  view transition), this moves focus within the editor in the keydown handler, so `el.focus()` +
  caret-set run synchronously. Browser focus auto-scrolls the target cell into view on a long table.
- **No `saving` guard needed.** The editor is `inert` during a save, so the chord can't reach a cell
  mid-save.

## What Step 2 does *not* own (boundary)

- **Step 1's pure resolver** (`gridNav.ts`) — consumed unchanged; this step adds no navigation rule.
- **Discoverability hint + docs → Step 3** (a tooltip / help line so merchants find the shortcut; the
  `progress-tracker.md` narrative).
- **Horizontal navigation** (`Left/Right`) — out of scope for the whole feature; `Tab` covers it.
- **A true ARIA grid / roving-tabindex / two-mode select-vs-edit model** — explicitly *not* this
  feature; the cells keep their current always-editable behaviour and tab order.
- **No change to** the reducer, the value surface / caret engine, the Label & Section inputs, the
  gutter, or the dnd reorder.

## File placement (per `code-standards.md`)

- New hook (keyboard chord + DOM focus/caret glue) → **`app/routes/app.templates_.$id/useGridKeyboardNav.ts`**
  (DOM-touching, browser-verified — same status as `valueDom.ts`).
- One-line attach (`useGridKeyboardNav(rows)` + `onKeyDown` on `.rowsScroller`) →
  **`app/routes/app.templates_.$id/RowGrid.tsx`**.
- Imports reused: `resolveGridTarget` from `app/utils/gridNav.ts`, `setCaretLinear` from
  `app/utils/valueDom.ts`, `linearLength` from `app/utils/valueParts.ts`.
- **No change to** `ValueCell.tsx`, `EditorRowItem.tsx`, `rows.ts`, any CSS module, or `package.json`.

## Testing

Per [[testing-strategy]], the navigation **rules** are already Node-unit-tested in Step 1; Step 2 is
**focus + selection in `contenteditable`**, which jsdom can't model faithfully, so it is
**browser-verified in the real embedded app**. The suite stays at **314** (no new extractable pure
logic — the resolver is the pure core, and source-detection / focus / caret are all DOM-bound).

**Browser checklist (live embedded app):**

1. **Value column:** `Ctrl/Cmd+Down` from a value cell lands in the **next row's value cell with the
   caret at the end**; `Ctrl/Cmd+Up` lands in the previous value cell. Existing content is intact.
2. **Label column:** same down/up between Label cells, caret at end.
3. **Sticky column through a section (the locked scenarios):** from a **value** cell, stepping Down
   through a SECTION row and on to the next data row lands back in **value** (Scenario 2); from a
   **label** cell the same chain lands in **label** (Scenario 1). The section row's title input is
   focused on the intermediate hop.
4. **Edges:** `Ctrl/Cmd+Up` on the first row and `Ctrl/Cmd+Down` on the last row **do nothing** — focus
   stays put, and the page/field does **not** scroll to top/bottom (the no-op still `preventDefault`s).
5. **Plain arrows unregressed:** `ArrowUp/Down/Left/Right` with no modifier still move the caret inside
   the cell (incl. across wrapped/hard-break lines in a multi-line value).
6. **Horizontal unregressed:** `Ctrl/Cmd+Left/Right` still word-jumps (Win) / line-home-ends (Mac)
   inside a cell; `Tab`/`Shift+Tab` still moves Label↔Value.
7. **dnd reorder unregressed:** Space/Enter on a drag handle still picks a row up and **plain** arrows
   still move it; a `Ctrl/Cmd+Arrow` while a handle/checkbox is focused does nothing (not a text cell).
8. **Cross-platform:** Cmd on Mac and Ctrl on Windows both navigate.
9. **Side effects honest:** the landed row shows the active-row accent; focusing a value cell arms the
   Insert-field button, focusing a label/section drops it; a navigated-to row off-screen scrolls into
   view.
10. **Frozen during save** (the `inert` freeze blocks the chord) and **no admin top-frame console
    errors** across the matrix.

## Open questions

- **Repeat / held-key behaviour.** Holding `Ctrl/Cmd+Down` auto-repeats the keydown and steps row by
  row; confirm in-browser it feels smooth and the auto-scroll keeps pace (expected fine — each repeat is
  one more synchronous hop). No throttle planned unless it misbehaves.
- **Caret-at-end vs visual position on very long wrapped values.** Caret-at-end is locked; just confirm
  the focus auto-scroll reveals the caret (end of a tall multi-line cell) and not just the cell top.

## Done when

1. `useGridKeyboardNav.ts` exists (chord filter → source detection → `resolveGridTarget` → focus +
   caret-at-end), and `RowGrid` attaches its handler to `.rowsScroller`; no other file changes beyond
   the documented imports.
2. `Ctrl/Cmd + Arrow Up/Down` moves between rows in the same column with the caret at the target cell's
   end, the sticky column survives a section row (Scenario 1 → Label, Scenario 2 → Value), and the
   first/last-row press is a clean no-op.
3. Plain arrows, `Ctrl/Cmd+Left/Right`, `Tab`/`Shift+Tab`, and dnd keyboard reorder are all
   **unregressed**; navigation is frozen during a save.
4. `npm run typecheck`, `lint`, `format:check`, `test:run` (**314**, unchanged), and `build` all pass;
   no reducer / CSS / dependency change.
5. **Browser-verified** in the live embedded app against the checklist above, with no admin top-frame
   console errors.
6. `context/progress-tracker.md` reflects Step 2 complete and points at **Step 3** (discoverability
   hint + docs).
