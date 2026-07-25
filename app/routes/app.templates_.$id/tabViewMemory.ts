// Feature 57 · Step 11 — tab view memory (shared device + per-tab edit/preview).
//
// The problem this solves (see `context/features/68-…`): the tab control
// (Content / Style / Settings) and the view control (Edit / Desktop / Mobile)
// are independent, so a merchant who opens Style while the view is still Edit
// changes colours and typography and SEES NOTHING HAPPEN. The knobs work — the
// Edit grid is a fixed editing surface that deliberately never reflects merchant
// styling (the binding rule from the withdrawn Step 11, `67-…`), so the device
// previews are the only surface that shows the change.
//
// The fix is NOT to style the grid. It is to put the merchant on the surface that
// already renders styling correctly, at the moment they start styling.
//
// Two orthogonal pieces of memory, not one per-tab view:
//
//   - `device` — the chosen preview device (Desktop / Mobile), SHARED across all
//     three tabs. Picking Mobile anywhere makes every tab that is previewing show
//     Mobile. A merchant should not have to re-pick the device each time they
//     cross a tab; the preview device is a property of the editor, not the tab.
//   - `modes` — per tab, whether that tab shows the editable grid (`edit`) or a
//     device preview (`preview`). This is where the tab-specific behaviour lives:
//     Content opens on the grid (it is the editing surface), Style / Settings open
//     on a preview (their knobs are storefront-only). A merchant's Edit choice on
//     a tab is never re-forced back to a preview.
//
// So switching a device on one tab moves every previewing tab to that device,
// while switching to Edit only affects the current tab. The view control stays
// fully enabled everywhere.
//
// Dependency-free (no React, no CSS import) so it unit-tests in Node without
// pulling in the component tree — same rationale as `deviceView.ts`.

import type { DeviceView, ViewId } from "./deviceView";

export type TabId = "content" | "style" | "settings";

export const TAB_IDS: readonly TabId[] = ["content", "style", "settings"];

/** Whether a tab shows the editable grid or a device preview. */
export type TabMode = "edit" | "preview";

/**
 * The editor's view memory: one shared preview device, plus each tab's
 * edit-or-preview mode. The active `ViewId` for a tab is derived from the two
 * (see `viewForTab`) — the device is never stored per tab.
 */
export interface ViewMemory {
  /** The shared preview device — applies to every tab that is previewing. */
  readonly device: DeviceView;
  /** Per-tab edit-vs-preview mode. */
  readonly modes: Readonly<Record<TabId, TabMode>>;
}

/**
 * The state before the merchant has expressed any preference.
 *
 * - Shared `device` → `desktop`: the widest preview, the natural first look.
 * - `content` mode → `edit`: the Content tab is for editing rows, so it opens on
 *   the editable grid. This is also what stops the symmetric dead end — clicking
 *   Content from a device view used to leave the merchant on a read-only preview
 *   with no grid to edit.
 * - `style` / `settings` mode → `preview`: both tabs carry knobs whose only
 *   visible effect is on the storefront table, so both open on a preview (of the
 *   shared `desktop` device).
 */
export const DEFAULT_VIEW_MEMORY: ViewMemory = {
  device: "desktop",
  modes: {
    content: "edit",
    style: "preview",
    settings: "preview",
  },
};

/**
 * The view a tab should show: the editable grid when its mode is `edit`,
 * otherwise the shared preview device.
 */
export function viewForTab(memory: ViewMemory, tab: TabId): ViewId {
  return memory.modes[tab] === "edit" ? "edit" : memory.device;
}

/**
 * Record the merchant's view choice from `tab`. Returns a new memory (the caller
 * holds it in state, so it must not be mutated in place); an unchanged choice
 * returns the same object so React can bail out of the re-render.
 *
 * - Choosing `edit` sets ONLY this tab's mode to `edit`. The shared device is
 *   retained, so returning to a previewing tab still shows the last device.
 * - Choosing a device sets the SHARED device (moving every previewing tab to it)
 *   AND flips this tab into `preview` — the click both picks a device and reveals
 *   the preview on the tab it was made from.
 */
export function rememberView(
  memory: ViewMemory,
  tab: TabId,
  view: ViewId,
): ViewMemory {
  if (view === "edit") {
    if (memory.modes[tab] === "edit") return memory;
    return { ...memory, modes: { ...memory.modes, [tab]: "edit" } };
  }

  const deviceChanged = memory.device !== view;
  const modeChanged = memory.modes[tab] !== "preview";
  if (!deviceChanged && !modeChanged) return memory;

  return {
    device: view,
    modes: modeChanged ? { ...memory.modes, [tab]: "preview" } : memory.modes,
  };
}

/**
 * Set the shared preview device WITHOUT touching any tab's edit-vs-preview mode
 * (feature 75). Used by the full-size preview modal's own device toggle, which
 * belongs to no tab.
 *
 * `rememberView` is deliberately NOT reusable here: it also flips the calling
 * tab into `preview`, so toggling the device from a modal opened over the
 * Content tab would leave Content showing a read-only preview instead of the
 * editable grid once the modal closed.
 *
 * The device stays SHARED (the locked Step 11 decision — the preview device is a
 * property of the editor, not of a tab), so a device picked in the modal is the
 * device every previewing tab shows behind it. An unchanged choice returns the
 * same object so React can bail out of the re-render.
 */
export function setPreviewDevice(
  memory: ViewMemory,
  device: DeviceView,
): ViewMemory {
  if (memory.device === device) return memory;
  return { ...memory, device };
}

/**
 * The screen-reader announcement for a view the merchant did NOT click.
 *
 * When a tab switch moves the checked segment of the view radiogroup,
 * `aria-checked` moves without focus moving — correct (focus belongs on the tab
 * just pressed), but it leaves a screen-reader user with no signal that the stage
 * changed underneath them. Callers announce this politely, and ONLY on a
 * programmatic change: a merchant who clicked the view segment themselves already
 * knows, and the radio's own state change covers it.
 */
export function viewAnnouncement(view: ViewId): string {
  switch (view) {
    case "edit":
      return "Edit";
    case "desktop":
      return "Desktop preview";
    case "mobile":
      return "Mobile preview";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
