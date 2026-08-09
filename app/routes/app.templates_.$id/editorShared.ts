import { useEffect, useLayoutEffect } from "react";
import type { TabId } from "./tabViewMemory";

// Shared types, constants and pure helpers for the spec-table editor. A
// dependency-free leaf that both `useRowEngine` and the presentational components
// import, so it can never close an import cycle.

// A discriminated union so a native field and a metafield are mutually exclusive
// across the modal's two choice lists: whichever kind is set empties the other
// list's controlled `values`, so only one radio is ever checked.
export type FieldSelection =
  | { kind: "native"; field: string }
  | { kind: "metafield"; namespace: string; key: string };

// The stable choice value for a metafield: its `namespace.key`, unique per shop
// and non-empty. Used as the `<s-choice value>` and to decode a pick back to a
// definition by lookup — never by string-splitting.
export function metafieldChoiceValue(part: {
  namespace: string;
  key: string;
}): string {
  return `${part.namespace}.${part.key}`;
}

// React runs layout effects only in the browser; fall back to useEffect during
// SSR so the editor's value-cell reconciler does not warn on the server.
export const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

// Shared grid template so the column header, data rows and section rows line up.
// The first track is the gutter holding the select checkbox, drag handle and
// delete button inline, so it must fit all three plus gaps. ⚠️ The two column
// templates derive from it — retune this one constant, never hardcode per-row
// widths.
export const GUTTER = "5.5rem";
export const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
export const SECTION_COLUMNS = `${GUTTER} 1fr`;

// The single editor-level "Insert field" modal, addressed by the App Bridge
// Modal API (`shopify.modal.show/hide`).
export const INSERT_FIELD_MODAL_ID = "insert-field-modal";

// 🔴 App Bridge plays a view transition whenever an `<s-modal>` opens or closes
// and manages focus AROUND it: focusing a child mid-open ABORTS the transition,
// and on close it restores focus to the invoker AFTER the transition settles.
// Both fight our own `.focus()` calls, so they defer past the animation by this
// many ms. See [[polaris-web-component-gotchas]].
export const MODAL_TRANSITION_MS = 350;

// Shown before a bulk paste that would cross the row cap, so the merchant can
// continue (add what fits) or cancel.
export const PASTE_CAP_MODAL_ID = "paste-over-cap-modal";

// Shown before a destructive multi-row delete. There is no undo, so this is the
// primary safeguard.
export const BULK_DELETE_MODAL_ID = "bulk-delete-modal";

// Deleting this many or more rows confirms first; deleting fewer is already a
// deliberate toolbar action and applies immediately.
export const BULK_DELETE_CONFIRM_THRESHOLD = 3;

// Spoken once when a drag handle is focused. dnd-kit renders this into the
// auto-generated `aria-describedby` element the handle points at.
export const REORDER_INSTRUCTIONS = {
  draggable:
    "To reorder a row, press space or enter on its drag handle to pick it up, " +
    "use the arrow keys to move it, then press space or enter to drop it, or " +
    "press escape to cancel.",
};

// A caret saved from a value cell: the row plus the textarea `selectionStart`
// offset into `partsToText(valueParts)`. ⚠️ A plain number, never a DOM Range, so
// it survives focus moving into the modal and any re-render.
export interface SavedCaret {
  rowId: string;
  offset: number;
}

// Polaris field events are typed as plain DOM `Event`; the field element exposes
// the current text on `value`, so we read it through this narrowed cast.
export function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// The App Bridge contextual save bar (the "Unsaved changes" bar at the top of the
// embedded app). Addressed by id, shown while the editor is dirty.
export const SAVE_BAR_ID = "template-save-bar";

