import { useEffect, useRef, type RefObject } from "react";
import type { EditorRow } from "../../utils/rows";
import { linearLength } from "../../utils/valueParts";
import { setCaretLinear } from "../../utils/valueDom";
import { resolveGridTarget, type GridColumn } from "../../utils/gridNav";

// --- Spreadsheet-style vertical cell navigation (feature 31, Step 2) ----------
// DOM/keyboard glue that wires the pure Step 1 resolver (`resolveGridTarget`) to
// the live editor: one delegated keydown listener on the rows scroller that, on
// `Ctrl/Cmd + Arrow Up/Down`, reads the SOURCE cell from `event.target`, asks the
// resolver where to go (carrying the sticky `preferredColumn` through section
// rows), focuses the target cell, and places the caret at its END.
//
// Attached as a NATIVE listener on the scroller element (via its existing ref)
// rather than a JSX `onKeyDown`: this is event delegation for the real
// interactive cells inside, not a widget on the container, so a native listener
// keeps the scroller div purely presentational (no `jsx-a11y` static-interaction
// role to invent) and is behaviour-identical — `event.target` is still the cell.
//
// It deliberately touches NOTHING in the caret engine: `ValueCell.handleKeyDown`
// returns for arrow keys without `preventDefault`/`stopPropagation`, so the chord
// reaches this listener untouched, and the Label/Section `<input>`s have no
// keydown handler. Browser-verified (jsdom can't model contenteditable
// focus/selection); the navigation RULES it leans on are Node-unit-tested in
// `gridNav.ts`.

const ROW_ID_PREFIX = "row-";

export function useGridKeyboardNav(
  scrollerRef: RefObject<HTMLDivElement | null>,
  rows: EditorRow[],
) {
  // Read live rows through a ref (mirrors the engine's `rowsRef` pattern) so the
  // listener can attach once and never close over a stale array.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Remembers the merchant's last DATA-cell column so it survives a pass THROUGH
  // a section row (which has no column) — the sticky-column mechanism. Default
  // "label" for the rare first-press-while-on-a-section case.
  const preferredColumn = useRef<GridColumn>("label");

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Our chord only: Ctrl/Cmd + ArrowUp/Down, no Shift/Alt. Plain arrows
      // (in-cell caret), Ctrl/Cmd+Left/Right (word-jump / line-home-end), Tab
      // (horizontal), and dnd's pick-up arrows are all left untouched.
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }
      const direction =
        event.key === "ArrowDown"
          ? "down"
          : event.key === "ArrowUp"
            ? "up"
            : null;
      if (!direction) return;

      const target = event.target as HTMLElement | null;
      const rowEl = target?.closest<HTMLElement>(`[id^="${ROW_ID_PREFIX}"]`);
      if (!rowEl) return;

      // SOURCE cell: value = the stable role; label/section = the row's only text
      // input (the gutter select checkbox is type=checkbox, excluded). Anything
      // else (drag handle, ✕, checkbox, padding) is not a navigable cell → leave.
      const inValue = !!target?.closest('[role="textbox"]');
      const inTextInput = !!target?.closest('input[type="text"]');
      if (!inValue && !inTextInput) return;

      const rowId = rowEl.id.slice(ROW_ID_PREFIX.length);
      const liveRows = rowsRef.current;
      const sourceRow = liveRows.find((row) => row.id === rowId);
      if (!sourceRow) return;

      // Column intent: a DATA value/label source updates the sticky column; a
      // SECTION source leaves it unchanged so the column survives the section.
      let column = preferredColumn.current;
      if (sourceRow.rowType === "DATA") {
        column = inValue ? "value" : "label";
        preferredColumn.current = column;
      }

      const result = resolveGridTarget(liveRows, rowId, column, direction);
      // Claim the chord even on a first/last-row no-op, so it never falls through
      // to a surprise native page/field scroll (Cmd+Up/Down on Mac).
      event.preventDefault();
      if (!result) return;

      const targetRowEl = document.getElementById(
        `${ROW_ID_PREFIX}${result.rowId}`,
      );
      if (!targetRowEl) return;

      if (result.cell === "value") {
        const host = targetRowEl.querySelector<HTMLElement>('[role="textbox"]');
        const targetRow = liveRows.find((row) => row.id === result.rowId);
        if (!host || targetRow?.rowType !== "DATA") return;
        host.focus(); // browser auto-scrolls it into view
        setCaretLinear(host, linearLength(targetRow.valueParts)); // caret at end
      } else {
        // "label" or "section" → the target row's single text input.
        const input =
          targetRowEl.querySelector<HTMLInputElement>('input[type="text"]');
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end); // caret at end
      }
    };

    scroller.addEventListener("keydown", onKeyDown);
    return () => scroller.removeEventListener("keydown", onKeyDown);
  }, [scrollerRef]);
}
