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

  return (
    <s-modal id={PASTE_CAP_MODAL_ID} heading="Some rows won’t fit">
      {/* One sentence, not three: the heading already raises the alarm, so a
          warning banner restating the cap and a closing "the remaining N won't
          be added" (the inverse of "only N will fit") were the same fact told
          over and over. The cap is folded in here as the reason. */}
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
