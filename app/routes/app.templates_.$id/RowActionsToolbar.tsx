import { MAX_TEMPLATE_ROWS } from "../../utils/rows";
import { BulkActionsBar } from "./BulkActionsBar";
import type { RowEngine } from "./useRowEngine";

// The fixed action toolbar above the rows scroller (reshell A1): Add row / Add section / Duplicate /
// Insert field + a live "Rows: N / 200" counter. Stays in view while the list scrolls beneath. While a
// multi-select exists (feature 29), the LEFT cell is swapped for the contextual BulkActionsBar; the
// counter stays put. Presentational.
export function RowActionsToolbar({ engine }: { engine: RowEngine }) {
  const {
    rows,
    atCap,
    canDuplicate,
    hasActiveCaret,
    selectedCount,
    handleAddRow,
    handleAddSection,
    handleDuplicate,
    handleOpenInsertField,
  } = engine;

  return (
    <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
      {/* While rows are selected, the bulk-action bar replaces the add/insert
          controls in this left cell; the counter on the right stays visible. */}
      {selectedCount > 0 ? (
        <BulkActionsBar engine={engine} />
      ) : (
        /* `<s-stack direction="inline">`, not `<s-button-group>`: the group's shadow root has no
            <slot> in the current Polaris CDN build, so its child buttons vanish (confirmed in-browser). */
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button
            variant="primary"
            icon="table"
            onClick={handleAddRow}
            {...(atCap ? { disabled: true } : {})}
          >
            Add row
          </s-button>
          <s-button
            variant="secondary"
            icon="layout-header"
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
          {/* Disabled until a value cell has an active caret — a pill only goes into a value. */}
          <s-button
            variant="secondary"
            icon="metafields"
            onClick={handleOpenInsertField}
            {...(hasActiveCaret ? {} : { disabled: true })}
          >
            Insert field
          </s-button>
        </s-stack>
      )}
      <s-text
        color={atCap ? undefined : "subdued"}
        tone={atCap ? "critical" : undefined}
        fontVariantNumeric="tabular-nums"
      >
        Rows: {rows.length} / {MAX_TEMPLATE_ROWS}
      </s-text>
    </s-grid>
  );
}
