import { useEffect, useLayoutEffect } from "react";
import type { TabId } from "./tabViewMemory";

// Shared types, constants and pure helpers for the spec-table editor. A dependency-free leaf that
// both `useRowEngine` and the presentational components import, so it can never close an import cycle.

// A discriminated union so a native field and a metafield are mutually exclusive across the modal's
// two choice lists: whichever kind is set empties the other list's controlled `values`.
export type FieldSelection =
  | { kind: "native"; field: string }
  | { kind: "metafield"; namespace: string; key: string };

// The stable choice value for a metafield: its `namespace.key`, unique per shop and non-empty. Used
// as the `<s-choice value>` and to decode a pick back to a definition by lookup, never by splitting.
export function metafieldChoiceValue(part: {
  namespace: string;
  key: string;
}): string {
  return `${part.namespace}.${part.key}`;
}

// React runs layout effects only in the browser; fall back to useEffect during SSR so the editor's
// value-cell reconciler doesn't warn on the server.
export const useBrowserLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

// Shared grid template so the column header, data rows and section rows line up. The first track is
// the gutter holding the select checkbox, drag handle and delete button inline. ⚠️ The two column
// templates derive from this — retune this one constant, never hardcode per-row widths.
export const GUTTER = "5.5rem";
export const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
export const SECTION_COLUMNS = `${GUTTER} 1fr`;

// The single editor-level "Insert field" modal, addressed by the App Bridge Modal API.
export const INSERT_FIELD_MODAL_ID = "insert-field-modal";

// 🔴 App Bridge plays a view transition whenever an `<s-modal>` opens/closes and manages focus around
// it: focusing a child mid-open ABORTS the transition, and on close it restores focus to the invoker
// AFTER it settles. Both fight our own `.focus()` calls, so they defer past the animation by this many
// ms. See [[polaris-web-component-gotchas]].
export const MODAL_TRANSITION_MS = 350;

// Shown before a bulk paste that would cross the row cap, so the merchant can continue or cancel.
export const PASTE_CAP_MODAL_ID = "paste-over-cap-modal";

// Shown before a destructive multi-row delete. There is no undo, so this is the primary safeguard.
export const BULK_DELETE_MODAL_ID = "bulk-delete-modal";

// Deleting this many or more rows confirms first; fewer is already a deliberate toolbar action.
export const BULK_DELETE_CONFIRM_THRESHOLD = 3;

// Spoken once when a drag handle is focused. dnd-kit renders this into the auto-generated
// `aria-describedby` element the handle points at.
export const REORDER_INSTRUCTIONS = {
  draggable:
    "To reorder a row, press space or enter on its drag handle to pick it up, " +
    "use the arrow keys to move it, then press space or enter to drop it, or " +
    "press escape to cancel.",
};

// A caret saved from a value cell: the row plus the textarea `selectionStart` offset into
// `partsToText(valueParts)`. ⚠️ A plain number, never a DOM Range, so it survives focus moving into
// the modal and any re-render.
export interface SavedCaret {
  rowId: string;
  offset: number;
}

// Polaris field events are typed as plain DOM `Event`; the field exposes the current text on `value`.
export function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// The App Bridge contextual save bar ("Unsaved changes" at the top of the embedded app). Shown while
// the editor is dirty.
export const SAVE_BAR_ID = "template-save-bar";

/**
 * The attributes the save bar's primary (Save) button carries, derived from the engine's
 * `saving` / `canSave` pair.
 *
 * 🔴 THE BUG THIS EXISTS FOR: `loading` MUST be a STRING, never a boolean. `<SaveBar>` renders
 * `<ui-save-bar>` and hooks a plain NATIVE `<button>`, and on React 18 a boolean value for an
 * attribute React doesn't know is a boolean is DROPPED from the DOM (dev-only warning). So
 * `loading={saving}` typechecks (App Bridge augments `ButtonHTMLAttributes` with `loading?: boolean
 * | string`) yet never reaches the element — the merchant clicked Save and got no spinner while the
 * whole editor froze. Verified: `loading="true"` → `<button … loading="true">`.
 *
 * ⚠️ Specific to native tags. Every `<s-button loading={flag}>` is FINE — a dashed tag is a custom
 * element, which receives booleans stringified. Do not "fix" those to match this.
 *
 * `disabled` is deliberately NOT set while a save is in flight (no spinner competing with a greyed
 * button): `handleSave` returns early when non-idle, the card is `inert`, and App Bridge disables a
 * loading button itself. The only thing that disables Save is an incomplete scope, folded into `canSave`.
 *
 * Returned as a spreadable object so the absent case is a MISSING attribute, not `loading="false"` /
 * `disabled="false"` (which a presence-based parser would read as true).
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

// The Style tab's "Reset to theme defaults" confirmation (feature 57 Step 12). A bulk,
// destructive-feeling action, so it confirms rather than applying on first click (the SaveBar's
// Discard is no substitute — it would revert unrelated edits). Mounted in `SpecTableEditor`, NOT
// `StyleTab`: the rail unmounts the moment the merchant switches to Content, which would strand an
// open dialog.
export const RESET_STYLING_MODAL_ID = "reset-styling-modal";

// --- Collapsible Style / Settings rail (feature 76) -------------------------
// The editor column is narrower than the storefront's 749px mobile breakpoint on a laptop once the
// rail is open, so the inline "Desktop" preview honestly renders STACKED. Collapsing the 18.75rem rail
// hands the stage the full card, clearing the breakpoint with ~300px to spare (measured). The ONE
// answer to that width problem — feature 75's full-size preview modal was the other, removed 2026-07-25.

// The tabs that HAVE a rail. `content` is excluded at the type level rather than handled with a
// fallback: the toggle isn't rendered there, so a label for it would be unreachable code.
export type RailTab = Exclude<TabId, "content">;

// The rail's inner scroller, referenced by the toggle's `aria-controls`. The id goes on the plain
// `.railScroller` div rather than the wrapping `<s-box>` — a custom-element host is the wrong place to
// bet on attribute handling ([[polaris-web-component-gotchas]]); a plain div takes an `id` reliably.
export const RAIL_REGION_ID = "editor-rail";

/**
 * The rail toggle's accessible name: the ACTION plus the panel ("Hide Style panel" / "Show Settings
 * panel"). A pure function (like `viewAnnouncement`) because the editor is a cross-origin iframe, so
 * accessible-name copy can't be read back from the top frame and is pinned by unit test. The verb
 * tracks `collapsed`, the noun tracks the tab.
 *
 * The button's ICON deliberately doesn't change with state — a swapping toggle icon is permanently
 * ambiguous about whether it depicts the state or the action. `aria-expanded` + this label carry state.
 */
export function railToggleLabel(tab: RailTab, collapsed: boolean): string {
  const panel = tab === "style" ? "Style" : "Settings";
  return collapsed ? `Show ${panel} panel` : `Hide ${panel} panel`;
}

// The header "More actions" <s-menu> (opened declaratively via the trigger's `commandFor`) and its
// two lifecycle <s-modal>s (feature 20), driven imperatively via the App Bridge Modal API.
export const MORE_ACTIONS_MENU_ID = "template-more-actions";
export const RENAME_MODAL_ID = "rename-template-modal";
export const DELETE_MODAL_ID = "delete-template-modal";
