import type { RefObject } from "react";
import { useEffect, useState } from "react";

// Reshell A3 — bounded inner-scroll. Measures and maintains the rows scroller's
// available height so that ONLY the rows list scrolls: the control row and toolbar
// stay fixed above it while the scroller fills the rest of the embedded iframe
// viewport. The component applies the returned px as `style={{ maxHeight }}` and
// the `.rowsScroller` class supplies `overflow-y: auto` + the matching
// `min-height` floor. Consumed by `RowGrid` (reshell A1). See
// `context/features/17-reshell-a3-bounded-inner-scroll.md`.
//
// `maxHeight`, not `height`: a short table stays short (no empty gap below the
// last row); a long table is bounded and scrolls.

// Breathing room below the scroller so the card clears the iframe's bottom edge
// rather than butting against it (or overflowing into a stray document scroll).
// This budgets for the card's own bottom padding + border that sit beneath the
// scroller; tuned against the real embedded iframe (see the A3.1 finding in
// `progress-tracker.md`).
const BOTTOM_PAD_REM = 3;
// Floor (mirrored as `min-height` on `.rowsScroller`) so an early/raced
// measurement — `scrollerTop` read before layout settles — never collapses the
// list; the next settled measure corrects it.
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
 * @param rowCount    re-measure when rows are added/removed (their count moves
 *                    the scroller's content, not its top, but the effect re-runs
 *                    so a freshly mounted grid measures against settled layout).
 * @returns the measured max height in px, or `undefined` before the first
 *          measure (the CSS `min-height` floor keeps the list usable until then).
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
      const top = scroller.getBoundingClientRect().top;
      const available = window.innerHeight - top - remToPx(BOTTOM_PAD_REM);
      const next = Math.round(
        Math.max(remToPx(MIN_SCROLLER_HEIGHT_REM), available),
      );
      // Bail when unchanged so the ResizeObserver converges: sizing the scroller
      // does not move `scrollerTop` (fixed by the content above it), so the next
      // measure yields the same value and React stops re-rendering.
      setMaxHeight((prev) => (prev === next ? prev : next));
    };

    // Coalesce bursts (resize drags, observer batches) into one read per frame,
    // run after layout settles.
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    // Clamp immediately on mount (layout is settled post-paint), then keep it
    // current on every input that moves `scrollerTop` or the viewport.
    measure();

    // Iframe viewport changes / admin window resize.
    window.addEventListener("resize", scheduleMeasure);

    // Any height/width change ABOVE the list (control-row wrap, toolbar wrap,
    // hint reflow, the Style/Settings sidebar appearing) moves `scrollerTop`;
    // observe a stable ancestor so we re-measure when it does.
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
