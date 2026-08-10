// Feature 57 · Step 11 — tab view memory (shared device + per-tab edit/preview).
//
// The problem (see features/68): the tab control (Content / Style / Settings) and the view control
// (Edit / Desktop / Mobile) are independent, so opening Style while the view is Edit changes colours
// and SEES NOTHING HAPPEN — the Edit grid deliberately never reflects merchant styling (binding rule,
// features/67), so the device previews are the only surface that shows the change. The fix is NOT to
// style the grid — it's to put the merchant on the surface that already renders styling correctly.
//
// Two orthogonal pieces of memory:
//   - `device` — the chosen preview device, SHARED across all three tabs (a property of the editor,
//     not the tab, so a merchant needn't re-pick it crossing tabs).
//   - `modes` — per tab, edit-or-preview. Content opens on the grid (the editing surface); Style /
//     Settings open on a preview (their knobs are storefront-only). An Edit choice is never re-forced.
//
// So a device switch moves every previewing tab; switching to Edit affects only the current tab.
//
// Dependency-free (no React/CSS) so it unit-tests in Node — same rationale as `deviceView.ts`.

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
 * The state before the merchant has expressed any preference. Shared `device` → `desktop` (widest,
 * the natural first look); `content` → `edit` (its editing surface, and what stops the symmetric dead
 * end of clicking Content from a device view onto a read-only preview); `style` / `settings` →
 * `preview` (their knobs are storefront-only).
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
 * Record the merchant's view choice from `tab`. Returns a new memory (never mutated in place); an
 * unchanged choice returns the same object so React can bail out of the re-render. Choosing `edit`
 * sets ONLY this tab's mode (the shared device is retained). Choosing a device sets the SHARED device
 * (moving every previewing tab) AND flips this tab into `preview`.
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
 * The screen-reader announcement for a view the merchant did NOT click. When a tab switch moves the
 * checked segment of the view radiogroup, `aria-checked` moves without focus moving, leaving a
 * screen-reader user with no signal the stage changed. Callers announce this politely, and ONLY on a
 * programmatic change (a merchant who clicked the segment already knows).
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
