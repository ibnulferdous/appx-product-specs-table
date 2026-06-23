import { memo, useState } from "react";
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
  // The delete ✕ is muted at rest and goes critical (red) only while hovered or
  // keyboard-focused, so the destructive control is discoverable without a column
  // of always-on red competing with the content. s-icon's color lives in its
  // shadow DOM (not overridable from light-DOM CSS), so the muted↔critical swap is
  // driven by this state, not a :hover rule.
  const [hot, setHot] = useState(false);
  return (
    // Plain wrapper so the CSS module's `.gutter` class can mute the controls at
    // rest and reveal them on row hover/active/focus — Polaris `s-*` elements
    // reject `className`, so the muting lives on this div, not the <s-stack>.
    <div className={styles.gutter}>
      <s-stack direction="inline" gap="small-200" alignItems="center">
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
        {/* Delete control — a native <button> (matching the drag handle) holding a
            muted ✕ that turns critical red on hover/focus. `onPointerEnter/Leave`
            and `onFocus/Blur` drive the tone swap; the chrome reset + focus ring
            live in the CSS module. */}
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
