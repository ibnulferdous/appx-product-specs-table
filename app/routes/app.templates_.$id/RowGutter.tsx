import { memo, useState } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import styles from "./SpecTableEditor.module.css";

// --- Row gutter (select checkbox + drag handle + delete), shared by data and
// section rows ----------------------------------------------------------------
export const RowGutter = memo(function RowGutter({
  rowNumber,
  selected,
  onToggleSelected,
  onDelete,
  reorderLabel,
  dragAttributes,
  dragListeners,
  setActivatorNodeRef,
  isDragging,
}: {
  rowNumber: number;
  // Multi-select state for bulk delete (feature 29). `selected` is a plain boolean (so the memoized
  // row re-renders only when ITS selection flips); `onToggleSelected` is a memo-stable per-row toggle.
  selected: boolean;
  onToggleSelected: () => void;
  onDelete: () => void;
  // The drag handle's accessible name, e.g. "Reorder Battery Life row" (icon-only handle would
  // otherwise be a nameless button). Derived from the row label via `describeRow`.
  reorderLabel: string;
  // dnd-kit drag wiring for the ⠿ handle. `attributes` make it a real keyboard-focusable,
  // screen-reader-operable control; `listeners` are the pointer + keyboard activation handlers.
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  setActivatorNodeRef?: (element: HTMLElement | null) => void;
  isDragging?: boolean;
}) {
  // The delete ✕ is muted at rest and goes critical (red) only on hover/focus, so the destructive
  // control is discoverable without a column of always-on red. s-icon's color lives in its shadow DOM
  // (not overridable from light-DOM CSS), so the swap is driven by this state, not a :hover rule.
  const [hot, setHot] = useState(false);
  return (
    // Plain wrapper so `.gutter` can mute the controls at rest and reveal them on row hover/focus —
    // `s-*` elements reject `className`, so the muting lives on this div. `data-selected` lifts the
    // gutter out of the muted state while selected, so a ticked checkbox can't scroll out of sight.
    <div
      className={styles.gutter}
      data-selected={selected ? "true" : undefined}
    >
      <s-stack direction="inline" gap="small-200" alignItems="center">
        {/* Per-row select checkbox (feature 29). A native <input>, tinted with the captured Polaris
            link blue and labelled for AT; its checked state drives the bulk-action bar. */}
        <input
          type="checkbox"
          className={styles.selectCheckbox}
          aria-label={`Select row ${rowNumber}`}
          checked={selected}
          onChange={onToggleSelected}
        />
        {/* Drag-to-reorder handle. A real <button> (dnd-kit's recommended activator) — keyboard
            operable: Space/Enter to pick up, arrows to move, Space/Enter to drop, Escape to cancel.
            `attributes` + `listeners` + `setActivatorNodeRef` must all sit on this one element. */}
        <button
          type="button"
          className={styles.dragHandle}
          data-dragging={isDragging ? "true" : undefined}
          aria-label={reorderLabel}
          ref={setActivatorNodeRef}
          {...dragAttributes}
          {...dragListeners}
        >
          {/* Decorative: the button's aria-label is the accessible name. */}
          <s-icon
            type="drag-handle"
            color="subdued"
            aria-hidden="true"
          ></s-icon>
        </button>
        {/* Delete control — a native <button> holding a muted ✕ that turns critical red on
            hover/focus. `onPointerEnter/Leave` + `onFocus/Blur` drive the tone swap. */}
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={`Delete row ${rowNumber}`}
          onClick={onDelete}
          onPointerEnter={() => setHot(true)}
          onPointerLeave={() => setHot(false)}
          onFocus={() => setHot(true)}
          onBlur={() => setHot(false)}
        >
          <s-icon
            type="x"
            tone={hot ? "critical" : "auto"}
            color={hot ? "base" : "subdued"}
            aria-hidden="true"
          ></s-icon>
        </button>
      </s-stack>
    </div>
  );
});
