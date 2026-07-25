import { useEffect, useRef, useState } from "react";
import type { EditorRow } from "../../utils/rows";
import type { StylingValues } from "../../utils/tableStyling";
import type { DeviceView } from "./deviceView";
import {
  browserScreenHeight,
  phoneScreenHeight,
  previewDeviceWidth,
} from "./deviceView";
import {
  clampPreviewHeight,
  PREVIEW_HEIGHT_MESSAGE_TYPE,
} from "./previewBridge";
import { renderSpecTablePreviewDocument } from "./specTablePreviewHtml";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
import styles from "./SpecTableEditor.module.css";
import device from "./DevicePreview.module.css";

// Feature 49 · Step 3 — the read-only device preview. Replaces the Step 1
// placeholder: feeds the live rows through the pure storefront-markup renderer
// (`renderSpecTablePreviewDocument` → `renderSpecTableHtml`) into a SANDBOXED
// <iframe srcDoc>, so the Desktop / Mobile toggle shows the real
// storefront markup + styling of the working table. The iframe is the isolation
// boundary: the storefront box model renders with no admin/Polaris CSS bleeding
// in, and nothing inside can reach back out.
//
// Read-only by construction — it reads `rows` and renders; it never dispatches.
// The `srcDoc` string is recomputed from the current rows on every render, so the
// preview always reflects the live editor state.
//
// Step 5 sizes the frame per device: `previewDeviceWidth(view)` supplies the
// iframe's width (desktop fills, mobile 375px), applied inline
// because it is dynamic per render; `.previewFrame` clamps + centers a fixed frame.
//
// Step 6 makes the frame auto-height to its content. Because the frame is an
// opaque origin, the parent cannot read into it; instead the framed document runs
// a trusted shim (see `previewBridge.ts`) that measures itself and postMessages the
// height OUT, and the effect below applies it. This flips the Step 3 `sandbox=""`
// to `sandbox="allow-scripts"` — the minimum needed to run the shim. The frame
// stays a UNIQUE OPAQUE ORIGIN (never `allow-same-origin`; combining the two would
// let the frame clear its own sandbox), and a strict CSP in the document forbids
// all network egress, so the newly-granted scripts are our shim and nothing else.
// Still read-only: the parent only READS a height number; it never posts into the
// frame or mutates the model.
//
// Feature 57 · Step 6 makes the preview STYLED: the engine's live `styling` is
// threaded straight into the document builder, which turns it into wrapper
// modifier classes + CSS custom properties. Liveness needs no new machinery — the
// `srcDoc` was already recomputed on every render, so a Style-tab change repaints
// the preview immediately, before (and independently of) any save. Unlike a
// device toggle (outer width only), a styling change yields a NEW document, so
// the frame reloads and the height shim re-reports — accepted, and the same class
// of event as a row edit.

// Feature 72 makes the preview render inside a device MOCKUP: a phone bezel for
// Mobile, a browser window for Desktop (chrome styled by `DevicePreview.module.css`,
// which wraps the iframe without touching the tripwired `.previewFrame`). The chrome
// is decorative (`aria-hidden`), so AT still sees only the titled iframe.
//
// Mobile sizes the phone to the AVAILABLE viewport height (like
// the Shopify theme editor's mobile preview), CAPPED at a plausible device height
// (`phoneScreenHeight` → `PHONE_SCREEN_MAX_PX`, so a tall monitor doesn't stretch the
// phone into an unrealistic slab), and lets the iframe scroll INTERNALLY like a real
// phone — the height shim still reports, but the Mobile branch ignores it and uses the
// fitted height instead. This is a deliberate, view-scoped exception to Step 6, not a
// reversal.
//
// Feature 73 gives Desktop an inner scrollbar too, but by a WEAKER rule than Mobile's:
// the browser window still takes the Step 6 shim-measured content height, now CLAMPED
// to the available viewport (`browserScreenHeight`). A short table is byte-identical to
// feature 72 (window hugs content, no scrollbar, no dead space); only a table too tall
// for the viewport is bounded, and it scrolls inside the window like a real browser.
// Step 6's measurement stays load-bearing on Desktop — it is the clamp's INPUT, not
// something the branch ignores.

const DEVICE_LABELS: Record<DeviceView, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
};

// Feature 75 lets a CALLER supply the height budget instead of measuring it. The
// full-size preview modal must: `useScrollRegionHeight` measures its element's
// top down to the app iframe's viewport bottom, which is not the room a centred
// dialog's body actually has (it ignores the modal footer and margins, and the
// dialog is laid out against the taller admin viewport). Everything downstream is
// unchanged — the override is only a different SOURCE for `available`, and both
// per-device rules interpret it exactly as before.

