import { BULK_DELETE_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation modal shown before a destructive bulk delete (feature 29) — gated
// on count: deleting 3+ selected rows (and therefore Select all → Delete) opens
// this first; 1–2 apply immediately. There is no undo yet, so this is the primary
// safeguard. Mounted in ContentTab beside InsertFieldModal / PasteCapModal and
// driven imperatively via the App Bridge Modal API; <s-modal> supplies the focus
// trap, Esc, and outside-click dismiss, all of which cancel and delete nothing.
// Presentational — count + handlers come from the engine.
export function BulkDeleteModal({ engine }: { engine: RowEngine }) {
  const { selectedCount, handleConfirmBulkDelete, handleCancelBulkDelete } =
    engine;

  const rowWord = selectedCount === 1 ? "row" : "rows";

  return (
    <s-modal id={BULK_DELETE_MODAL_ID} heading="Delete rows?">
      <s-stack direction="block" gap="base">
        <s-banner tone="warning">
          Deleting {selectedCount} {rowWord} can’t be undone.
        </s-banner>
        <s-paragraph>
          {selectedCount} selected {rowWord} will be removed from this template.
          They stay gone after you save.
        </s-paragraph>
      </s-stack>
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
