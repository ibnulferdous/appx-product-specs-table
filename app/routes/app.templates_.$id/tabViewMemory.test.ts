import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_MEMORY,
  TAB_IDS,
  rememberView,
  viewAnnouncement,
  viewForTab,
  type TabId,
  type ViewMemory,
} from "./tabViewMemory";
import type { ViewId } from "./deviceView";

// Feature 57 · Step 11. The pure view memory that puts the merchant on a preview
// when they open Style — the surface that actually shows styling, since the Edit
// grid deliberately never does (`context/features/67-…`) — while keeping the
// preview DEVICE shared across all three tabs (Content / Style / Settings).
// Node-env unit coverage; the DOM swap itself is browser-verified (jsdom cannot
// render the Polaris web components the shell is built from — [[testing-strategy]]).

// A merchant's click sequence, replayed through the same reducer the shell uses.
// `tab` is where they are; each view choice is remembered from it.
function replay(steps: ReadonlyArray<{ tab: TabId; choose?: ViewId }>): {
  memory: ViewMemory;
  view: ViewId;
} {
  let memory: ViewMemory = DEFAULT_VIEW_MEMORY;
  let tab: TabId = "content";
  for (const step of steps) {
    tab = step.tab;
    if (step.choose) memory = rememberView(memory, tab, step.choose);
  }
  return { memory, view: viewForTab(memory, tab) };
}

describe("default landing view per tab", () => {
  it("opens Content on the editable grid", () => {
    expect(viewForTab(DEFAULT_VIEW_MEMORY, "content")).toBe("edit");
  });

  it("opens Style on a desktop preview — the whole point of Step 11", () => {
    expect(viewForTab(DEFAULT_VIEW_MEMORY, "style")).toBe("desktop");
  });

  it("opens Settings on a desktop preview too (its knobs are storefront-only)", () => {
    expect(viewForTab(DEFAULT_VIEW_MEMORY, "settings")).toBe("desktop");
  });

  it("defines a mode for every tab (a new tab cannot land undefined)", () => {
    for (const tab of TAB_IDS) {
      expect(DEFAULT_VIEW_MEMORY.modes[tab]).toBeTruthy();
    }
    expect(Object.keys(DEFAULT_VIEW_MEMORY.modes).sort()).toEqual(
      [...TAB_IDS].sort(),
    );
  });
});

describe("shared preview device", () => {
  it("moves every previewing tab to the device chosen on any tab", () => {
    // Pick Mobile on Style; Settings (also previewing) follows.
    const { memory } = replay([{ tab: "style", choose: "mobile" }]);
    expect(viewForTab(memory, "style")).toBe("mobile");
    expect(viewForTab(memory, "settings")).toBe("mobile");
  });

  it("reveals the preview on the tab the device was chosen from", () => {
    // Choosing a device on Content flips Content into preview, so all three
    // tabs show the same device preview.
    const { memory } = replay([{ tab: "content", choose: "mobile" }]);
    expect(viewForTab(memory, "content")).toBe("mobile");
    expect(viewForTab(memory, "style")).toBe("mobile");
    expect(viewForTab(memory, "settings")).toBe("mobile");
  });

  it("keeps the shared device when a tab returns to Edit", () => {
    // Preview Mobile on Content, then switch Content back to the grid: Content
    // shows the grid again while Style / Settings keep the Mobile preview.
    const { memory } = replay([
      { tab: "content", choose: "mobile" },
      { tab: "content", choose: "edit" },
    ]);
    expect(viewForTab(memory, "content")).toBe("edit");
    expect(viewForTab(memory, "style")).toBe("mobile");
    expect(viewForTab(memory, "settings")).toBe("mobile");
  });

  it("retains the last device so a later preview reuses it, not the default", () => {
    // Pick Mobile on Style, drop Style to Edit, then re-enter preview on Style:
    // it returns to Mobile (the retained shared device), not desktop.
    const { view } = replay([
      { tab: "style", choose: "mobile" },
      { tab: "style", choose: "edit" },
      { tab: "style", choose: "mobile" },
    ]);
    expect(view).toBe("mobile");
  });
});

describe("per-tab edit / preview mode", () => {
  it("lets Edit chosen on Content stick — the merchant is never re-forced", () => {
    // Content already defaults to edit; choosing a device then edit leaves it on
    // edit even after leaving and returning.
    const { view } = replay([
      { tab: "content", choose: "mobile" },
      { tab: "content", choose: "edit" },
      { tab: "style" },
      { tab: "content" },
    ]);
    expect(view).toBe("edit");
  });

  it("lets Edit chosen on Style stick without touching the other tabs", () => {
    // Dropping Style to Edit affects only Style; Settings still previews.
    const { memory } = replay([{ tab: "style", choose: "edit" }]);
    expect(viewForTab(memory, "style")).toBe("edit");
    expect(viewForTab(memory, "settings")).toBe("desktop");
    expect(viewForTab(memory, "content")).toBe("edit");
  });

  it("keeps each tab's mode independent while sharing the device", () => {
    const { memory } = replay([
      { tab: "content", choose: "mobile" }, // content → preview, device mobile
      { tab: "style", choose: "edit" }, // style → edit
    ]);
    expect(viewForTab(memory, "content")).toBe("mobile");
    expect(viewForTab(memory, "style")).toBe("edit");
    expect(viewForTab(memory, "settings")).toBe("mobile");
  });
});

describe("immutability / referential stability", () => {
  it("returns the same object when the choice is a no-op", () => {
    // Style already previews desktop by default → choosing desktop changes nothing.
    expect(rememberView(DEFAULT_VIEW_MEMORY, "style", "desktop")).toBe(
      DEFAULT_VIEW_MEMORY,
    );
    // Content already edits by default → choosing edit changes nothing.
    expect(rememberView(DEFAULT_VIEW_MEMORY, "content", "edit")).toBe(
      DEFAULT_VIEW_MEMORY,
    );
  });

  it("does not mutate the memory in place", () => {
    const next = rememberView(DEFAULT_VIEW_MEMORY, "style", "mobile");
    expect(DEFAULT_VIEW_MEMORY.device).toBe("desktop");
    expect(DEFAULT_VIEW_MEMORY.modes.style).toBe("preview");
    expect(next.device).toBe("mobile");
    // Same value in → same object out, so React can bail out of the re-render.
    expect(rememberView(next, "style", "mobile")).toBe(next);
  });
});

describe("viewAnnouncement", () => {
  it("names each view for a screen reader", () => {
    expect(viewAnnouncement("edit")).toBe("Edit");
    expect(viewAnnouncement("desktop")).toBe("Desktop preview");
    expect(viewAnnouncement("mobile")).toBe("Mobile preview");
  });

  it("is total — every view has a non-empty announcement", () => {
    const all: ViewId[] = ["edit", "desktop", "mobile"];
    for (const view of all) {
      expect(viewAnnouncement(view).length).toBeGreaterThan(0);
    }
  });
});
