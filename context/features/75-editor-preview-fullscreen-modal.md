# Feature 75 — Full-size preview modal

> **Status: 🗑️ REMOVED 2026-07-25 — this surface is no longer in the product.** It
> shipped and was live-verified (log below, unedited), but feature 76's collapsible
> rail — the *other* option the same merchant offered for the same report — answered
> the width problem well enough on its own, and the merchant chose to keep only that
> one. Two surfaces solving one problem is two surfaces to explain, keep truthful, and
> re-verify. Everything the modal added was deleted: `PreviewModal.tsx`, the control-row
> trigger + `PREVIEW_MODAL_ID`, `deviceView.ts`'s `modalPreviewHeight` /
> `MODAL_CHROME_PX` / `MODAL_PREVIEW_*`, `tabViewMemory.ts`'s `setPreviewDevice`, the
> `SpecTablePreview` `availableHeight` override + its render-prop `options` argument,
> and all 13 of their unit tests. **What survives:** `SegmentedControl.tsx`, the verbatim
> extraction this feature made — `EditorShell` uses it for both its tab group and its
> device toggle, so it is now just a shared component with no modal in it.
>
> **This doc is kept as the record, not as a spec.** Its root-cause analysis is still
> correct and still load-bearing — the 749px breakpoint reasoning below is why feature 76
> exists, and the 🚫 "never lower 749" rule stands regardless of which surface ships.
> Everything from "The design" onward describes code that no longer exists. If a
> full-size preview is ever wanted again, read [[76]]'s "The honest limit" first: the
> recorded answer to renewed friction is a fixed-1100px `transform: scale()` preview,
> **not** a re-added modal.

> _Original status line (2026-07-25):_ ✅ shipped & verified. Full gate (typecheck · lint ·
> format · test 875/36 · build) green, and confirmed live on the dev store via
> Claude-in-Chrome ([[browser-verify-embedded-app]]) at a 1397×599 admin window — the size
> that reproduces the reported bug. Step 0 passed on width and forced two build-time
> corrections; both are logged below.

> **Doc numbering:** this takes 75, so Reshell Phase B2 (the built-in preset gallery)
> moves to 76+. Update the pointer in `progress-tracker.md` → Next Up when this ships.

---

## The ask

Merchant report (2026-07-25, with screenshots): open a template, go to the **Style**
tab with **Desktop** selected in the device toggle — and the preview renders the
**stacked (mobile)** layout, label above value, even though `rowLayout` is
`TWO_COLUMN`. The Desktop preview is not showing the desktop layout.

Reported on a laptop. The merchant's framing was "two sidebars leave no room," and
the two ideas offered were (1) a collapsible Style rail and (2) a full-size preview
popup. **Idea 2 is the chosen direction.**

## Root cause — this is a fidelity bug, not a comfort complaint

The storefront stylesheet flips to stacked at a hard breakpoint:

```css
@media (max-width: 749px) { .appx-spec-table--mobile-stacked … }
```
`extensions/product-specs-table/assets/spec-table.css:275` — 749px is Dawn's mobile
breakpoint, deliberately chosen so the table flips where the surrounding theme does.

That query is evaluated against the **iframe's own viewport**, and
`previewDeviceWidth("desktop")` returns `"100%"` (`deviceView.ts:41`) — so "Desktop"
is only ever as wide as the leftover editor column:

> viewport − admin chrome − `18.75rem` Style rail (`EditorShell.tsx:310`)
> − `1.5rem × 2` `.stage` padding (`DevicePreview.module.css:53`)

On the reporter's ~1277 CSS px viewport that lands near **~640px** — genuinely under
749, so the preview is telling the truth about a 640px-wide "desktop". Approximate
Desktop-iframe width by admin viewport, with what each option buys:

| Admin viewport | Rail open (today) | Rail collapsed (idea 1) | Modal (idea 2) |
| --- | --- | --- | --- |
| 1440 | ~800 ✅ | ~1100 ✅ | ~1050 ✅ |
| 1277 (reporter) | ~640 ❌ | ~940 ✅ | ~980 ✅ |
| 1152 | ~510 ❌ | ~810 ✅ | ~1000 ✅ |
| 1024 | ~385 ❌ | ~685 ❌ | ~960 ✅ |

**Why idea 1 was rejected:** collapsing the rail does not clear 749px on a 1024–1100px
laptop — it relocates the failure to a smaller machine while telling the merchant the
sidebar was the problem. It also breaks the Style tab's core loop (turn a knob, watch
the table change) by requiring the knobs to be hidden to see a truthful table.

