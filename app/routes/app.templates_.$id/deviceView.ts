// The editor's view-toggle modes. Dependency-free (no React, no CSS import) so
// the pure predicates can be imported from a Node unit test.
//
// `edit` is the only editable view; `desktop` / `mobile` are read-only previews
// of how the table renders for a shopper at that width.

export type ViewId = "edit" | "desktop" | "mobile";

/** A non-edit view — one of the read-only device previews. */
export type DeviceView = Exclude<ViewId, "edit">;

/** True when `view` is a device preview. A type guard, so callers can pass a narrowed `ViewId` into
 * the `preview` render-prop without a cast. */
export function isPreviewView(view: ViewId): view is DeviceView {
  return view !== "edit";
}

/**
 * The CSS width the device preview iframe renders at. `desktop` fills the editor column (a fixed px
 * would only be clamped by the narrower admin column); `mobile` is a fixed 375 CSS px — px not rem, a
 * phone is 375 CSS px regardless of the admin's root font size. CSS clamps with `max-width: 100%`.
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
 * Vertical chrome the phone mockup adds around its screen (bezel padding + speaker pill + gap +
 * borders). Keep in sync with `.phone` / `.phoneSpeaker` in `DevicePreview.module.css`.
 */
export const PHONE_CHROME_PX = 28;

/**
 * The tallest the emulated phone screen is ever sized to. 812 is the iPhone X-class layout viewport,
 * pairing with the 375px width for a real aspect ratio. Without the cap, a tall monitor produces a
 * phone several devices long; the screen still scrolls internally, so long tables stay reachable.
 */
export const PHONE_SCREEN_MAX_PX = 812;

/**
 * The phone screen's height for a measured available viewport height (`null` before the first
 * measurement → let CSS decide). Fits the phone to the viewport, then clamps to a plausible height.
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

/**
 * A sanity floor for the desktop browser screen, guarding a raced measurement from collapsing the
 * window to a sliver. Applied to the BUDGET, not the result, so it never inflates a short table.
 */
export const BROWSER_SCREEN_MIN_PX = 240;

/**
 * The desktop browser mockup's screen height. Clamp, not fit: unlike the phone, a browser window hugs
 * a short page and only bounds a long one — `content <= available` renders `content`; beyond that it
 * stops at `available` and the iframe scrolls internally. `content` null → null (let `.previewFrame`'s
 * min-height stand); `available` missing → the unclamped `content`. No resize loop: shrinking the
 * iframe can't shrink `content` (the framed document's height is width-driven).
 */
export function browserScreenHeight(
  content: number | null | undefined,
  available: number | null | undefined,
): number | null {
  if (content == null || !Number.isFinite(content)) return null;
  if (available == null || !Number.isFinite(available)) return content;
  return Math.min(content, Math.max(BROWSER_SCREEN_MIN_PX, available));
}
