# Feature 76 — Collapsible Style / Settings rail

> **Status: ✅ SHIPPED & VERIFIED 2026-07-25.** Both Step 0 checks came back
> **negative** and both fallbacks were taken (see "Step 0" below), and live
> verification turned up one defect the plan did not predict — a scroll-offset drift
> across the collapse, fixed with `overflow-anchor: none`. Everything else landed as
> designed. Full gate green; 883 tests / 37 files.

> **Doc numbering:** this takes 76, so Reshell Phase B2 (the built-in preset gallery)
> moves to **77+**. Update the pointer in `progress-tracker.md` → Next Up when this
> ships. (75 = full-size preview modal, 74 = content-free tables, 73 = desktop preview
> inner scroll.)

---

## The ask

Same merchant report that produced feature 75 (2026-07-25): on the **Style** tab with
**Desktop** selected, the preview renders the **stacked (mobile)** layout. Two ideas
were offered — (1) a collapsible Style rail with a toggle button, (2) a full-size
preview popup. Feature 75 built idea 2. **This doc builds idea 1**, at the merchant's
request, as a complementary surface rather than a replacement.

The merchant's instruction on placement: _"You can put the open and close button
wherever it fits perfectly."_ This doc picks a spot and shows its work.

---

## Measured, not modelled

**Feature 75's rejection table for this idea was wrong, and this doc supersedes it.**
That table (`75-…md`, "Root cause") derived the preview width from the raw _admin
viewport_. The actual constraint is the `<s-page inlineSize="large">` card
(`route.tsx:543`), whose width is `viewport − admin nav − gutters − app-frame
scrollbar`. Modelling off the viewport overstated the width with the rail open and
understated the headroom with it collapsed, which is why that table both predicted
~640px where reality is ~726px and called idea 1 a failure at widths where it works.

Measured live on the dev store (ACEFAST YF4 template, Claude-in-Chrome,
[[browser-verify-embedded-app]]), the real chain is:

```
editorCard    = appIframeWidth − 64      // 24px <s-page> gutter ×2 + ~16px app-frame scrollbar
browserMockup = editorCard − 48          // .stage padding 1.5rem ×2   (DevicePreview.module.css:53)
previewIframe = browserMockup − 2        // .browser 1px border ×2     (DevicePreview.module.css:112)
                              − 300      // ...and 18.75rem more when the rail is open
```

Confirmed to the pixel: at an 884px app iframe the `.browser` mockup measured **770 CSS
px** against a predicted 770.

