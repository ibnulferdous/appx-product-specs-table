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

/**
 * A sanity floor for the desktop browser window's screen, in CSS px. Only guards
 * a raced/pathological `available` measurement (one taken before layout settles)
 * from collapsing the window to a sliver; the next settled measure corrects it.
 * It never inflates a genuinely short table — see `browserScreenHeight`, which
 * applies this to the BUDGET, not to the result.
 */
export const BROWSER_SCREEN_MIN_PX = 240;

/**
 * The height to render the desktop browser mockup's screen at (feature 73), given
 * the shim-measured `content` height and the measured `available` viewport room
 * below the screen's top edge.
 *
 * **Clamp, not fit.** Unlike the phone — a fixed-size device that always fills its
 * measured height — a browser window hugs a short page and only bounds a long one:
 *
 * - `content <= available` → `content`, i.e. exactly the pre-feature-73 behavior.
 *   A short table shows no scrollbar and no dead white space beneath it.
 * - `content > available` → `available`, so the window stops at the bottom of the
 *   editor viewport and the iframe scrolls INTERNALLY, like a real browser.
 *
 * `content` null (no height message yet) → `null`, i.e. let `.previewFrame`'s
 * `min-height` floor stand until the first measurement, as before. `available`
 * missing/non-finite (pre-measurement) → the unclamped `content`, which degrades
 * to the old unbounded window rather than to a wrong size.
 *
 * No resize loop: shrinking the iframe cannot shrink `content` (the framed
 * document's height is width-driven), and an inner scrollbar appearing can only
 * push `content` further above the cap, where the result is pinned to `available`.
 *
 * Pure so the sizing rule is unit-testable; the visual result is browser-verified.
 */
export function browserScreenHeight(
  content: number | null | undefined,
  available: number | null | undefined,
): number | null {
  if (content == null || !Number.isFinite(content)) return null;
  if (available == null || !Number.isFinite(available)) return content;
  return Math.min(content, Math.max(BROWSER_SCREEN_MIN_PX, available));
}

/**
 * Vertical room the full-size preview modal's own chrome takes out of the app
 * iframe's viewport before any preview can be drawn (feature 75). Measured on
 * the real embedded admin (Step 0 spike, logged in `context/features/75-…`) at a
 * 1397×599 admin window, where the app iframe reports 1141×487:
 *
 *     dialog top/bottom margin  ~62   (the dialog caps near 90% of the frame)
 *     heading bar               ~44
 *     device-toggle block       ~56   (s-box padding + the segmented control)
 *     `.stage` padding          ~48   (24 top + 24 bottom — the device shadow's room)
 *     `.browserBar`             ~38   (sits ABOVE `.browserScreen`, which is what
 *                                      `browserScreenHeight` actually sizes)
 *     ------------------------------
 *                               ~248
 *
 * Erring 4px high on purpose: the two failure directions are not symmetric. Too
 * large leaves a thin gap under the mockup; too small pushes it past the modal
 * body, which then scrolls — a scrollbar inside a scrollbar, the exact thing
 * feature 73 removed. Prefer the gap.
 *
 * Same calibrated-constant approach as `PHONE_CHROME_PX` (measured against the
 * CSS bezel) and `useScrollRegionHeight`'s `BOTTOM_PAD_REM` (measured against the
 * real embedded iframe). Retune HERE if the modal's chrome changes — and note
 * that removing the footer action buttons is already priced in (the first cut
 * carried a redundant footer "Close" and lost 53px to it).
 */
export const MODAL_CHROME_PX = 252;

/**
 * Sanity bounds for the modal preview's height budget. The floor deliberately
 * equals `BROWSER_SCREEN_MIN_PX` so the two floors cannot fight: a budget below
 * it would be raised to it by `browserScreenHeight` anyway, and pretending
 * otherwise here would only hide that. On a genuinely short window (under
 * ~610px of app viewport) the floor wins and the modal body scrolls by the
 * difference — accepted, since a preview shorter than this shows nothing useful.
 *
 * The ceiling stops a very tall monitor from claiming more room than the
 * dialog's own max-height will grant, which would push the mockup past the
 * bottom of the body.
 */
export const MODAL_PREVIEW_MIN_PX = BROWSER_SCREEN_MIN_PX;
export const MODAL_PREVIEW_MAX_PX = 1200;

/**
 * The height budget to hand the preview inside the full-size modal (feature 75),
 * given the app iframe's viewport height.
 *
 * **Derived from the VIEWPORT, not from the modal body.** Measuring the body
 * with a ResizeObserver looks more precise but is circular: an `<s-modal>` sizes
 * to its content up to a max, so a preview sized from the body feeds straight
 * back into the body's height. The viewport is not an output of that layout, so
 * deriving from it terminates.
 *
 * The result feeds the SAME per-device rules the inline card preview uses —
 * `phoneScreenHeight` fits the phone, `browserScreenHeight` clamps the browser
 * window — so the modal introduces no third sizing behaviour. It must NOT come
 * from `useScrollRegionHeight`, whose element-top → iframe-bottom measurement is
 * meaningless for a centred dialog (see `context/features/75-…`).
 *
 * `null`/non-finite in (pre-measurement) → `null`, i.e. let CSS decide, matching
 * its two neighbours.
 */
export function modalPreviewHeight(
  viewportHeight: number | null | undefined,
): number | null {
  if (viewportHeight == null || !Number.isFinite(viewportHeight)) return null;
  return Math.min(
    MODAL_PREVIEW_MAX_PX,
    Math.max(MODAL_PREVIEW_MIN_PX, viewportHeight - MODAL_CHROME_PX),
  );
}
