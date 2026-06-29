// Isolated browser glue: detect macOS so the keyboard tip can show ⌘ vs. Ctrl.
//
// This is the lone DOM read for the tips footer (feature 32) — kept apart from the
// pure `buildEditorTips(isMac)` exactly like `valueDom.ts`'s reads are kept apart
// from `valueParts.ts`'s math. Browser-verified, not Node-unit-tested (jsdom's
// `navigator` is synthetic).

// True on macOS. `navigator.platform` is deprecated but remains the most reliable
// cross-browser signal; fall back to the UA string. SSR-safe — returns false when
// `navigator` is absent, so the keyboard tip first renders "Ctrl" on the server
// and corrects to "⌘" on hydration if the merchant is on a Mac.
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = navigator.platform || navigator.userAgent || "";
  return /mac/i.test(p);
}
