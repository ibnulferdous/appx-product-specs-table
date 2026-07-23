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
- **Mobile → phone.** A **light, thin** frame (hairline border + soft shadow + a
  subtle speaker pill) around a rounded screen — not a heavy dark bezel, so the specs
  table stays the focus (merchant feedback 2026-07-22). The phone is sized to the
  **available viewport height** (measured with feature 71's `useScrollRegionHeight`,
  minus `PHONE_CHROME_PX`) and **capped at `PHONE_SCREEN_MAX_PX`** (see the 2026-07-23
  follow-up below), like the Shopify theme editor's mobile preview, and the iframe
  **scrolls internally** like a real phone.

**Mobile height is a deliberate, view-scoped exception to Step 6, not a reversal.**
Desktop still auto-heights; only Mobile ignores the shim-reported height and fits the
measured viewport instead. A grow-with-content phone would be an absurd never-ending
device; a fixed scrolling viewport that matches the available height is what the
references show and what reads as a phone.

**Revision (2026-07-22).** First cut used a dark bezel and a fixed 720px screen; on
review that was too dark and too tall. Now: light frame + height measured to fit the
viewport (`useScrollRegionHeight`).

**Follow-up (2026-07-23) — max height.** Fitting the phone to *all* the available
height was right on a laptop but wrong on a large monitor: the phone grew several real
devices long, which is not a viewport any shopper has (merchant report, screenshot).
The measured fit is now clamped by a pure `phoneScreenHeight(available)` in
`deviceView.ts`, capping the screen at `PHONE_SCREEN_MAX_PX = 812` — the iPhone X-class
layout viewport, which pairs with the existing 375px `previewDeviceWidth` for a real
~1 : 2.17 phone aspect. Short viewports are unchanged (still fit); the screen still
scrolls internally, so a long table stays fully reachable either way. `PHONE_CHROME_PX`
moved from `SpecTablePreview.tsx` into `deviceView.ts` alongside it, so the whole device
sizing rule lives in one dependency-free, unit-tested module (6 new cases in
`deviceView.test.ts`).

**Follow-up (2026-07-23) — the shadow was being sliced.** `.stage` sets `overflow-x:
auto`, and CSS computes the other axis to `auto` too, so the stage is a scroll container
that clips at its padding box. Both device shadows reached past the 1.5rem bottom padding
and were cut mid-gradient — a hard line under the device (browser-measured: the white
band below the phone is exactly the 24px padding). Padding the stage more is not
available: the phone is sized to the measured viewport, so extra padding pushes the card
past the bottom of the admin frame. So the shadow is **contained** instead — its geometry
is now two custom properties on `.stage` (`--appx-device-shadow-offset` 0.375rem +
`--appx-device-shadow-blur` 1rem, summing under the 1.5rem padding), shared by the phone
and the browser window. Verified live: the shadow fades to white before the card edge on
both devices.

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

**In:** `SpecTablePreview.tsx` (chrome wrapper + mobile height); new
`DevicePreview.module.css`; the mobile sizing rule in `deviceView.ts`
(`PHONE_CHROME_PX`, `PHONE_SCREEN_MAX_PX`, `phoneScreenHeight`) + its tests.

**Out:** the storefront renderer / document builder, the height shim + bridge,
sandboxing, live styling, `previewDeviceWidth`, the EditorShell device toggle, and the
tripwired `SpecTableEditor.module.css` — all unchanged. No schema, no server, no
storefront.

## Verification

1. **Full gate** — typecheck · lint · format · test (837/37) · build all green.
2. **Browser (dev store, DJI Mavic 4 Pro, 44 rows):**
   - Desktop preview shows the browser window (dots + address pill), storefront table
     below, filling the column. ✅
   - Mobile preview shows the light phone frame (speaker pill), stacked mobile layout
     in a rounded screen, fitting the available height on both Content and Style. ✅
   - The phone screen scrolls **internally** (content moved through the sections while
     the frame stayed fixed). ✅

## Definition of done

- Desktop preview renders inside a browser-window mockup. ✅
- Mobile preview renders inside a phone mockup with an internal-scroll screen. ✅
- Tripwired `SpecTableEditor.module.css` untouched; iframe pipeline unchanged. ✅
- Full gate green + browser-verified on the dev store. ✅
