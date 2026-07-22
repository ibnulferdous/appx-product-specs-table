# Feature 71 — Inner-scroll the Style / Settings sidebar

> **Status: ✅ SHIPPED & VERIFIED 2026-07-22.** Full gate green (typecheck · lint ·
> format · test 837/37 · build) and confirmed live on the dev store via
> Claude-in-Chrome ([[browser-verify-embedded-app]]): on the 44-row "DJI Mavic 4 Pro
> Fly More Combo" template, the Style rail scrolls internally from Layout down to
> "Reset to theme defaults" with the preview staying anchored in the viewport (the
> page itself never scrolls); Settings behaves identically; Content unchanged.

## The problem

On the Style (and Settings) tab the editor is a two-column layout — a controls rail
on the left, the preview on the right (`EditorShell.tsx`, the `showSidebar` branch).
The Style rail is long (Layout · Sections · Rows · Colors · Typography · Reset). It
had **no height bound**, so the grid grew to the rail's full height and the whole
admin iframe scrolled — reaching the rail's last control pushed the preview
completely out of the viewport, exactly the surface the merchant is styling against.

## The fix

Cap the rail to the remaining iframe viewport and scroll it **internally**, so the
preview column stays put. Chosen model (merchant decision): **only the rail
scrolls** — the preview keeps its natural height, no fixed-viewport dual-scroll and
no sticky preview.

This is the Content tab's reshell-A3 pattern applied to the rail. It reuses the
existing measurer verbatim:

- **`useScrollRegionHeight(railRef, showSidebar ? 1 : 0)`** — clamps the rail
  scroller's top → viewport bottom (minus the shared bottom pad), re-measures on
  resize + an ancestor `ResizeObserver`, and enforces a `min-height` floor. Called
  unconditionally (rules of hooks); it no-ops until `railRef` mounts, i.e. only on
  Style/Settings. The `showSidebar` re-measure key makes it clamp the instant the
  rail appears (Content → Style).
- A native scroller `<div>` inside the rail's `s-box` carries the scroll; the
  measured px is applied inline as `max-height`, mirroring `RowGrid` +
  `.rowsScroller`.

## Why it lands where it does

- **New `EditorShell.module.css`**, not `SpecTableEditor.module.css`. The latter is
  held byte-clean against the Step 10 sign-off (`a7b304c`) as the tripwire for the
  Edit-grid-never-styled binding rule; a new shell rule there would trip it. The
  new module carries one class, `.railScroller` (`overflow-y: auto`, the 12rem
  floor matching `MIN_SCROLLER_HEIGHT_REM`, `overscroll-behavior: contain`).
- **Scroll on a native `<div>`, not the `s-box` `overflow` prop.** Polaris web
  components' overflow handling is unreliable ([[polaris-web-component-gotchas]]);
  a native element is deterministic.
- **Landmark + padding stay on the `s-box`.** The region role/label (feature 57
  Step 12 a11y) and the `base` padding are untouched; only the scroll moved inside.

## Scope

**In:** `EditorShell.tsx` (ref + hook call + one wrapper div in the sidebar
branch); new `EditorShell.module.css`.

**Out:** the Content tab, `RowGrid`, the tripwired CSS module, the freeze wrapper,
the SaveBar, and everything the rail renders (`StyleTab` / `SettingsTab`) — all
unchanged. No schema, no server, no storefront.

## Verification

1. **Full gate** — typecheck · lint · format · test (837/37) · build all green.
2. **Tripwire** — `git diff a7b304c -- SpecTableEditor.module.css RowGrid.tsx` is
   empty (confirmed).
3. **Browser (OWED)** — on the dev preview: open Style, confirm the rail scrolls
   internally with the preview anchored; repeat on Settings; confirm Content is
   unchanged; keyboard-reach the rail's last control without the page moving; check
   a narrow iframe width and a short rail (no empty gap, `max-height` not `height`).

## Definition of done

- Style/Settings rail scrolls internally; the preview stays in view. ✅ (code)
- Only the rail scrolls; preview keeps natural height. ✅ (code)
- Content tab, tripwired files, and rail contents unchanged. ✅
- Full gate green. ✅
- Browser-verified on the dev preview. ✅ (2026-07-22)
