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

// Feature 49 · Step 3 — the read-only device preview. Feeds the live rows through the pure
// storefront-markup renderer (`renderSpecTablePreviewDocument`) into a SANDBOXED <iframe srcDoc>, so
// the Desktop / Mobile toggle shows the real storefront markup + styling. The iframe is the isolation
// boundary: no admin/Polaris CSS bleeds in, nothing inside reaches back out. Read-only by construction
// — it reads `rows` and renders, never dispatches; the `srcDoc` is recomputed every render so the
// preview always reflects live editor state.
//
// Step 5 sizes the frame per device (`previewDeviceWidth(view)`; desktop fills, mobile 375px), applied
// inline; `.previewFrame` clamps + centers.
//
// Step 6 makes the frame auto-height. The frame is an opaque origin, so the parent can't read into it;
// the framed document runs a trusted shim (`previewBridge.ts`) that measures itself and postMessages
// the height OUT, and the effect below applies it. This flips `sandbox=""` to `sandbox="allow-scripts"`
// (the minimum needed to run the shim). The frame stays a UNIQUE OPAQUE ORIGIN (never
// `allow-same-origin`, which combined with scripts would let it clear its own sandbox), and a strict
// CSP forbids all network egress. Still read-only: the parent only READS a height number.
//
// Feature 57 · Step 6 makes the preview STYLED: the live `styling` is threaded into the document
// builder (→ wrapper modifier classes + CSS custom properties). The `srcDoc` was already recomputed
// every render, so a Style-tab change repaints immediately, before any save. Unlike a device toggle
// (outer width only), a styling change yields a NEW document, so the frame reloads and the shim
// re-reports — same class of event as a row edit.
//
// Feature 72 renders the preview inside a device MOCKUP (phone bezel / browser window; chrome styled
// by `DevicePreview.module.css`, decorative + `aria-hidden`, so AT sees only the titled iframe). Mobile
// sizes the phone to the AVAILABLE viewport height, capped at a plausible device height
// (`phoneScreenHeight` → `PHONE_SCREEN_MAX_PX`), and lets the iframe scroll INTERNALLY — the Mobile
// branch ignores the shim height and uses the fitted one (a deliberate, view-scoped exception to Step
// 6). Feature 73 gives Desktop an inner scrollbar by a weaker rule: the window takes the shim-measured
// content height, CLAMPED to the viewport (`browserScreenHeight`). A short table is byte-identical to
// feature 72; only a too-tall table is bounded and scrolls inside. Step 6's measurement stays
// load-bearing on Desktop — it is the clamp's INPUT.

const DEVICE_LABELS: Record<DeviceView, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
};

export function SpecTablePreview({
  rows,
  styling,
  view,
}: {
  rows: EditorRow[];
  styling: StylingValues;
  view: DeviceView;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Trust by frame IDENTITY, not origin: an opaque-origin sandboxed frame posts with
      // `origin === "null"`, so only accept messages whose source is our own iframe's window.
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

  // Both mockups bound their screen to the remaining iframe viewport (feature 71's A3 measurer). ONE
  // ref, moved to whichever device is mounted; the re-measure key flips on a device switch. Each
  // branch's pure sizing function interprets the measurement accordingly:
  // - Mobile → `.phone` (the whole body). `phoneScreenHeight` subtracts the bezel chrome, then caps
  //   to a phone-shaped maximum.
  // - Desktop → `.browserScreen`, i.e. BELOW the chrome bar, so the measurement already IS the
  //   screen's budget (no chrome constant to keep in sync). Sizing the screen never moves its own top,
  //   so the hook's measure→resize→measure cycle converges on the first repeat.
  const deviceRef = useRef<HTMLDivElement>(null);
  const available = useScrollRegionHeight(deviceRef, isMobile ? 1 : 2);
  const screenHeight = isMobile
    ? phoneScreenHeight(available)
    : // Feature 73 — clamp, don't fit: a short table keeps hugging its content; a long one stops at
      // the viewport and scrolls inside the window.
      browserScreenHeight(height, available);

  const frame = (
    <iframe
      ref={frameRef}
      className={styles.previewFrame}
      // Accessible name conveys preview + device + read-only (Step 7), so AT users know this is a
      // non-editable rendering, not the live table.
      title={`Spec table preview — ${DEVICE_LABELS[view]}, read-only`}
      // `allow-scripts` ONLY (Step 6) — runs the trusted height shim while the frame stays a unique
      // opaque origin. Never add `allow-same-origin`: with scripts, the pair lets a frame remove its
      // own sandbox. Egress is further barred by the document's CSP.
      sandbox="allow-scripts"
      srcDoc={renderSpecTablePreviewDocument(rows, styling)}
      // Width is the per-device size (Step 5); height from the per-device sizing rule above. Either way
      // an over-tall document scrolls INSIDE the iframe. `undefined` (pre-measurement) falls back to
      // `.previewFrame`'s min-height.
      style={{
        width: previewDeviceWidth(view),
        height: screenHeight !== null ? `${screenHeight}px` : undefined,
      }}
    ></iframe>
  );

  // Feature 72 — the device mockup around the frame. Chrome is decorative + `aria-hidden` so screen
  // readers reach only the titled iframe.
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
