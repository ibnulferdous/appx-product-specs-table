import { useEffect, useRef, type RefObject } from "react";
import type { EditorRow } from "../../utils/rows";
import { resolveGridTarget, type GridColumn } from "../../utils/gridNav";
import { useBrowserLayoutEffect } from "./editorShared";

// --- Spreadsheet-style vertical cell navigation (feature 31, Step 2) ----------
// DOM/keyboard glue wiring the pure Step 1 resolver (`resolveGridTarget`) to the live editor: one
// delegated keydown listener on the rows scroller that, on `Ctrl/Cmd + Arrow Up/Down`, reads the
// SOURCE cell from `event.target`, asks the resolver where to go (carrying the sticky
// `preferredColumn` through section rows), focuses the target cell, and places the caret at its END.
//
// A NATIVE listener on the scroller (via its ref) rather than a JSX `onKeyDown`: this is event
// delegation for the real interactive cells inside, so a native listener keeps the scroller div
// purely presentational (no `jsx-a11y` role to invent) and is behaviour-identical. Browser-verified
// (jsdom can't model textarea focus/selection); the navigation RULES are Node-unit-tested in `gridNav.ts`.

const ROW_ID_PREFIX = "row-";

export function useGridKeyboardNav(
  scrollerRef: RefObject<HTMLDivElement | null>,
  rows: EditorRow[],
) {
  // Read live rows through a ref so the listener attaches once and never closes over a stale array.
  // Published after commit (never during render): React can replay or discard a render, so a ref
  // write in the render body could leak rows from work that never committed to the live listener.
  const rowsRef = useRef(rows);
  useBrowserLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  // The merchant's last DATA-cell column, so it survives a pass THROUGH a section row (which has no
  // column) — the sticky-column mechanism. Default "label" for the first-press-on-a-section case.
  const preferredColumn = useRef<GridColumn>("label");

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Our chord only: Ctrl/Cmd + ArrowUp/Down, no Shift/Alt. Plain arrows, Ctrl/Cmd+Left/Right, Tab,
      // and dnd's pick-up arrows are all left untouched.
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

      // SOURCE cell: value = the `<textarea>`; label/section = the row's only text input (the gutter
      // checkbox is type=checkbox, excluded). Anything else is not a navigable cell → leave.
      const inValue = !!target?.closest("textarea");
      const inTextInput = !!target?.closest('input[type="text"]');
      if (!inValue && !inTextInput) return;

      const rowId = rowEl.id.slice(ROW_ID_PREFIX.length);
      const liveRows = rowsRef.current;
      const sourceRow = liveRows.find((row) => row.id === rowId);
      if (!sourceRow) return;

      // Column intent: a DATA source updates the sticky column; a SECTION source leaves it unchanged.
      let column = preferredColumn.current;
      if (sourceRow.rowType === "DATA") {
        column = inValue ? "value" : "label";
        preferredColumn.current = column;
      }

      const result = resolveGridTarget(liveRows, rowId, column, direction);
      // Claim the chord even on a first/last-row no-op, so it never falls through to a native
      // page/field scroll (Cmd+Up/Down on Mac).
      event.preventDefault();
      if (!result) return;

      const targetRowEl = document.getElementById(
        `${ROW_ID_PREFIX}${result.rowId}`,
      );
      if (!targetRowEl) return;

      if (result.cell === "value") {
        const host = targetRowEl.querySelector<HTMLTextAreaElement>("textarea");
        const targetRow = liveRows.find((row) => row.id === result.rowId);
        if (!host || targetRow?.rowType !== "DATA") return;
        host.focus(); // browser auto-scrolls it into view
        const end = host.value.length;
        host.setSelectionRange(end, end); // caret at end (native textarea API)
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
