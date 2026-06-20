import type {
  ClipboardEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useFetcher, useRevalidator } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { loader as metafieldDefinitionsLoader } from "../app.metafield-definitions";
import type { action as templateAction } from "./route";
import {
  MAX_TEMPLATE_ROWS,
  newRowId,
  rowsReducer,
  type DataRow,
  type EditorRow,
  type RowsAction,
  type ValuePart,
} from "../../utils/rows";
import {
  linearLength,
  linearToPartOffset,
  partOffsetToLinear,
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
import {
  filterMetafieldDefinitions,
  filterNativeFields,
  findNativeField,
} from "../../utils/shopifyFields";
import {
  announceReorderCancel,
  announceReorderEnd,
  announceReorderOver,
  announceReorderStart,
  describeRow,
} from "../../utils/reorderAnnouncements";
import styles from "./SpecTableEditor.module.css";

// The field the merchant has picked in the "Insert field" modal (Step 9). A
// discriminated union so a native field and a metafield are mutually exclusive
// across the modal's two choice lists: whichever kind is set makes the other
// list's controlled `values` empty, so only one radio is ever checked. `null`
// means nothing picked (the primary button is disabled).
type FieldSelection =
  | { kind: "native"; field: string }
  | { kind: "metafield"; namespace: string; key: string };

// The stable choice value for a metafield in the modal's list: its
// `namespace.key`, which is unique per shop and non-empty (the Step 8 mapper
// drops nodes missing either). Used both as the <s-choice value> and to decode an
// onChange pick back to a definition by lookup (never by string-splitting).
function metafieldChoiceValue(part: {
  namespace: string;
  key: string;
}): string {
  return `${part.namespace}.${part.key}`;
}

// Map a clicked pill's value part to the selection that should pre-fill the modal
// in edit mode (Step 9). A METAFIELD pill pre-selects its namespace/key; a
// SHOPIFY_FIELD pill pre-selects its field only when it is a known native token
// (an unknown token opens unselected); anything else opens unselected.
function partToSelection(part: ValuePart): FieldSelection | null {
  if (part.type === "METAFIELD") {
    return { kind: "metafield", namespace: part.namespace, key: part.key };
  }
  if (part.type === "SHOPIFY_FIELD" && findNativeField(part.field)) {
    return { kind: "native", field: part.field };
  }
  return null;
}

// React runs layout effects only in the browser; fall back to useEffect during
// SSR so the editor's value-cell reconciler does not warn on the server.
const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

// Shared grid template so the column header, data rows, and section rows all
// line up. First track is the fixed-width gutter (drag handle + delete).
const GUTTER = "2.75rem";
const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
const SECTION_COLUMNS = `${GUTTER} 1fr`;

// The single editor-level "Insert field" modal, addressed by the App Bridge
// Modal API (`shopify.modal.show/hide`).
const INSERT_FIELD_MODAL_ID = "insert-field-modal";

// Spoken once when a drag handle is focused (Step 11). dnd-kit renders this into
// the auto-generated `aria-describedby` instructions element the handle points at.
const REORDER_INSTRUCTIONS = {
  draggable:
    "To reorder a row, press space or enter on its drag handle to pick it up, " +
    "use the arrow keys to move it, then press space or enter to drop it, or " +
    "press escape to cancel.",
};

// The pill the merchant is editing (Step 6.3): the row and the value-part index
// of the clicked token. `null` means the modal is in create mode (Insert drops a
// new pill at the saved caret); non-null means edit mode (Update swaps this pill's
// field in place). One modal serves both.
interface EditTarget {
  rowId: string;
  partIndex: number;
}

// A caret saved from a value cell: which row, and where in that cell's linear
// caret space (see valueParts.ts). Plain numbers, never a DOM Range, so it
// survives focus moving into the modal and any re-render.
interface SavedCaret {
  rowId: string;
  linear: number;
}

// Polaris field events are typed as plain DOM `Event`; the field element exposes
// the current text on `value`, so we read it through this narrowed cast.
function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// --- Row gutter (drag handle + delete), shared by data and section rows ------
const RowGutter = memo(function RowGutter({
  rowNumber,
  onDelete,
  reorderLabel,
  dragAttributes,
  dragListeners,
  setActivatorNodeRef,
  isDragging,
}: {
  rowNumber: number;
  onDelete: () => void;
  // The drag handle's accessible name, e.g. "Reorder Battery Life row" (Step 11).
  // The handle is icon-only, so without this it would announce as a nameless
  // button. Derived from the row label via `describeRow`.
  reorderLabel: string;
  // dnd-kit drag wiring for the ⠿ handle. `attributes` (role=button, tabIndex=0,
  // aria-roledescription, aria-describedby, aria-pressed) make it a real
  // keyboard-focusable, screen-reader-operable control (Step 11 — Step 10
  // withheld these and kept the handle aria-hidden for mouse-only drag).
  // `listeners` are the sensor (pointer + keyboard) activation handlers.
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  isDragging?: boolean;
}) {
  return (
    <s-stack direction="block" gap="small-300" alignItems="center">
      {/* Drag-to-reorder handle. A real <button> (dnd-kit's recommended, most
          accessible activator) — keyboard-focusable and operable: Space/Enter to
          pick up, arrow keys to move, Space/Enter to drop, Escape to cancel
          (Step 11). Its native chrome is reset in the CSS module so it still
          reads as the muted ⠿ affordance. `attributes` + `listeners` +
          `setActivatorNodeRef` must all sit on this one element. */}
      <button
        type="button"
        className={styles.dragHandle}
        data-dragging={isDragging ? "true" : undefined}
        aria-label={reorderLabel}
        ref={setActivatorNodeRef}
        {...dragAttributes}
        {...dragListeners}
      >
        {/* Decorative: the button's aria-label is the accessible name, so hide
            the icon from assistive tech to avoid a double-announcement. */}
        <s-icon type="drag-handle" color="subdued" aria-hidden="true"></s-icon>
      </button>
      <s-button
        variant="tertiary"
        tone="critical"
        icon="delete"
        accessibilityLabel={`Delete row ${rowNumber}`}
        onClick={onDelete}
      ></s-button>
    </s-stack>
  );
});

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
function ValueCell({
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

// --- Data row ---------------------------------------------------------------
interface RowItemProps {
  row: EditorRow;
  index: number;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  dispatch: Dispatch<RowsAction>;
  onCaretChange: (rowId: string, linear: number | null) => void;
  onEditPart: (rowId: string, partIndex: number, part: ValuePart) => void;
  pendingCaret: Map<string, number>;
}

// Memoized so a single cell edit re-renders only that row. `dispatch`,
// `onActivate`, `onDelete`, `onCaretChange`, and `onEditPart` are stable;
// `pendingCaret` is a stable ref-held Map; `isActive` is a boolean, so
// non-edited, non-(de)activated rows skip re-rendering entirely.
const EditorRowItem = memo(function EditorRowItem({
  row,
  index,
  isActive,
  onActivate,
  onDelete,
  dispatch,
  onCaretChange,
  onEditPart,
  pendingCaret,
}: RowItemProps) {
  const rowNumber = index + 1;

  const handleLabel = useCallback(
    (event: Event) =>
      dispatch({ type: "SET_LABEL", id: row.id, label: readValue(event) }),
    [dispatch, row.id],
  );
  const handleDelete = useCallback(() => onDelete(row.id), [onDelete, row.id]);
  const handleActivate = useCallback(
    () => onActivate(row.id),
    [onActivate, row.id],
  );
  // Focusing a Label / Section field means the merchant is no longer in a value
  // cell, so drop the "Insert field" gate (a pill can only be inserted into a
  // value). Focusing a value cell re-arms it via ValueCell's onCaretChange.
  const handleLabelFocus = useCallback(
    () => onCaretChange(row.id, null),
    [onCaretChange, row.id],
  );

  // Sortable wiring (Step 10). `useSortable` is called inside the row so its
  // per-frame transform re-renders only this row from within the hook (React.memo
  // gates parent-prop re-renders, not hook-driven ones). The transform/transition
  // are applied to the plain wrapper <div>; the Polaris `<s-*>` hosts are left
  // untouched. `attributes`/`listeners`/`setActivatorNodeRef` go to the ⠿ handle
  // only (Step 11 adds `attributes` so the handle is keyboard-focusable; Step 10
  // had withheld them), so the value cell keeps its caret/selection behaviour.
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const rowClass = isActive ? `${styles.row} ${styles.rowActive}` : styles.row;
  const isSection = row.rowType === "SECTION_HEADER";
  // Accessible name for the drag handle (Step 11). Reuses the same descriptor as
  // the screen-reader announcements so the handle and the live region agree
  // ("Battery Life row", "Display section", or a positional fallback).
  const reorderLabel = `Reorder ${describeRow(row, index)}`;

  return (
    // Activation is a focus side effect: clicking any cell/control focuses it,
    // and keyboard tabbing focuses it too — both bubble to onFocusCapture. A
    // bare onClick here would be a non-interactive-div a11y violation.
    <div
      id={`row-${row.id}`}
      ref={setNodeRef}
      style={dragStyle}
      className={isDragging ? `${rowClass} ${styles.rowDragging}` : rowClass}
      onFocusCapture={handleActivate}
    >
      <s-box
        padding="small-200"
        borderRadius="base"
        {...(isActive ? { background: "subdued" } : {})}
      >
        <s-grid
          gridTemplateColumns={isSection ? SECTION_COLUMNS : DATA_COLUMNS}
          gap="base"
          alignItems="center"
        >
          <RowGutter
            rowNumber={rowNumber}
            onDelete={handleDelete}
            reorderLabel={reorderLabel}
            dragAttributes={attributes}
            dragListeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
            isDragging={isDragging}
          />

          {isSection ? (
            <s-box background="subdued" borderRadius="base" padding="small-200">
              <s-text-field
                label={`Section title for row ${rowNumber}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="Section title"
                value={row.label}
                onInput={handleLabel}
                onFocus={handleLabelFocus}
              />
            </s-box>
          ) : (
            <>
              <s-text-field
                label={`Label for row ${rowNumber}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="Label"
                value={row.label}
                onInput={handleLabel}
                onFocus={handleLabelFocus}
              />
              <ValueCell
                row={row}
                rowNumber={rowNumber}
                dispatch={dispatch}
                onCaretChange={onCaretChange}
                onEditPart={onEditPart}
                pendingCaret={pendingCaret}
              />
            </>
          )}
        </s-grid>
      </s-box>
    </div>
  );
});

// Polaris's `s-*` color tokens live inside each component's shadow DOM and are
// NOT exposed as light-DOM CSS custom properties (confirmed in-browser:
// `--p-color-*` / `--s-color-*` all resolve empty on the document, body, and even
// on `s-*` hosts). So the inline value token — a plain light-DOM span — cannot
// reference `--p-color-text-link` directly. Instead, capture Polaris's own link
// color once from a throwaway `<s-link>`'s shadow and publish it as
// `--appx-token-color` for the scoped token CSS (which derives its hover / caret-on
// tints from the same value via color-mix). This keeps the blue a genuine Polaris
// value with no hardcoded hex; it degrades to `currentColor` if the read fails.
function useCapturedTokenColor() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.style.getPropertyValue("--appx-token-color")) return;
    const probe = document.createElement("s-link");
    probe.textContent = "link";
    probe.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(probe);
    const read = () => {
      const shadow = (probe as HTMLElement & { shadowRoot?: ShadowRoot })
        .shadowRoot;
      for (const node of shadow
        ? Array.from(shadow.querySelectorAll("*"))
        : []) {
        const color = getComputedStyle(node).color;
        const rgb = color.match(/\d+/g);
        // Skip the inherited near-black; the link text node carries the blue.
        if (rgb && !(rgb[0] === "0" && rgb[1] === "0" && rgb[2] === "0")) {
          root.style.setProperty("--appx-token-color", color);
          break;
        }
      }
      probe.remove();
    };
    const raf = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(raf);
      probe.remove();
    };
  }, []);
}

