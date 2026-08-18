// Roving-tabindex key arithmetic for the WAI-ARIA radiogroup pattern: given a
// key, the current index, and the option count, which index comes next.
//
// ⚠️ `SegmentedControl.tsx` implements the same arithmetic in its own `switch`
// and deliberately does not use this — it has no test coverage, so the swap
// belongs in a step that can verify it.

/**
 * Where a roving-tabindex group should move next, or `null` if this key is not
 * one it handles.
 *
 * 🔴 **`null` must not become `0`.** It is the caller's cue to skip
 * `preventDefault()` so `Tab` still leaves the group and `Enter` still submits.
 *
 * Total by construction: any `count`, any `current` — including `-1` for
 * "nothing selected yet".
 */
export function nextRovingIndex(
  key: string,
  current: number,
  count: number,
): number | null {
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
 * ⚠️ Not `index % count`. JS `%` keeps the sign of the dividend, so `-1 % 6` is
 * `-1`, not `5` — which would focus `refs[-1]` and make ArrowLeft on the first
 * option silently do nothing. Also normalizes an out-of-range `current`.
 */
function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}
