import { describe, expect, it } from "vitest";
import {
  clampPreviewHeight,
  MIN_PREVIEW_HEIGHT_PX,
  PREVIEW_HEIGHT_BRIDGE_SCRIPT,
  PREVIEW_HEIGHT_MESSAGE_TYPE,
} from "./previewBridge";

// Feature 49 · Step 6. The parent⇄frame auto-height contract. The pure clamp is
// exhaustively unit-tested here; the actual postMessage round-trip + ResizeObserver
// reflow are browser-verified (iframe messaging can't run in the Node env).
describe("clampPreviewHeight", () => {
  it("ceils a normal positive height (never a sub-pixel short → no scrollbar)", () => {
    expect(clampPreviewHeight(640)).toBe(640);
    expect(clampPreviewHeight(200.2)).toBe(201);
    expect(clampPreviewHeight(199.999)).toBe(200);
  });

  it("floors a tiny positive height to the minimum", () => {
    expect(clampPreviewHeight(10)).toBe(MIN_PREVIEW_HEIGHT_PX);
    expect(clampPreviewHeight(1)).toBe(MIN_PREVIEW_HEIGHT_PX);
  });

  it("returns null for non-positive / non-finite / non-number (garbage guard)", () => {
    expect(clampPreviewHeight(0)).toBeNull();
    expect(clampPreviewHeight(-5)).toBeNull();
    expect(clampPreviewHeight(Number.NaN)).toBeNull();
    expect(clampPreviewHeight(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampPreviewHeight("640")).toBeNull();
    expect(clampPreviewHeight(undefined)).toBeNull();
    expect(clampPreviewHeight(null)).toBeNull();
    expect(clampPreviewHeight({ height: 640 })).toBeNull();
  });
});

describe("preview height bridge shim", () => {
  it("is a self-contained <script> referencing the shared message type", () => {
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT.startsWith("<script>")).toBe(true);
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT.endsWith("</script>")).toBe(true);
    // The single-source message type is embedded (so shim + listener can't drift).
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT).toContain(PREVIEW_HEIGHT_MESSAGE_TYPE);
    // Reports OUT via postMessage (never same-origin DOM access), measures the
    // full content box, and reacts to reflow via ResizeObserver — not just load.
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT).toContain("postMessage");
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT).toContain("scrollHeight");
    expect(PREVIEW_HEIGHT_BRIDGE_SCRIPT).toContain("ResizeObserver");
  });

  it("has no nested </script> that would truncate the srcDoc document", () => {
    const inner = PREVIEW_HEIGHT_BRIDGE_SCRIPT.slice(
      "<script>".length,
      -"</script>".length,
    );
    expect(inner).not.toContain("</script>");
  });
});
