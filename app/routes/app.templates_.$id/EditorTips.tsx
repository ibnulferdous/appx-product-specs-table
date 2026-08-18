import { useEffect, useMemo, useState } from "react";
import { buildEditorTips } from "../../utils/editorTips";
import { isMacPlatform } from "../../utils/platform";
import styles from "./SpecTableEditor.module.css";

// The editor tips footer (feature 32). A small manual-advance strip BELOW the editor card (a sibling
// after the freeze <div>, so it costs the card no vertical space and isn't frozen during a save). One
// tip at a time with wrapping ‹ / › controls + a "Tip i of n" indicator — the discoverability surface
// for the otherwise-invisible Ctrl/⌘ + ↑ ↓ cell navigation.
//
// Presentational: owns only a local index. The tip list is the pure `buildEditorTips`; the lone
// browser read (Mac?) is isolated in `isMacPlatform`.
//
// Accessibility: a labelled <section>, real <s-button> prev/next controls with accessibilityLabels,
// and an `aria-live="polite"` region on the tip body. Manual advance ONLY (no auto-rotation),
// sidestepping WCAG 2.2.2 and the reduced-motion / read-before-it-scrolls problems.
export function EditorTips() {
  // Resolve the platform AFTER mount, not during render. This route is SSR'd (no `navigator` on the
  // server, so it renders "Ctrl"). Reading the platform in render would make the first CLIENT render
  // produce "⌘" on a Mac while the server HTML says "Ctrl" — a hydration text mismatch. Starting at
  // `false` matches the server; the effect corrects to "⌘" one tick after hydration. List length is
  // identical across platforms, so `index` stays in range when this flips.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(isMacPlatform()), []);

  const tips = useMemo(() => buildEditorTips(isMac), [isMac]);
  const count = tips.length;
  const [index, setIndex] = useState(0);

  // Defensive: the builder is never empty, but never index past the list.
  if (count === 0) return null;

  // Wrap-around step; `+ count` keeps the modulo non-negative going backwards.
  const step = (delta: number) => setIndex((i) => (i + delta + count) % count);

  const tip = tips[index];

  return (
    <section aria-label="Editor tips" className={styles.tipsFooter}>
      <s-button
        variant="tertiary"
        icon="chevron-left"
        accessibilityLabel="Previous tip"
        onClick={() => step(-1)}
      ></s-button>

      {/* Persistent live region: the container stays mounted and only its text changes on advance, so
          a screen reader announces the new tip + position. Manual-only → polite is not noisy. */}
      <div className={styles.tipBody} aria-live="polite">
        <s-text color="subdued">{tip.text}</s-text>
        <s-text color="subdued" fontVariantNumeric="tabular-nums">
          Tip {index + 1} of {count}
        </s-text>
      </div>

      <s-button
        variant="tertiary"
        icon="chevron-right"
        accessibilityLabel="Next tip"
        onClick={() => step(1)}
      ></s-button>
    </section>
  );
}
