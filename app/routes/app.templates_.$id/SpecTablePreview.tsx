import { useEffect, useRef, useState } from "react";
import type { EditorRow } from "../../utils/rows";
import type { StylingValues } from "../../utils/tableStyling";
import type { DeviceView } from "./deviceView";
import { previewDeviceWidth } from "./deviceView";
import {
  clampPreviewHeight,
  PREVIEW_HEIGHT_MESSAGE_TYPE,
} from "./previewBridge";
import { renderSpecTablePreviewDocument } from "./specTablePreviewHtml";
import styles from "./SpecTableEditor.module.css";

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

  return (
    <s-box padding="base">
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
        // Width is the per-device size (Step 5); height is the shim-measured
        // content height (Step 6), falling back to the `.previewFrame` min-height
        // until the first measurement arrives.
        style={{
          width: previewDeviceWidth(view),
          height: height !== null ? `${height}px` : undefined,
        }}
      ></iframe>
    </s-box>
  );
}
