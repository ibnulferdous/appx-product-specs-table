import { useId } from "react";
import type { RowEngine } from "./useRowEngine";

// The contextual bulk-action bar (feature 29) that takes over the toolbar's LEFT
// cell while a selection exists — the standard Shopify/Polaris resource-list
// "N selected" pattern. It holds the selection count and a critical Delete; the
// `Rows: N / 200` counter in the toolbar's right cell stays visible alongside it.
// Select-all / clear is driven by the tristate header checkbox in RowGrid, not a
// button here. Presentational — every value + handler comes from the engine.
export function BulkActionsBar({ engine }: { engine: RowEngine }) {
  const { selectedCount, requestDeleteSelected, clearSelection } = engine;

  const countWord = selectedCount === 1 ? "row" : "rows";

  // Instance-unique id linking the icon-only clear button to its <s-tooltip> via
  // `interestFor` (same invoker family as the `commandFor` this build ships) — the
  // codebase's icon-only tooltip pattern (see the SegmentedControl in EditorShell).
  const clearTooltipId = useId();

  return (
    <>
      <s-stack direction="inline" gap="base" alignItems="center">
        {/* Clear selection — the icon-only escape hatch the Polaris bulk-action bar
            expects, so the merchant can drop a selection without scrolling back up
            to the tristate header checkbox. Mirrors that checkbox's clear path.
            `accessibilityLabel` names it for assistive tech; the <s-tooltip> below
            (via `interestFor`) surfaces the same label to sighted hover/focus. */}
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
        {/* Destructive: routes through requestDeleteSelected, which confirms via a
            modal for 3+ rows (and select-all → Delete) and applies 1–2 immediately. */}
        <s-button tone="critical" onClick={requestDeleteSelected}>
          Delete
        </s-button>
      </s-stack>
      {/* Tooltip for the icon-only clear button — kept OUTSIDE the inline stack so
          it doesn't occupy a flex/gap slot; `interestFor` references it by id, so
          its DOM position is free. */}
      <s-tooltip id={clearTooltipId}>Clear selection</s-tooltip>
    </>
  );
}
