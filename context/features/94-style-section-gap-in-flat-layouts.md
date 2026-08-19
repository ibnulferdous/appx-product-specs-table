# Feature 94 — Section gap in the flat block layouts (Style tab)

**Status:** ✅ **COMPLETE 2026-07-28** — built, harness-measured, and live-verified
rail → preview → Postgres across all three row layouts. Tests 1101 → **1120**.
⚠️ One leg owed: the real-storefront render (needs an ACTIVE template; see
"Verification").
**Reported:** 2026-07-28, merchant DevTools screenshot of a live storefront table
with `margin-top: 30px` applied by hand to `tr.appx-spec-table__section-row`.
**Depends on:** feature 80 (the `sectionGapPx` knob), feature 85 (`GRID`),
feature 86 (the eight-group rail axis). Nothing new.
**Migration:** **none.** The column has existed since
`20260725181733_add_section_gap_styling`.
**Numbering:** takes **94**. 82 / 83 / 84 stay reserved (feature 81);
**93 is the accent / colour-theme feature** (renumbered 89 → 93 when feature 88's
step files took 89–92).

---

## The ask

> "I want to add the option of section gap. Many merchants may want to add gap
> between sections. It will help them present the data group wise and grouping
> will be more visible to the website visitors. I added `margin-top: 30px` to
> `.appx-spec-table__section-row` and it works."

The **knob already exists** — `sectionGapPx`, `Int?`, 1–48, shipped by feature
80, with a rail control labelled "Gap between sections" and a `--appx-spec-section-gap`
custom property already flowing rail → Postgres → metaobject → storefront. The
`accordion` preset already ships `sectionGapPx: 12`.

What does not exist is **access to it without collapsing**. The rail hides the
control unless `sectionsCollapsible` is on, so a merchant on a flat table cannot
reach a knob that would work for them. This feature is that fence, moved.

## Root cause — a true statement over-generalised

Three places assert the same claim, in almost the same words:

| site | claim |
| --- | --- |
| [spec-table.css:389](../../extensions/product-specs-table/assets/spec-table.css) | "In the flat shape a section header is a table row, which takes no margin at all" |
| [stylingControls.ts:461](../../app/routes/app.templates_.$id/stylingControls.ts) | "In the flat shape a section header is a table row, and a table row takes no margin at all" |
| [data-model.md:411](../data-model.md) | "only expressible when `sectionsCollapsible`, since a flat section header is a `<tr>` and a `<tr>` takes no margin" |

That is true **only in the `TWO_COLUMN` layout.** The flat shape emits one
`<tr class="appx-spec-table__section-row">` per section header
([specTablePreviewHtml.ts:184](../../app/routes/app.templates_.$id/specTablePreviewHtml.ts)),
but what that `<tr>` *displays as* is decided by the row-layout rules:

| row layout | `__section-row` display | margin? | why |
| --- | --- | --- | --- |
| `TWO_COLUMN` | `table-row` | ❌ | margin does not apply to internal table boxes |
| `STACKED` | `block` | ✅ | normal-flow block ([spec-table.css:527](../../extensions/product-specs-table/assets/spec-table.css)) |
| `GRID` | `block`, and a **grid item** of the `display: grid` tbody | ✅ | [spec-table.css:578](../../extensions/product-specs-table/assets/spec-table.css) |
| any layout ≤749px under `--mobile-stacked` | `block` | ✅ | [spec-table.css:666](../../extensions/product-specs-table/assets/spec-table.css) |

The merchant's screenshot is **`GRID`** — label above value, two tracks, the
section header spanning both. Their `margin-top` worked because in Grid the
section row is a grid item, and grid items take margin. The report is a correct
observation about a real hole in the reasoning, not a workaround that happened
to stick.

So feature 80 fenced the knob one notch too tightly: it excluded *the flat
shape*, when the thing that actually cannot express a gap is *the table
formatting context*.

## Vocabulary — 0 new columns, 0 new fields, 0 new predicates

| field | change | delivery |
| --- | --- | --- |
| `sectionGapPx` | **none** — same type, same bounds, same null semantics | same `--appx-spec-section-gap` var + `--section-gap` presence class |

This has the **feature-87 cost profile**, and for the same structural reason:
nothing about the value changes, only where it is reachable and what it paints.

