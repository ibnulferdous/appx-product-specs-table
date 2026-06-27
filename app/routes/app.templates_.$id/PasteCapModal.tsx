import { MAX_TEMPLATE_ROWS } from "../../utils/rows";
import { PASTE_CAP_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation modal shown before a bulk paste that would cross the 200-row cap
// (feature 24). The paste handler stops short of inserting, stashes the truncated
// (already-id-stamped) rows on `engine.pendingPaste`, and opens this modal so the
// merchant can see how many rows will be added vs. won't fit, then choose Continue
// (add what fits) or Cancel (add nothing). Hidden — and `pendingPaste` null —
// until `shopify.modal.show` is called; <s-modal> supplies the focus trap, Esc,
// and outside-click dismiss, all of which cancel and insert nothing.
// Presentational — all state + handlers come from the engine.
export function PasteCapModal({ engine }: { engine: RowEngine }) {
  const { pendingPaste, handleConfirmPaste, handleCancelPaste } = engine;

  // Derived from the staged paste; reads as zeros while hidden (pendingPaste is
  // null), but the modal is only ever shown with a paste staged, so the visible
  // copy is always accurate.
  const added = pendingPaste?.pasted.length ?? 0;
  const dropped = pendingPaste?.dropped ?? 0;
  const total = added + dropped;
  const addedWord = added === 1 ? "row" : "rows";
  const droppedWord = dropped === 1 ? "row" : "rows";

  return (
    <s-modal id={PASTE_CAP_MODAL_ID} heading="Some rows won’t fit">
      <s-stack direction="block" gap="base">
        <s-banner tone="warning">
          A spec table can hold up to {MAX_TEMPLATE_ROWS} rows.
        </s-banner>
        <s-paragraph>
          You’re pasting {total} rows, but only {added} {addedWord} will fit.
          The remaining {dropped} {droppedWord} won’t be added.
        </s-paragraph>
      </s-stack>
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
