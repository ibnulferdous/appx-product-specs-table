import type { RowEngine } from "./useRowEngine";

// The contextual bulk-action bar (feature 29) that takes over the toolbar's LEFT
// cell while a selection exists — the standard Shopify/Polaris resource-list
// "N selected" pattern. It holds the selection count, a Select all / Deselect all
// toggle, and a critical Delete; the `Rows: N / 200` counter in the toolbar's
// right cell stays visible alongside it. Presentational — every value + handler
// comes from the engine.
export function BulkActionsBar({ engine }: { engine: RowEngine }) {
  const {
    rows,
    selectedCount,
    allSelected,
    selectAll,
    clearSelection,
    requestDeleteSelected,
  } = engine;

  const countWord = selectedCount === 1 ? "row" : "rows";

  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      <s-text fontVariantNumeric="tabular-nums">
        {selectedCount} {countWord} selected
      </s-text>
      {/* Select all ⇄ Deselect all — one toggle covers both "select the rest" and
          the exit-selection affordance once everything is selected. */}
      {allSelected ? (
        <s-button variant="tertiary" onClick={clearSelection}>
          Deselect all
        </s-button>
      ) : (
        <s-button variant="tertiary" onClick={selectAll}>
          Select all ({rows.length})
        </s-button>
      )}
      {/* Destructive: routes through requestDeleteSelected, which confirms via a
          modal for 3+ rows (and Select all → Delete) and applies 1–2 immediately. */}
      <s-button tone="critical" onClick={requestDeleteSelected}>
        Delete
      </s-button>
    </s-stack>
  );
}
