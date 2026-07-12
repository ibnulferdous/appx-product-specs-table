// The editor's view-toggle modes (feature 49). Kept in a dependency-free module
// (no React, no CSS import) so the pure `isPreviewView` predicate can be imported
// from a Node unit test without pulling in the component tree.
//
// `edit` is the only editable view; `desktop` / `tablet` / `mobile` are read-only
// device previews of how the table renders for a shopper at that width (Reshell
// Phase D). Step 1 wires the toggle to swap the stage; the real iframe preview
// lands in later steps.

export type ViewId = "edit" | "desktop" | "tablet" | "mobile";

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
 * - `tablet` → `"768px"`, `mobile` → `"375px"`: fixed CSS-pixel device widths.
 *   Px (not rem) on purpose — a phone is 375 CSS px regardless of the admin's
 *   root font size, so rem would let admin typography distort the emulated
 *   device. The frame is clamped with `max-width: 100%` in CSS, so a fixed width
 *   wider than the column shrinks instead of overflowing.
 *
 * Keyed on `DeviceView` (not `ViewId`) because only device previews reach the
 * iframe; the exhaustive `never` default makes a future `ViewId` addition fail
 * typecheck here. Pure string-in/string-out, unit-tested like `isPreviewView`.
 */
export function previewDeviceWidth(view: DeviceView): string {
  switch (view) {
    case "desktop":
      return "100%";
    case "tablet":
      return "768px";
    case "mobile":
      return "375px";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}
