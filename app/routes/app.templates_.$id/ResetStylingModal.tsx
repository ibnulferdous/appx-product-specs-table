import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { RESET_STYLING_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation gate for the Style rail's "Reset to theme defaults" (feature 57
// Step 12). Resetting throws away every styling override in one click, and the
// SaveBar's Discard is not an undo for it — Discard reverts unrelated edits too —
// so this confirms first. <s-modal> supplies the focus trap, Esc, and
// outside-click dismiss, all of which cancel and change nothing.
//
// MOUNTED IN `SpecTableEditor`, not in `StyleTab`, for two reasons. `EditorShell`
// unmounts the whole rail the moment the merchant switches to Content, which
// would tear the dialog out from under them mid-confirm; and mounting it at the
// wrapper level keeps it alive across every tab and device view. Nothing about
// the reset depends on being on the Style tab, so an open dialog that survives a
// tab switch still does exactly what it says.
//
// Show/hide is component-local (the `TemplateHeaderActions` variant) rather than
// routed through the engine: the engine owns the state change, this owns the
// dialog. Like every other <s-modal> here it portals OUTSIDE the editor's inert
// save-freeze, so the freeze cannot reach its buttons — hence both guards below.
export function ResetStylingModal({ engine }: { engine: RowEngine }) {
  const shopify = useAppBridge();
  const { saving, resetStyling } = engine;

  // If a save somehow starts while this is open, hide it: the freeze that stops
  // every other control cannot reach a portalled modal. Hiding an already-hidden
  // modal is a no-op.
  useEffect(() => {
    if (saving) shopify.modal.hide(RESET_STYLING_MODAL_ID);
  }, [saving, shopify]);

  const handleConfirm = () => {
    // Re-guard at click time, not just via the effect above — the effect races a
    // click landing in the same tick, and an edit applied into an in-flight save
    // would never reach the server.
    if (saving) return;
    resetStyling();
    shopify.modal.hide(RESET_STYLING_MODAL_ID);
  };
  const handleCancel = () => shopify.modal.hide(RESET_STYLING_MODAL_ID);

  return (
    <s-modal id={RESET_STYLING_MODAL_ID} heading="Reset to theme defaults?">
      <s-paragraph>
        Every style override on this template — layout, sections, rows, colors,
        and typography — goes back to your theme’s defaults. Nothing else about
        the template changes, and the reset is only saved when you save.
      </s-paragraph>
      <s-button
        slot="primary-action"
        variant="primary"
        tone="critical"
        onClick={handleConfirm}
      >
        Reset styles
      </s-button>
      <s-button slot="secondary-actions" onClick={handleCancel}>
        Cancel
      </s-button>
    </s-modal>
  );
}
