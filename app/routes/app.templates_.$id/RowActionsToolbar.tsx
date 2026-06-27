import { MAX_TEMPLATE_ROWS } from "../../utils/rows";
import type { RowEngine } from "./useRowEngine";

// The fixed action toolbar above the bounded rows scroller (reshell A1): Add row
// / Add section / Duplicate / Insert field + the live "Rows: N / 200" counter. It
// stays in view while the rows list scrolls beneath it — the core A3 win. Purely
// presentational; every handler + disabled gate comes from the engine.
export function RowActionsToolbar({ engine }: { engine: RowEngine }) {
  const {
    rows,
    atCap,
    canDuplicate,
    hasActiveCaret,
    handleAddRow,
    handleAddSection,
    handleDuplicate,
    handleOpenInsertField,
  } = engine;

  return (
    <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
      {/* `<s-stack direction="inline">`, not `<s-button-group>`: the group's
          shadow root has no <slot> in the current Polaris CDN build, so its
          child buttons render at 0×0 / vanish. Do not switch to a button
          group — it regresses (confirmed in-browser, Step 2). */}
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
  );
}
