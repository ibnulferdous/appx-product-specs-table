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
