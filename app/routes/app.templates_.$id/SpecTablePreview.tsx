import type { EditorRow } from "../../utils/rows";
import type { DeviceView } from "./deviceView";
import { renderSpecTablePreviewDocument } from "./specTablePreviewHtml";
import styles from "./SpecTableEditor.module.css";

// Feature 49 · Step 3 — the read-only device preview. Replaces the Step 1
// placeholder: feeds the live rows through the pure storefront-markup renderer
// (`renderSpecTablePreviewDocument` → `renderSpecTableHtml`) into a SANDBOXED
// <iframe srcDoc>, so the Desktop / Tablet / Mobile toggle shows the real (still
// unstyled) storefront markup of the working table. The iframe is the isolation
// boundary: the storefront box model renders with no admin/Polaris CSS bleeding
// in, and nothing inside can reach back out.
//
// Read-only by construction — it reads `rows` and renders; it never dispatches.
// The `srcDoc` string is recomputed from the current rows on every render, so the
// preview always reflects the live editor state.
//
// Deferred to later steps: the shared `spec-table.css` inside the iframe + pill
// visuals (Step 4), device-width sizing (Step 5), content-driven auto-height
// (Step 6), and richer a11y + the empty-rows state (Step 7).

const DEVICE_LABELS: Record<DeviceView, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export function SpecTablePreview({
  rows,
  view,
}: {
  rows: EditorRow[];
  view: DeviceView;
}) {
  return (
    <s-box padding="base">
      <iframe
        className={styles.previewFrame}
        title={`${DEVICE_LABELS[view]} preview`}
        // Empty sandbox = the most restrictive: no scripts, no forms, no popups,
        // and a unique opaque origin (no allow-same-origin). The preview is static
        // HTML with zero interactivity, so it needs none of those — a defense-in-
        // depth layer beneath the renderer's HTML escaping. (Step 6's auto-height
        // must therefore avoid same-origin DOM access into the frame.)
        sandbox=""
        srcDoc={renderSpecTablePreviewDocument(rows)}
      ></iframe>
    </s-box>
  );
}
