import { useId } from "react";
import type { RowEngine } from "./useRowEngine";

// The contextual bulk-action bar (feature 29) that takes over the toolbar's LEFT cell while a
// selection exists — the standard "N selected" pattern. Holds the count and a critical Delete;
// select-all is driven by the tristate header checkbox in RowGrid, not here. Presentational.
export function BulkActionsBar({ engine }: { engine: RowEngine }) {
  const { selectedCount, requestDeleteSelected, clearSelection } = engine;

  const countWord = selectedCount === 1 ? "row" : "rows";

  // Instance-unique id linking the icon-only clear button to its <s-tooltip> via `interestFor` — the
  // codebase's icon-only tooltip pattern (see SegmentedControl).
  const clearTooltipId = useId();

  return (
    <>
      <s-stack direction="inline" gap="base" alignItems="center">
        {/* Clear selection — an icon-only escape hatch so the merchant can drop a selection without
            scrolling to the header checkbox. `accessibilityLabel` names it for AT; the <s-tooltip>
            (via `interestFor`) surfaces the same label on hover/focus. */}
        <s-button
          variant="tertiary"
          icon="x"
          accessibilityLabel="Clear selection"
          interestFor={clearTooltipId}
          onClick={clearSelection}
        ></s-button>
        <s-text fontVariantNumeric="tabular-nums">
          {selectedCount} {countWord} selected
        </s-text>
        {/* Destructive: `requestDeleteSelected` confirms via a modal for 3+ rows and applies 1–2 now. */}
        <s-button tone="critical" onClick={requestDeleteSelected}>
          Delete
        </s-button>
      </s-stack>
      {/* Tooltip for the clear button — OUTSIDE the inline stack so it doesn't occupy a flex/gap slot;
          `interestFor` references it by id, so its DOM position is free. */}
      <s-tooltip id={clearTooltipId}>Clear selection</s-tooltip>
    </>
  );
}
