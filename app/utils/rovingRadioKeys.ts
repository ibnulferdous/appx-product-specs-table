// Roving-tabindex key arithmetic (feature 93 · step 100). Binding spec:
// `context/features/100-accent-swatch-row.md`.
//
// The WAI-ARIA radiogroup pattern says arrows / Home / End move focus between the
// radios AND check the one they land on, with the group holding a single tab stop.
// This module owns the ONE part of that which is pure: given a key, where you are,
// and how many options there are, which index comes next.
//
// --- Why a module for six lines of arithmetic --------------------------------
//
// Everything else in a radiogroup is refs, `.focus()` calls and event objects —
// untestable in this project today, because `vitest.config.ts` runs in `node` and
// jsdom is deliberately not installed ("a jsdom project gets added later only
// if/when component tests are introduced"). Extracting the arithmetic is what
// lets the swatch row ship REAL behavioural coverage instead of only a
// source-reading contract test.
//
// It also earns it on merit: `((index % count) + count) % count` is the
// negative-modulo idiom, and the plain `index % count` that a reader "simplifies"
// it to returns **-1** for ArrowLeft on the first option — a focus call on
// `refs[-1]`, which is `undefined`, so the key silently does nothing at exactly
// the edge a keyboard user hits first. A property test sweeps for that.
//
// ⚠️ `SegmentedControl.tsx` (the editor's tab group and device toggle) implements
// the same arithmetic in its own `switch` and is NOT changed to use this. That is
// recorded debt, not an oversight: it is a live merchant-facing control with zero
// test coverage, and the swap belongs in a step that can verify it. See doc 100's
// finding and its "deliberately out of scope" list.

/**
 * Where a roving-tabindex group should move next, or `null` if this key is not
 * one it handles.
 *
 * 🔴 **`null` is load-bearing and must not become `0`.** It is the caller's cue to
 * skip `preventDefault()` and let the event through — so `Tab` still leaves the
 * group and `Enter` still submits. A version that returned `0` for an unhandled
 * key would make Tab silently select the first option and trap focus.
 *
 * Total by construction: any `count`, any `current` — including `-1` for "nothing
 * selected yet", which is what a group whose value is absent from its options
 * reports. The result is always a valid index into a non-empty list, never
 * negative and never `NaN`.
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  // Nothing to move to. Returning `null` rather than `0` keeps the "not handled"
  // contract honest: with no options there is no index to focus, and a caller
  // that trusted a number here would call `.focus()` on `undefined`.
  if (count <= 0) return null;

  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return wrap(current + 1, count);
    case "ArrowLeft":
    case "ArrowUp":
      return wrap(current - 1, count);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * Modulo that wraps in BOTH directions.
 *
 * ⚠️ Not `index % count`. JavaScript's `%` keeps the sign of the dividend, so
 * `-1 % 6` is `-1`, not `5`. The double-modulo is what turns a backward step off
 * the front of the list into the last option.
 *
 * `current` may also be out of range (`-1` for "nothing selected", or a stale
 * index after the option list shrank), so this normalizes rather than assuming
 * the input was already valid.
 */
function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}