export function SpecTablePreview({
  rows,
  styling,
  view,
  availableHeight,
}: {
  rows: EditorRow[];
  styling: StylingValues;
  view: DeviceView;
  availableHeight?: number;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Trust by frame IDENTITY, not origin: an opaque-origin sandboxed frame
      // posts with `origin === "null"`, so only accept messages whose source is
      // our own iframe's window (this also rejects unrelated App Bridge traffic).
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== PREVIEW_HEIGHT_MESSAGE_TYPE) return;
      const next = clampPreviewHeight(data.height);
      if (next !== null) setHeight(next);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const isMobile = view === "mobile";

  // Both mockups bound their screen to the remaining iframe viewport, measured by
  // feature 71's A3 measurer. ONE ref, moved to whichever device is mounted, so
  // the hook stays unconditional; the re-measure key flips on a device switch so
  // the new mockup clamps the moment it mounts.
  //
  // The ref sits on a different element per device, and each branch's pure sizing
  // function interprets the measurement accordingly:
  //
  // - Mobile → `.phone` (the whole body). `phoneScreenHeight` subtracts the
  //   bezel chrome, since the measurement covers padding + speaker + borders that
  //   sit around the screen, then caps to a phone-shaped maximum.
  // - Desktop → `.phoneScreen`'s counterpart `.browserScreen`, i.e. BELOW the
  //   chrome bar, so the measurement already IS the screen's budget — no
  //   chrome constant to keep in sync with the CSS bar height. Sizing the screen
  //   never moves its own top (the bar above it is fixed), so the hook's
  //   measure→resize→measure cycle converges on the first repeat, exactly as its
  //   `.rowsScroller` contract describes.
  const deviceRef = useRef<HTMLDivElement>(null);
  const measured = useScrollRegionHeight(deviceRef, isMobile ? 1 : 2);
  // Called unconditionally (rules of hooks); its measurement is simply ignored
  // when a caller supplied the budget — see the feature-75 note above.
  const available = availableHeight ?? measured;
  const screenHeight = isMobile
    ? phoneScreenHeight(available)
    : // Feature 73 — clamp, don't fit: a short table keeps hugging its content
      // (unchanged from feature 72); a long one stops at the viewport and scrolls
      // inside the window.
      browserScreenHeight(height, available);

  const frame = (
    <iframe
      ref={frameRef}
      className={styles.previewFrame}
      // Accessible name conveys preview + which device + read-only (Step 7), so
      // AT users know this is a non-editable rendering, not the live table.
      title={`Spec table preview — ${DEVICE_LABELS[view]}, read-only`}
      // `allow-scripts` ONLY (Step 6) — runs the trusted height shim while the
      // frame stays a unique opaque origin. Never add `allow-same-origin`: with
      // scripts, the pair lets a frame remove its own sandbox. Egress is further
      // barred by the document's CSP.
      sandbox="allow-scripts"
      srcDoc={renderSpecTablePreviewDocument(rows, styling)}
      // Width is the per-device size (Step 5). Height comes from the per-device
      // pure sizing rule above — Mobile fits the viewport up to a phone-shaped
      // maximum (feature 72), Desktop takes the shim-measured content height
      // clamped to the viewport (feature 73). Either way an over-tall document
      // scrolls INSIDE the iframe. `undefined` (before the first measurement)
      // falls back to `.previewFrame`'s min-height.
      style={{
        width: previewDeviceWidth(view),
        height: screenHeight !== null ? `${screenHeight}px` : undefined,
      }}
    ></iframe>
  );

  // Feature 72 — the device mockup around the frame. Chrome is decorative and
  // `aria-hidden` so screen readers reach only the titled iframe.
  return (
    <div className={device.stage}>
      {isMobile ? (
        <div ref={deviceRef} className={device.phone}>
          <span className={device.phoneSpeaker} aria-hidden="true"></span>
          <div className={device.phoneScreen}>{frame}</div>
        </div>
      ) : (
        <div className={device.browser}>
          <div className={device.browserBar} aria-hidden="true">
            <span className={device.browserDots}>
              <span className={`${device.browserDot} ${device.dotRed}`}></span>
              <span
                className={`${device.browserDot} ${device.dotYellow}`}
              ></span>
              <span
                className={`${device.browserDot} ${device.dotGreen}`}
              ></span>
            </span>
            <span className={device.browserUrl}>Storefront preview</span>
          </div>
          <div ref={deviceRef} className={device.browserScreen}>
            {frame}
          </div>
        </div>
      )}
    </div>
  );
}
