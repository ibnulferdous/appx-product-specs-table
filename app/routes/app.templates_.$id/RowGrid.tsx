import { useRef } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { EditorRowItem } from "./EditorRowItem";
import { DATA_COLUMNS, REORDER_INSTRUCTIONS } from "./editorShared";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
import type { RowEngine } from "./useRowEngine";
import styles from "./SpecTableEditor.module.css";

// The bounded rows scroller (reshell A1 + A3): the ONLY thing that scrolls, so
// the toolbar above it stays in view on a long table. Holds the reorderable rows
// + the bottom dashed Add-row (which scrolls with them, mockup-faithful). Its
// `max-height` is JS-measured by `useScrollRegionHeight`; `.rowsScroller` supplies
// `overflow-y: auto` + the min-height floor. Because the rows now live inside this
// `overflow-y: auto` scroller, the engine's `scrollIntoView` on a freshly added
// row scrolls THIS list, not the iframe — the core A3 win, now on the real engine.
// A Label/Value header tops the list — it shares the DATA_COLUMNS template +
// inline padding with each row so the columns line up, and scrolls with the rows.
// Presentational.
export function RowGrid({ engine }: { engine: RowEngine }) {
  const {
    rows,
    activeRowId,
    onActivate,
    onDelete,
    dispatch,
    onCaretChange,
    handleEditPart,
    pendingCaret,
    sensors,
    handleDragEnd,
    dndAnnouncements,
    handleAppendRow,
    atCap,
  } = engine;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const maxHeight = useScrollRegionHeight(scrollerRef, rows.length);

  return (
    <div
      ref={scrollerRef}
      className={styles.rowsScroller}
      style={{ maxHeight }}
    >
      {/* Column header — anchors the grid (Label / Value) and tells the eye it's a
          table. The `.colHeader` div carries the hairline (Polaris `s-*` reject
          `className`); it scrolls with the rows. Shares DATA_COLUMNS + inline
          padding with each row so the two columns line up; the empty first cell
          spans the gutter. */}
      <div className={styles.colHeader}>
        <s-box paddingBlock="small-200" paddingInline="small-200">
          <s-grid
            gridTemplateColumns={DATA_COLUMNS}
            gap="base"
            alignItems="center"
          >
            <span aria-hidden="true"></span>
            <s-text color="subdued">Label</s-text>
            <s-text color="subdued">Value</s-text>
          </s-grid>
        </s-box>
      </div>

      {/* Reorderable rows. DndContext/SortableContext render no DOM of their own,
          so each row's `.row` wrapper is a direct, flush child of the scroller —
          rows are separated by their hairline bottom borders, not a gap. Keyed by
          row id (stable identity) so React preserves each row's instance — and its
          caret/focus state — across a reorder. */}
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
              pendingCaret={pendingCaret}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Bottom add-row: a dashed full-width affordance (mockup-faithful), with
          breathing room above so it doesn't butt against the last row's divider.
          Scrolls WITH the rows; the toolbar's primary Add row stays fixed and
          always reachable. Always appends to the end regardless of the active
          row. */}
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
              icon="plus"
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