**🚫 Do not "fix" this by lowering the 749px breakpoint.** It is Dawn's mobile
breakpoint, it is byte-drift-guarded by `specTableCssContract.test.ts`, and changing it
would alter what real shoppers see on real phones to work around an admin sizing problem.

---

## The design

A **full-size preview modal**: an icon button beside the device toggle opens an
`<s-modal>` containing the same `SpecTablePreview`, at a width the admin column cannot
constrain. The modal carries its own Desktop / Mobile toggle so the merchant can
compare both layouts at full fidelity, and closes back to the editor unchanged.

Scope boundary — the modal is a **verification** surface, not an authoring one. The
Style knobs stay in the rail behind it. This is accepted: the merchant's stated need is
"a clear idea about the layout," which is a look-at-it task, not an adjust-it task.

### Step 0 — the spike that gates everything (do this first)

The entire feature rests on one unverified number: **how wide is the inside of an
`<s-modal size="large-100" padding="none">` in the embedded admin, on a laptop?**
App Home's `ModalProps` caps `size` at `large-100` — there is **no `max` size**
(`@shopify/polaris-types` restricts to `small-100 | small | base | large | large-100`),
so "full screen" will really be "a wide modal". If its inner width minus `.stage`'s
48px padding does not clear 749px, the feature does not solve the reported bug.

Spike, in the real embedded admin via Claude-in-Chrome ([[browser-verify-embedded-app]])
at the reporter's own window size, on a throwaway branch:

1. Render an `<s-modal size="large-100" padding="none">` with a `100%`-width iframe.
2. Measure the **iframe's** `clientWidth`. Record it. **Pass = > 749.**
3. Measure the modal body's available **height**, and compare it to `window.innerHeight`
   inside the app iframe — the modal is laid out against the *admin's* viewport, which
   is taller than the app frame. Record the delta; it calibrates `MODAL_CHROME_PX` below.
4. Confirm `<s-modal>` still portals **outside** the editor's `inert` save-freeze (the
   behaviour `ResetStylingModal.tsx:20` documents) and that `onShow` / `onAfterHide`
   fire on Esc and backdrop dismiss, not just on the Close button.

**If step 2 fails**, do not ship a modal that still renders stacked. Fall back to
emulating a fixed desktop viewport and scaling it down: iframe `width: 1100px` fixed,
wrapper `transform: scale(available / 1100)` with `transform-origin: top left`, scale
factor from a new pure `previewScale()` in `deviceView.ts`. That is correct at *any*
width, at the cost of smaller text — and it would then be worth applying to the inline
card preview too, retiring the modal as the primary fix.

#### Step 0 — RESULTS (2026-07-25, run against the live dev store)

Measured environment: admin window **1397 × 599** CSS px (`devicePixelRatio` 1.375);
the app iframe reports **1141 × 487** and is cross-origin, so nothing inside it can be
read from the top frame — every number below the first row came from geometry, not
from `contentDocument` ([[browser-verify-embedded-app]]).

| # | Question | Result |
| --- | --- | --- |
| 1–2 | Modal inner width at `large-100` + `padding="none"` | **PASS.** Dialog ≈976px wide; the desktop mockup clears 749px comfortably and renders **two-column**. The fallback was not needed. |
| 3 | Modal body height vs `window.innerHeight` | The dialog caps near **90% of the app frame** (425 of 487) and the chrome above/below the mockup totals ~248px. **My planned `MODAL_CHROME_PX = 148` was badly wrong** — see correction 1. |
| 4 | Portals outside `inert`; `onShow`/`onAfterHide` fire on Esc and backdrop | **PASS**, and the save-freeze question resolved differently — see correction 2. |

**Correction 1 — `MODAL_CHROME_PX` 148 → 252, and the footer had to go.** The first
build overflowed: the browser mockup was taller than the modal body, so the body grew
its own scrollbar *outside* the iframe's — a scrollbar inside a scrollbar, the exact
failure feature 73 existed to remove. Re-derived from the measured stack (dialog
margins 62 + heading 44 + toggle block 56 + `.stage` padding 48 + `.browserBar` 38 ≈
248, rounded to 252 to err toward a gap rather than an overflow).

