import { memo } from "react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import styles from "./SpecTableEditor.module.css";

// --- Row gutter (drag handle + delete), shared by data and section rows ------
export const RowGutter = memo(function RowGutter({
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