- **no schema change, no migration** — so ⚠️ the stale-Prisma-client trap does
  not apply and the dev server needs no restart before the first save
- **no new field** in `STYLING_FIELD_NAMES` — the feature-86 drop guard, the
  `COLOR_KNOBS` grids and the metaobject payload are untouched
- **no new hide predicate** — `showsSectionGapControl` changes its *condition*,
  not its existence, so the pinned count **stays 7** and the 2⁷ empty-group test
  from feature 86 Step 5 keeps its shape
- **no Liquid, no extension TOML, no markup** — the seventh feature running that
  "server precomputes `styling_css`; Liquid only prints" has paid for
- **no repaint.** Every rule added is gated on `--section-gap`, which is emitted
  only when the merchant sets the knob. A table that has never touched it
  declares nothing new.

## The CSS — one rule, two selectors

Added directly beneath the existing feature-80 gap rule at
[spec-table.css:393](../../extensions/product-specs-table/assets/spec-table.css):

```css
.appx-spec-table--section-gap.appx-spec-table--layout-stacked
  .appx-spec-table__section-row:not(:first-child),
.appx-spec-table--section-gap.appx-spec-table--layout-grid
  .appx-spec-table__section-row:not(:first-child) {
  margin-block-start: var(--appx-spec-section-gap, 0);
}
```

Four decisions, each load-bearing:

**1. Layout-scoped, not written bare.** The unscoped form
(`.appx-spec-table--section-gap .appx-spec-table__section-row`) would be a
*silent no-op* in `TWO_COLUMN` — a declaration that reads as if it works
everywhere and quietly does nothing in the default layout. Naming the two
layouts makes the selector state the constraint it is subject to, which is the
same call the file already makes for `--mobile-same-as-desktop` being
deliberately rule-less.

**2. `:not(:first-child)`, matching the collapsible rule verbatim.** Same
purpose and same subtlety: rows can appear *before* the first section header, so
the sibling combinator would skip that boundary, and a leading gap inside the
frame is never wanted. In `STACKED` it does a second job — `tbody` is
`display: block` there, so a first-child top margin would **collapse out through
the tbody** and push the whole table down rather than open a gap.

**3. The two shapes can never both fire.** The flat renderer emits
`__section-row` and no `<details>`; the collapsible renderer emits
`__section-group` / `__section-summary` and **no `__section-row` at all**
([specTablePreviewHtml.ts:255](../../app/routes/app.templates_.$id/specTablePreviewHtml.ts)).
So there is no double-gap state to guard against, in any combination of
`sectionsCollapsible` × `rowLayout`. Worth pinning as a test rather than
re-deriving it from the renderer every time someone reads these two rules.

**4. `margin-block-start`, not `-end`.** Logical axis, RTL for free, and the
same side as the collapsible rule — so a merchant switching Collapsible on and
off sees the gap stay where it was rather than migrate to the other edge of the
section.

⚠️ **Two different mechanisms, one visible result.** In `STACKED` the gap is a
collapsed block margin (max of the adjoining margins); in `GRID` it is a grid
item margin, which never collapses. Both produce the merchant's 30px because
every neighbouring margin is 0 today. A future rule that gives `__row` a bottom
margin would change `STACKED` and not `GRID` — recorded so it is a decision then
rather than a surprise.

## The predicate

```ts
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible || styling.rowLayout !== "TWO_COLUMN";
}
```

**`!== "TWO_COLUMN"`, not `∈ {STACKED, GRID}`.** Same call feature 85 made for
`showsMobileLayoutControl`, inverted: the excluded case is the one with a
*reason* (a table formatting context), so a fourth `ROW_LAYOUTS` member added
later inherits "the gap works" by default, which is correct — any new layout
will be a block-ish one, since `TWO_COLUMN` is the only member that keeps
`display: table`.

**An OR, not a replacement.** `TWO_COLUMN` + collapsible-on still shows the
control and still works: the collapsible shape's `<details>` elements exist
regardless of row layout, so feature 80's original rule is untouched and every
table that has a gap today keeps it.

It stays a **pure read**, so the merchant's px value survives a round trip
through any hiding edit — the preserve-on-hide law, already enforced for it by
`VISIBILITY_PREDICATES`.