That alone was not enough on a 599px window. The planned footer "Close" button cost
**53px of a 487px budget — 11%** — to duplicate dismissal the modal already offers
three ways (heading ✕, Esc, backdrop). On a surface whose entire job is showing table,
that trade is backwards, so the modal now ships with **no footer actions**. Verified
after: one scrollbar only, the iframe's own, inside the browser window.

**Correction 2 — the save-freeze guard is unnecessary, for a better reason than
planned.** The Decisions section argued no guard was needed because the modal is
read-only. The real reason is stronger: **the state is unreachable.** Starting a save
requires clicking the SaveBar, which lives outside the dialog, and any outside click
dismisses the modal first (observed). `Ctrl+S` does not save (observed). So "modal open
+ save in flight" cannot be entered by pointer or keyboard, and the freeze can never
trap the dialog shut.

**Not verified, stated plainly:** the "short table hugs its content" case
(done-when #6). At a 599px-tall window the modal's height budget is ~240px — about five
rows — so every template in the dev store clamps and scrolls. The hug branch is
unit-tested in `browserScreenHeight` and is unchanged by this feature (the modal only
supplies a different `available`), but it was not seen on screen. Re-check on a taller
monitor.

**One boundary artifact:** Tab from inside the dialog can reach the Shopify **dev
console** overlay, which lives in the parent frame. `<s-modal>`'s focus trap operates
inside the app iframe's document and cannot span the frame boundary. Development-only
tooling, not app chrome, and not something the app can control.

### Where the pieces live

- **`editorShared.ts`** — `export const PREVIEW_MODAL_ID = "preview-modal";` beside the
  five existing modal ids. One home for modal ids, unchanged convention.

- **`SegmentedControl.tsx`** *(new — extraction, behaviour-preserving)* — move
  `SegmentedControl`, `SegOption`, and the `SIconType` alias out of `EditorShell.tsx`
  so the modal's device toggle reuses the real WAI-ARIA radiogroup (roving tabindex,
  arrows/Home/End) instead of a second, divergent implementation. It keeps importing
  `.segGroup` / `.segBtn` from `SpecTableEditor.module.css` — **importing** the tripwired
  module is fine; **editing** it is not. Its `useId` tooltip prefix already prevents id
  collisions between two mounted instances.

- **`PreviewModal.tsx`** *(new)* — the `<s-modal>` shell: heading, `padding="none"`,
  `size="large-100"`, and a Desktop/Mobile `SegmentedControl`. Takes the `preview`
  render prop and the shared device, renders `preview(device, { availableHeight })`.
  **No footer actions** — dropped during Step 0 to buy back 53px of preview height
  (correction 1 above); dismissal is the heading ✕, Esc, or a backdrop click.

- **`EditorShell.tsx`** — mounts `<PreviewModal>` as a sibling of the stage grid, and
  adds the trigger button. Stays **presentational**: it already receives `preview` as a
  render prop, so the modal reaches the live rows/styling through that same slot and
  the shell still never touches the engine.

- **`tabViewMemory.ts`** — new pure `setPreviewDevice(memory, device)`: sets `device`
  only, leaving every tab's `edit`/`preview` mode alone, and returns the same object
  when unchanged so React can bail out. `rememberView` is **not** reusable here — it
  also flips the calling tab into `preview`, which would leave the Content tab showing
  a preview instead of the grid after the modal is closed.

- **`deviceView.ts`** — new pure `modalPreviewHeight(viewportHeight)` +
  `MODAL_CHROME_PX` (calibrated in Step 0) and min/max constants. Joins
  `phoneScreenHeight` / `browserScreenHeight` so the whole device-sizing rule stays in
  one dependency-free, unit-tested module.

- **`SpecTablePreview.tsx`** — one new optional prop:
  ```ts
  const measured = useScrollRegionHeight(deviceRef, isMobile ? 1 : 2);
  const available = availableHeight ?? measured;
  ```
  Nothing else changes. Both existing sizing rules then work unmodified inside the
  modal: Mobile fits and caps at `PHONE_SCREEN_MAX_PX`, Desktop clamps the shim height
  via `browserScreenHeight`.

### Why the modal must not reuse `useScrollRegionHeight`

The hook measures *its element's top → the app iframe's viewport bottom*, minus a flat
`BOTTOM_PAD_REM = 3` (`useScrollRegionHeight.ts:57`). Inside a centred modal that budget
is wrong in both directions: it ignores the modal's footer and bottom margin, and it is
measured against the wrong viewport (see Step 0.3). Applied naively it would size the
browser mockup **taller than the modal body**, producing a nested scrollbar inside a
scrollbar — the exact failure feature 73 was built to remove.