// The App Bridge contextual save bar (the "Unsaved changes" bar at the top of the
// embedded app). Addressed by id, shown while the editor is dirty.
const SAVE_BAR_ID = "template-save-bar";

// --- Editor container -------------------------------------------------------
export function SpecTableEditor({
  initialRows,
  initialName,
  initialStatus,
  onDiscard,
}: {
  initialRows: EditorRow[];
  initialName: string;
  initialStatus: string;
  // Remount the editor (parent bumps a key) so Discard resets the reducer to the
  // persisted rows without a dedicated reset action.
  onDiscard: () => void;
}) {
  const [rows, dispatch] = useReducer(rowsReducer, initialRows);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const atCap = rows.length >= MAX_TEMPLATE_ROWS;
  useCapturedTokenColor();
  const shopify = useAppBridge();

  // --- Drag reorder (Steps 10–11) ------------------------------------------
  // Two sensors on one DndContext: a PointerSensor (mouse/touch, Step 10) with a
  // small activation distance so a click on the ⠿ handle is not mistaken for a
  // drag, and a KeyboardSensor (Step 11) whose `sortableKeyboardCoordinates` lets
  // the arrow keys step this vertical list (Space/Enter pick up & drop, Escape
  // cancels). Both produce the SAME onDragEnd, so the keyboard drop reuses the
  // Step 10 MOVE_ROW path unchanged; the reducer no-ops a drop onto the origin,
  // so a same-spot drag never flips the dirty flag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    dispatch({
      type: "MOVE_ROW",
      activeId: String(active.id),
      overId: String(over.id),
    });
  }, []);

  // Screen-reader announcements for the keyboard drag (Step 11). dnd-kit renders
  // the hidden live region; we supply row-aware copy (its label + 1-based
  // position) from the pure `reorderAnnouncements` helper. The callbacks read
  // CURRENT rows via a ref so they never close over a stale array — the array
  // does not change mid-drag (MOVE_ROW only fires on drop), and the pre-move
  // `over` position is the slot the dragged row lands in (see the helper's note).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dndAnnouncements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) =>
        announceReorderStart(rowsRef.current, String(active.id)),
      onDragOver: ({ active, over }) =>
        announceReorderOver(
          rowsRef.current,
          String(active.id),
          over ? String(over.id) : null,
        ),
      onDragEnd: ({ active, over }) =>
        announceReorderEnd(
          rowsRef.current,
          String(active.id),
          over ? String(over.id) : null,
        ),
      onDragCancel: ({ active }) =>
        announceReorderCancel(rowsRef.current, String(active.id)),
    }),
    [],
  );

  // --- Save (Step 9.5) -----------------------------------------------------
  // Persist the row array (plus name + status, ridden along unchanged for now) to
  // Postgres + the storefront metaobject via the route action. The editor sends
  // JSON so the structured valueParts survive (FormData would stringify them).
  const saveFetcher = useFetcher<typeof templateAction>();
  const revalidator = useRevalidator();
  const saving = saveFetcher.state !== "idle";

  // Dirty-tracking against the last-saved baseline. Rows are the only editable
  // surface here, so a JSON compare of the row array is the dirty signal.
  const currentRowsJson = JSON.stringify(rows);
  const rowsJsonRef = useRef(currentRowsJson);
  rowsJsonRef.current = currentRowsJson;
  const [savedRowsJson, setSavedRowsJson] = useState(currentRowsJson);
  const isDirty = currentRowsJson !== savedRowsJson;

  const handleSave = useCallback(() => {
    // The payload is valid JSON at runtime; the cast satisfies SubmitTarget,
    // which the EditorRow interface union does not match structurally (interfaces
    // carry no implicit index signature).
    saveFetcher.submit(
      {
        rows,
        name: initialName,
        status: initialStatus,
      } as unknown as Parameters<typeof saveFetcher.submit>[0],
      { method: "post", encType: "application/json" },
    );
  }, [saveFetcher, rows, initialName, initialStatus]);

  const handleDiscard = useCallback(() => {
    // Clear dirty immediately (hides the bar), then remount to the persisted rows.
    setSavedRowsJson(rowsJsonRef.current);
    onDiscard();
  }, [onDiscard]);

  // Process a completed save exactly once (guard on the data identity): reset the
  // dirty baseline, refresh the loader so a later Discard reverts to the saved
  // rows, and toast the outcome (incl. the metaobject round-trip result).
  const handledSaveRef = useRef<unknown>(null);
  useEffect(() => {
    if (saveFetcher.state !== "idle") return;
    const data = saveFetcher.data;
    if (!data || data === handledSaveRef.current) return;
    handledSaveRef.current = data;
    if (data.ok) {
      setSavedRowsJson(rowsJsonRef.current);
      revalidator.revalidate();
      if (data.syncError) {
        shopify.toast.show(data.syncError, { isError: true });
      } else if (data.roundTripOk) {
        shopify.toast.show("Saved — storefront round-trip verified");
      } else {
        shopify.toast.show("Saved");
      }
    } else {
      shopify.toast.show(data.error ?? "Could not save template", {
        isError: true,
      });
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator, shopify]);

  // --- Metafield definitions fetch (Step 8) --------------------------------
  // The shop's product metafield definitions are fetched lazily from the
  // `/app/metafield-definitions` resource route the FIRST time the modal opens,
  // then cached for the editor's lifetime (reopening never refetches). The fetch
  // is observably async so the modal can show explicit loading / empty / error
  // states. Step 8 only confirms the fetch + states — the definitions are NOT
  // rendered as selectable choices yet (that is Step 9).
  const metafieldsFetcher = useFetcher<typeof metafieldDefinitionsLoader>();
  // Flips true on the first open; gates both the "load once" guard and whether
  // the status region renders at all (so it never shows a spinner before the
  // merchant has opened the modal).
  const [metafieldsRequested, setMetafieldsRequested] = useState(false);

  const loadMetafieldDefinitions = useCallback(() => {
    metafieldsFetcher.load("/app/metafield-definitions");
  }, [metafieldsFetcher]);

  // Trigger the fetch once, on the first modal open. Subsequent opens reuse the
  // cached result; the error state's Retry calls `loadMetafieldDefinitions`
  // directly to re-issue.
  const ensureMetafieldDefinitions = useCallback(() => {
    if (metafieldsRequested) return;
    setMetafieldsRequested(true);
    loadMetafieldDefinitions();
  }, [metafieldsRequested, loadMetafieldDefinitions]);

  // --- Insert field modal: caret bridge (Step 5) ---------------------------
  // `activeCaretRef` holds the live caret in whichever value cell last reported
  // one; it is NOT cleared when that cell blurs (so tabbing/clicking to the
  // toolbar button keeps a saved selection — the canonical rich-text-toolbar
  // pattern). It IS cleared when a Label/Section field is focused, since the
  // merchant is no longer editing a value. `savedCaretRef` is the snapshot taken
  // when the modal opens; `hasActiveCaret` only drives the button's disabled gate.
  const activeCaretRef = useRef<SavedCaret | null>(null);
  const savedCaretRef = useRef<SavedCaret | null>(null);
  const [hasActiveCaret, setHasActiveCaret] = useState(false);
  // The field the merchant has picked in the modal (Step 6 native, Step 9
  // metafield). Insert/Update is disabled while this is null. The discriminated
  // `kind` keeps the native and metafield choice lists mutually exclusive.
  // `editTarget` is null in create mode and holds the clicked pill's coordinate in
  // edit mode; together they drive the modal heading, the primary button label,
  // and which commit path runs.
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  // The modal's search query (Step 7). Pure UI: it filters which native fields
  // are rendered (`filterNativeFields`) and never touches `selectedField` — a
  // selected field filtered out of view stays selected and committable. Reset to
  // "" on every open so the list always opens full.
  const [searchQuery, setSearchQuery] = useState("");
  // The modal's search field. Focused shortly after open so the merchant can
  // type immediately; the focus is deliberately deferred past the modal's open
  // animation (see `focusSearchField`). Typed via the global tag-name map so the
  // JSX ref accepts it (the element is an <s-search-field>, not a plain element).
  const searchFieldRef = useRef<HTMLElementTagNameMap["s-search-field"] | null>(
    null,
  );
  // Caret positions queued for a value cell after a modal Insert, keyed by row id.
  // A ref-held Map so its identity is stable across renders (memoization-safe) and
  // mutating it never triggers a render; the target ValueCell consumes it once in
  // its reconcile effect. Created once.
  const pendingCaretByRowRef = useRef<Map<string, number>>(new Map());

  const onCaretChange = useCallback((rowId: string, linear: number | null) => {
    if (linear === null) {
      activeCaretRef.current = null;
      setHasActiveCaret(false);
    } else {
      activeCaretRef.current = { rowId, linear };
      setHasActiveCaret(true);
    }
  }, []);

  // A freshly created row should scroll into view once it has rendered.
  const scrollTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const id = scrollTargetRef.current;
    if (!id) {
      return;
    }
    scrollTargetRef.current = null;
    document
      .getElementById(`row-${id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [rows]);

  const onActivate = useCallback((id: string) => setActiveRowId(id), []);

  const onDelete = useCallback((id: string) => {
    dispatch({ type: "DELETE_ROW", id });
    // The active id may now point at a removed row; clear it so toolbar inserts
    // fall back to appending until the merchant focuses another row.
    setActiveRowId((current) => (current === id ? null : current));
    // If the deleted row held the saved caret, drop the Insert field gate so it
    // cannot target a row that no longer exists.
    if (activeCaretRef.current?.rowId === id) {
      activeCaretRef.current = null;
      setHasActiveCaret(false);
    }
  }, []);

  // Toolbar inserts land directly below the active row (append when none); the
  // new row becomes active and is scrolled into view.
  const insertActive = useCallback((action: (newId: string) => RowsAction) => {
    const id = newRowId();
    scrollTargetRef.current = id;
    dispatch(action(id));
    setActiveRowId(id);
  }, []);

  const handleAddRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id, afterId: activeRowId })),
    [insertActive, activeRowId],
  );
  const handleAddSection = useCallback(
    () =>
      insertActive((id) => ({ type: "ADD_SECTION", id, afterId: activeRowId })),
    [insertActive, activeRowId],
  );
  const handleDuplicate = useCallback(() => {
    if (!activeRowId) {
      return;
    }
    insertActive((id) => ({
      type: "DUPLICATE_ROW",
      id: activeRowId,
      newId: id,
    }));
  }, [insertActive, activeRowId]);

  // The bottom button always appends to the end, regardless of the active row.
  const handleAppendRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id })),
    [insertActive],
  );

  // Open the modal in CREATE mode, snapshotting the current value-cell caret
  // first. Runs on the button's click while the cell still holds the saved
  // selection (value-cell blur does not clear activeCaretRef), so the snapshot is
  // always valid. Resets editTarget + selectedField so a prior edit can't leak in.
  // Focus the modal's search field after it is open. App Bridge plays a view
  // transition when the modal shows; calling .focus() while that transition is
  // mid-flight aborts it (an "InvalidStateError: Transition was aborted" surfaces
  // in the admin console), so we defer past the animation. The modal's own focus
  // trap lands on the close button first; this moves it to the search field so
  // the merchant can type straight away.
  const focusSearchField = useCallback(() => {
    setTimeout(() => searchFieldRef.current?.focus(), 350);
  }, []);

  const handleOpenInsertField = useCallback(() => {
    savedCaretRef.current = activeCaretRef.current;
    if (!savedCaretRef.current) return;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
    ensureMetafieldDefinitions();
    shopify.modal.show(INSERT_FIELD_MODAL_ID);
    focusSearchField();
  }, [shopify, focusSearchField, ensureMetafieldDefinitions]);

  // Open the same modal in EDIT mode for a clicked pill (Step 6.3). No saved
  // caret — edit targets the pill's own slot, not an insertion point. Pre-select
  // the clicked pill: a METAFIELD pre-selects its namespace/key, a native
  // SHOPIFY_FIELD pre-selects its field (Step 9). An unknown native token opens
  // unselected; the pre-selected metafield radio shows checked once the
  // definitions have loaded (the selection is held regardless of render).
  const handleEditPart = useCallback(
    (rowId: string, partIndex: number, part: ValuePart) => {
      savedCaretRef.current = null;
      setEditTarget({ rowId, partIndex });
      setSelection(partToSelection(part));
      setSearchQuery("");
      ensureMetafieldDefinitions();
      shopify.modal.show(INSERT_FIELD_MODAL_ID);
      focusSearchField();
    },
    [shopify, focusSearchField, ensureMetafieldDefinitions],
  );

  // Track the merchant's search query (Step 7). `onInput` fires per keystroke,
  // before `onChange`, so the list filters live as they type.
  const handleSearchInput = useCallback((event: Event) => {
    const value = (event.currentTarget as unknown as { value?: string }).value;
    setSearchQuery(value ?? "");
  }, []);

  // Track the merchant's pick in the native-field choice list (Step 6). Setting a
  // native kind makes the metafield list's controlled values empty, so picking a
  // native field deselects any metafield.
  const handleSelectNative = useCallback((event: Event) => {
    const values = (event.currentTarget as unknown as { values?: string[] })
      .values;
    if (values && values.length > 0) {
      setSelection({ kind: "native", field: values[0] });
    }
  }, []);

  // Track the merchant's pick in the metafield choice list (Step 9). The picked
  // value is a `namespace.key`; decode it back to a definition by LOOKUP in the
  // loaded list (never by string-splitting, so a `.` in a key can't corrupt the
  // pair). Setting a metafield kind deselects any native field.
  const handleSelectMetafield = useCallback(
    (event: Event) => {
      const values = (event.currentTarget as unknown as { values?: string[] })
        .values;
      const picked = values && values.length > 0 ? values[0] : null;
      if (!picked) return;
      const data = metafieldsFetcher.data;
      const definitions = data && data.ok ? data.definitions : [];
      const match = definitions.find(
        (definition) => metafieldChoiceValue(definition) === picked,
      );
      if (match) {
        setSelection({
          kind: "metafield",
          namespace: match.namespace,
          key: match.key,
        });
      }
    },
    [metafieldsFetcher],
  );

  // Commit the picked field. One handler serves both modes: edit swaps the
  // clicked pill in place (SET_VALUE_PART), create inserts a new pill at the saved
  // caret (INSERT_VALUE_PART_AT, the Step 5 path). Either way the post-commit
  // caret lands just after the committed pill via pendingCaretByRowRef, and all
  // modal state is reset so create and edit can't leak into each other.
  const handleCommit = useCallback(() => {
    if (!selection) return; // primary button is disabled in this state
    const part: ValuePart =
      selection.kind === "native"
        ? { type: "SHOPIFY_FIELD", field: selection.field }
        : {
            type: "METAFIELD",
            namespace: selection.namespace,
            key: selection.key,
          };
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);

    if (editTarget) {
      const row = rows.find((r) => r.id === editTarget.rowId);
      if (row && row.rowType === "DATA") {
        // In-place swap keeps the array length, so the caret index after the
        // pill is the start of the next part on the current valueParts.
        pendingCaretByRowRef.current.set(
          editTarget.rowId,
          partOffsetToLinear(row.valueParts, editTarget.partIndex + 1, 0),
        );
        dispatch({
          type: "SET_VALUE_PART",
          id: editTarget.rowId,
          partIndex: editTarget.partIndex,
          part,
        });
      }
    } else {
      const saved = savedCaretRef.current;
      if (saved) {
        const row = rows.find((r) => r.id === saved.rowId);
        if (row && row.rowType === "DATA") {
          const { partIndex, offset } = linearToPartOffset(
            row.valueParts,
            saved.linear,
          );
          pendingCaretByRowRef.current.set(saved.rowId, saved.linear + 1);
          dispatch({
            type: "INSERT_VALUE_PART_AT",
            id: saved.rowId,
            partIndex,
            offset,
            part,
          });
        }
      }
    }

    savedCaretRef.current = null;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
  }, [editTarget, rows, selection, shopify]);

  const handleCancelInsertField = useCallback(() => {
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);
    savedCaretRef.current = null;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
  }, [shopify]);

  const canDuplicate = activeRowId !== null && !atCap;
  // The native fields visible in the modal for the current search query (Step 7).
  // Cheap over 13 entries, so computed inline each render rather than memoized.
  const visibleFields = filterNativeFields(searchQuery);

  // Metafield fetch status for the modal's metafield section (Steps 8–9). `data`
  // is undefined until the first load resolves; treat that — and any non-idle
  // fetcher state, including a Retry that still holds stale data — as loading.
  const metafieldsData = metafieldsFetcher.data;
  const metafieldsLoading =
    metafieldsFetcher.state !== "idle" || metafieldsData === undefined;
  const metafieldDefinitions =
    metafieldsData && metafieldsData.ok ? metafieldsData.definitions : [];
  const metafieldCount = metafieldDefinitions.length;
  // The metafields visible for the current search query (Step 9), filtered by the
  // same shared rule as the native list above.
  const visibleMetafields = filterMetafieldDefinitions(
    metafieldDefinitions,
    searchQuery,
  );
  // The single combined empty state (Step 9): shown only when a non-empty query
  // filters BOTH the native list and the loaded metafield list to nothing, so the
  // merchant never sees two "no match" messages.
  const showCombinedEmpty =
    searchQuery.trim() !== "" &&
    visibleFields.length === 0 &&
    metafieldsData?.ok === true &&
    visibleMetafields.length === 0;

  return (
    <s-stack direction="block" gap="base">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        {/* `<s-stack direction="inline">`, not `<s-button-group>`: the group's
            shadow root has no <slot> in the current Polaris CDN build, so its
            child buttons render at 0×0 / vanish. Do not switch to a button
            group — it regresses (confirmed in-browser, Step 2). */}
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button
            variant="primary"
            icon="plus"
            onClick={handleAddRow}
            {...(atCap ? { disabled: true } : {})}
          >
            Add row
          </s-button>
          <s-button
            variant="secondary"
            icon="layout-section"
            onClick={handleAddSection}
            {...(atCap ? { disabled: true } : {})}
          >
            Add section
          </s-button>
          <s-button
            variant="secondary"
            icon="duplicate"
            onClick={handleDuplicate}
            {...(canDuplicate ? {} : { disabled: true })}
          >
            Duplicate
          </s-button>
          {/* Disabled until a value cell has an active caret — a pill can only be
              dropped into a value, never a label. Opens the Insert field modal. */}
          <s-button
            variant="secondary"
            icon="metafields"
            onClick={handleOpenInsertField}
            {...(hasActiveCaret ? {} : { disabled: true })}
          >
            Insert field
          </s-button>
        </s-stack>
        <s-text
          color={atCap ? undefined : "subdued"}
          tone={atCap ? "critical" : undefined}
          fontVariantNumeric="tabular-nums"
        >
          Rows: {rows.length} / {MAX_TEMPLATE_ROWS}
        </s-text>
      </s-grid>

      {atCap ? (
        <s-banner tone="warning">
          You have reached the {MAX_TEMPLATE_ROWS} row limit. Delete a row
          before adding, duplicating, or adding a section.
        </s-banner>
      ) : null}

      {rows.length === 0 ? (
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-paragraph>
            No rows yet. Choose Add row to start building your spec table.
          </s-paragraph>
        </s-box>
      ) : (
        <s-stack direction="block" gap="small-300">
          <s-grid gridTemplateColumns={DATA_COLUMNS} gap="base">
            <s-text> </s-text>
            <s-text type="strong">Label</s-text>
            <s-text type="strong">Value</s-text>
          </s-grid>

          {/* DndContext/SortableContext render no DOM of their own, so the rows
              stay direct children of the <s-stack> and its gap is preserved.
              Sortable items are keyed by row id (stable identity), so React
              preserves each row's instance — and its caret/focus state — across a
              reorder. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{
              announcements: dndAnnouncements,
              screenReaderInstructions: REORDER_INSTRUCTIONS,
            }}
          >
            <SortableContext
              items={rows.map((row) => row.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((row, index) => (
                <EditorRowItem
                  key={row.id}
                  row={row}
                  index={index}
                  isActive={row.id === activeRowId}
                  onActivate={onActivate}
                  onDelete={onDelete}
                  dispatch={dispatch}
                  onCaretChange={onCaretChange}
                  onEditPart={handleEditPart}
                  pendingCaret={pendingCaretByRowRef.current}
                />
              ))}
            </SortableContext>
          </DndContext>
        </s-stack>
      )}

      <s-button
        variant="secondary"
        icon="plus"
        onClick={handleAppendRow}
        {...(atCap ? { disabled: true } : {})}
      >
        Add row
      </s-button>

      {/* One editor-level Insert field modal serving both create and edit (Step
          6). Hidden until `shopify.modal.show` is called — from the toolbar
          button (create) or a pill click (edit); <s-modal> provides the focus
          trap, Esc, and outside-click dismiss natively. The body is a search box
          (Step 7) over a native-field list (Step 6) plus a live metafield section
          (Step 9); the primary button is disabled until a field is selected and
          commits create (Insert at the saved caret) or edit (Update the clicked
          pill in place). Cancel / Esc / outside-click commit nothing. */}
      <s-modal
        id={INSERT_FIELD_MODAL_ID}
        heading={editTarget ? "Edit field" : "Insert field"}
      >
        {/* Search box (Step 7): filters BOTH lists as the merchant types. Pure
            presentation — it never changes `selection`, so a pick that scrolls
            out of the filtered view stays committable. */}
        <s-stack direction="block" gap="base">
          <s-search-field
            ref={searchFieldRef}
            label="Search fields"
            labelAccessibilityVisibility="exclusive"
            placeholder="Search fields"
            value={searchQuery}
            onInput={handleSearchInput}
          />
          {/* Native fields (Step 6). No per-section empty message: an empty
              native list is silent, and the single combined empty state below
              covers the case where BOTH lists are empty. */}
          {visibleFields.length > 0 ? (
            <s-choice-list
              label="Product field"
              labelAccessibilityVisibility="exclusive"
              values={selection?.kind === "native" ? [selection.field] : []}
              onChange={handleSelectNative}
            >
              {visibleFields.map((nativeField) => (
                <s-choice key={nativeField.field} value={nativeField.field}>
                  {nativeField.label}
                </s-choice>
              ))}
            </s-choice-list>
          ) : null}

          {/* Metafield section (Step 9): the shop's product metafield
              definitions as a selectable list below the native fields, filtered
              by the same search box. Loading / error+Retry / empty-store states
              are carried from Step 8. The heading stays visible whenever the
              section has been requested so it is always discoverable. */}
          {metafieldsRequested ? (
            <s-stack direction="block" gap="small-200">
              <s-divider />
              <s-text type="strong">Metafields</s-text>
              {metafieldsLoading ? (
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-spinner accessibilityLabel="Loading metafields"></s-spinner>
                  <s-text color="subdued">Loading metafields…</s-text>
                </s-stack>
              ) : !metafieldsData!.ok ? (
                <s-stack direction="block" gap="small-200">
                  <s-banner tone="critical">{metafieldsData!.error}</s-banner>
                  <s-stack direction="inline">
                    <s-button onClick={loadMetafieldDefinitions}>
                      Retry
                    </s-button>
                  </s-stack>
                </s-stack>
              ) : metafieldCount === 0 ? (
                <s-text color="subdued">
                  This store has no product metafield definitions.
                </s-text>
              ) : visibleMetafields.length > 0 ? (
                <s-choice-list
                  label="Metafield"
                  labelAccessibilityVisibility="exclusive"
                  values={
                    selection?.kind === "metafield"
                      ? [metafieldChoiceValue(selection)]
                      : []
                  }
                  onChange={handleSelectMetafield}
                >
                  {visibleMetafields.map((definition) => (
                    <s-choice
                      key={definition.id || metafieldChoiceValue(definition)}
                      value={metafieldChoiceValue(definition)}
                    >
                      {definition.name}
                    </s-choice>
                  ))}
                </s-choice-list>
              ) : null}
            </s-stack>
          ) : null}

          {/* Single combined empty state (Step 9): only when a query filters
              both loaded lists to nothing. */}
          {showCombinedEmpty ? (
            <s-paragraph color="subdued">
              No fields match “{searchQuery.trim()}”.
            </s-paragraph>
          ) : null}
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleCommit}
          {...(selection ? {} : { disabled: true })}
        >
          {editTarget ? "Update" : "Insert"}
        </s-button>
        <s-button slot="secondary-actions" onClick={handleCancelInsertField}>
          Cancel
        </s-button>
      </s-modal>

      {/* The App Bridge contextual save bar (Step 9.5). Shown while the row array
          differs from the last-saved baseline; Save persists to Postgres + the
          storefront metaobject, Discard remounts the editor to the saved rows. */}
      <SaveBar id={SAVE_BAR_ID} open={isDirty}>
        <button variant="primary" onClick={handleSave} loading={saving}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
    </s-stack>
  );
}
