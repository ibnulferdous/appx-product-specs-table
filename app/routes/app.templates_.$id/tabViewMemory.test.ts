import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_VIEWS,
  TAB_IDS,
  rememberView,
  viewAnnouncement,
  viewForTab,
  type TabId,
  type TabViewMemory,
} from "./tabViewMemory";
import type { ViewId } from "./deviceView";

// Feature 57 · Step 11. The pure per-tab view memory that puts the merchant on a
// preview when they open Style — the surface that actually shows styling, since
// the Edit grid deliberately never does (`context/features/67-…`). Node-env unit
// coverage; the DOM swap itself is browser-verified (jsdom cannot render the
// Polaris web components the shell is built from — [[testing-strategy]]).

// A merchant's click sequence, replayed through the same reducer the shell uses.
// `tab` is where they are; each view choice is remembered against it.
function replay(steps: ReadonlyArray<{ tab: TabId; choose?: ViewId }>): {
  memory: TabViewMemory;
  view: ViewId;
} {
  let memory: TabViewMemory = DEFAULT_TAB_VIEWS;
  let tab: TabId = "content";
  for (const step of steps) {
    tab = step.tab;
    if (step.choose) memory = rememberView(memory, tab, step.choose);
  }
  return { memory, view: viewForTab(memory, tab) };
}

describe("default landing view per tab", () => {
  it("opens Content on the editable grid", () => {
    expect(viewForTab(DEFAULT_TAB_VIEWS, "content")).toBe("edit");
  });

  it("opens Style on a preview — the whole point of Step 11", () => {
    expect(viewForTab(DEFAULT_TAB_VIEWS, "style")).toBe("desktop");
  });

  it("opens Settings on a preview too (its knobs are storefront-only as well)", () => {
    expect(viewForTab(DEFAULT_TAB_VIEWS, "settings")).toBe("desktop");
  });

  it("defines a default for every tab (a new tab cannot land undefined)", () => {
    for (const tab of TAB_IDS) {
      expect(DEFAULT_TAB_VIEWS[tab]).toBeTruthy();
    }
    expect(Object.keys(DEFAULT_TAB_VIEWS).sort()).toEqual([...TAB_IDS].sort());
  });
});

describe("per-tab memory", () => {
  it("remembers a view choice against the tab it was made on", () => {
    const { view } = replay([
      { tab: "style", choose: "mobile" },
      { tab: "content" },
      { tab: "style" },
    ]);
    expect(view).toBe("mobile");
  });

  it("keeps each tab's memory independent", () => {
    const { memory } = replay([
      { tab: "content", choose: "tablet" },
      { tab: "style", choose: "mobile" },
    ]);
    expect(viewForTab(memory, "content")).toBe("tablet");
    expect(viewForTab(memory, "style")).toBe("mobile");
    expect(viewForTab(memory, "settings")).toBe("desktop");
  });

  it("does NOT seed Style from a device chosen on Content", () => {
    // Deliberate: cross-tab seeding is one more rule for a gain the merchant
    // would not notice. Style's first entry is Desktop, full stop.
    const { view } = replay([
      { tab: "content", choose: "mobile" },
      { tab: "style" },
    ]);
    expect(view).toBe("desktop");
  });

  it("lets Edit chosen on Style stick — the merchant is never re-forced", () => {
    // This is the case a naive "force a preview on tab entry" rule gets wrong:
    // it would override the merchant on every return to Style.
    const { view } = replay([
      { tab: "style", choose: "edit" },
      { tab: "content" },
      { tab: "style" },
    ]);
    expect(view).toBe("edit");
  });

  it("returns Content to the editable grid after previewing on Style", () => {
    // The symmetric dead end: clicking Content must not strand the merchant on a
    // read-only preview with no grid to edit.
    const { view } = replay([
      { tab: "style", choose: "tablet" },
      { tab: "content" },
    ]);
    expect(view).toBe("edit");
  });

  it("treats the memory as immutable and returns it unchanged on a no-op", () => {
    const next = rememberView(DEFAULT_TAB_VIEWS, "style", "tablet");
    expect(DEFAULT_TAB_VIEWS.style).toBe("desktop");
    expect(next.style).toBe("tablet");
    // Same value in → same object out, so React can bail out of the re-render.
    expect(rememberView(next, "style", "tablet")).toBe(next);
  });
});

describe("viewAnnouncement", () => {
  it("names each view for a screen reader", () => {
    expect(viewAnnouncement("edit")).toBe("Edit");
    expect(viewAnnouncement("desktop")).toBe("Desktop preview");
    expect(viewAnnouncement("tablet")).toBe("Tablet preview");
    expect(viewAnnouncement("mobile")).toBe("Mobile preview");
  });

  it("is total — every view has a non-empty announcement", () => {
    const all: ViewId[] = ["edit", "desktop", "tablet", "mobile"];
    for (const view of all) {
      expect(viewAnnouncement(view).length).toBeGreaterThan(0);
    }
  });
});
