# Feature 57 · Step 11 — Reveal the preview when the merchant opens the Style tab

> **Status: ✅ SHIPPED 2026-07-20** (commit `76916e6`), live-verified on the dev store.
> Replaces the withdrawn Step 11 (`67-…`). Read that document's rule first; this
> step exists *because* of it.

## The premise, stated out loud

Per `67-…`, the binding rule is:

> The Edit grid is a fixed editing surface. It never reflects merchant styling.
> The Desktop / Tablet / Mobile previews are the only place Style and Settings
> changes appear.

That rule creates a gap, because the **tab** control (Content / Style / Settings)
and the **view** control (Edit / Desktop / Tablet / Mobile) are independent in
`EditorShell` (`EditorShell.tsx:198-210`). A merchant who opens Style while the
view is still Edit changes colours, fonts and layout knobs and **sees nothing
happen**. The knobs work; the merchant is simply looking at the wrong surface.

**The premise is verified, not assumed.** `SpecTableEditor.tsx:52-58` passes
`engine.styling` — the live, unsaved working state — straight into
`<SpecTablePreview>`. The preview already reflects in-progress edits. So this step
adds no rendering, no mapping consumer, and no styling logic. It only changes
*which surface the merchant is looking at* at the moment they start styling.

If that premise is wrong — if the preview turns out to show only saved styling —
**this step is void and should not be built**, because showing the merchant a
stale surface is worse than showing them none.

## The design: per-tab view memory

Rather than a "force on entry" rule that fights the merchant's own clicks, each
tab remembers its own view.

| Tab      | Default view | Behaviour |
| -------- | ------------ | --------- |
| Content  | `edit`       | Merchant may switch to a device preview; that choice is remembered for Content. |
| Style    | `desktop`    | First entry lands on Desktop preview. Any later view choice is remembered for Style. |
| Settings | `desktop`    | Same as Style. |

Switching tabs restores that tab's remembered view. Switching views sets the
current tab's memory. That is the whole rule.

**Why this shape rather than "force to preview on entry":**

- It satisfies both halves of the ask without a conflict. Opening Style *does*
  land on a preview (Desktop by default), *and* a merchant who prefers Tablet gets
  Tablet on every subsequent visit.
- **Nothing is ever forced twice.** A "force on entry" rule re-overrides the
  merchant every time they return to Style, even though they told it Edit last
  time. Per-tab memory has no such fight — the merchant's last word on each tab
  is final.
- It fixes the symmetric dead end for free: leaving a device view for Content
  returns to `edit`, so the merchant who clicks Content to fix a typo gets the
  editable grid instead of a read-only preview.
- The view control stays **fully enabled on every tab**. Edit while on the Style
  tab remains one click away and stays put. Nothing is disabled or hidden.

**Cross-tab seeding is deliberately NOT done.** Picking Mobile on Content does not
seed Style's first entry. It is one more rule to explain and test for a gain the
merchant will not notice; Style's default is Desktop, full stop.

## Scope

**In:**

- Per-tab view memory in `EditorShell` (the shell already owns both pieces of
  state; this is a small change local to one component).
- Settings gets the same treatment as Style. The withdrawn step's rule names
  Style *and* Settings as preview-only, the mechanism is identical, and splitting
  them would leave a knob-bearing tab with the same dead end.
- A polite live-region announcement when the view changes *programmatically*
  (see a11y below).

**Out:**

- Any change to what a preview renders, to `tableStylingCss.ts`, to
  `previewStyles.ts`, to the Liquid, or to the grid.
- Persistence across page loads or across templates. The memory is component
  state and resets to Content/`edit` on mount. No schema, no localStorage, no
  server round trip.
- Any change to the two segmented controls' markup, ARIA roles, or keyboard
  behaviour.

**Housekeeping to land inside this step:** `tableStylingCss.ts`'s header comment
still promises "the live editing grid (Step 11)" as a third consumer of the
mapping. That is stale (see `67-…`) and invites a future reader to "finish" the
withdrawn work. Correct the comment to name the two real consumers.

## Accessibility

The view segmented control is a WAI-ARIA radiogroup with roving tabindex. When a
tab click moves the checked segment, `aria-checked` moves **without focus moving**
— correct, since focus belongs on the tab the merchant just pressed, but it means
a screen-reader user gets no signal that the stage changed underneath them.

Announce the new view politely (`aria-live="polite"`), e.g. *"Desktop preview"* /
*"Edit"*. Announce **only** on a programmatic change: a merchant who clicked the
view segment themselves already knows, and the radio's own state change covers it.

Do not move focus into the stage. Do not trap focus.

## Verification

1. **Unit** — the per-tab memory is pure state logic; extract the reducer/helper
   so it can be tested without rendering Polaris web components
   ([[testing-strategy]]: jsdom cannot render them). Cover: first entry to Style
   → `desktop`; view choice on Style remembered across a Content round trip;
   Content's own memory independent; Edit chosen on Style stays on return.
2. **`npm run build`** — the only gate that catches CSS syntax errors, per the
   Step 11a/b post-mortem. Non-negotiable even though this step writes no CSS.
3. **Live on the dev store** — open Style from Content and confirm the stage shows
   the Desktop preview; change a colour and confirm it lands *without* touching
   the view control; click Edit and confirm the grid returns unstyled; round-trip
   through Content and back and confirm Edit stuck.

## Definition of done

- Opening Style or Settings from Content lands on a preview.
- Every tab remembers its own last view; nothing is re-forced.
- Returning to Content from a preview restores the editable grid.
- The grid renders **identically to Step 10** — verified by diffing
  `SpecTableEditor.module.css` and `RowGrid.tsx` against `a7b304c`, which must
  show **no change**. This step must not become the withdrawn one by the back door.
- Suite green (812 tests / 34 files as the floor), `npm run build` passes,
  `progress-tracker.md` updated.

## Pointers

- The withdrawn Step 11 and its binding rule → `context/features/67-…`
- Step 10 (the last step that added knobs) → `context/features/66-…`
- Step 12 (Reset + a11y + docs + B1 sign-off) — unaffected by this step.
