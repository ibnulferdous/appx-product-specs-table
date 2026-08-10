import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { RESET_STYLING_MODAL_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// Confirmation gate for the Style rail's "Reset to theme defaults" (feature 57 Step 12). Resetting
// throws away every styling override in one click, and the SaveBar's Discard is no undo for it (it
// reverts unrelated edits), so this confirms first. <s-modal> supplies the focus trap + Esc +
// outside-click dismiss, all of which cancel.
//
// MOUNTED IN `SpecTableEditor`, not `StyleTab`: `EditorShell` unmounts the rail the moment the
// merchant switches to Content, which would tear the dialog out mid-confirm; the wrapper level keeps
// it alive across every tab. Like every <s-modal> here it portals OUTSIDE the editor's inert
// save-freeze, so the freeze can't reach its buttons — hence both guards below.
export function ResetStylingModal({ engine }: { engine: RowEngine }) {
  const shopify = useAppBridge();
  const { saving, resetStyling } = engine;

  // If a save starts while this is open, hide it: the freeze can't reach a portalled modal.
  useEffect(() => {
    if (saving) shopify.modal.hide(RESET_STYLING_MODAL_ID);
  }, [saving, shopify]);

  const handleConfirm = () => {
    // Re-guard at click time — the effect races a click in the same tick, and an edit applied into an
    // in-flight save would never reach the server.
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