### Why the height is viewport-derived, not measured off the modal body

A `ResizeObserver` on the modal body looks more precise but is **circular**: an
`<s-modal>` sizes to its content up to a max, so a preview sized from the body feeds
back into the body's height. Deriving from `window.innerHeight` breaks the loop, because
the viewport is not an output of the layout. `modalPreviewHeight` is therefore pure,
unit-testable, and calibrated once against reality — the same approach as
`PHONE_CHROME_PX` (calibrated against the CSS bezel) and `BOTTOM_PAD_REM` (calibrated
against the real embedded iframe). Mis-calibration degrades softly: a slightly short
modal body scrolls, a slightly tall one leaves a gap. Neither is a broken layout.

### The trigger button, and the tripwire

`.controlrow` is `justify-content: space-between` with exactly two children
(`SpecTableEditor.module.css:347`). A third child would strand the device toggle in the
middle. Wrap the right-hand pair instead — **no CSS change, so the tripwired module
stays byte-clean**:

```jsx
<div className={styles.controlrow}>
  <SegmentedControl ariaLabel="Editor tab" … />
  <s-stack direction="inline" gap="small-300" alignItems="center">
    <SegmentedControl ariaLabel="Preview device" … />
    <s-button variant="tertiary" icon="maximize"
              commandFor={PREVIEW_MODAL_ID} command="--show" … />
  </s-stack>
</div>
```

`maximize` is a valid `s-icon` type (verified against `@shopify/polaris-types`).
The button is **not** a fourth segment of the radiogroup — it is an action, not a view,
and adding it inside `role="radiogroup"` would corrupt the radio semantics. Declarative
`commandFor` / `command="--show"` avoids pulling `useAppBridge` into the shell; the
open/close **state** rides the modal's own `onShow` / `onAfterHide` callbacks, which fire
for Esc and backdrop dismiss too (confirm in Step 0.4).

### Mount the preview only while open

`<s-modal>` children stay in the DOM when hidden, so a naively-mounted modal preview
would run a **second** full storefront document — re-rendering its `srcDoc` on every
keystroke — permanently. Gate the modal's `preview(...)` call on `isOpen` state driven
by `onShow` / `onAfterHide`, so the second iframe exists only while the merchant is
looking at it.

The **card's** preview keeps rendering behind the overlay. Unmounting it would cost a
white flash and a shim re-measure on close, for no benefit — it is hidden, not free, and
that is the right trade.

---

## Decisions

- **The modal's device toggle drives the SHARED device** (`setPreviewDevice`), not a
  local copy. This follows the locked Step 11 decision that "the preview device is a
  property of the editor, not the tab" (`tabViewMemory.ts:14`). Consequence, accepted:
  flipping to Mobile in the modal and closing leaves the card on Mobile — visibly, since
  the card's segmented control shows it. *Escape hatch if review disagrees:* give
  `PreviewModal` its own `useState` seeded from the shared device on `onShow`; that is a
  five-line change confined to one file.
- **The trigger is visible on every tab and view**, including Content/Edit. "Show me how
  this looks" is a reasonable thing to want while editing rows, and a conditional trigger
  is more logic and more surprise than it saves.
- **No save-freeze guard.** `ResetStylingModal` hides itself when a save starts because
  it *mutates* (`ResetStylingModal.tsx:30`). This modal is read-only, so an open preview
  during an in-flight save would be harmless anyway — and per Step 0 correction 2 the
  state is not even reachable, since starting a save requires an outside click that
  dismisses the dialog first.
- **`browserScreenHeight`'s clamp-not-fit rule is reused unchanged** inside the modal. A
  short table hugging its content was feature 73's explicit merchant call; a big empty
  browser window in a big modal is the same dead space, just larger.

## Risks

| Risk | Mitigation |
| --- | --- |
| `large-100` is narrower than ~800px → still renders stacked | **Step 0 gates the build.** Fallback = scale-to-fit. |
| Modal-body height mis-derived → nested scrollbars | Viewport-derived pure fn, calibrated in Step 0; soft failure modes. |
| `s-modal` does **not** portal outside `inert` after all | Step 0.4. If it doesn't, mount `PreviewModal` in `SpecTableEditor` as a sibling of the freeze `<div>` (like `ResetStylingModal`) and pass the device through props. |
| Two live preview iframes | Gated on `isOpen`; only ever one extra, only while visible. |
| `SegmentedControl` extraction regresses tab/device controls | Pure move, no signature change; re-verify roving tabindex + arrow keys on both groups. |

