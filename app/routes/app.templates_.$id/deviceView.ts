// The editor's view-toggle modes (feature 49). Kept in a dependency-free module
// (no React, no CSS import) so the pure `isPreviewView` predicate can be imported
// from a Node unit test without pulling in the component tree.
//
// `edit` is the only editable view; `desktop` / `mobile` are read-only device
// previews of how the table renders for a shopper at that width (Reshell Phase D).
// Step 1 wires the toggle to swap the stage; the real iframe preview lands in
// later steps.

export type ViewId = "edit" | "desktop" | "mobile";

/** A non-edit view — one of the three read-only device previews. */
export type DeviceView = Exclude<ViewId, "edit">;

/**
 * True when `view` is a device preview (anything but `edit`). A type guard, so a
 * caller can narrow a `ViewId` to `DeviceView` and pass it straight into the
 * `preview` render-prop without a cast. This one predicate encodes the whole
 * "the stage renders the preview slot only off-Edit" decision.
 */
export function isPreviewView(view: ViewId): view is DeviceView {
  return view !== "edit";
}

/**
 * The CSS width the device preview iframe renders at (feature 49, Step 5).
 *
 * - `desktop` → `"100%"`: fill the editor column. Emulating a fixed desktop px
 *   width would only ever be clamped by the narrower admin column, so desktop
 *   simply fills.
 * - `mobile` → `"375px"`: a fixed CSS-pixel device width. Px (not rem) on
 *   purpose — a phone is 375 CSS px regardless of the admin's root font size, so
 *   rem would let admin typography distort the emulated device. The frame is
 *   clamped with `max-width: 100%` in CSS, so a fixed width wider than the column
 *   shrinks instead of overflowing.
 *
 * Keyed on `DeviceView` (not `ViewId`) because only device previews reach the
 * iframe; the exhaustive `never` default makes a future `ViewId` addition fail
 * typecheck here. Pure string-in/string-out, unit-tested like `isPreviewView`.
 */
export function previewDeviceWidth(view: DeviceView): string {
  switch (view) {
    case "desktop":
      return "100%";
    case "mobile":
      return "375px";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

/**
 * Vertical chrome the phone mockup adds around its screen (feature 72): bezel
 * padding + speaker pill + gap + top/bottom border. Subtracted from the measured
 * available height so the WHOLE phone — not just its screen — fits the viewport.
 * Keep in sync with `.phone` padding/gap + `.phoneSpeaker` height + border in
 * `DevicePreview.module.css`.
 */
export const PHONE_CHROME_PX = 28;

/**
 * The tallest the emulated phone screen is ever sized to, in CSS px. 812 is the
 * iPhone X-class layout viewport, which pairs with the 375px `previewDeviceWidth`
 * for a real phone aspect ratio (~1 : 2.17).
 *
 * Feature 72 originally sized the phone to ALL the available height, matching the
 * theme editor. On a tall monitor that produced a phone several real devices long
 * — an unrealistic preview, since no shopper's viewport is that tall. Capping here
 * keeps the mockup phone-shaped; the screen still scrolls internally, so a long
 * table is fully reachable either way.
 */
export const PHONE_SCREEN_MAX_PX = 812;

/**
 * The height to render the phone mockup's screen at, given the measured available
 * viewport height (`undefined`/`null` before the first measurement → `null`, i.e.
 * let CSS decide). Fits the phone to the viewport, then clamps to a plausible
 * device height. The floor reuses `PHONE_CHROME_PX` purely as a sanity minimum so
 * a pathologically short measurement can't yield a zero/negative screen.
 *
 * Pure so the sizing rule is unit-testable; the visual result is browser-verified.
 */
export function phoneScreenHeight(
  available: number | null | undefined,
): number | null {
  if (available == null || !Number.isFinite(available)) return null;
  return Math.min(
    PHONE_SCREEN_MAX_PX,
    Math.max(PHONE_CHROME_PX, available - PHONE_CHROME_PX),
  );
}
