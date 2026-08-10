import { BULK_DELETE_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation modal before a bulk delete (feature 29), gated on count: 3+ selected rows (and Select
// all → Delete) open this first; 1–2 apply immediately. A friction guard, not the last line of
// defense: confirming still fires the 10s "Undo" toast (feature 33), and the removal only persists on
// Save. Driven imperatively via the App Bridge Modal API. Presentational.
export function BulkDeleteModal({ engine }: { engine: RowEngine }) {
  const { selectedCount, handleConfirmBulkDelete, handleCancelBulkDelete } =
    engine;

  const rowWord = selectedCount === 1 ? "row" : "rows";

  return (
    <s-modal
      id={BULK_DELETE_MODAL_ID}
      heading={`Delete ${selectedCount} ${rowWord}?`}
    >
      <s-paragraph>
        {selectedCount} selected {rowWord} will be removed from this template.
        You can undo right afterward; the removal is saved when you save the
        template.
      </s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        onClick={handleConfirmBulkDelete}
      >
        Delete {selectedCount} {rowWord}
      </s-button>
      <s-button slot="secondary-actions" onClick={handleCancelBulkDelete}>
        Cancel
      </s-button>
    </s-modal>
  );
}