| Admin viewport                      | App iframe | Editor card | Rail open                   | Rail collapsed                 |
| ----------------------------------- | ---------- | ----------- | --------------------------- | ------------------------------ |
| 1397 (reporter's normal window)     | 1141       | 1076        | **726 ❌ observed stacked** | 1026 ✅                        |
| 1140 (same window, side panel open) | 884        | 820         | **470 ❌ observed stacked** | **768 ✅ observed two-column** |

Both ❌ cells were _observed_ stacked on the Style tab. The ✅ 768 cell was _observed_
two-column — measured on the **Content** tab, which already renders the exact rail-less
geometry a collapsed rail produces, so the premise of this feature was verifiable
without writing any code.

**Crossover points**, from the chain above (need ≥ 750px):

- Rail open → card ≥ 1100 → app iframe ≥ ~1164 → **admin viewport ≥ ~1420**.
- Rail collapsed → card ≥ 800 → app iframe ≥ ~864 → **admin viewport ≥ ~1120**.

_Not verified:_ behaviour below ~1120, where Shopify's admin auto-collapses its own
240px left nav and hands most of it back. The real floor is therefore lower than 1120,
but by an unmeasured amount — the window manager pinned the browser width during the
spike and would not accept a narrower size.

### What survives from feature 75's objection

The width half of that objection is retracted: **collapsing the rail does fix the
reported bug, on the reporter's own machine, with ~300px to spare.** The other half
stands unchanged and is the real design problem:

> It breaks the Style tab's core loop (turn a knob, watch the table change) by requiring
> the knobs to be hidden to see a truthful table.

That is inherent to the idea, not a bug in it. See "The honest limit" below.

**🚫 Do not "fix" the underlying bug by lowering the 749px breakpoint** in
`spec-table.css:275`. It is Dawn's mobile breakpoint, it is byte-drift-guarded by
`specTableCssContract.test.ts`, and moving it would change what real shoppers see on
real phones to work around an admin sizing problem.

---

## The design

One toggle button collapses the Style / Settings rail to **zero width**, giving the
stage the full editor card. Clicking again restores it. In-memory only, one click each
way, nothing destroyed.

### Where the button goes — and why it cannot go in the rail

**In the control row, immediately right of the tab group**, wrapped with it in one
`s-stack` so `.controlrow` still sees exactly two flex children.

The placement is forced by the measurement, not chosen by taste. The tight case above
has **only 18px of headroom** (768 vs the 750 threshold). An "icon rail stub" — the
common collapsed-sidebar pattern, where a ~48px strip survives to hold the expand
button — would spend 48 of those 18px and put the preview **back under the breakpoint
at 720px**. So:

1. The collapse must go to **zero width**, which leaves the button nowhere to live
   inside the rail.
2. It must be **visible in both states, in a fixed position** — a control that moves
   when you press it is a control you have to re-find.
3. Beside the tabs is where it belongs semantically: the tabs choose _which_ rail shows;
   this chooses _whether_ it shows.
4. It mirrors the right-hand group (device toggle + full-size trigger) that feature 75
   established, so the row reads as tabs-and-panel on the left, preview controls on the
   right.

```jsx
<div className={styles.controlrow}>
  {/* LEFT: tabs + the rail toggle, wrapped as ONE flex child — `.controlrow` is
      `justify-content: space-between` with exactly two children
      (SpecTableEditor.module.css:347), and that module is tripwired. */}
  <s-stack direction="inline" gap="small-300" alignItems="center">
    <SegmentedControl ariaLabel="Editor tab" options={TABS} … />
    {railTab ? (
      // A plain <button>, not an <s-button> — see Step 0.2.
      <button
        type="button"
        className={styles.segBtn}
        aria-label={railToggleLabel(railTab, railCollapsed)}
        aria-expanded={!railCollapsed}
        aria-controls={RAIL_REGION_ID}
        onClick={() => setRailCollapsed((c) => !c)}
      >
        <s-box borderRadius="base" paddingBlock="small-300" paddingInline="small-200">
          <s-icon type="layout-sidebar-left" aria-hidden="true"></s-icon>
        </s-box>
      </button>
    ) : null}
  </s-stack>

  {/* RIGHT: unchanged from feature 75. */}
  <s-stack direction="inline" gap="small-300" alignItems="center">…</s-stack>
</div>
```

`layout-sidebar-left` is a valid `s-icon` type (verified against the 518-name union in
`@shopify/polaris-types`). **One stable icon, not a swapping chevron** — a toggle icon
that changes is permanently ambiguous about whether it depicts the current state or the
action; `aria-expanded` plus the label carry the state instead.

Rendered only when the tab HAS a rail (Style / Settings). Content has no rail, so the
button would be a no-op there. The gate is `railTab` — `activeTab` narrowed to
`RailTab` — rather than the boolean `showSidebar`, so `railToggleLabel` can be total over
its domain instead of carrying an unreachable `content` branch. `showSidebar` is then
derived from it and means exactly what it did before.

**No hover tooltip**, matching the full-size-preview trigger beside it (feature 75) rather
than the icon-only _segments_, which get `interestFor` tooltips because they are states in
a radiogroup. If merchants report the icon is unclear, the `interestFor` + `<s-tooltip>`
pattern in `SegmentedControl` is the drop-in.

### Collapse by hiding, not unmounting

```jsx
<s-grid gridTemplateColumns={railCollapsed ? "1fr" : "18.75rem 1fr"}>
  <s-box data-appx-rail-collapsed={railCollapsed ? "" : undefined} …>
```

```css
/* EditorShell.module.css — attribute, not class; see Step 0.1 */
:global(s-box[data-appx-rail-collapsed]) {
  display: none;
}
```

**⚠️ Both changes are required together, and the failure mode is silent.** `display:
none` removes the rail as a grid item, so with the template left at `18.75rem 1fr` the
_stage_ becomes the first child and renders inside the 300px column — a broken layout
that looks like a CSS bug rather than a missing ternary. A done-when item covers it.

`display: none` specifically, not a visually-hidden recipe: the collapsed rail has to
leave the tab order and the a11y tree too, or a merchant who collapsed it would Tab
through invisible Style controls.

Hiding beats unmounting because the rail's React state survives — it keeps its scroll
position (which needed Step 0.3's fix to actually hold), and StyleTab's own UI memory
(`rememberedPxRef`, the custom font-size px) survives with it. It also keeps
`aria-controls` pointing at a node that exists.

> **Correction.** The plan cited "StyleTab's collapsible sections (feature 65)" as the
> state being preserved. There are none: feature 65's `<details>/<summary>` are the
> **storefront table's** collapsible sections, and the rail's groups are `role="group"`
> divs with `<s-heading>`s, always open. Scroll position is the real preserved state, and
> is what done-when #7 was verified against.

The new rule lands in **`EditorShell.module.css`**, the sanctioned home for shell CSS —
`SpecTableEditor.module.css` stays byte-clean.

### The two things that already work, for free

- **The preview re-measures its height on collapse.** The framed document's shim
  observes `document.documentElement` with a `ResizeObserver`
  (`previewBridge.ts:55`), so widening the iframe reflows the storefront document and
  re-reports its height. And `useScrollRegionHeight` in `SpecTablePreview` observes the
  `.browser` parent, whose width changes. No new plumbing.
- **The table re-flows across the breakpoint by itself.** The media query lives in the
  framed document and is evaluated against the iframe's own viewport, which is what the
  collapse changes.

### The one thing that does not

`useScrollRegionHeight(railRef, showSidebar ? 1 : 0)` (`EditorShell.tsx:143`). With the
rail hidden rather than unmounted, the ref stays live and
`getBoundingClientRect()` on a `display: none` element returns all zeros — so `top` is
0 and the hook computes an over-large `maxHeight` that is stale-wrong the moment the
rail comes back. Change the re-measure key to include the collapse:

```ts
const railMaxHeight = useScrollRegionHeight(
  railRef,
  showSidebar && !railCollapsed ? 1 : 0,
);
```

The effect re-runs after commit, i.e. after the grid template and the class are applied,
so the first measurement on expand is taken against settled layout.

**Shipped with one addition the plan missed.** The key change guarantees a re-measure on
expand, but it does not stop the bogus one: the key going `1 → 0` makes the effect re-run
_while collapsed_, which is exactly when the zero rect is read and stored. So the hook now
also bails on a 0×0 rect, holding the last good value for the whole hide/show cycle rather
than applying a viewport-tall `maxHeight` for the frame before the re-measure lands. This
is a one-line guard in `useScrollRegionHeight.ts` (not in the plan's file list, and not in
its must-stay-untouched list either) and is strictly better for its other two consumers —
a scroller that is not rendered has no budget worth storing. It is **not** the fix for the
scroll drift; see Step 0.3.

---

## Step 0 — two platform checks (small; the width spike is already done)

Unlike feature 75, the load-bearing measurement is finished. Two questions remained,
both cheap and both with a ready fallback. **Both came back negative, and both
fallbacks were taken — though 0.1's was replaced with something smaller.**

### 0.1 — Can the rail be hidden by a class on the `<s-box>` host? ❌ No

Not a CSS question at all, as it turned out: **Polaris's JSX types reject `className`
on an `<s-box>`.** Each `s-*` element is typed as its own props plus exactly
`key` / `ref` / `slot` / `children` (`polaris.d.ts` → `ReactBaseElementProps`), so
`className` (and `style`, and `id`) is a hard `tsc` error on a Box:

```
Property 'className' does not exist on type
  'ReactProps$T & ReactBaseElementPropsWithChildren<Box>'
```

The documented fallback was a plain `<div>` grid child. **Not taken** — it would demote
the rail from _being_ the grid item to a nested child, which (a) re-enters the
unpainted-inline-end-sliver bug recorded in [[polaris-web-component-gotchas]] for
exactly this rail, and (b) loses the grid's `align-self: stretch`, so the grey panel
would stop reaching the row's full height and need `display: grid` on the wrapper to get
it back.

Smaller route taken instead: **a hyphenated data attribute plus an attribute selector.**
TypeScript skips excess-property checking for JSX attribute names that are not valid JS
identifiers, so `data-appx-rail-collapsed` typechecks on an `s-*` host where `className`
cannot — and the same escape hatch is why `aria-expanded` / `aria-controls` typecheck
below. The rule lives in `EditorShell.module.css` as planned, just as
`:global(s-box[data-appx-rail-collapsed]) { display: none }`; CSS Modules only rewrites
class/id selectors, and the `appx-` prefix keeps the necessarily-global selector
unambiguous. Emitted output confirmed in the build:
`s-box[data-appx-rail-collapsed]{display:none}`.

**The underlying CSS question is answered too, and favourably:** the document-level rule
DOES beat Polaris's internal display — collapsed live, the rail is gone completely, the
stage takes the full card, and no 300px remnant column survives.

### 0.2 — Do `aria-expanded` / `aria-controls` on `<s-button>` reach AT? ❌ No

Measured directly against the live `cdn.shopify.com/shopifycloud/polaris.js` build, in a
throwaway local page rather than the app (the editor iframe is cross-origin, so its AOM
cannot be read from the top frame — [[browser-verify-embedded-app]]). Rendering
`<s-button variant="tertiary" icon="layout-sidebar-left" accessibilityLabel="Hide Style
panel" aria-expanded="true" aria-controls="editor-rail">` and reading the open shadow
root:

```json
{
  "hostRole": null,
  "hostComputedRole": null,
  "hostAriaExpanded": "true",
  "innerTag": "BUTTON",
  "innerAttrs": {
    "id": "probe",
    "aria-label": "Hide Style panel",
    "class": "button size-base tone-auto variant-tertiary icon-only",
    "type": "button"
  },
  "innerAriaExpanded": null,
  "innerAriaControls": null
}
```

So Polaris forwards `accessibilityLabel` → `aria-label` (and, unexpectedly, copies the
host's `id` onto the shadow button as well), but **`aria-expanded` and `aria-controls`
are dropped**. They stay on a host that has _no role at all_, where `aria-expanded` is
not a valid state on anything and is exposed to nothing.

**Fallback taken: a plain `<button className={styles.segBtn}>`** with a nested `<s-box>`
for hit area and an `aria-hidden` `<s-icon>` inside. Chosen over "accept host-level ARIA
and note it" because a toggle whose state exists for sighted users only is precisely the
gap feature 57 Step 12 spent a whole step closing _in this same rail_ — shipping a new
one beside it would be a regression in kind. `.segBtn` is imported (never edited) from
the tripwired module, exactly as `SegmentedControl` already does, so the button gets the
same chrome-reset and the same `currentColor` `:focus-visible` ring as the tab segments
immediately left of it, and renders as the same bare icon the `s-button` did.

On a real `<button>` there is no shadow root to lose the attribute and `role=button`
supports the state natively, so this is a platform guarantee rather than another vendor
bet. _Not_ claimed: no screen reader was run — same standing limitation as feature 70's
open question, and the label copy is pinned by `editorShared.test.ts` instead.

### 0.3 — Unplanned: the rail's scroll offset drifted across the collapse

Not on the checklist, and only visible because done-when #7 asked for it. Collapsing and
re-expanding returned the rail _near_ where the merchant left it but **~36px further
down every cycle** — five toggles walked it a third of a panel.

First hypothesis was wrong and is recorded so it is not retried: the plan notes that
`getBoundingClientRect()` on a `display: none` element returns all zeros, so
`useScrollRegionHeight` computes an over-large `maxHeight` off `top: 0`. That IS real —
the re-measure key makes the effect re-run while collapsed, when the rail is hidden and
the ref is still live — and it is now guarded in the hook (bail when the rect is 0×0, so
the last good value is held for the whole hide/show cycle instead of a viewport-tall one
being applied for a frame on the way back). But the guard did **not** move the drift,
which reproduced at the same magnitude with it in place.

The actual cause is **Chrome scroll anchoring**: re-laying-out a whole hidden subtree
resizes content above the anchor node it picked, and the compensation does not net to
zero. `overflow-anchor: none` on `.railScroller` fixes it — verified pixel-identical
across one cycle and then across five more. Nothing in the rail grows above the
merchant's reading position on its own (the knobs are a fixed list), so there is no
anchoring benefit being traded away.

---

## Where the pieces live

_(As shipped.)_

- **`EditorShell.tsx`** — the whole feature, essentially. Adds `railCollapsed` state
  beside `activeTab`, derives `railTab` (and `showSidebar` from it), wraps the tab group +
  new button in an `s-stack`, switches the grid template, applies the hide attribute, puts
  `RAIL_REGION_ID` on the rail scroller, and extends the `useScrollRegionHeight` key.
  Stays presentational; it does not touch the engine.

- **`EditorShell.module.css`** — the hide rule (as an attribute selector, Step 0.1) plus
  `overflow-anchor: none` on the existing `.railScroller` (Step 0.3).

- **`editorShared.ts`** — `RailTab`, `RAIL_REGION_ID` (for `aria-controls`, applied to the
  rail's inner `.railScroller` div, which is a plain element and takes an `id` reliably)
  and a pure `railToggleLabel(tab, collapsed)` returning "Hide Style panel" / "Show Style
  panel" / the Settings pair. Label logic out of JSX and into a testable function, the
  same call as `viewAnnouncement` in `tabViewMemory.ts`. Adds one type-only import of
  `TabId` from `tabViewMemory` — no cycle, since nothing there imports this file.

- **`editorShared.test.ts`** _(new)_ — 8 cases for `railToggleLabel`: both tabs × both
  states, the verb flips with `collapsed`, the noun tracks the tab.

- **`useScrollRegionHeight.ts`** _(not in the plan)_ — the 0×0-rect bail. See "The one
  thing that does not."

**Must stay untouched:** `SpecTableEditor.module.css` and `RowGrid.tsx` (tripwired
byte-clean), `spec-table.css` (the 749px breakpoint — see the 🚫), `SpecTablePreview.tsx`,
`previewBridge.ts`, `deviceView.ts`, `PreviewModal.tsx`. All held. No schema, no server, no
Liquid, no metaobject — admin-UI-only, so it does not cross the split-work boundary in
`ai-workflow-rules.md`.

---

## Decisions

- **In-memory only, resets on reload.** Matches `viewMemory`'s documented behaviour
  ("a reload returns to Content/`edit`/`desktop`", `EditorShell.tsx:96`). It also means
  a merchant who collapses the rail and forgets cannot get permanently stuck wondering
  where the Style controls went. Persisting to `localStorage` is a deliberate
  non-goal — storage is partitioned in an embedded iframe, and the reset is a feature.

- **One boolean shared by Style and Settings**, not one per tab. The rail is one
  surface; per-tab collapse memory is state the merchant never asked for and would have
  to keep track of.

- **No live-region announcement.** The merchant clicked this themselves, and
  `aria-expanded` changing on the button they just pressed is the announcement. Same
  reasoning `viewAnnouncement` records for a self-initiated view change
  (`tabViewMemory.ts:140`).

- **The button is hidden on Content**, rather than shown-but-disabled. There is no rail
  to talk about there; a permanently dead control is worse than an absent one.

- **This does not replace feature 75's modal.** See below.

## The honest limit

After this ships, on a viewport under ~1420px the Style tab **still cannot show a
truthful desktop table and the knobs at the same time**. Collapse trades the knobs for
width; the modal trades the editor for width. Both are look-then-adjust loops, not
adjust-and-watch loops.

The only option that resolves it is the third one originally proposed and not built:
render the desktop preview at a fixed 1100px and `transform: scale()` it down to fit,
so it is correct at _any_ column width at the cost of smaller text. If the merchant
reports the friction again after this ships, that is the fix — not a third panel.
Recorded here so the next person does not re-derive it.

## Risks

| Risk                                                                               | Mitigation                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Grid template not switched with the hide class → stage renders in the 300px column | Called out above; explicit done-when item. Silent failure, so it is checked visually.                                                  |
| `display: none` loses to Polaris's internal display                                | Step 0.1; fallback = plain `<div>` grid child.                                                                                         |
| `aria-expanded`/`aria-controls` don't reach AT through `<s-button>`                | Step 0.2; fallback = plain `<button>` with `.segBtn` chrome.                                                                           |
| Rail `maxHeight` stale after expand                                                | Re-measure key includes `railCollapsed`.                                                                                               |
| Merchant collapses, forgets, thinks the Style knobs are gone                       | Button always visible in a fixed spot; its label names the action and the target; state resets on reload.                              |
| Tripwire drift                                                                     | No edits to `SpecTableEditor.module.css` / `RowGrid.tsx`; new CSS goes to `EditorShell.module.css`. Verify byte-clean before sign-off. |
| Control row wraps on a narrow iframe and the button lands oddly                    | `.controlrow` already sets `flex-wrap: wrap`; the button is inside the left `s-stack`, so it wraps _with_ the tabs, not alone.         |

## Done when — all met

Verified live on the dev store (ACEFAST YF4 template `cmrrs6xma000cvpwko2l66xri`,
Claude-in-Chrome, [[browser-verify-embedded-app]]) at **`window.innerWidth` 1397 → app
iframe 1141** — the reporter's own window, and the exact top row of the measurement table
above, reproduced to the pixel.

1. ✅ Both Step 0 checks run and recorded above. **Both negative**; 0.1 took a smaller
   route than the documented fallback, 0.2 took its fallback as written. A third,
   unplanned finding (0.3) is recorded with it.
2. ✅ Full gate green — typecheck · lint · format · test · build.
3. ✅ Tripwired files byte-clean: `git status` shows neither `SpecTableEditor.module.css`
   nor `RowGrid.tsx` modified. (`SegmentedControl` and now the toggle both _import_
   `.segBtn` from it; importing is fine, editing is not.)
4. ✅ `railToggleLabel` unit-tested, 8 cases. Suite **875 → 883** tests, 36 → 37 files.
5. ✅ **The bug is fixed at the reporter's own window size.** Reproduced first: Style +
   Desktop rendered _stacked_ — "Brand" above "ACEFAST". One click on the toggle rendered
   the same rows **two-column**. Re-expanding returned it to stacked, which is correct and
   is the honest limit below made visible.
6. ✅ Sane in both states on both tabs. Collapsed, the stage takes the full card with no
   300px remnant — the paired-ternary failure mode did not occur. Settings expands and
   collapses identically, its own controls (Status, Show this table on) intact.
7. ✅ Scroll position restored — **after Step 0.3's fix.** Scrolled the rail to the Colors
   group, then collapsed/expanded: pixel-identical, and still pixel-identical after five
   more cycles. Before the fix it drifted ~36px per cycle.
8. ✅ Rail still inner-scrolls after expanding: Tab-traversal walks focus down and the rail
   scrolls internally to follow it while the preview stays anchored and the app iframe does
   not scroll (feature 71 unregressed).
9. ✅ Keyboard: Tab from the Style segment lands on the toggle with a visible
   `currentColor` focus ring; Enter and Space both toggle; focus stays on the button across
   the toggle (rings compared before/after, identical). `aria-expanded` + `aria-controls`
   land on a real `<button>` per Step 0.2 — structurally guaranteed, not screen-reader
   confirmed (see the note there).
10. ✅ Collapse survives Style → Settings, and Settings → Content → Settings: the button is
    **absent on Content** and the collapsed state is still there on return.
11. ✅ The full-size preview modal opens from a collapsed rail, renders two-column,
    toggles to Mobile, and closes on Esc — with the shared device propagating back to the
    card exactly as feature 75 specifies.
12. ✅ `progress-tracker.md` updated.

**Dev-store data safety:** verification was view-state only. No knob was turned, no row
edited; the SaveBar never appeared at any point, so nothing was dirtied and no Discard was
needed. The template's rows, styling, and assignment are unchanged.
