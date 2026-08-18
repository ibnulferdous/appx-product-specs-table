import { describe, expect, it } from "vitest";
import { railToggleLabel, type RailTab } from "./editorShared";

// Feature 76 — the collapsible Style / Settings rail.
//
// The editor is a cross-origin iframe, so the top frame cannot read the app's
// AOM: an accessible name is not something a browser check can assert, only
// eyeball. So the copy is pinned here instead, on the pure helper, exactly as
// `viewAnnouncement` is in `tabViewMemory.test.ts`. The collapse itself (grid
// template, `display: none`, the re-measured rail height) is browser-verified —
// jsdom cannot render the Polaris web components the shell is built from
// ([[testing-strategy]]).

const RAIL_TABS: readonly RailTab[] = ["style", "settings"];

describe("railToggleLabel", () => {
  it("offers to HIDE an expanded Style rail", () => {
    expect(railToggleLabel("style", false)).toBe("Hide Style panel");
  });

  it("offers to SHOW a collapsed Style rail", () => {
    expect(railToggleLabel("style", true)).toBe("Show Style panel");
  });

  it("offers to HIDE an expanded Settings rail", () => {
    expect(railToggleLabel("settings", false)).toBe("Hide Settings panel");
  });

  it("offers to SHOW a collapsed Settings rail", () => {
    expect(railToggleLabel("settings", true)).toBe("Show Settings panel");
  });

  // The label names the ACTION, not the state — the whole reason the icon is
  // allowed to stay stable across the toggle. If the verb ever stopped flipping,
  // the button would be a control with no indication of what pressing it does.
  it.each(RAIL_TABS)("flips the verb with `collapsed` on %s", (tab) => {
    expect(railToggleLabel(tab, false)).toMatch(/^Hide /);
    expect(railToggleLabel(tab, true)).toMatch(/^Show /);
  });

  // ...and the noun names the TARGET, so a merchant who collapsed the rail and
  // forgot can tell from the button alone which panel comes back.
  it.each([false, true])(
    "tracks the tab in the noun (collapsed=%s)",
    (collapsed) => {
      expect(railToggleLabel("style", collapsed)).toContain("Style panel");
      expect(railToggleLabel("settings", collapsed)).toContain(
        "Settings panel",
      );
      expect(railToggleLabel("style", collapsed)).not.toBe(
        railToggleLabel("settings", collapsed),
      );
    },
  );
});
