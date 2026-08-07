import type {
  ChangeEvent,
  ClipboardEvent,
  Dispatch,
  SyntheticEvent,
} from "react";
import { useCallback, useRef } from "react";
import type { DataRow, RowsAction } from "../../utils/rows";
import { partsToText, textToParts } from "../../utils/valueText";
import { cellCount } from "../../utils/clipboardTable";
import { readClipboardGrid } from "../../utils/clipboardTableDom";
import { MODAL_TRANSITION_MS, useBrowserLayoutEffect } from "./editorShared";
import styles from "./SpecTableEditor.module.css";

// --- Value cell: one native <textarea> surface (feature 111) ----------------
// The value is a `ValuePart[]` (the canonical persisted/delivered/previewed
// shape), but the EDITING surface is a plain textarea. `valueText.ts` (feature
// 109) converts between the two: the textarea shows `partsToText(valueParts)` —
// dynamic fields as `{% field … %}` / `{% mf … %}` text tokens, hard breaks as
// `\n` — and every edit reparses the whole string via `textToParts` into a
// `SET_VALUE_PARTS` dispatch (feature 110).
//
// Why a textarea (not contenteditable): native, isolated undo/redo (the old
// surface's structural re-render wiped the browser undo stack — broken Ctrl+Z),
// native selection/IME/multiline, and first-class accessibility. The merchant
// loses the colored inline pill and click-to-edit; a field is now edited as its
// token text.
//
// Uncontrolled while typing: the browser owns the textarea text and caret. The
// layout effect reconciles the DOM to state ONLY when they diverge (a modal
// Insert, or a rare hand-typed token that normalizes), so normal typing and
// native undo never rewrite the element — the exact behavior that keeps the undo
// stack alive. A pill can still be inserted from OUTSIDE via the Step 5 modal:
// the container splices a token string at the saved caret, queues the post-insert
// caret in `pendingCaret` (keyed by row id), and this effect refocuses the cell
// and restores the caret.

// Grow the textarea to fit its content (the old surface grew naturally). Reset to
// `auto` first so it can also SHRINK when lines are removed.
function autoSize(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function ValueCell({
  row,
  rowNumber,
  dispatch,
  onCaretChange,
  onBulkPaste,
  pendingCaret,
}: {
  row: DataRow;
  rowNumber: number;
  dispatch: Dispatch<RowsAction>;
  // Report this cell's caret to the container: the textarea `selectionStart` on
  // focus / caret move, or null when a label field takes focus (dropped by
  // EditorRowItem). Drives the "Insert field" gate and the insert offset.
  onCaretChange: (rowId: string, offset: number | null) => void;
  // Route a genuine multi-cell table pasted into this cell to the shared bulk
  // handler (file 21) instead of flattening it into one cell. Stable useCallback.
  onBulkPaste: (grid: string[][]) => void;
  // Caret offsets queued by the modal Insert, keyed by row id. Consumed once.
  pendingCaret: Map<string, number>;
}) {
  const rowName = row.label || `row ${rowNumber}`;
  const desired = partsToText(row.valueParts);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Reconcile the DOM textarea with state only when they differ (see header).
  useBrowserLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (ta.value !== desired) {
      // Structural change from OUTSIDE this textarea's own input (a modal Insert,
      // or a normalized hand-typed token). During normal typing desired already
      // equals ta.value, so this is skipped and the native caret/undo are never
      // disturbed.
      ta.value = desired;
    }
    autoSize(ta);
    // An external (modal) Insert queued a caret for this row: focus the host and
    // place the caret after the inserted token. Deferred past the modal's close
    // transition — App Bridge restores focus to the modal's invoker AFTER this
    // effect, so a synchronous focus here would be overwritten (confirmed for the
    // old surface; same race applies).
    const pending = pendingCaret.get(row.id);
    if (pending !== undefined) {
      pendingCaret.delete(row.id);
      setTimeout(() => {
        if (taRef.current !== ta) return; // cell unmounted / row swapped out
        ta.focus();
        ta.setSelectionRange(pending, pending);
        onCaretChange(row.id, pending);
        autoSize(ta);
      }, MODAL_TRANSITION_MS);
    }
  }, [desired, row.id, pendingCaret, onCaretChange]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      autoSize(event.currentTarget);
      dispatch({
        type: "SET_VALUE_PARTS",
        id: row.id,
        valueParts: textToParts(event.currentTarget.value),
      });
    },
    [dispatch, row.id],
  );

  const reportCaret = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      onCaretChange(row.id, event.currentTarget.selectionStart ?? 0);
    },
    [onCaretChange, row.id],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      // Content-first intent (file 21): a genuine multi-cell table routes to the
      // shared bulk handler — it becomes rows, not a flattened blob in this cell.
      // A single value is left to the textarea's NATIVE paste (onChange reparses
      // it), which also keeps it inside the native undo stack.
      const grid = readClipboardGrid(event.clipboardData);
      if (cellCount(grid) > 1) {
        event.preventDefault();
        onBulkPaste(grid);
      }
    },
    [onBulkPaste],
  );

  // The textarea carries its own field chrome (border-inline-start divider,
  // padding, focus ring via `.surface` → `.cellField`) so it matches the
  // Label/Section inputs. Uncontrolled (`defaultValue` for first paint; the effect
  // owns updates), single `aria-label`, native placeholder.
  return (
    <textarea
      ref={taRef}
      className={styles.surface}
      defaultValue={desired}
      rows={1}
      aria-label={`Value for ${rowName}`}
      placeholder="Value"
      spellCheck={false}
      onChange={handleChange}
      onPaste={handlePaste}
      onFocus={reportCaret}
      onSelect={reportCaret}
    />
  );
}
