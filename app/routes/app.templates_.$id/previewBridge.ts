// Feature 49 · Step 6 — the parent⇄frame contract for the preview iframe's content-driven auto-height.
//
// The preview iframe is a UNIQUE OPAQUE ORIGIN (Step 3 `sandbox="allow-scripts"`, never
// `allow-same-origin`), so the parent can't read `contentDocument` to learn the content height.
// Instead the framed document runs the trusted shim below, which measures itself and `postMessage`s
// the height OUT; the parent (`SpecTablePreview`) listens and sizes the iframe. Single source of truth
// for the message `type` and the shim, imported by BOTH the document builder and the parent listener,
// so the two ends can't drift. Framework-free so the pure `clampPreviewHeight` is Node-unit-testable.

/** The `postMessage` `type` the shim posts and the parent listener filters on. */
export const PREVIEW_HEIGHT_MESSAGE_TYPE = "appx-preview-height";

/**
 * The smallest height the parent will apply. A sanity floor beneath the visible `.previewFrame`
 * `min-height` (the real pre-measurement floor); keeps a pathological tiny measurement from a sliver.
 */
export const MIN_PREVIEW_HEIGHT_PX = 24;

// The inline measurement shim, a self-contained IIFE. Reports `documentElement.scrollHeight` (the full
// content box, incl. the Step 4 ambient `body` margin) whenever the content height can change: once
// immediately, once on `load`, and on every `ResizeObserver` firing (which covers a device-width
// change, late font swaps and rows edits). rAF-coalesced and deduped so there's no message churn.
//
// No resize loop: the content height is width-driven (fixed per view) and independent of the iframe's
// outer height, so applying the measured height doesn't change the measurement (`last` dedupe is a
// second guard). Target "*" — the payload is a single integer; the PARENT establishes trust by frame
// identity (`event.source`), not origin (an opaque-origin frame posts with `origin === "null"`).
const SHIM_BODY = `(function(){
var last=-1;
function report(){
var h=document.documentElement.scrollHeight;
if(h===last)return;
last=h;
parent.postMessage({type:${JSON.stringify(PREVIEW_HEIGHT_MESSAGE_TYPE)},height:h},"*");
}
var scheduled=false;
function schedule(){
if(scheduled)return;
scheduled=true;
requestAnimationFrame(function(){scheduled=false;report();});
}
if(window.ResizeObserver){new ResizeObserver(schedule).observe(document.documentElement);}
window.addEventListener("load",schedule);
schedule();
})();`;

/** The shim wrapped in a `<script>`, ready to inject at the end of the `<body>`. */
export const PREVIEW_HEIGHT_BRIDGE_SCRIPT = `<script>${SHIM_BODY}</script>`;

/**
 * Turn a raw height off the wire into a safe pixel value, or `null` to fall back to the CSS floor.
 * Guards against a hostile/garbage message: non-numeric / non-finite / non-positive → null; a valid
 * height is `Math.ceil`'d (so the frame is never a sub-pixel short of its content, showing a
 * scrollbar) and floored to `MIN_PREVIEW_HEIGHT_PX`.
 */
export function clampPreviewHeight(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.max(MIN_PREVIEW_HEIGHT_PX, Math.ceil(raw));
}
