import type {
  ClipboardEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  MAX_TEMPLATE_ROWS,
  newRowId,
  rowsReducer,
  type DataRow,
  type EditorRow,
  type RowsAction,
} from "../../utils/rows";
import {
  linearLength,
  linearToPartOffset,
  planAtomicDelete,
  planSelectionDelete,
} from "../../utils/valueParts";
import {
  getSelectionLinearRange,
  partsEqual,
  readPartsFromHost,
  renderPartsToHost,
  sameStructure,
  setCaretLinear,
  syncTrailingFiller,
  updateCaretOnState,
} from "../../utils/valueDom";
import styles from "./SpecTableEditor.module.css";

// React runs layout effects only in the browser; fall back to useEffect during
// SSR so the editor's value-cell reconciler does not warn on the server.
const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

// Shared grid template so the column header, data rows, and section rows all
// line up. First track is the fixed-width gutter (drag handle + delete).
const GUTTER = "2.75rem";
const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
const SECTION_COLUMNS = `${GUTTER} 1fr`;

// Polaris field events are typed as plain DOM `Event`; the field element exposes
// the current text on `value`, so we read it through this narrowed cast.
function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// --- Row gutter (drag handle + delete), shared by data and section rows ------
const RowGutter = memo(function RowGutter({
  rowNumber,
  onDelete,
}: {
  rowNumber: number;
  onDelete: () => void;
}) {
  return (
    <s-stack direction="block" gap="small-300" alignItems="center">
      {/* Drag-to-reorder is wired in Step 4; inert + hidden from AT for now. */}
      <span className={styles.dragHandle} aria-hidden="true">
        <s-icon type="drag-handle" color="subdued"></s-icon>
      </span>
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
// linear index. The field picker that inserts complete pills is Step 5; here the
// only structural edits the merchant can make are typing, deleting a token/break,
// and pressing Enter for a hard line break.
function ValueCell({
  row,
  rowNumber,
  dispatch,
}: {
  row: DataRow;
  rowNumber: number;
  dispatch: Dispatch<RowsAction>;
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
    if (!inSync && pendingCaretRef.current !== null) {
      setCaretLinear(host, pendingCaretRef.current);
      updateCaretOnState(host);
    }
    pendingCaretRef.current = null;
  }, [valueParts]);

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
          dispatch({ type: "SET_VALUE_TEXT", id: row.id, partIndex, text: part.text });
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
        const { partIndex, offset } = linearToPartOffset(valueParts, range.from);
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
      dispatch({ type: "REMOVE_VALUE_PART", id: row.id, partIndex: plan.removeIndex });
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

  // Live "caret-on" highlight: while focused, mark the token/break the next
  // Backspace/Delete would remove. selectionchange is the only event that fires
  // for every caret move (arrows, click, drag).
  const handleSelectionChange = useCallback(() => {
    const host = hostRef.current;
    if (host) updateCaretOnState(host);
  }, []);

  const handleFocus = useCallback(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    const host = hostRef.current;
    if (host) updateCaretOnState(host);
  }, [handleSelectionChange]);

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
}

// Memoized so a single cell edit re-renders only that row. `dispatch`,
// `onActivate`, and `onDelete` are stable; `isActive` is a boolean, so non-edited,
// non-(de)activated rows skip re-rendering entirely.
const EditorRowItem = memo(function EditorRowItem({
  row,
  index,
  isActive,
  onActivate,
  onDelete,
  dispatch,
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

  const rowClass = isActive ? `${styles.row} ${styles.rowActive}` : styles.row;
  const isSection = row.rowType === "SECTION_HEADER";

  return (
    // Activation is a focus side effect: clicking any cell/control focuses it,
    // and keyboard tabbing focuses it too — both bubble to onFocusCapture. A
    // bare onClick here would be a non-interactive-div a11y violation.
    <div id={`row-${row.id}`} className={rowClass} onFocusCapture={handleActivate}>
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
          <RowGutter rowNumber={rowNumber} onDelete={handleDelete} />

          {isSection ? (
            <s-box background="subdued" borderRadius="base" padding="small-200">
              <s-text-field
                label={`Section title for row ${rowNumber}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="Section title"
                value={row.label}
                onInput={handleLabel}
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
              />
              <ValueCell row={row} rowNumber={rowNumber} dispatch={dispatch} />
            </>
          )}
        </s-grid>
      </s-box>
    </div>
  );
});

// Step 4 verification scaffolding: with no Save path yet, every template loads
// with an empty rows array, so there is no complete pill or multiline value to
// exercise the token/caret behavior. In development only, seed a finished sample
// (a METAFIELD token inside "Up to … hours" and a two-line value) so the surface
// is verifiable on its own. Fixed ids keep server and client renders identical
// (no hydration mismatch). Removed when Step 5's modal lands the real insert path.
function devSampleRows(): EditorRow[] {
  return [
    {
      id: "sample-battery-life",
      key: "battery_life",
      rowType: "DATA",
      label: "Battery Life",
      valueParts: [
        { type: "TEXT", text: "Up to " },
        { type: "METAFIELD", namespace: "custom", key: "battery_life" },
        { type: "TEXT", text: " hours" },
      ],
      hideWhenEmpty: true,
    },
    {
      id: "sample-features",
      key: "features",
      rowType: "DATA",
      label: "Features",
      valueParts: [
        { type: "TEXT", text: "1000 nits max brightness (typical)" },
        { type: "LINE_BREAK" },
        { type: "TEXT", text: "1600 nits peak brightness (HDR)" },
      ],
      hideWhenEmpty: true,
    },
  ];
}

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
      for (const node of shadow ? Array.from(shadow.querySelectorAll("*")) : []) {
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

// --- Editor container -------------------------------------------------------
export function SpecTableEditor({ initialRows }: { initialRows: EditorRow[] }) {
  const [rows, dispatch] = useReducer(rowsReducer, initialRows, (rows) =>
    rows.length === 0 && import.meta.env.DEV ? devSampleRows() : rows,
  );
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const atCap = rows.length >= MAX_TEMPLATE_ROWS;
  useCapturedTokenColor();

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
  }, []);

  // Toolbar inserts land directly below the active row (append when none); the
  // new row becomes active and is scrolled into view.
  const insertActive = useCallback(
    (action: (newId: string) => RowsAction) => {
      const id = newRowId();
      scrollTargetRef.current = id;
      dispatch(action(id));
      setActiveRowId(id);
    },
    [],
  );

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
    insertActive((id) => ({ type: "DUPLICATE_ROW", id: activeRowId, newId: id }));
  }, [insertActive, activeRowId]);

  // The bottom button always appends to the end, regardless of the active row.
  const handleAppendRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id })),
    [insertActive],
  );

  const canDuplicate = activeRowId !== null && !atCap;

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
          You have reached the {MAX_TEMPLATE_ROWS} row limit. Delete a row before
          adding, duplicating, or adding a section.
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

          {rows.map((row, index) => (
            <EditorRowItem
              key={row.id}
              row={row}
              index={index}
              isActive={row.id === activeRowId}
              onActivate={onActivate}
              onDelete={onDelete}
              dispatch={dispatch}
            />
          ))}
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
    </s-stack>
  );
}
