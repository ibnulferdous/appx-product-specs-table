import { MAX_TEMPLATE_ROWS } from "../../utils/rows";
import { PASTE_CAP_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation modal before a bulk paste that would cross the 200-row cap (feature 24). The paste
// handler stashes the truncated (already-id-stamped) rows on `engine.pendingPaste` and opens this so
// the merchant sees how many will be added vs. won't fit, then chooses Continue (add what fits) or
// Cancel. Hidden — and `pendingPaste` null — until shown. Presentational.
export function PasteCapModal({ engine }: { engine: RowEngine }) {
  const { pendingPaste, handleConfirmPaste, handleCancelPaste } = engine;

  // Derived from the staged paste; reads as zeros while hidden, but the modal is only shown with a
  // paste staged, so the visible copy is always accurate.
  const added = pendingPaste?.pasted.length ?? 0;
  const dropped = pendingPaste?.dropped ?? 0;
  const total = added + dropped;
  const addedWord = added === 1 ? "row" : "rows";

  return (
    <s-modal id={PASTE_CAP_MODAL_ID} heading="Some rows won’t fit">
      {/* One sentence, not three: the heading already raises the alarm, so a banner restating the cap
          and a closing "the remaining N won't be added" were the same fact repeated. */}
      <s-paragraph>
        A spec table can hold up to {MAX_TEMPLATE_ROWS} rows. You’re pasting{" "}
        {total}, so only {added} {addedWord} will fit.
      </s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleConfirmPaste}
      >
        Add {added} {addedWord}
      </s-button>
      <s-button slot="secondary-actions" onClick={handleCancelPaste}>
        Cancel
      </s-button>
    </s-modal>
  );
}
