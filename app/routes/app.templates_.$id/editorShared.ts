import { useEffect, useLayoutEffect } from "react";
import { findNativeField } from "../../utils/shopifyFields";
import type { ValuePart } from "../../utils/rows";

// Shared types + constants + tiny pure helpers for the spec-table editor, lifted
// out of the former monolithic `SpecTableEditor.tsx` (reshell A1). This is a
// dependency-free leaf both `useRowEngine` and the presentational components
// import — it pulls in no engine/component code, so it can never close an import
// cycle.

// The field the merchant has picked in the "Insert field" modal (Step 9). A
// discriminated union so a native field and a metafield are mutually exclusive
// across the modal's two choice lists: whichever kind is set makes the other
// list's controlled `values` empty, so only one radio is ever checked. `null`
// means nothing picked (the primary button is disabled).
export type FieldSelection =
  | { kind: "native"; field: string }
  | { kind: "metafield"; namespace: string; key: string };

// The stable choice value for a metafield in the modal's list: its
// `namespace.key`, which is unique per shop and non-empty (the Step 8 mapper
// drops nodes missing either). Used both as the <s-choice value> and to decode an
// onChange pick back to a definition by lookup (never by string-splitting).
export function metafieldChoiceValue(part: {
  namespace: string;
  key: string;
}): string {
  return `${part.namespace}.${part.key}`;
}

// Map a clicked pill's value part to the selection that should pre-fill the modal
// in edit mode (Step 9). A METAFIELD pill pre-selects its namespace/key; a
// SHOPIFY_FIELD pill pre-selects its field only when it is a known native token
// (an unknown token opens unselected); anything else opens unselected.
export function partToSelection(part: ValuePart): FieldSelection | null {
  if (part.type === "METAFIELD") {
    return { kind: "metafield", namespace: part.namespace, key: part.key };
  }
  if (part.type === "SHOPIFY_FIELD" && findNativeField(part.field)) {
    return { kind: "native", field: part.field };
  }
  return null;
}

// React runs layout effects only in the browser; fall back to useEffect during
// SSR so the editor's value-cell reconciler does not warn on the server.
export const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

// Shared grid template so the column header, data rows, and section rows all
// line up. First track is the fixed-width gutter holding the per-row select
// checkbox + the drag handle + the delete button side by side (inline), so it
// must fit all THREE controls plus gaps. Widened from 4rem (two controls) when
// the multi-select checkbox landed (feature 29); DATA_COLUMNS / SECTION_COLUMNS
// derive from it, so the header, data rows, and section rows stay aligned
// automatically — retune this one constant, never hardcode per-row widths.
export const GUTTER = "5.5rem";
export const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
export const SECTION_COLUMNS = `${GUTTER} 1fr`;

// The single editor-level "Insert field" modal, addressed by the App Bridge
// Modal API (`shopify.modal.show/hide`).
export const INSERT_FIELD_MODAL_ID = "insert-field-modal";

// App Bridge plays a view transition whenever an `<s-modal>` opens or closes, and
// it manages focus AROUND that transition: focusing a child mid-open ABORTS the
// transition, and on close it restores focus to the modal's invoker AFTER the
// transition settles. Both fights with our own `.focus()` calls, so we defer past
// the animation by this many ms — long enough to clear the transition. Used by the
// modal's deferred search-field focus (open) and the value cell's caret restore
// after an Insert (close). Confirmed in-browser; see polaris-web-component-gotchas.
export const MODAL_TRANSITION_MS = 350;

// The "some pasted rows won't fit" confirmation modal (feature 24). Shown before a
// bulk paste that would cross the 200-row cap so the merchant can continue (add
// what fits) or cancel (add nothing). Driven imperatively via the App Bridge Modal
// API, like the Insert-field modal.
export const PASTE_CAP_MODAL_ID = "paste-over-cap-modal";

// The bulk-delete confirmation modal (feature 29). Shown before a destructive
// multi-row delete (gated on count) so the merchant can confirm or cancel —
// there is no undo yet, so this is the primary safeguard. Driven imperatively via
// the App Bridge Modal API, like the Insert-field and Paste-cap modals.
export const BULK_DELETE_MODAL_ID = "bulk-delete-modal";

// Deleting this many or more selected rows (and therefore Select all → Delete)
// opens the confirmation modal first; deleting 1–2 is already a deliberate
// toolbar action and applies immediately, no modal. A named constant — never a
// hardcoded literal — same convention as MAX_TEMPLATE_ROWS, so the threshold can
// be retuned from merchant feedback in one place.
export const BULK_DELETE_CONFIRM_THRESHOLD = 3;

// Spoken once when a drag handle is focused (Step 11). dnd-kit renders this into
// the auto-generated `aria-describedby` instructions element the handle points at.
export const REORDER_INSTRUCTIONS = {
  draggable:
    "To reorder a row, press space or enter on its drag handle to pick it up, " +
    "use the arrow keys to move it, then press space or enter to drop it, or " +
    "press escape to cancel.",
};

// The pill the merchant is editing (Step 6.3): the row and the value-part index
// of the clicked token. `null` means the modal is in create mode (Insert drops a
// new pill at the saved caret); non-null means edit mode (Update swaps this pill's
// field in place). One modal serves both.
export interface EditTarget {
  rowId: string;
  partIndex: number;
}

// A caret saved from a value cell: which row, and where in that cell's linear
// caret space (see valueParts.ts). Plain numbers, never a DOM Range, so it
// survives focus moving into the modal and any re-render.
export interface SavedCaret {
  rowId: string;
  linear: number;
}

// Polaris field events are typed as plain DOM `Event`; the field element exposes
// the current text on `value`, so we read it through this narrowed cast.
export function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// The App Bridge contextual save bar (the "Unsaved changes" bar at the top of the
// embedded app). Addressed by id, shown while the editor is dirty.
export const SAVE_BAR_ID = "template-save-bar";

// The header "More actions" <s-menu> and its two lifecycle <s-modal>s (feature
// 20). The menu is opened declaratively (the trigger button's `commandFor`); the
// modals are driven imperatively via the App Bridge Modal API
// (`shopify.modal.show/hide`), like the Insert-field modal.
export const MORE_ACTIONS_MENU_ID = "template-more-actions";
export const RENAME_MODAL_ID = "rename-template-modal";
export const DELETE_MODAL_ID = "delete-template-modal";
