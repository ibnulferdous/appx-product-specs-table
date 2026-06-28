import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { TemplateStatus } from "@prisma/client";
import { BADGE_TONES } from "../../utils/templateStatus";
import {
  NAME_MAX_LENGTH,
  validateTemplateName,
} from "../../utils/templateName";
import {
  DELETE_MODAL_ID,
  MORE_ACTIONS_MENU_ID,
  RENAME_MODAL_ID,
  SAVE_BAR_ID,
  readValue,
} from "./editorShared";
import type { RowEngine } from "./useRowEngine";
import type { action as templateAction } from "./route";

// The template-level header controls (feature 20): a read-only status badge plus a
// "More actions" <s-menu> (Rename / Duplicate / Delete) with two lifecycle
// <s-modal>s. Rendered as direct children of the page's <s-page> (via slot=...)
// ABOVE the editor's inert freeze wrapper, so the commands stay reachable during
// an in-flight save — which is exactly why template-level actions live in the
// header, not the row-scoped editor body (the editor already has a per-row
// Duplicate + delete ✕; verb+noun labels here disambiguate).
//
// Rename rides the existing dirty/Save flow: it just sets `engine.name`, which
// flips isDirty and opens the SaveBar; persistence happens on Save. Duplicate and
// Delete are navigational — each uses its OWN fetcher (so their request state
// never collides with the SaveBar's `saving`) and the route action redirects.
export function TemplateHeaderActions({
  engine,
  template,
}: {
  engine: RowEngine;
  template: { id: string; name: string; status: TemplateStatus };
}) {
  const shopify = useAppBridge();
  const { saving, isDirty, setName } = engine;

  // Lifecycle actions need a persisted template; on the create-on-first-save
  // sentinel there is nothing to clone or delete yet, so Duplicate/Delete are
  // hidden. Rename stays enabled — it edits the in-memory name carried into
  // create-on-first-save.
  const isNew = template.id === "new";

  // Separate fetchers so Duplicate/Delete request state never collides with the
  // SaveBar's saving state.
  const duplicateFetcher = useFetcher<typeof templateAction>();
  const deleteFetcher = useFetcher<typeof templateAction>();
  const duplicating = duplicateFetcher.state !== "idle";
  const deleting = deleteFetcher.state !== "idle";

  // Rename modal field state, seeded from the live engine name on open.
  const [renameValue, setRenameValue] = useState(template.name);
  const renameResult = validateTemplateName(renameValue);

  // Surface a failed Duplicate (the success path redirects, so it returns no
  // data). Delete always redirects, so it has no error path to surface here.
  useEffect(() => {
    const data = duplicateFetcher.data;
    if (duplicateFetcher.state === "idle" && data && data.ok === false) {
      shopify.toast.show(data.error ?? "Could not duplicate template", {
        isError: true,
      });
    }
  }, [duplicateFetcher.state, duplicateFetcher.data, shopify]);

  // Defense in depth: if a save somehow starts while a lifecycle modal is open,
  // hide it — both modals portal OUTSIDE the editor's inert freeze (like the
  // Insert-field modal and the SaveBar), so the freeze cannot reach their buttons.
  // The menu items are also disabled while saving. Hiding an already-hidden modal
  // is a no-op.
  useEffect(() => {
    if (saving) {
      shopify.modal.hide(RENAME_MODAL_ID);
      shopify.modal.hide(DELETE_MODAL_ID);
    }
  }, [saving, shopify]);

  const handleOpenRename = () => {
    setRenameValue(engine.name);
    shopify.modal.show(RENAME_MODAL_ID);
  };
  const handleRenameConfirm = () => {
    if (!renameResult.ok) return; // the Rename button is disabled in this state
    setName(renameResult.name); // trimmed; flips isDirty + opens the SaveBar
    shopify.modal.hide(RENAME_MODAL_ID);
  };
  const handleRenameCancel = () => shopify.modal.hide(RENAME_MODAL_ID);

  const handleDuplicate = async () => {
    if (saving || duplicating) return;
    // The clone reflects SAVED state; warn before discarding unsaved edits. When
    // not dirty there is no save bar, so leaveConfirmation resolves immediately.
    if (isDirty) {
      try {
        await shopify.saveBar.leaveConfirmation();
      } catch {
        return; // merchant cancelled — stay put
      }
    }
    duplicateFetcher.submit(
      { intent: "duplicate" },
      { method: "post", encType: "application/json" },
    );
  };

  const handleOpenDelete = () => shopify.modal.show(DELETE_MODAL_ID);
  const handleDeleteConfirm = () => {
    if (deleting) return;
    // The confirmation modal is the unsaved-edits guard: deleting discards any
    // pending edits by definition (the copy below warns of this). Keep the modal
    // open with the button in its loading state until the redirect navigates away.
    //
    // Dismiss the contextual save bar BEFORE navigating. Delete redirects to the
    // template LIST (route.tsx), which renders no <SaveBar>, and `open` here is
    // bound to engine.isDirty — which never flips false on delete (we discard, not
    // save). So nothing tells the host to close the "Unsaved changes" bar, and the
    // React <SaveBar>'s unmount-time hide() does not reliably reach the host during
    // a programmatic redirect (the element disconnects around the hide message), so
    // the bar would linger on the list page. Hide it imperatively; hiding an
    // already-hidden bar is a no-op. (Duplicate has no such issue — it lands on
    // another editor whose fresh <SaveBar> mounts with open=false.)
    shopify.saveBar.hide(SAVE_BAR_ID);
    deleteFetcher.submit(
      { intent: "delete" },
      { method: "post", encType: "application/json" },
    );
  };
  const handleDeleteCancel = () => shopify.modal.hide(DELETE_MODAL_ID);

  return (
    <>
      {/* Read-only status indicator. Reads the PERSISTED status from the loader,
          not engine state — after a Save revalidates the loader, it re-tones. */}
      <s-badge slot="accessory" tone={BADGE_TONES[template.status]}>
        {template.status}
      </s-badge>

      <s-button
        slot="secondary-actions"
        icon="menu-horizontal"
        commandFor={MORE_ACTIONS_MENU_ID}
      >
        More actions
      </s-button>
      <s-menu id={MORE_ACTIONS_MENU_ID} accessibilityLabel="Template actions">
        <s-button
          icon="edit"
          onClick={handleOpenRename}
          {...(saving ? { disabled: true } : {})}
        >
          Rename template
        </s-button>
        {isNew ? null : (
          <s-button
            icon="duplicate"
            onClick={handleDuplicate}
            {...(saving || duplicating ? { disabled: true } : {})}
          >
            Duplicate template
          </s-button>
        )}
        {isNew ? null : (
          <s-button
            icon="delete"
            tone="critical"
            onClick={handleOpenDelete}
            {...(saving || deleting ? { disabled: true } : {})}
          >
            Delete template
          </s-button>
        )}
      </s-menu>

      {/* Rename — edits the in-memory name only; the SaveBar persists it. Copy
          stays neutral so it does not imply immediate DB persistence (notably on
          the /new sentinel, where nothing is persisted until the first Save). */}
      <s-modal id={RENAME_MODAL_ID} heading="Rename template">
        <s-text-field
          label="Template name"
          value={renameValue}
          maxLength={NAME_MAX_LENGTH}
          details="For your reference only — shoppers never see this name."
          onInput={(event: Event) => setRenameValue(readValue(event))}
          error={renameResult.ok ? undefined : renameResult.error}
        />
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleRenameConfirm}
          {...(renameResult.ok ? {} : { disabled: true })}
        >
          Rename
        </s-button>
        <s-button slot="secondary-actions" onClick={handleRenameCancel}>
          Cancel
        </s-button>
      </s-modal>

      {/* Delete — confirmation gate (never deletes on first click). Only rendered
          for a persisted template. */}
      {isNew ? null : (
        <s-modal id={DELETE_MODAL_ID} heading="Delete template">
          <s-stack direction="block" gap="base">
            <s-banner tone="warning">This action cannot be undone.</s-banner>
            <s-paragraph>
              Deleting “{engine.name}” permanently removes the template and its
              storefront data. Any unsaved edits will be lost.
            </s-paragraph>
          </s-stack>
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            onClick={handleDeleteConfirm}
            loading={deleting}
          >
            Delete template
          </s-button>
          <s-button
            slot="secondary-actions"
            onClick={handleDeleteCancel}
            {...(deleting ? { disabled: true } : {})}
          >
            Cancel
          </s-button>
        </s-modal>
      )}
    </>
  );
}
