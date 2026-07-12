import { describe, expect, it } from "vitest";
import {
  isPreviewView,
  previewDeviceWidth,
  type DeviceView,
  type ViewId,
} from "./deviceView";

// Feature 49 · Step 1. The pure predicate that carries the edit-vs-preview
// decision (the "stage renders the preview slot only off-Edit" rule). Node-env
// unit coverage; the actual DOM swap in EditorShell is browser-verified.
describe("isPreviewView", () => {
  it("is false for the editable view", () => {
    expect(isPreviewView("edit")).toBe(false);
  });

  it("is true for each device preview view", () => {
    expect(isPreviewView("desktop")).toBe(true);
    expect(isPreviewView("tablet")).toBe(true);
    expect(isPreviewView("mobile")).toBe(true);
  });

  it("covers every ViewId exactly once (edit off, the three devices on)", () => {
    const all: ViewId[] = ["edit", "desktop", "tablet", "mobile"];
    expect(all.filter(isPreviewView)).toEqual(["desktop", "tablet", "mobile"]);
  });
});

// Feature 49 · Step 5. The pure device-width mapping that sizes the preview
// iframe. Node-env unit coverage; the actual frame sizing/centering is visual and
// browser-verified.
describe("previewDeviceWidth", () => {
  it("returns the exact width for each device", () => {
    expect(previewDeviceWidth("desktop")).toBe("100%");
    expect(previewDeviceWidth("tablet")).toBe("768px");
    expect(previewDeviceWidth("mobile")).toBe("375px");
  });

  it("is total — every device view yields a non-empty width", () => {
    const devices: DeviceView[] = ["desktop", "tablet", "mobile"];
    for (const view of devices) {
      expect(previewDeviceWidth(view).length).toBeGreaterThan(0);
    }
  });

  it("fills only on desktop; tablet and mobile are fixed px", () => {
    expect(previewDeviceWidth("desktop")).toBe("100%");
    expect(previewDeviceWidth("tablet")).toMatch(/^\d+px$/);
    expect(previewDeviceWidth("mobile")).toMatch(/^\d+px$/);
  });
});