### 🚫 There is no mobile asymmetry, and the reason is the predicate

Worth stating explicitly, because it looks like a trap and isn't. The obvious
worry: a `TWO_COLUMN` table with `On mobile = Stacked` becomes `display: block`
under 749px, so a gap would appear on a phone and vanish on desktop — one
setting, two answers.

That state is **unreachable**. In `TWO_COLUMN` with collapsing off the control
is hidden, so `sectionGapPx` is never set there in the first place; and with
collapsing on, the gap comes from the `<details>` rule, which is not
breakpoint-sensitive. Every state the merchant can actually reach renders the
same gap at every viewport width:

| state | desktop | ≤749px |
| --- | --- | --- |
| `STACKED`, gap set | ✅ | ✅ (already block) |
| `GRID`, gap set | ✅ | ✅ (grid stays grid — feature 85 keeps it out of the media query) |
| any layout + collapsible, gap set | ✅ | ✅ (`<details>` rule) |
| `TWO_COLUMN`, collapsing off | control hidden — no value to disagree about | — |

## The rail — the control moves group

Feature 86's organising rule is **one axis: the object being styled**, and once
the gap no longer requires collapsing it is not a property of collapsing. It
moves:

- **from** `Collapsible sections` (which drops to 2 controls: the switch +
  "Sections start")
- **to** `Section headers` (which goes to 8)

No group empties out, so feature 86 Step 5's "no group may consist entirely of
hide-gated controls" invariant holds — `Collapsible sections` still leads with
its ungated switch. The Step-1 drop guard and the Step-4 per-group tests will
both flag the move, which is those guards working rather than an obstacle.

**Help text must change.** It currently reads:

| state | now | after |
| --- | --- | --- |
| `null` | "No gap between sections." | unchanged |
| set | "Space between each **collapsible** section." | "Space between each section." |

The word "collapsible" becomes false the moment this ships, and it is the kind
of stale gloss the feature-86 state-reporting idiom exists to prevent.

## `TWO_COLUMN` is deliberately excluded — and the rejection is already on file

The tempting fix was already considered and rejected in-repo, before this
report, at [stylingControls.ts:463](app/routes/app.templates_.$id/stylingControls.ts):

> 🚫 The tempting flat-shape approximation — a transparent `border-block-start`
> on the section cell — does not work either: under `border-collapse: collapse`
> the wider border wins the shared edge, so anything past 1px would silently
> delete the previous row's own divider.

That reasoning stands and this feature does not relitigate it. The four
mechanisms that can open vertical space above a row in a `display: table`:

| approach | verdict |
| --- | --- |
| `padding-block-start` on the section `th` | ❌ padding is *inside* the box, so under **Banded** the band simply gets taller — the wrong look on the default header style. Correct-looking under Plain / Underlined only, which makes it a knob that means two different things. |
| transparent `border-block-start` on the `th` | ❌ **already rejected** — collapsed-border width resolution eats the preceding row's 1px divider. |
| a spacer `<tr>` in the markup | ❌ injects a row with no cells into a `role="table"` / `role="row"` chain that feature 70 still owes a screen-reader pass on. A layout hack that lies to assistive tech. |
| `border-collapse: separate` scoped to the knob | ⚠️ **not evaluated** — see below. |

### The one option nobody has costed — recorded as an open question, not scope

The existing rejection assumes `border-collapse: collapse`, which is set
unconditionally at [spec-table.css:151](../../extensions/product-specs-table/assets/spec-table.css).
Under `border-collapse: separate` there is no shared edge to contest, so a
transparent top border on the section `th` plus `background-clip: padding-box`
would open a real gap with the band intact — and scoping it to
`.appx-spec-table--section-gap.appx-spec-table--layout-two-column` means **no
existing table changes border models**, so the no-repaint law survives.

Not scoped here, for three reasons:

1. It is a **different system boundary** — switching border models re-resolves
   every divider, the column rule and feature 78's outer border at once.
   Feature 86's lesson was that bundling boundaries is what makes a surface hard
   to reason about.
2. It needs a `.harness/` matrix first, and a real one — `border-spacing: 0`,
   the `LINES` divider on the last row of a section, the column rule at the
   label/value seam, and the outer border, across all three header styles.
