# Feature 73 — Desktop preview inner scroll

> **Status: ✅ SHIPPED & VERIFIED 2026-07-23.** Full gate (typecheck · lint · format ·
> test 852/36 · build) green, and confirmed live on the dev store via Claude-in-Chrome
> ([[browser-verify-embedded-app]]) at a 1440×900 window.

## The ask

Merchant report (2026-07-23): the **Mobile** preview reads as a real device — the
phone is fitted to the viewport and its screen scrolls internally, so it is obvious
you are looking at a phone. The **Desktop** preview has no scrollbar at all. The
browser-window mockup kept feature 49 Step 6's content-driven auto-height, so it grew
to whatever the table needed and ran off the bottom of the editor; the merchant
scrolled the admin page, not the window. Give Desktop a scrollbar inside the mockup.

## The design

Mirror Mobile's mechanism (bound the screen, let the iframe scroll itself) but with a
**weaker sizing rule**, because a browser window is not a fixed-size device:

| | rule | short table | long table |
| --- | --- | --- | --- |
| Mobile (72) | **fit** the viewport, capped at `PHONE_SCREEN_MAX_PX` | full-height phone, empty space below the table | scrolls internally |
| Desktop (73) | **clamp** the shim height to the viewport | window hugs the content — identical to feature 72 | bounded, scrolls internally |

Clamp, not fit, was the merchant's call. Always filling the viewport would be more
literally "a browser window", but it puts dead white space under a three-row table;
the pre-73 hug-the-content look was already right for that case, and this change must
not regress it.

**Step 6's height shim stays load-bearing on Desktop.** Mobile *ignores* the reported
height; Desktop feeds it in as the clamp's INPUT. Nothing about the iframe pipeline
(renderer, shim, `sandbox="allow-scripts"` opaque origin, CSP, live styling) changes.

### Where the pieces live

- **`deviceView.ts`** — new pure `browserScreenHeight(content, available)`, beside
  `phoneScreenHeight`, so the whole device-sizing rule stays in one dependency-free,
  unit-tested module:
  - `content` null / non-finite (no height message yet) → `null`, i.e. `.previewFrame`'s
    `min-height` floor stands, exactly as before.
  - `available` missing / non-finite (pre-measurement) → the **unclamped** `content`,
    so the failure mode degrades to the old unbounded window, never to a wrong size.
  - otherwise `min(content, max(BROWSER_SCREEN_MIN_PX, available))`.
  - **The floor guards the BUDGET, not the result** — `max()` is applied to `available`
    before the `min()`, so a raced tiny measurement can't collapse the window to a
    sliver *and* a genuinely 40px table still renders 40px tall.
- **`SpecTablePreview.tsx`** — the two mockups now share ONE measuring ref
  (`deviceRef`) and one unconditional `useScrollRegionHeight` call, with the
  re-measure key flipped per device (`isMobile ? 1 : 2`) so the newly mounted mockup
  clamps immediately on a device switch. The iframe's inline `height` is now a single
  `screenHeight` expression instead of a per-device ternary.
- **`previewStyles.ts`** — `html { scrollbar-width: thin }` added to `PREVIEW_AMBIENT`
  (merchant's call: slimmed, not native). Page chrome, not content: a full-width
  platform scrollbar inside a small mockup reads as a UI artifact rather than as part
  of the previewed page. Standard property only — no `::-webkit-scrollbar` fork — so
  it degrades to the platform default where unsupported, and it is inert whenever the
  document fits. Preview-only, like everything in that module; never shipped to the
  storefront, and outside the byte-drift-guarded `SPEC_TABLE_CSS` copy.

### Why the ref sits on `.browserScreen`, not `.browser`

`useScrollRegionHeight` measures *its element's top → viewport bottom* (minus its 3rem
bottom pad). Mobile puts the ref on `.phone`, the whole body, so `phoneScreenHeight`
must subtract `PHONE_CHROME_PX` — a constant that has to be kept in sync with the CSS
bezel by hand. Desktop instead measures **below** the chrome bar, so the measurement
already *is* the screen's budget: no `BROWSER_CHROME_PX`, nothing to drift against
`.browserBar`'s padding. The browser has no chrome *below* the screen, so this is exact
(bar the 1px bottom border, absorbed by the hook's bottom pad).

One ref pointing at two different elements means `available` means something slightly
different per branch; each branch's pure function owns that interpretation, and the
call site says so.

### Two loops that don't happen

1. **Measure → resize → measure.** Sizing `.browserScreen` does not move its own top
   (the chrome bar above it is fixed), so the repeat measurement is equal and the
   hook's `setMaxHeight` bails — the same convergence argument its `.rowsScroller`
   contract already documents.
2. **Clamp → reflow → re-report.** Shrinking the iframe cannot shrink `content` (the
   framed document's height is width-driven, and the outer height is not an input).
   An inner scrollbar appearing consumes width and can only push `content` *further*
   above the cap, where the result is pinned to `available`. `browserScreenHeight` is
   a fixed point over its own output — covered by a test.

## Files touched

- `app/routes/app.templates_.$id/deviceView.ts` — `browserScreenHeight`,
  `BROWSER_SCREEN_MIN_PX`.
- `app/routes/app.templates_.$id/deviceView.test.ts` — 9 new cases.
- `app/routes/app.templates_.$id/SpecTablePreview.tsx` — shared `deviceRef`, unified
  height expression, header-comment reconciliation (the feature-72 block claimed
  "Desktop is unchanged").
- `app/routes/app.templates_.$id/previewStyles.ts` — `html { scrollbar-width: thin }`.

**Untouched:** `DevicePreview.module.css` (the mockup chrome needed nothing — iframes
scroll natively, and `.browser`'s `overflow: hidden` + radius already clip the screen),
`previewBridge.ts`, `specTablePreviewHtml.ts`, and the tripwired
`SpecTableEditor.module.css` / `RowGrid.tsx` (verified byte-clean).

## Done when

1. ✅ Gate green (typecheck · lint · format · test · build).
2. ✅ Tripwired files byte-clean.
3. ✅ Long table on Desktop (DJI Mavic, 44 rows, Style tab): the browser window stops
   at the bottom of the editor viewport with a scrollbar down its right edge; paging
   that scrollbar walked the preview to the last section (Warranty) while the header,
   tabs, rail and window frame stayed anchored — the admin page did not move.
4. ✅ Short table on Desktop (ACEFAST YF4, 8 rows, Content tab): the window ends
   directly under the last row — no scrollbar, no dead space. Unchanged from 72.
5. ✅ Desktop → Mobile → Desktop re-measures both ways; the phone still fits the
   viewport and scrolls internally, and Desktop re-clamps on return.
6. ✅ Style-tab rail inner-scroll (feature 71) still independent: paging the rail's own
   scrollbar moved only the rail; the preview held its scroll position exactly.
7. ✅ The slimmed scrollbar reads visibly narrower than the admin's own page scrollbar
   beside it (zoom comparison), and applies to the phone screen too.
