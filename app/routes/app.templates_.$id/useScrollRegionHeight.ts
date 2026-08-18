import type { RefObject } from "react";
import { useEffect, useState } from "react";

// Reshell A3 — bounded inner-scroll. Maintains the rows scroller's available height so ONLY the rows
// list scrolls: the control row and toolbar stay fixed above it while the scroller fills the rest of
// the iframe viewport. The component applies the returned px as `style={{ maxHeight }}`; `.rowsScroller`
// supplies `overflow-y: auto` + the matching `min-height` floor. (features/17)
//
// `maxHeight`, not `height`: a short table stays short; a long table is bounded and scrolls.

// Breathing room below the scroller so the card clears the iframe's bottom edge (budgets for the
// card's own bottom padding + border; tuned against the real embedded iframe — A3.1 finding).
const BOTTOM_PAD_REM = 3;
// Floor (mirrored as `min-height` on `.rowsScroller`) so an early/raced measurement never collapses
// the list; the next settled measure corrects it.
const MIN_SCROLLER_HEIGHT_REM = 12;

function remToPx(rem: number): number {
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  return rem * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
}

/**
 * Bound the rows scroller to the remaining iframe viewport.
 *
 * @param scrollerRef ref to the `overflow-y: auto` scroller element.
 * @param rowCount    re-measure when rows are added/removed (the effect re-runs so a freshly mounted
 *                    grid measures against settled layout).
 * @returns the measured max height in px, or `undefined` before the first measure (the CSS
 *          `min-height` floor keeps the list usable until then).
 */
export function useScrollRegionHeight(
  scrollerRef: RefObject<HTMLElement>,
  rowCount: number,
): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let frame = 0;

    const measure = () => {
      const rect = scroller.getBoundingClientRect();
      // A scroller that is not RENDERED reports an all-zero rect, so `top` reads 0 and the budget
      // below comes out as the whole viewport. Feature 76's collapsible rail hides via `display: none`
      // (not unmount), so this is reachable: without the bail, the rail would be re-shown carrying a
      // viewport-tall `maxHeight` until the re-measure lands. Holding the last good value keeps the
      // height stable across a hide/show cycle.
      if (rect.width === 0 && rect.height === 0) return;
      const available = window.innerHeight - rect.top - remToPx(BOTTOM_PAD_REM);
      const next = Math.round(
        Math.max(remToPx(MIN_SCROLLER_HEIGHT_REM), available),
      );
      // Bail when unchanged so the ResizeObserver converges: sizing the scroller doesn't move
      // `scrollerTop` (fixed by the content above), so the next measure yields the same value.
      setMaxHeight((prev) => (prev === next ? prev : next));
    };

    // Coalesce bursts (resize drags, observer batches) into one read per frame, after layout settles.
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    // Clamp immediately on mount, then keep it current on every input that moves `scrollerTop` or the
    // viewport.
    measure();

    // Iframe viewport changes / admin window resize.
    window.addEventListener("resize", scheduleMeasure);

    // Any height/width change ABOVE the list (control-row wrap, toolbar wrap, hint reflow, the sidebar
    // appearing) moves `scrollerTop`; observe a stable ancestor so we re-measure when it does.
    const ancestor = scroller.parentElement ?? scroller;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(ancestor);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      observer.disconnect();
    };
  }, [scrollerRef, rowCount]);

  return maxHeight;
}
