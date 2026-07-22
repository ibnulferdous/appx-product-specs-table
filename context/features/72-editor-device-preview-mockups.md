# Feature 72 — Device mockups around the preview

> **Status: ✅ SHIPPED & VERIFIED 2026-07-22.** Full gate green (typecheck · lint ·
> format · test 837/37 · build) and confirmed live on the dev store via
> Claude-in-Chrome ([[browser-verify-embedded-app]]).

## The ask

The editor's read-only device previews (feature 49) rendered the storefront table in
a bare, minimally-framed iframe — the Desktop / Mobile toggle changed only the width,
so neither view read as a *device*. Make the preview load inside a device **mockup**:
a browser window for Desktop, a phone for Mobile (references: the Shopify theme editor
and WordPress Elementor). Chosen fidelity (merchant decision): a **realistic frame**,
not a minimal viewport.

## The design

Wrap the existing iframe in device chrome; the iframe and its whole pipeline
(`renderSpecTablePreviewDocument`, the height shim, sandboxing, live styling) are
unchanged.

- **Desktop → browser window.** A chrome bar (three traffic-light dots + a faux
  "Storefront preview" address pill) above the screen; the window fills the stage
  column. Keeps the Step 6 content-driven **auto-height** (the window grows with the
  table).
- **Mobile → phone.** A dark bezel with a top speaker pill around a rounded screen,
  centered on a subtle backdrop. The screen is pinned to a **fixed device height**
  (`MOBILE_SCREEN_HEIGHT_PX = 720`, paired with the 375px device width) and the iframe
  **scrolls internally** like a real phone.

**Mobile height is a deliberate, view-scoped exception to Step 6, not a reversal.**
Desktop still auto-heights; only Mobile ignores the shim-reported height and pins a
fixed one. A grow-with-content phone would be an absurd never-ending device; a fixed
scrolling viewport is what the references show and what reads as a phone.

## Where it lives

- **`SpecTablePreview.tsx`** — builds the iframe once (single element, single ref) and
  places it inside either the phone or browser chrome by `view`. Chrome elements are
  decorative and `aria-hidden`, so assistive tech still reaches only the titled iframe
  (the Step 7 read-only accessible name is untouched).
- **New `DevicePreview.module.css`** — all the chrome. Kept OUT of
  `SpecTableEditor.module.css`, which is byte-clean tripwired against `a7b304c` (the
  Edit-grid-never-styled rule); the iframe keeps its `.previewFrame` class and two
  element selectors (`.phoneScreen iframe`, `.browserScreen iframe`) drop its own
  border/radius so the device frame owns the edge — no change to the tripwired file.

**Colour.** Polaris colour tokens aren't exposed to light-DOM CSS
([[polaris-web-component-gotchas]]) — the same reason `.previewFrame` hardcodes
`#ffffff`. Per code-standards ("single source of truth, not abstinence"), every device
literal is declared ONCE as a custom property on `.stage` and referenced by `var()`;
hairlines / shadows / muted text derive from `currentColor`. Neutral device surfaces
are fixed literals that read against a light admin (like the existing `#f6f7f9` band,
they won't adapt to a dark admin theme); the three traffic-light dots keep their
identity colours.

## Scope

**In:** `SpecTablePreview.tsx` (chrome wrapper + fixed mobile height); new
`DevicePreview.module.css`.

**Out:** the storefront renderer / document builder, the height shim + bridge,
sandboxing, live styling, `deviceView.ts` (`previewDeviceWidth` unchanged), the
EditorShell device toggle, and the tripwired `SpecTableEditor.module.css` — all
unchanged. No schema, no server, no storefront.

## Verification

1. **Full gate** — typecheck · lint · format · test (837/37) · build all green.
2. **Browser (dev store, DJI Mavic 4 Pro, 44 rows):**
   - Desktop preview shows the browser window (dots + address pill), storefront table
     below, filling the column. ✅
   - Mobile preview shows the phone (bezel + speaker pill), stacked mobile layout in a
     rounded screen. ✅
   - The phone screen scrolls **internally** (content moved through the sections while
     the bezel stayed fixed). ✅

## Definition of done

- Desktop preview renders inside a browser-window mockup. ✅
- Mobile preview renders inside a phone mockup with an internal-scroll screen. ✅
- Tripwired `SpecTableEditor.module.css` untouched; iframe pipeline unchanged. ✅
- Full gate green + browser-verified on the dev store. ✅
