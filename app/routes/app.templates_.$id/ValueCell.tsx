import type {
  ClipboardEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useCallback, useEffect, useRef } from "react";
import type { DataRow, RowsAction, ValuePart } from "../../utils/rows";
import {
  linearLength,
  linearToPartOffset,
  planAtomicDelete,
  planSelectionDelete,
} from "../../utils/valueParts";
import {
  getSelectionLinearRange,
  partIndexOfElement,
  partsEqual,
  readPartsFromHost,
  renderPartsToHost,
  sameStructure,
  setCaretLinear,
  syncTrailingFiller,
  updateCaretOnState,
} from "../../utils/valueDom";
import { useBrowserLayoutEffect } from "./editorShared";
import styles from "./SpecTableEditor.module.css";

// --- Value cell: one inline contenteditable surface -------------------------
// `valueParts` render into a single contenteditable host (Step 4): TEXT parts are
// editable text nodes, dynamic-field parts are atomic, non-editable link tokens,
// and LINE_BREAK parts are atomic `<br>`s — the caret flows across all three as
// one line. The surface is uncontrolled while typing (the browser owns the caret;
// onInput maps the changed text run to SET_VALUE_TEXT) and is only re-rendered
// from state on structural edits (insert/delete), with the caret restored from a
// linear index. The merchant's in-surface structural edits are typing, deleting a
// token/break, and Enter for a hard line break. A pill can also be inserted from
// *outside* the surface by the Step 5 "Insert field" modal: the container queues a
// caret in `pendingCaret` (keyed by row id) and dispatches INSERT_VALUE_PART_AT;
// the reconcile effect below picks that up, refocuses the host, and restores the
// caret — the same linear-caret path as an internal edit.
export function ValueCell({
  row,
  rowNumber,
  dispatch,
  onCaretChange,
  onEditPart,
  pendingCaret,
}: {
  row: DataRow;
  rowNumber: number;
  dispatch: Dispatch<RowsAction>;
  // Report this cell's caret to the container: a linear index on focus / caret
  // move, never null from here (the gate is dropped when a label field is focused).
  onCaretChange: (rowId: string, linear: number | null) => void;
  // Open the Insert field modal in edit mode for a clicked pill (Step 6.3): the
  // cell resolves the token's part index from the live DOM and reports it plus the
  // clicked value part itself, so the container can pre-select the right field —
  // native OR metafield (Step 9).
  onEditPart: (rowId: string, partIndex: number, part: ValuePart) => void;
  // Caret positions queued by the modal Insert, keyed by row id. Consumed once.
  pendingCaret: Map<string, number>;
}) {
  const rowName = row.label || `row ${rowNumber}`;
  const valueParts = row.valueParts;
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Where the caret should land after the next state-driven re-render. Set by the
  // structural handlers (insert/delete) in linear-index space; consumed once by
  // the reconcile effect. Typing leaves it null so the native caret is untouched.
  const pendingCaretRef = useRef<number | null>(null);
  const composingRef = useRef(false);

  const isEmpty =
    valueParts.length === 1 &&
    valueParts[0].type === "TEXT" &&
    valueParts[0].text === "";

  // Reconcile the DOM with valueParts only when they actually differ. After a
  // keystroke the browser has already updated the text node, so the readback
  // equals state and we skip — never fighting the native caret. After a
  // structural edit the DOM is stale, so we rebuild and restore the caret.
  useBrowserLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const inSync = partsEqual(readPartsFromHost(host), valueParts);
    if (!inSync) {
      renderPartsToHost(host, valueParts, styles.token);
    }
    // Keep the trailing-empty-line filler correct on every pass — including when
    // the DOM already matches state (e.g. the merchant just typed on the new
    // line), so the filler is removed before it can paint a phantom line.
    syncTrailingFiller(host, valueParts);
    // An external (modal) Insert queued a caret for this row: focus the host
    // (focus is in the modal at this point) and place the caret after the freshly
    // inserted pill. Takes precedence over a pending internal caret for this pass.
    const external = pendingCaret.get(row.id);
    if (external !== undefined) {
      pendingCaret.delete(row.id);
      host.focus();
      setCaretLinear(host, external);
      updateCaretOnState(host);
      onCaretChange(row.id, external);
    } else if (!inSync && pendingCaretRef.current !== null) {
      setCaretLinear(host, pendingCaretRef.current);
      updateCaretOnState(host);
    }
    pendingCaretRef.current = null;
  }, [valueParts, row.id, pendingCaret, onCaretChange]);

  const handleInput = useCallback(() => {
    const host = hostRef.current;
    if (!host || composingRef.current) return;
    const domParts = readPartsFromHost(host);
    if (sameStructure(domParts, valueParts)) {
      // Pure typing: dispatch the changed TEXT run(s) by part index.
      domParts.forEach((part, partIndex) => {
        const current = valueParts[partIndex];
        if (
          part.type === "TEXT" &&
          current.type === "TEXT" &&
          part.text !== current.text
        ) {
          dispatch({
            type: "SET_VALUE_TEXT",
            id: row.id,
            partIndex,
            text: part.text,
          });
        }
      });
    } else {
      // Structure drifted (e.g. a rich/multiline paste injected nodes the cell
      // does not model): re-sync the surface to known-good state instead of
      // persisting a malformed value. Full clipboard support is Steps 12–13.
      renderPartsToHost(host, valueParts, styles.token);
      setCaretLinear(host, linearLength(valueParts));
    }
  }, [dispatch, row.id, valueParts]);

  // Delete a non-collapsed selection using only existing reducer actions: trim
  // overlapping TEXT runs, then drop fully-selected atomic parts (descending so
  // indices stay valid as the array collapses).
  const applyRangeDelete = useCallback(
    (from: number, to: number) => {
      const plan = planSelectionDelete(valueParts, from, to);
      if (plan.textEdits.length === 0 && plan.removeIndices.length === 0) {
        return;
      }
      pendingCaretRef.current = plan.caretLinear;
      for (const edit of plan.textEdits) {
        dispatch({
          type: "SET_VALUE_TEXT",
          id: row.id,
          partIndex: edit.partIndex,
          text: edit.text,
        });
      }
      for (const partIndex of [...plan.removeIndices].sort((a, b) => b - a)) {
        dispatch({ type: "REMOVE_VALUE_PART", id: row.id, partIndex });
      }
    },
    [dispatch, row.id, valueParts],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const host = hostRef.current;
      if (!host || composingRef.current) return;

      if (event.key === "Enter") {
        // A value cell has no paragraph concept: Enter and Shift+Enter both
        // insert one hard line break at the caret.
        event.preventDefault();
        const range = getSelectionLinearRange(host);
        if (!range) return;
        if (range.from !== range.to) {
          applyRangeDelete(range.from, range.to);
          return;
        }
        const { partIndex, offset } = linearToPartOffset(
          valueParts,
          range.from,
        );
        pendingCaretRef.current = range.from + 1; // after the new break
        dispatch({
          type: "INSERT_VALUE_PART_AT",
          id: row.id,
          partIndex,
          offset,
          part: { type: "LINE_BREAK" },
        });
        return;
      }

      const direction =
        event.key === "Backspace"
          ? "backward"
          : event.key === "Delete"
            ? "forward"
            : null;
      if (!direction) return;

      const range = getSelectionLinearRange(host);
      if (!range) return;
      if (range.from !== range.to) {
        event.preventDefault();
        applyRangeDelete(range.from, range.to);
        return;
      }
      // Collapsed caret: only intercept when an atomic part is the neighbour;
      // a plain character is left to the browser and re-derived via onInput.
      const plan = planAtomicDelete(valueParts, range.from, direction);
      if (!plan) return;
      event.preventDefault();
      pendingCaretRef.current = plan.caretLinear;
      dispatch({
        type: "REMOVE_VALUE_PART",
        id: row.id,
        partIndex: plan.removeIndex,
      });
    },
    [applyRangeDelete, dispatch, row.id, valueParts],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      // Step 4 keeps the surface structurally sound: paste plain text at a
      // collapsed caret only; multi-cell table paste is Steps 12–13.
      event.preventDefault();
      const host = hostRef.current;
      if (!host) return;
      const pasted = (event.clipboardData?.getData("text/plain") ?? "").replace(
        /\r?\n/g,
        " ",
      );
      if (!pasted) return;
      const range = getSelectionLinearRange(host);
      if (!range || range.from !== range.to) return;
      const { partIndex, offset } = linearToPartOffset(valueParts, range.from);
      const target = valueParts[partIndex];
      if (!target || target.type !== "TEXT") return;
      pendingCaretRef.current = range.from + pasted.length;
      dispatch({
        type: "SET_VALUE_TEXT",
        id: row.id,
        partIndex,
        text: target.text.slice(0, offset) + pasted + target.text.slice(offset),
      });
    },
    [dispatch, row.id, valueParts],
  );

  // Click an existing pill to edit it (Step 6.3). A delegated click on the host
  // detects a `[data-token]` element (TEXT and line breaks have none), resolves
  // its part index from the live DOM, and asks the container to reopen the modal
  // in edit mode pre-filled with that pill (native field or metafield, Step 9).
  // LINE_BREAK `<br>`s carry no data-token, so clicking near one never triggers
  // an edit.
  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const host = hostRef.current;
      if (!host) return;
      const tokenEl = (event.target as HTMLElement).closest?.("[data-token]");
      if (!tokenEl || !host.contains(tokenEl)) return;
      const partIndex = partIndexOfElement(host, tokenEl);
      if (partIndex === null) return;
      const part = valueParts[partIndex];
      if (
        !part ||
        (part.type !== "SHOPIFY_FIELD" && part.type !== "METAFIELD")
      ) {
        return;
      }
      onEditPart(row.id, partIndex, part);
    },
    [onEditPart, row.id, valueParts],
  );

  // Live "caret-on" highlight: while focused, mark the token/break the next
  // Backspace/Delete would remove. selectionchange is the only event that fires
  // for every caret move (arrows, click, drag). It also feeds the container the
  // live caret so the "Insert field" gate stays accurate and the save snapshot is
  // current; when the selection has left this host (e.g. into the modal) the range
  // is null and we leave the last-known caret in place.
  const handleSelectionChange = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    updateCaretOnState(host);
    const range = getSelectionLinearRange(host);
    if (range) onCaretChange(row.id, range.from);
  }, [onCaretChange, row.id]);

  const handleFocus = useCallback(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    const host = hostRef.current;
    if (!host) return;
    updateCaretOnState(host);
    const range = getSelectionLinearRange(host);
    onCaretChange(row.id, range ? range.from : 0);
  }, [handleSelectionChange, onCaretChange, row.id]);

  const handleBlur = useCallback(() => {
    document.removeEventListener("selectionchange", handleSelectionChange);
    const host = hostRef.current;
    if (host) {
      for (const marked of Array.from(
        host.querySelectorAll("[data-caret-on]"),
      )) {
        marked.removeAttribute("data-caret-on");
      }
    }
  }, [handleSelectionChange]);

  useEffect(
    () => () =>
      document.removeEventListener("selectionchange", handleSelectionChange),
    [handleSelectionChange],
  );

  return (
    <s-box border="base" borderRadius="base" padding="small-200">
      <div
        ref={hostRef}
        className={styles.surface}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label={`Value for ${rowName}`}
        spellCheck={false}
        data-empty={isEmpty ? "true" : undefined}
        data-placeholder="Value"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          handleInput();
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </s-box>
  );
}
