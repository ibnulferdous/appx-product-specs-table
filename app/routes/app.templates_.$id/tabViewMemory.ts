// Feature 57 · Step 11 — per-tab view memory.
//
// The problem this solves (see `context/features/68-…`): the tab control
// (Content / Style / Settings) and the view control (Edit / Desktop / Tablet /
// Mobile) are independent, so a merchant who opens Style while the view is still
// Edit changes colours and typography and SEES NOTHING HAPPEN. The knobs work —
// the Edit grid is a fixed editing surface that deliberately never reflects
// merchant styling (the binding rule from the withdrawn Step 11, `67-…`), so the
// device previews are the only surface that shows the change.
//
// The fix is NOT to style the grid. It is to put the merchant on the surface that
// already renders styling correctly, at the moment they start styling.
//
// Rather than FORCING a preview on entry — which re-overrides the merchant every
// time they return to Style, even though they chose Edit last visit — each tab
// remembers its own view. Switching tabs restores that tab's view; switching
// views sets the current tab's memory. The merchant's last word on each tab is
// final, and the view control stays fully enabled everywhere.
//
// Dependency-free (no React, no CSS import) so it unit-tests in Node without
// pulling in the component tree — same rationale as `deviceView.ts`.

import type { ViewId } from "./deviceView";

export type TabId = "content" | "style" | "settings";

export const TAB_IDS: readonly TabId[] = ["content", "style", "settings"];

/**
 * Which view each tab lands on before the merchant has expressed a preference.
 *
 * - `content` → `edit`: the Content tab is for editing rows, so it opens on the
 *   editable grid. This is also what stops the symmetric dead end — clicking
 *   Content from a device view used to leave the merchant on a read-only preview
 *   with no grid to edit.
 * - `style` / `settings` → `desktop`: both tabs carry knobs whose only visible
 *   effect is on the storefront table, so both open on a preview.
 *
 * Cross-tab seeding is deliberately NOT done: picking Mobile on Content does not
 * seed Style's first entry. It is one more rule to explain and test for a gain
 * the merchant will not notice.
 */
export const DEFAULT_TAB_VIEWS: Readonly<Record<TabId, ViewId>> = {
  content: "edit",
  style: "desktop",
  settings: "desktop",
};

export type TabViewMemory = Readonly<Record<TabId, ViewId>>;

/** The view a tab should show, given what it remembers. */
export function viewForTab(memory: TabViewMemory, tab: TabId): ViewId {
  return memory[tab];
}

/**
 * Record the merchant's view choice against the tab they made it on. Returns a
 * new memory — the caller holds it in state, so it must not be mutated in place.
 */
export function rememberView(
  memory: TabViewMemory,
  tab: TabId,
  view: ViewId,
): TabViewMemory {
  if (memory[tab] === view) return memory;
  return { ...memory, [tab]: view };
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
    case "tablet":
      return "Tablet preview";
    case "mobile":
      return "Mobile preview";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
