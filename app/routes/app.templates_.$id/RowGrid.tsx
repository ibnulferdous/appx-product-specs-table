import { useRef } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { EditorRowItem } from "./EditorRowItem";
import { DATA_COLUMNS, REORDER_INSTRUCTIONS } from "./editorShared";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
import { useGridKeyboardNav } from "./useGridKeyboardNav";
import type { RowEngine } from "./useRowEngine";
import styles from "./SpecTableEditor.module.css";

// The bounded rows scroller (reshell A1 + A3): the ONLY thing that scrolls, so the toolbar above it
// stays in view. Holds the reorderable rows + the bottom dashed Add-row (both scroll with them). Its
// `max-height` is JS-measured by `useScrollRegionHeight`; `.rowsScroller` supplies `overflow-y: auto` +
// the min-height floor — so the engine's `scrollIntoView` on a new row scrolls THIS list, not the
// iframe. A Label/Value header tops the list, sharing DATA_COLUMNS + inline padding so the columns line
// up. Presentational.
export function RowGrid({ engine }: { engine: RowEngine }) {
  const {
    rows,
    activeRowId,
    selectedRowIds,
    selectedCount,
    allSelected,
    selectAll,
    clearSelection,
    onActivate,
    onDelete,
    toggleSelected,
    dispatch,
    onCaretChange,
    onBulkPaste,
    pendingCaret,
    sensors,
    handleDragEnd,
    dndAnnouncements,
    handleAppendRow,
    atCap,
  } = engine;

  // Tristate "select all" — checked when every row is selected, indeterminate when only some are (set
  // imperatively via a ref, since a native checkbox has no indeterminate attribute).
  const someSelected = selectedCount > 0 && !allSelected;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const maxHeight = useScrollRegionHeight(scrollerRef, rows.length);
  // Spreadsheet-style Ctrl/Cmd+Arrow vertical cell navigation (feature 31): a delegated native keydown
  // listener that self-filters to the chord + a real text cell, so plain arrows / Tab / dnd pick-up
  // arrows pass through.
  useGridKeyboardNav(scrollerRef, rows);

  return (
    <div
      ref={scrollerRef}
      className={styles.rowsScroller}
      style={{ maxHeight }}
    >
      {/* Column header (Label / Value). The `.colHeader` div carries the hairline (`s-*` reject
          `className`) and scrolls with the rows. Shares DATA_COLUMNS + inline padding so the columns
          line up; the empty first cell spans the gutter. */}
      <div className={styles.colHeader}>
        <s-box paddingBlock="small-200" paddingInline="small-200">
          <s-grid
            gridTemplateColumns={DATA_COLUMNS}
            gap="none"
            alignItems="center"
          >
            {/* Select-all checkbox in the gutter column, aligned over the per-row checkboxes.
                `justifySelf: start` left-aligns it within the 5.5rem gutter column; without it, s-grid
                centers the bare input. */}
            <input
              type="checkbox"
              className={styles.selectCheckbox}
              style={{ justifySelf: "start" }}
              aria-label="Select all rows"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={() => (allSelected ? clearSelection() : selectAll())}
              {...(rows.length === 0 ? { disabled: true } : {})}
            />
            <div className={styles.headerCell}>
              <s-text color="subdued">Label</s-text>
            </div>
            <div className={`${styles.headerCell} ${styles.headerCellLast}`}>
              <s-text color="subdued">Value</s-text>
            </div>
          </s-grid>
        </s-box>
      </div>

      {/* Reorderable rows. DndContext/SortableContext render no DOM of their own, so each `.row`
          wrapper is a flush child of the scroller. Keyed by row id so React preserves each row's
          instance — and its caret/focus — across a reorder. */}
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
              selected={selectedRowIds.has(row.id)}
              onActivate={onActivate}
              onDelete={onDelete}
              onToggleSelected={toggleSelected}
              dispatch={dispatch}
              onCaretChange={onCaretChange}
              onBulkPaste={onBulkPaste}
              pendingCaret={pendingCaret}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Bottom add-row: a dashed full-width affordance that scrolls WITH the rows (the toolbar's
          primary Add row stays fixed). Always appends to the end regardless of the active row. */}
      <s-box paddingBlock="base">
        <s-box
          borderStyle="dashed"
          borderWidth="base"
          borderColor="base"
          borderRadius="base"
          padding="small-300"
        >
          <div style={{ display: "flex", justifyContent: "center" }}>
            <s-button
              variant="tertiary"
              icon="table"
              onClick={handleAppendRow}
              {...(atCap ? { disabled: true } : {})}
            >
              Add row
            </s-button>
          </div>
        </s-box>
      </s-box>
    </div>
  );
}