## Files touched

**New:** `SegmentedControl.tsx`, `PreviewModal.tsx`.
**Edited:** `EditorShell.tsx`, `SpecTablePreview.tsx`, `deviceView.ts`,
`tabViewMemory.ts`, `editorShared.ts`, `deviceView.test.ts`, `tabViewMemory.test.ts`.

Final: as planned, no additions or removals. 13 new tests (862 → 875).

**Must stay untouched:** `spec-table.css` (the 749px breakpoint — see the 🚫 above),
`specTablePreviewHtml.ts`, `previewBridge.ts`, `previewStyles.ts`,
`DevicePreview.module.css`, and the tripwired `SpecTableEditor.module.css` / `RowGrid.tsx`
(verify byte-clean before sign-off). No schema, no server, no Liquid, no metaobject —
this is admin-UI-only, so it does not cross the split-work boundary in
`ai-workflow-rules.md`.

## Done when

1. ✅ **Step 0 spike recorded in this doc** — see "Step 0 — RESULTS" above: measured
   width (pass), the height derivation, and the portal + event findings, plus the two
   corrections they forced.
2. ✅ Full gate green (typecheck · lint · format · test 875/36 · build).
3. ✅ Tripwired files byte-clean. `git status` shows neither `SpecTableEditor.module.css`
   nor `RowGrid.tsx` modified. *(Note: that CSS module does differ from sign-off
   `a7b304c` by one line — a comment-only edit from `e3476de`, the tablet removal, which
   predates this feature.)*
4. ✅ New pure functions unit-tested — `setPreviewDevice` (6 cases: device moves,
   modes preserved, an Edit tab survives, identity on no-op, no mutation, round-trip
   against `rememberView`) and `modalPreviewHeight` (7 cases: null/non-finite, chrome
   subtraction, both clamps, monotonicity, and that its budget feeds the card's two
   device rules unchanged).
5. ✅ **The bug is fixed, at the reporter's own window size.** Reproduced first: at
   1397×599 the Style tab with the rail open renders "Max Ascent Speed" *above*
   "22.4 mph / 36.0 km/h" with Desktop selected. Opening the modal renders the same row
   **two-column** — label left, value right. Confirmed on two templates (DJI Mavic,
   ACEFAST YF4).
6. ⚠️ **Partly verified.** Desktop ⇄ Mobile toggles both ways; Mobile shows the phone
   mockup fitted, centred, scrolling internally, and the dialog re-centres to it rather
   than leaving dead space; Desktop bounds the 44-row DJI table with an inner scrollbar.
   **The short-table-hugs case was NOT observed** — at 599px the budget is ~240px, so
   every dev-store template clamps. See the Step 0 note; re-check on a taller monitor.
7. ✅ Live styling flows. Row layout → Stacked (unsaved, SaveBar dirty) then opening the
   modal showed **stacked** where it had shown two-column moments earlier, proving the
   modal reads live engine state, not saved state. *(Turning a knob while the modal is
   already open is not reachable — the rail is behind a modal overlay. Same-state proof,
   different gesture.)*
8. ✅ Esc **and** backdrop click both close; each returns to an unchanged editor with the
   SaveBar's dirty state intact (verified by Discarding afterwards and seeing the knob
   revert). The footer Close no longer exists (Step 0 correction 1); the heading ✕ is the
   third path.
9. ✅/⚠️ The trigger renders beside the device toggle with `accessibilityLabel`; Esc
   returns focus to it (visible focus ring). The modal's radiogroup moves Desktop→Mobile
   on `ArrowRight` with a visible ring, so the `SegmentedControl` extraction is
   behaviour-preserving. `ariaLabel` is "Full-size preview device", distinct from the
   card's "Preview device". ⚠️ Tab can escape the dialog to the **dev-console** overlay
   in the parent frame — a cross-frame boundary the app cannot control, and dev-only.
   A screen-reader pass was not run (consistent with [[testing-strategy]]).
10. ✅ Resolved as unreachable rather than guarded — Step 0 correction 2.
11. ✅ `progress-tracker.md` updated.

**No dev-store data was modified.** Every dirty state raised during verification was
Discarded; the ACTIVE DJI template (2 assigned products) and the Motorola G45 draft both
ended byte-identical to how they started.
