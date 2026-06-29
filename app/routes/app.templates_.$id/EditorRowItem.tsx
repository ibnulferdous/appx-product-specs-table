import type { ChangeEvent, Dispatch } from "react";
import { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditorRow, RowsAction, ValuePart } from "../../utils/rows";
import { describeRow } from "../../utils/reorderAnnouncements";
import { DATA_COLUMNS, SECTION_COLUMNS } from "./editorShared";
import { RowGutter } from "./RowGutter";
import { ValueCell } from "./ValueCell";
import styles from "./SpecTableEditor.module.css";

// --- Data row ---------------------------------------------------------------
interface RowItemProps {
  row: EditorRow;
  index: number;
  isActive: boolean;
  selected: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleSelected: (id: string) => void;
  dispatch: Dispatch<RowsAction>;
  onCaretChange: (rowId: string, linear: number | null) => void;
  onEditPart: (rowId: string, partIndex: number, part: ValuePart) => void;
  onBulkPaste: (grid: string[][]) => void;
  pendingCaret: Map<string, number>;
}

// Memoized so a single cell edit re-renders only that row. `dispatch`,
// `onActivate`, `onDelete`, `onToggleSelected`, `onCaretChange`, `onEditPart`,
// and `onBulkPaste` are stable; `pendingCaret` is a stable ref-held Map;
// `isActive` and `selected` are booleans, so non-edited, non-(de)activated,
// non-(de)selected rows skip re-rendering entirely.
export const EditorRowItem = memo(function EditorRowItem({
  row,
  index,
  isActive,
  selected,
  onActivate,
  onDelete,
  onToggleSelected,
  dispatch,
  onCaretChange,
  onEditPart,
  onBulkPaste,
  pendingCaret,
}: RowItemProps) {
  const rowNumber = index + 1;

  const handleLabel = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({
        type: "SET_LABEL",
        id: row.id,
        label: event.currentTarget.value,
      }),
    [dispatch, row.id],
  );
  const handleDelete = useCallback(() => onDelete(row.id), [onDelete, row.id]);
  const handleToggleSelected = useCallback(
    () => onToggleSelected(row.id),
    [onToggleSelected, row.id],
  );
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

  const isSection = row.rowType === "SECTION_HEADER";
  // Compose the row's classes: every row is a `.row`; a section adds the grey
  // full-width band; the active row adds the blue accent + tint (declared last so
  // it wins the background on an active section).
  let rowClass = styles.row;
  if (isSection) rowClass += ` ${styles.rowSection}`;
  if (isActive) rowClass += ` ${styles.rowActive}`;
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
      {/* Tight vertical padding for a dense, table-like row; the active state is
          the .rowActive accent + tint on the full-width wrapper above, not a
          floating grey card here. */}
      <s-box paddingBlock="small-300" paddingInline="small-200">
        <s-grid
          gridTemplateColumns={isSection ? SECTION_COLUMNS : DATA_COLUMNS}
          gap="none"
          alignItems="center"
        >
          <RowGutter
            rowNumber={rowNumber}
            selected={selected}
            onToggleSelected={handleToggleSelected}
            onDelete={handleDelete}
            reorderLabel={reorderLabel}
            dragAttributes={attributes}
            dragListeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
            isDragging={isDragging}
          />

          {isSection ? (
            // Native single-line <input> styled as a heading via `.cellSection`
            // (borderless semibold sentence-case text; the row's grey band is the
            // separator), editable with the shared blue ring on focus. `aria-label`
            // carries the accessible name the former `s-text-field` `label` provided.
            <input
              type="text"
              className={styles.cellSection}
              aria-label={`Section title for row ${rowNumber}`}
              placeholder="Section title"
              value={row.label}
              onChange={handleLabel}
              onFocus={handleLabelFocus}
            />
          ) : (
            <>
              <input
                type="text"
                className={styles.cellInput}
                aria-label={`Label for row ${rowNumber}`}
                placeholder="Label"
                value={row.label}
                onChange={handleLabel}
                onFocus={handleLabelFocus}
              />
              <ValueCell
                row={row}
                rowNumber={rowNumber}
                dispatch={dispatch}
                onCaretChange={onCaretChange}
                onEditPart={onEditPart}
                onBulkPaste={onBulkPaste}
                pendingCaret={pendingCaret}
              />
            </>
          )}
        </s-grid>
      </s-box>
    </div>
  );
});