/**
 * The attributes the save bar's primary (Save) button carries, derived from the
 * engine's `saving` / `canSave` pair.
 *
 * 🔴 THE BUG THIS EXISTS FOR: `loading` MUST be a STRING, never a boolean.
 * `<SaveBar>` renders `<ui-save-bar>` and hooks a plain NATIVE `<button>`, and on
 * React 18 a boolean value for an attribute React does not know is a boolean is
 * DROPPED from the DOM entirely (dev-only console warning, nothing else). So
 * `loading={saving}` typechecks — `@shopify/app-bridge-types` augments
 * `ButtonHTMLAttributes` with `loading?: boolean | string` — and then never
 * reaches the element, so the merchant clicked Save and got no spinner at all
 * while the whole editor froze. Verified by `renderToStaticMarkup`:
 * `loading={true}` → `<button variant="primary">`, `loading="true"` →
 * `<button variant="primary" loading="true">`.
 *
 * ⚠️ This trap is specific to native tags. Every `<s-button loading={flag}>` in
 * the app is FINE: a dashed tag is a custom element, and React passes booleans
 * through to those stringified. Do not "fix" those to match this.
 *
 * `disabled` is deliberately NOT set while a save is in flight, so the spinner is
 * never competing with a greyed-out button for the same pixels. Nothing is at
 * risk: `handleSave` returns early when the fetcher is non-idle, the editor card
 * is `inert` for the duration, and App Bridge disables a loading button itself.
 * The only thing that disables Save is the reason unrelated to saving — an
 * incomplete assignment scope, which `canSave` folds in.
 *
 * Returned as a spreadable object rather than two props so the absent case is a
 * MISSING attribute, not `loading="false"` / `disabled="false"` — both of which a
 * presence-based attribute parser would read as true.
 */
export function saveBarSaveAttrs({
  saving,
  canSave,
}: {
  saving: boolean;
  canSave: boolean;
}): { loading?: "true"; disabled?: true } {
  if (saving) return { loading: "true" };
  return canSave ? {} : { disabled: true };
}

// The header "More actions" <s-menu> and its two lifecycle <s-modal>s (feature
// 20). The menu is opened declaratively (the trigger button's `commandFor`); the
// modals are driven imperatively via the App Bridge Modal API
// (`shopify.modal.show/hide`), like the Insert-field modal.
// The Style tab's "Reset to theme defaults" confirmation (feature 57 Step 12).
// A bulk, destructive-feeling styling action, so it confirms rather than applying
// on first click — and the SaveBar's Discard is not a substitute, since Discard
// would revert unrelated edits too. Driven imperatively like every other modal
// here. Mounted in `SpecTableEditor`, NOT in `StyleTab`: the rail unmounts the
// moment the merchant switches to Content, which would strand an open dialog.
export const RESET_STYLING_MODAL_ID = "reset-styling-modal";

// --- Collapsible Style / Settings rail (feature 76) -------------------------
// The editor column is narrower than the storefront's 749px mobile breakpoint on
// a laptop once the Style rail is open, so the inline "Desktop" preview honestly
// renders the STACKED layout. Collapsing the 18.75rem rail hands the stage the
// full editor card, which on the reporter's own window clears the breakpoint with
// ~300px to spare (measured — see `context/features/76-…`). This is the ONE
// answer to that width problem: feature 75's full-size preview modal was the
// other, and it was removed 2026-07-25 (see `context/features/75-…`).

// The tabs that HAVE a rail. `content` is excluded at the type level rather than
// handled with a fallback string: the toggle is not rendered there (no rail to
// talk about, and a permanently dead control is worse than an absent one), so a
// label for it would be unreachable code that only invites a wrong answer.
export type RailTab = Exclude<TabId, "content">;

// The rail's inner scroller, referenced by the toggle's `aria-controls`. The id
// goes on the plain `.railScroller` div rather than the wrapping `<s-box>`
// because a custom-element host is the wrong place to bet on attribute handling
// ([[polaris-web-component-gotchas]]) — a plain div takes an `id` reliably.
export const RAIL_REGION_ID = "editor-rail";

/**
 * The rail toggle's accessible name: the ACTION it performs plus the panel it
 * performs it on ("Hide Style panel" / "Show Settings panel").
 *
 * Out of JSX and into a pure function for the same reason as `viewAnnouncement`
 * (`tabViewMemory.ts`): the editor is a cross-origin iframe, so accessible-name
 * copy cannot be read back from the top frame and has to be pinned by unit test
 * instead. The verb tracks `collapsed`, the noun tracks the tab.
 *
 * The button's ICON deliberately does not change with state — a toggle icon that
 * swaps is permanently ambiguous about whether it depicts the current state or
 * the action. `aria-expanded` plus this label carry the state.
 */
export function railToggleLabel(tab: RailTab, collapsed: boolean): string {
  const panel = tab === "style" ? "Style" : "Settings";
  return collapsed ? `Show ${panel} panel` : `Hide ${panel} panel`;
}

export const MORE_ACTIONS_MENU_ID = "template-more-actions";
export const RENAME_MODAL_ID = "rename-template-modal";
export const DELETE_MODAL_ID = "delete-template-modal";