3. **This feature is shippable and useful without it.** `STACKED` and `GRID` are
   the layouts the merchant is actually using, and they cost one CSS rule.

Recorded in `progress-tracker.md` as an open question so a later session
confronts it rather than rediscovering the `collapse` rejection and stopping
there.

## Build order

1. **CSS** — the rule above in `spec-table.css`, then re-mirror
   `previewStyles.ts`. ⚠️ **No backticks in the new comments** (the trap that
   fired on features 81 and 85 — the regeneration script refuses to run when the
   CSS contains one). Use the script, do not hand-edit.
2. **Predicate** — `showsSectionGapControl`, and rewrite the doc comment above
   it: the "unexpressible in the flat shape" paragraph becomes "unexpressible in
   a table formatting context", and the 🚫 border note is kept but re-pointed at
   `TWO_COLUMN` specifically, with a pointer to the `separate` open question.
3. **Rail** — move the control from the `collapsibleSections` group to
   `sectionHeaders` in `StyleTab.tsx`, update its help text, update the block
   comment at [StyleTab.tsx:843](../../app/routes/app.templates_.$id/StyleTab.tsx)
   (it currently states the "harder reason" that this feature retires).
4. **Docs** — `data-model.md:404` and `:411`, and `admin-screen-plan.md` §Tab 2
   (whose group table lists the gap under Collapsible sections). Amend at the
   head of the list, the convention that doc already uses.

Steps 1 and 2–3 are independently verifiable and could split if step 1's harness
turns up anything, but they do not cross the admin / storefront boundary that
`ai-workflow-rules.md` requires a split for — the storefront half is CSS only,
with no Liquid change.

## Tests

Estimated **+12–16** (from 1101; the real number gets recorded on completion).

- **`specTableCssContract.test.ts`** — the gap rule declares
  `margin-block-start: var(--appx-spec-section-gap…)` for both new selectors;
  each is gated on **both** `--section-gap` and its layout modifier (a rule that
  lost its layout class would silently claim `TWO_COLUMN`); `:not(:first-child)`
  present on both. The `variant({ sectionGapPx: 1 })` entry at line 61 and the
  note at line 299 both need revisiting — the latter currently explains that the
  other variants leave the gap at `null`.
- **`stylingControls.test.ts`** — the `VISIBILITY_PREDICATES` entry gains a
  `GRID`-visible fixture; the count assertion **stays at 7**; and a new case:
  visible under `STACKED` and `GRID` with collapsing **off**, hidden under
  `TWO_COLUMN` with collapsing off, visible under `TWO_COLUMN` with collapsing
  **on** (the OR, which a `!== "TWO_COLUMN"`-only predicate would fail).
- **`styleTabContract.test.ts`** — the gap control renders under the
  `sectionHeaders` heading, not `collapsibleSections`. This is what makes the
  move a checked change rather than a silent one.
- **the shape-exclusivity pin** — the flat renderer emits `__section-row` and no
  `__section-group`; the collapsible renderer emits `__section-group` and no
  `__section-row`. Derived from `specTablePreviewHtml.ts` output, so the
  no-double-gap claim in "The CSS" §3 is measured rather than argued.

✅ **Mutation-test before signing off**, per the standing practice: dropping the
`--layout-grid` selector must fail with `grid` named in the diff, and reverting
the predicate to `sectionsCollapsible` must fail the `STACKED`-with-collapsing-off
case.

## Verification — ✅ done 2026-07-28

### The harness (`.harness/feature-94.html`, 8 cases, measured not eyeballed)

Real `spec-table.css`, renderer-exact markup, `--appx-spec-section-gap: 30px`,
computed styles read at 1:1.

| case | result |
| --- | --- |
| `STACKED`, first element IS a section header | margin `0px`; **table top offset identical to the no-gap control** — the collapse-out-through-`tbody` hazard closed by measurement, not argument |
| `STACKED`, rows BEFORE the first section header | **both** boundaries `30.0px` — the case an adjacent-sibling combinator would skip |
| `GRID` | `30.0px`, spanning every track |
| `TWO_COLUMN` | **`-0.0px`** — the deliberate no-op; layout scoping correct |
| `LINES` / `STRIPES` / `NONE` | `30.0px` in all three |
| no gap set (control) | margin `0px`, offset unchanged — the no-repaint claim |

