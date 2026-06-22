import { useRef } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { EditorRowItem } from "./EditorRowItem";
import { REORDER_INSTRUCTIONS } from "./editorShared";
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
// No Label/Value header: column alignment is carried by the shared grid templates
// on each row (header removed to free vertical space). Presentational.
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
      <s-stack direction="block" gap="base">
        {/* DndContext/SortableContext render no DOM of their own, so the rows
            stay direct children of the <s-stack> and its gap is preserved.
            Sortable items are keyed by row id (stable identity), so React
            preserves each row's instance — and its caret/focus state — across a
            reorder. */}
        <s-stack direction="block" gap="small-300">
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
        </s-stack>

        {/* Bottom add-row: a dashed full-width affordance (mockup-faithful). It
            scrolls WITH the rows; the toolbar's primary Add row stays fixed and
            always reachable. Always appends to the end regardless of the active
            row. */}
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
      </s-stack>
    </div>
  );
}
