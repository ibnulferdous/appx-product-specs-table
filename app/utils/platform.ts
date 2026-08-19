// Isolated browser glue: detect macOS so the keyboard tip can show ⌘ vs. Ctrl.

// `navigator.platform` is deprecated but remains the most reliable cross-browser
// signal; the UA string is the fallback. SSR-safe — returns false with no
// `navigator`, so the tip renders "Ctrl" server-side and corrects on hydration.
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(p);
}