🔍 **The stranded-rule question is answered NO, and by computed style rather than
by looking** (the feature-88 lesson about low-contrast fills in downscaled
screenshots). The last row before a gap keeps
`border-bottom: 0.909px solid rgba(0, 0, 0, 0.1)` under `LINES` — **identical to
the same table with no gap** — so the gap changes spacing and nothing else. Under
`STRIPES` and `NONE` the value is `0px none`: no rule exists to strand.

### Live, on `Untitled template (copy)` (DRAFT, 0 assignments)

- ✅ **Two-column + collapsing off** → the gap control is **absent** from Section
  headers (group runs Header style → … → Title spacing → colors). The excluded
  state, confirmed by eye.
- ✅ **Stacked** → the control appears **inside Section headers**, between Title
  spacing and the colour swatches, reading `0` / "No gap between sections."
- ✅ **Set 30** → the preview separates the two sections, and the help text reads
  **"Space between each section."** — the stale "collapsible" wording gone.
- ✅ **Grid** → two tracks with the gap spanning both. The merchant's own case,
  now driven by the knob instead of hand-edited DevTools CSS.
- 🔴 **The round trip is the one that mattered.** Switching to Two-column hides
  the control; enabling collapsing there brings it back **still reading 30**, with
  feature 80's `<details>` rule painting the gap. Preserve-on-hide and the OR's
  left side, both observed live rather than only unit-tested.
- ✅ **Postgres after save:** `sectionGapPx = 30`. **Restored afterwards** —
  `rowLayout` and `sectionGapPx` both back to `null`, every other `TableStyling`
  column byte-identical to before.
- ⚠️ **Left in place:** the content rows added to that throwaway scaffold to give
  it a second section (`Basic Information` / Weight / `Physical Description` /
  Dimensions).

### ⚠️ Owed — the real-storefront leg

Not run. It needs an ACTIVE template, and the dev store's ACTIVE templates are in
merchant use. Low risk by construction — the editor preview renders through the
same `renderSpecTablePreviewDocument` and a byte-mirrored copy of the same
stylesheet, both guarded by tests — but it is **owed, not passed**. What it would
add: the gap on a real product page and at 390px, resizing the real storefront tab
rather than the admin iframe (see the `browser-verify-embedded-app` memory).

### 🔴 Method note

Blind `Shift+Tab` repeats in the embedded admin walk focus out of the app iframe
unobserved. Worse: a template's DRAFT→ACTIVE change was read as self-inflicted and
raised as an alarm when it was the merchant's own concurrent work. **Check the
mechanism against how the app actually saves — SaveBar-gated, explicit Save;
`Shift+Tab` cannot activate anything — before attributing a write.** Tab in small
batches with a screenshot after each.

### The original plan (kept as the record)

Then live, on a DRAFT template with 0 assigned products:

- Rail shows "Gap between sections" under **Section headers** with collapsing
  **off**, in both `STACKED` and `GRID`; disappears on switching to
  `TWO_COLUMN`; reappears on enabling collapsing there.
- The px value survives that round trip (the preserve-on-hide law, observed
  rather than only unit-tested).
- Postgres: `sectionGapPx` is the **only** column the save touches.
- On the wire: `styling` overrides-only, `styling_css.classes` carries
  `--section-gap`, and `vars` carries `--appx-spec-section-gap` — the presence
  class *and* the property, which is what distinguishes this knob from
  feature 87's pure modifier.
- Rendered on the real `appx-dev.myshopify.com` storefront, not the editor
  mirror — and **at 390px**, resizing the real storefront tab rather than the
  admin iframe (see the `browser-verify-embedded-app` memory).
- Revert and confirm every other `TableStyling` column byte-identical.

## Invariants respected

- `SpecTableEditor.module.css` / `RowGrid.tsx` untouched — the Edit grid still
  never reflects merchant styling (tripwired byte-clean against `a7b304c`).
- `previewStyles.ts` re-mirrored; the byte-exact drift guard in
  `specTablePreviewHtml.test.ts` must pass.
- No repaint: every new declaration is gated on a presence class emitted only
  when the knob is set.
- No contrast checking; no new colour knob — the gap is whitespace and reads
  whatever the theme paints behind the table.
