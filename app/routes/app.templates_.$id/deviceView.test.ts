import { describe, expect, it } from "vitest";
import {
  isPreviewView,
  phoneScreenHeight,
  previewDeviceWidth,
  PHONE_CHROME_PX,
  PHONE_SCREEN_MAX_PX,
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
    expect(isPreviewView("mobile")).toBe(true);
  });

  it("covers every ViewId exactly once (edit off, the two devices on)", () => {
    const all: ViewId[] = ["edit", "desktop", "mobile"];
    expect(all.filter(isPreviewView)).toEqual(["desktop", "mobile"]);
  });
});

// Feature 49 · Step 5. The pure device-width mapping that sizes the preview
// iframe. Node-env unit coverage; the actual frame sizing/centering is visual and
// browser-verified.
describe("previewDeviceWidth", () => {
  it("returns the exact width for each device", () => {
    expect(previewDeviceWidth("desktop")).toBe("100%");
    expect(previewDeviceWidth("mobile")).toBe("375px");
  });

  it("is total — every device view yields a non-empty width", () => {
    const devices: DeviceView[] = ["desktop", "mobile"];
    for (const view of devices) {
      expect(previewDeviceWidth(view).length).toBeGreaterThan(0);
    }
  });

  it("fills only on desktop; mobile is a fixed px width", () => {
    expect(previewDeviceWidth("desktop")).toBe("100%");
    expect(previewDeviceWidth("mobile")).toMatch(/^\d+px$/);
  });
});

// Feature 72 (max-height follow-up). The pure sizing rule behind the Mobile
// mockup's screen: fit the phone to the available viewport, then cap it so a tall
// monitor can't stretch it past a plausible device height.
describe("phoneScreenHeight", () => {
  it("is null before the first measurement (so CSS decides)", () => {
    expect(phoneScreenHeight(null)).toBeNull();
    expect(phoneScreenHeight(undefined)).toBeNull();
  });

  it("ignores a non-finite measurement", () => {
    expect(phoneScreenHeight(Number.NaN)).toBeNull();
    expect(phoneScreenHeight(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("fits the whole phone in the viewport when there is room to spare", () => {
    // Screen + chrome must not exceed what was measured.
    const available = 600;
    expect(phoneScreenHeight(available)).toBe(available - PHONE_CHROME_PX);
  });

  it("caps at a plausible device height on a tall monitor", () => {
    expect(phoneScreenHeight(2000)).toBe(PHONE_SCREEN_MAX_PX);
    expect(phoneScreenHeight(PHONE_SCREEN_MAX_PX + PHONE_CHROME_PX)).toBe(
      PHONE_SCREEN_MAX_PX,
    );
  });

  it("never returns a zero or negative screen from a tiny measurement", () => {
    expect(phoneScreenHeight(0)).toBe(PHONE_CHROME_PX);
    expect(phoneScreenHeight(10)).toBe(PHONE_CHROME_PX);
  });

  it("is monotonic and always within the cap", () => {
    let previous = 0;
    for (const available of [0, 100, 400, 840, 1200, 3000]) {
      const height = phoneScreenHeight(available);
      expect(height).not.toBeNull();
      expect(height!).toBeGreaterThanOrEqual(previous);
      expect(height!).toBeLessThanOrEqual(PHONE_SCREEN_MAX_PX);
      previous = height!;
    }
  });
});
