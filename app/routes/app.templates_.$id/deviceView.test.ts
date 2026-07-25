import { describe, expect, it } from "vitest";
import {
  browserScreenHeight,
  isPreviewView,
  modalPreviewHeight,
  phoneScreenHeight,
  previewDeviceWidth,
  BROWSER_SCREEN_MIN_PX,
  MODAL_CHROME_PX,
  MODAL_PREVIEW_MAX_PX,
  MODAL_PREVIEW_MIN_PX,
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

// Feature 73. The pure sizing rule behind the Desktop mockup's screen: CLAMP the
// shim-measured content height to the viewport — hug a short table exactly as
// before, bound a long one so the iframe scrolls inside the browser window.
describe("browserScreenHeight", () => {
  it("is null before the first height message (so CSS decides)", () => {
    expect(browserScreenHeight(null, 900)).toBeNull();
    expect(browserScreenHeight(undefined, 900)).toBeNull();
  });

  it("ignores a non-finite content height", () => {
    expect(browserScreenHeight(Number.NaN, 900)).toBeNull();
    expect(browserScreenHeight(Number.POSITIVE_INFINITY, 900)).toBeNull();
  });

  it("falls back to the unclamped content height before the first measurement", () => {
    // Degrades to the pre-feature-73 unbounded window, never to a wrong size.
    expect(browserScreenHeight(1400, undefined)).toBe(1400);
    expect(browserScreenHeight(1400, null)).toBe(1400);
    expect(browserScreenHeight(1400, Number.NaN)).toBe(1400);
  });

  it("hugs the content when the table fits the viewport (no scrollbar)", () => {
    expect(browserScreenHeight(400, 900)).toBe(400);
    // The boundary case: exactly filling the viewport is still a fit.
    expect(browserScreenHeight(900, 900)).toBe(900);
  });

  it("bounds the window when the table outgrows the viewport", () => {
    expect(browserScreenHeight(2400, 900)).toBe(900);
  });

  it("never inflates a genuinely short table to the sanity floor", () => {
    // The floor guards the BUDGET, not the result — a one-row table stays tiny.
    const tiny = 40;
    expect(tiny).toBeLessThan(BROWSER_SCREEN_MIN_PX);
    expect(browserScreenHeight(tiny, 900)).toBe(tiny);
  });

  it("never collapses the window from a raced tiny measurement", () => {
    expect(browserScreenHeight(2400, 0)).toBe(BROWSER_SCREEN_MIN_PX);
    expect(browserScreenHeight(2400, 50)).toBe(BROWSER_SCREEN_MIN_PX);
  });

  it("never exceeds the content height (the clamp is one-sided)", () => {
    for (const content of [24, 200, 900, 5000]) {
      for (const available of [0, 300, 900, 4000]) {
        expect(browserScreenHeight(content, available)!).toBeLessThanOrEqual(
          content,
        );
      }
    }
  });

  it("is a fixed point: re-clamping an applied height changes nothing", () => {
    // The applied height can never feed back as a smaller content measurement
    // (the framed document's height is width-driven), but if it did, the rule
    // would already be settled.
    const applied = browserScreenHeight(2400, 900)!;
    expect(browserScreenHeight(applied, 900)).toBe(applied);
  });
});

// Feature 75. The height budget handed to the preview inside the full-size
// modal — derived from the VIEWPORT, because measuring the modal's own body
// would be circular (an <s-modal> sizes to its content).
describe("modalPreviewHeight", () => {
  it("is null before the first measurement (so CSS decides)", () => {
    expect(modalPreviewHeight(null)).toBeNull();
    expect(modalPreviewHeight(undefined)).toBeNull();
  });

  it("ignores a non-finite viewport height", () => {
    expect(modalPreviewHeight(Number.NaN)).toBeNull();
    expect(modalPreviewHeight(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("subtracts the modal's own chrome from the viewport", () => {
    const viewport = 800;
    expect(modalPreviewHeight(viewport)).toBe(viewport - MODAL_CHROME_PX);
  });

  it("never returns less than the sanity floor on a tiny viewport", () => {
    expect(modalPreviewHeight(0)).toBe(MODAL_PREVIEW_MIN_PX);
    expect(modalPreviewHeight(MODAL_CHROME_PX)).toBe(MODAL_PREVIEW_MIN_PX);
  });

  it("caps on a very tall monitor, where the dialog's own max-height governs", () => {
    expect(modalPreviewHeight(4000)).toBe(MODAL_PREVIEW_MAX_PX);
  });

  it("always lands within its bounds, and is monotonic in the viewport", () => {
    let previous = 0;
    for (const viewport of [0, 200, 600, 900, 1400, 3000]) {
      const height = modalPreviewHeight(viewport);
      expect(height).not.toBeNull();
      expect(height!).toBeGreaterThanOrEqual(MODAL_PREVIEW_MIN_PX);
      expect(height!).toBeLessThanOrEqual(MODAL_PREVIEW_MAX_PX);
      expect(height!).toBeGreaterThanOrEqual(previous);
      previous = height!;
    }
  });

  it("feeds the card's per-device rules unchanged", () => {
    // The modal introduces no third sizing behaviour: its budget is just another
    // `available`, interpreted by the same two functions.
    const budget = modalPreviewHeight(900)!;
    expect(phoneScreenHeight(budget)).toBe(
      Math.min(PHONE_SCREEN_MAX_PX, budget - PHONE_CHROME_PX),
    );
    // A table taller than the budget is bounded; a short one still hugs.
    expect(browserScreenHeight(5000, budget)).toBe(budget);
    expect(browserScreenHeight(120, budget)).toBe(120);
  });
});
