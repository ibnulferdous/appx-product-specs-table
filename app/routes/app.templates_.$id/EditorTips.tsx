import { useEffect, useMemo, useState } from "react";
import { buildEditorTips } from "../../utils/editorTips";
import { isMacPlatform } from "../../utils/platform";
import styles from "./SpecTableEditor.module.css";

// The editor tips footer (feature 32, Step 3 of the keyboard-nav feature). A small
// manual-advance strip rendered BELOW the editor card (mounted in SpecTableEditor
// as a sibling after the freeze <div>, so it costs the card zero vertical space and
// is not frozen during a save). It shows one tip at a time with ‹ / › controls that
// wrap, plus a "Tip i of n" indicator — the discoverability surface that advertises
// the otherwise-invisible Ctrl/⌘ + ↑ ↓ cell navigation, and the long-term home for
// all editor tips.
//
// Self-contained and presentational: it owns only a local index (no reducer, no
// dispatch, no engine). The tip list is the pure, unit-tested `buildEditorTips`; the
// lone browser read (am I on a Mac?) is isolated in `isMacPlatform`.
//
// Accessibility (non-negotiable for this app): a labelled <section>, real <s-button>
// prev/next controls (Tab + Enter/Space) with accessibilityLabels, and an
// `aria-live="polite"` region on the tip body so a manual advance is announced.
// Manual advance ONLY — no timer/auto-rotation — sidestepping WCAG 2.2.2 (Pause,
// Stop, Hide) and the reduced-motion / read-before-it-scrolls problems.
export function EditorTips() {
  // Resolve the platform AFTER mount, not during render. This route is SSR'd: the
  // server has no `navigator`, so it renders the "Ctrl" form. Reading the platform
  // in render (e.g. inside useMemo) would make the first CLIENT render produce "⌘"
  // on a Mac while the server HTML says "Ctrl" — a React hydration text mismatch
  // (console error). Starting at `false` matches the server, then the effect
  // corrects to "⌘" on a Mac one tick after hydration — the "corrected on hydrate"
  // behaviour the feature doc calls for, with no mismatch. The list length is
  // identical across platforms (only the keyboard tip's glyph differs), so the
  // active `index` stays in range when this flips.
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

      {/* Persistent live region: the container stays mounted and only its text
          changes on advance, so a screen reader announces the new tip + position.
          Manual-only changes → polite is not noisy. */}
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
