# Feature 85 — Multi-column row flow (Style tab)

**Status:** 📋 **specced, not built.** ⚠️ Gated on the feature-70 screen-reader pass —
see "The one blocking dependency".
**Reported:** 2026-07-26, merchant sent five competitor spec tables laying their
rows out in 2–3 side-by-side tracks and asked whether this app can do the same.
**Depends on:** feature 57 Step 8 (`rowLayout`, the stacked shape) + feature 70
(the unconditional ARIA role chain). Nothing new.
**Migration:** `add_grid_min_column_width_styling` (**one** additive column —
`rowLayout` is a validated `String?`, not a Prisma enum, so a third member costs
no migration).
**Numbering:** takes **85**. 82 / 83 / 84 stay reserved for the band-radius /
chevron / open-close-animation units proposed in `81-…`; renumbering live
proposals to close a gap is not worth it, and the tracker already treats a spent
number as spent.

---

## The ask

Five reference tables, and they are **not all the same feature**. Sorting them by
what unit is being laid out:

| reference | sections? | unit laid out | fill order |
| --- | --- | --- | --- |
| screenshot 1 (Samsung-style) | yes, full-width | one label/value pair | across, then down |
| screenshot 2 (marketplace PDP) | no | one label/value pair | across, then down |
| screenshot 4 (Dell) | no | one label/value pair | **down, then across** |
| screenshot 3 (retailer, Apple product) | yes | **a whole section** | balanced two tracks |
| screenshot 5 (Amazon) | yes | **a whole section** | two tracks |

**This feature is the first three — "Type A", where the unit is a pair.**
Screenshots 3 and 5 are section-level flow ("Type B") and are deliberately out of
scope; see the bottom of this doc for why they cost 3–4× as much.

### What it actually buys

A height fix, not a decoration. The DJI template on the dev store is 44 rows —
44 lines of vertical page. At three tracks that is ~15, and everything below the
spec table (reviews, related products) moves up a screen and a half. That is the
whole merchant case, and it is why the feature is worth building even though a
minority of catalogs need it.

---

## Why it is cheap here specifically

The stacked shape already did the hard part. `--layout-stacked` sets
`display: block` on the table, tbody, rows and cells — a pair is **already** a
nested block box in that mode. Multi-column is that same shape plus "flow the
boxes into tracks".

- **No Liquid change, no extension TOML change, no metaobject-shape change.** The
  fifth feature in a row the "server precomputes `styling_css`; Liquid only
  prints" pipe pays for.
- **No markup change**, so `specTablePreviewHtml.ts` and `spec_table.liquid` stay
  hand-mirrored without either being touched.
- **No repaint.** `GRID` is a new, non-default member of an existing keyword
  union; every table that exists today keeps `TWO_COLUMN` and renders
  byte-identically.
- **The a11y mechanism already exists.** The ARIA chain
  (`table`/`rowgroup`/`row`/`rowheader`/`cell`) is emitted unconditionally
  precisely because `display: block` strips implicit table semantics, and
  `specTableAriaContract.test.ts` already enforces "a class that changes
  `display` must carry a role". That guard extends to `display: grid`; it is not
  a new mechanism.

---

## Vocabulary

### 1. `GRID` joins `ROW_LAYOUTS` — it is not a separate orthogonal knob

```ts
export const ROW_LAYOUTS = ["TWO_COLUMN", "STACKED", "GRID"] as const;
```

A pair renders exactly one way, so "how does a pair render" is one question with
three answers. Making `GRID` a *member* buys mutual exclusivity **by
construction**: there is no such thing as two-column-and-grid, and a separate
boolean would have to forbid that combination with a hide predicate and a test.
This is the feature-79 call again — the knob that cannot express the ugly case is
the right knob.

It also inherits three things free: `rowLayoutClass()` is a total switch (adding
a member without a class is a compile error), `serializeStylingOverrides` omits
it while it is the default, and `showsLabelWidthControl` already reads
`rowLayout === "TWO_COLUMN"`, so the label-width box hides for `GRID` **with zero
code change**.

### 2. `gridMinColumnWidthPx Int?` — a MINIMUM WIDTH, not a column count

| field | type | null means | CSS var |
| --- | --- | --- | --- |
| `gridMinColumnWidthPx` | `Int?` 160–640 | the stylesheet's own `240px` | `--appx-spec-grid-min-column` |

```css
grid-template-columns: repeat(
  auto-fit,
  minmax(var(--appx-spec-grid-min-column, 240px), 1fr)
);
```

**This is the single most important decision in the feature, and it is not a
taste call.** A literal "3 columns" knob is wrong three ways, and a minimum width
fixes all three at once:

- **Responsiveness comes free.** At a 375px viewport `minmax(240px, 1fr)` fits
  exactly one track. Below the 749px breakpoint the grid collapses to a single
  column *with no media query at all*, which is why this feature adds nothing to
  the `@media` block at the bottom of `spec-table.css`.
- **It cannot produce the unreadable case.** A merchant who picks "3" and has a
  600px theme container gets three 200px tracks with wrapped-to-death values. A
  merchant who picks a 240px minimum gets two tracks there and three on a wide
  page, and never gets a track too narrow to read.
- ⚠️ **It is what keeps the editor preview honest.** The inline Desktop preview
  is ~640px on a laptop (feature 76's measured limit), so a *count* knob would
  render 3 tracks in the preview and 3 tracks on a 1400px storefront while
  looking completely different in each — the preview would be lying about
  spacing. A *minimum-width* knob makes the preview truthful by construction:
  it is showing what a 640px container does with that minimum, which is exactly
  what a 640px storefront would do. **A count knob would make the preview lie.
  This one does not.** Recorded because it is the reason to reject the obvious
  design.

Bounds: floor **160** (below that a label and its value are unreadable at any
theme font size — the same usability-guard reasoning as
`TABLE_MAX_WIDTH_PX_MIN`), ceiling **640** (past that on a 1440px page you get
two tracks and the knob has stopped being a multi-column control).

**Null vocabulary:** null = the stylesheet's `240px` literal, i.e. feature 81's
`headerPaddingBlockPx` vocabulary, **not** feature 78's "null = off". There is no
off state — grid mode always has a minimum. Nothing keys a presence flag on this
field (the `--layout-grid` class is the gate), so feature 78's minimum-of-1 law
does not reach it; the floor is a usability number, not a modelling constraint.

### ⚠️ Naming: "column" is already spoken for

`columnDividerStyle` means **the label/value seam** — the opposite sense of
"column" from this feature's tracks. The `grid` prefix is what disambiguates, the
same way the `header*` prefix groups the section-header family. Do not add a
field called `columnCount`, `columns`, or `columnWidth` to this schema; a reader
six months out cannot tell which sense is meant.

---

## Fill order: across-then-down only. Screenshot 4's order is rejected.

Screenshot 4 fills **down then across** — read its first track top to bottom and
you get Processor → OS → Graphics → Display → Memory → Storage before the second
track starts. That is CSS multicol (`columns: 3`), not grid, and it is one
property away.

🚫 **Not shipping it, and the reason is a11y, not cost.** This markup declares
itself a table via `role="table"` / `role="row"` / `role="rowheader"`. A screen
reader announces **DOM order**. Grid's across-then-down flow keeps DOM order and
visual order identical, so what a sighted shopper reads and what a screen-reader
shopper hears are the same sequence. Multicol's down-then-across flow makes them
diverge — the third pair is announced third but appears at the top of the second
track — while the ARIA chain keeps insisting it is a table. Shipping a layout
that makes the ARIA claim *false* is not a knob, it is a defect.

There is also a structural blocker: multicol spans use `column-span: all`, which
does not compose with `grid-column: 1 / -1`, so section headers would need an
entirely parallel rule set. Two reasons, either sufficient.

---

## The rules

Placed in the layout block of `spec-table.css`, **after** the divider/density
blocks and **before** the `@media` block, exactly where `--layout-stacked` sits
and for the same reason: several of these rules must beat a divider member at
equal specificity by source order.

```css
/* --- Row layout: GRID -------------------------------------------------------
   Pairs become blocks (as in --layout-stacked) and the tbody becomes the grid
   that flows them. auto-fit + minmax is the whole responsive story: the track
   count falls out of the available width, so this layout needs no media query
   and no mobile variant. */
.appx-spec-table--layout-grid .appx-spec-table__table,
.appx-spec-table--layout-grid .appx-spec-table__section-row,
.appx-spec-table--layout-grid .appx-spec-table__row,
.appx-spec-table--layout-grid .appx-spec-table__section,
.appx-spec-table--layout-grid .appx-spec-table__label,
.appx-spec-table--layout-grid .appx-spec-table__value {
  display: block;
}

.appx-spec-table--layout-grid .appx-spec-table__table tbody {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(var(--appx-spec-grid-min-column, 240px), 1fr)
  );
}

/* A section header interrupts the flow and claims every track — the screenshot-1
   look. 1 / -1 addresses the explicit track lines that auto-fit generates. */
.appx-spec-table--layout-grid .appx-spec-table__section-row {
  grid-column: 1 / -1;
}

/* Identical to the stacked refinements, and for identical reasons: the pair must
   read as one unit, so the label drops its own bottom rule and the value is
   pulled toward it. border-inline-end goes for the third time here — a grid cell
   is a full-width block with its value underneath, so there is no label/value
   seam for a column rule to sit on and a survivor paints as a stray stub. Equal
   specificity to the column-divider rule earlier in the file, so source order
   drops it; no importance override, per this file's design rules. */
.appx-spec-table--layout-grid .appx-spec-table__label {
  width: auto;
  border-block-end: none;
  border-inline-end: none;
}

.appx-spec-table--layout-grid .appx-spec-table__value {
  padding-block-start: 0.25rem;
}

/* Zebra striping is DOM-order parity, and in a multi-track grid DOM-order parity
   paints a checkerboard rather than alternating rows — nth-child cannot know how
   many tracks the browser chose. The fill stands down; the LINES and NONE
   members are unaffected and both behave correctly here. */
.appx-spec-table--layout-grid.appx-spec-table--dividers-stripes
  .appx-spec-table__label,
.appx-spec-table--layout-grid.appx-spec-table--dividers-stripes
  .appx-spec-table__value {
  background: transparent;
}
```

⚠️ **`tbody` is deliberately absent from the first selector list** (contrast the
stacked rule, which includes it) — it takes `display: grid` in the second rule
instead. Listing it in both is a same-specificity source-order accident waiting
to happen.

⚠️ **The stripe rule is two classes on the wrapper plus a descendant**, so it
ties with the `--dividers-stripes` fill rule and wins on source order alone. That
is the feature-79 hazard exactly: breaking it is *invisible* (the checkerboard
reads as a deliberate design), so it needs a test that pins the ordering, not
just one that pins the rule.

---

## Interaction checklist

| interaction | expectation | code needed? |
| --- | --- | --- |
| `columnDividerStyle = LINE` | dropped — no seam in a stacked pair | yes, in the rule above (source order) |
| `rowDividerStyle = LINES` | hairline under each pair; correct as-is | no |
| `rowDividerStyle = STRIPES` | fill stands down; help-text caveat | yes, rule + caveat |
| `rowDividerStyle = NONE` | correct as-is | no |
| `labelWidthPct` | control hides — `showsLabelWidthControl` already reads `=== "TWO_COLUMN"` | **no** |
| `mobileLayout` | control hides — grid is already responsive | yes, extend `showsMobileLayoutControl` |
| `density` | owns row-cell padding; applies to the blocks | no |
| `sectionsCollapsible` | each `<details>` owns its own table, so the grid applies *within* a section — screenshot 1 with disclosures. Wanted, and free | no |
| `sectionGapPx` | unchanged; margin between disclosures, outside the grid | no |
| `tableMaxWidthPx` / `tableAlign` | wrapper-level; unaffected | no |
| `--outer-border` last-row rule | ⚠️ its three selectors assume `tr:last-child` is visually last. In a grid the last DOM row is the bottom of the **last track**, not the bottom-left. Verify in the harness | maybe |
| `--outer-radius` + `overflow: hidden` | unchanged | no |
| section header typography (81) | full-width band in every shape; all five apply | no |
| feature-80 separator | collapsible-only, outside the grid | no |
| feature-74 R1/R2 gates | render-time; hidden rows simply do not become grid items, and the flow closes up **for free** — a server-side column split would have to rebalance per product per pageview | no |
| RTL | grid flows in writing direction; `border-inline-end` already logical | no |
| Edit grid | unchanged — the binding rule holds, tripwired files untouched | no |

---

## The one blocking dependency

🔴 **Do not ship this before the feature-70 screen-reader pass is run.**

The tracker carries feature 70 as an open red item: the ARIA role chain is
shipped and inert, but **no assistive technology has ever confirmed the pairs are
announced**, and the spec's own falsifier — that explicit ARIA can *suppress*
native table affordances — is unchecked. This feature adds a **third** departure
from `display: table` on top of an unverified claim about the second.

If the pass finds the roles are wrong, feature 70's own instruction is "revert
(`<dl>` back on the table) — do not patch". Building a third consumer of that
mechanism first means the revert gets more expensive rather than less.

**Sequencing:** run the NVDA/VoiceOver pass at desktop **and** ≤749px, then build
this. If the pass comes back clean, this feature adds one line to the contract
test and inherits a validated mechanism. That is the difference between a cheap
feature and a risky one, and it is entirely a sequencing choice.

---

## The controls

**Row layout** gains a third option in the existing select:

| option | help text |
| --- | --- |
| Two column | *(unchanged)* |
| Stacked | *(unchanged)* |
| **Grid** | "Labels sit above their values and flow into as many columns as fit." |

**Minimum column width** — a new `s-number-field`, suffix `px`, blank = default,
directly under Row layout, visible only in Grid mode.

- Help text (null): "Columns are at least 240px wide."
- Help text (set): "Columns are at least this wide (160–640). Fewer, wider
  columns on narrow screens."
- Uses `toBoundedIntControlValue` / `fromBoundedIntControlValue` — the **blank
  box** idiom, not zero-means-off. `0` here is not a spelling of anything; it
  would mean unbounded track count, which is the unreadable case the floor
  exists to prevent.

**Row dividers** gains a caveat on its Stripes option: "Stripes are off in Grid
layout." This is the feature-79 precedent — a knob that does nothing in one shape
carries the caveat in its own help text and a test pins it as a shipped
requirement, rather than growing a hide predicate for one option of one select.

### Hide-rule count goes 6 → 7

| predicate | change |
| --- | --- |
| `showsLabelWidthControl` | **none** — already `rowLayout === "TWO_COLUMN"` |
| `showsMobileLayoutControl` | **extend** — `!== "STACKED"` becomes `=== "TWO_COLUMN"` |
| `showsGridMinColumnWidthControl` | **new, 7th** — `rowLayout === "GRID"` |

The new one is warranted where feature 79 declined: a minimum-column-width box
with no grid to apply to is not a knob whose effect is invisible, it is a knob
with no referent. It must be a pure READ and inherit the preserve-on-hide law by
adding one row to `VISIBILITY_PREDICATES` — a merchant's 320px survives a trip
through Two column and back.

⚠️ `stylingControls.test.ts:965` asserts `toHaveLength(6)`. That assertion is
doing its job when it fails here; update it to 7 with a comment naming this
feature, exactly as feature 81 did at 6.

---

## What must NOT change

- **No Liquid change, no extension TOML change, no markup change** in either
  hand-mirrored renderer. If the build wants one, stop — something in the plan is
  wrong.
- **No `!important`**, anywhere. Every conflict above is resolved by source order
  at equal specificity, per the file's design rules.
- **No media query.** `auto-fit` is the responsive behaviour. Adding a
  `--layout-grid` rule inside the `@media` block means the minimum-width design
  was misunderstood.
- **No repaint.** `TWO_COLUMN` is untouched; the only new var has a literal
  fallback.
- `SpecTableEditor.module.css` / `RowGrid.tsx` stay byte-clean against `a7b304c`.
- `previewStyles.ts` is a **verbatim mirror** of `spec-table.css` — every CSS edit
  must be copied across or the byte-exact drift guard in
  `specTableCssContract.test.ts` fails. ⚠️ And no backticks in the new comments
  (feature 81's build log, trap 1).

---

## Build order

Each step ends green on the full gate (typecheck · lint · format · test · build).

0. **⚠️ Feature-70 screen-reader pass.** Blocking — see above. Not part of this
   feature's diff, but nothing below starts until it is green.
1. **Domain** — `tableStyling.ts`: `"GRID"` appended to `ROW_LAYOUTS` (appended,
   never inserted — first member is the default);
   `GRID_MIN_COLUMN_WIDTH_PX_MIN/MAX` = 160/640; `gridMinColumnWidthPx` in
   `StylingValues` + `STYLING_FIELD_NAMES` (immediately after `rowLayout`, ahead
   of the colour block — it is not a colour, so the derived-`COLOR_KNOBS`-order
   test is unaffected); `DEFAULT_STYLING_VALUES` null; `parseStylingValues` via
   `parseBoundedInt`.
2. **Mapping** — `tableStylingCss.ts`: one `SPEC_TABLE_CSS_VARS` entry;
   `gridMinColumnWidthPx` appended to the `pxFields` loop; `rowLayoutClass` gains
   the `GRID` case (a compile error until it does — that is the design working).
   **No new presence flag.**
3. **CSS** — the rules above in `spec-table.css`, `previewStyles.ts` mirror
   regenerated, contract tests updated. **Run the harness here, before any
   persistence work** — this is the step that can invalidate the design.
4. **Persistence** — `prisma/schema.prisma` one column + migration
   `add_grid_min_column_width_styling`; `template.server.ts` column type + one
   `stylingToDbColumns` line. No enum migration: `rowLayout` is a `String?` with
   app-side validation.
5. **Rail** — `stylingControls.ts`: `ROW_LAYOUT_OPTIONS` third entry,
   `fromGridMinColumnWidthControlValue`, `showsGridMinColumnWidthControl`,
   `showsMobileLayoutControl` extended, Stripes caveat; `StyleTab.tsx` one new
   number field under Row layout.

> ⚠️ **Restart `shopify app dev` after step 4.** Vite HMR reloads app code but not
> `@prisma/client`, so the first save after a migration fails **silently** — the
> SaveBar keeps reading "Unsaved changes", no toast, no error. Hit on 78, 79, 80
> **and** 81; assume it will happen. Discriminator: run the upsert from a fresh
> `node -e`; if that writes, the server is merely stale. Also `prisma generate`
> may report `EPERM … query_engine-windows.dll.node` while having already
> rewritten the types — do not loop on it.

> ⚠️ **`s-number-field` commits on blur, not per keystroke.** The new box will do
> this. Not a bug.

---

## Tests to add

| file | assertions |
| --- | --- |
| `tableStyling.test.ts` | `GRID` parses and round-trips; `TWO_COLUMN` still the default (pinned — an accidental reorder would repaint every table); `gridMinColumnWidthPx` clamps at 160/640, non-integer/NaN/string → null, omitted from overrides when null |
| `tableStylingCss.test.ts` | `GRID` → `--layout-grid`; the var emitted iff non-null with a `px` suffix; **no new presence flag** — modifier output for a grid table is the same length as for a two-column one |
| `stylingControls.test.ts` | `VISIBILITY_PREDICATES` length **7** (update 965); the new predicate registered so it inherits the preserve-on-hide law; `showsMobileLayoutControl` false for `GRID`; `showsLabelWidthControl` false for `GRID` (free, but pin it); the Stripes caveat string present |
| `specTableCssContract.test.ts` | the grid rule set present with the `240px` literal fallback; `grid-column: 1 / -1` on the section row; **the stripe-standdown rule appears AFTER the `--dividers-stripes` fill rule** — the invisible-when-broken ordering; `border-inline-end: none` present in the grid label rule; **no `--layout-grid` selector inside the `@media` block**; previewStyles drift (existing, automatic) |
| `specTableAriaContract.test.ts` | extend the `display: block` scan to `display: grid`; `--layout-grid` classes all carry a role |
| `templateSync.test.ts` | the all-fields fixture gains `gridMinColumnWidthPx: null` |

Expect roughly **943 → ~965**. Budget for the pre-existing totality guards to
fire across five all-fields fixtures on the first run — that is them working, not
breakage (feature 81 build log, item 2).

---

## Live verification plan

Harness **first**, same shape as 78/79/80/81, so the storefront pass confirms
rather than explores.

1. Migration non-repainting: `TableStyling` rows with `gridMinColumnWidthPx`
   non-null must be **0**; rows with `rowLayout = 'GRID'` must be **0**.
2. **CSS harness against the real `spec-table.css`.** The cases that can
   invalidate the design, in order of risk:
   - `grid-column: 1 / -1` under `auto-fit` — does a section header actually span
     every track? This is the one unproven interaction.
   - The **`--outer-border` last-row rule** in grid mode: `tr:last-child` is the
     bottom of the last *track*, so confirm whether the dropped bottom rule looks
     right or leaves one visually-bottom pair with a rule and another without. If
     it looks wrong, that is a real finding and belongs in this feature.
   - Track count at container widths 1440 / 900 / 640 / 375 at minimums 160 /
     240 / 400 / 640 — the whole responsive claim, measured.
   - Stripes: confirm no fill in grid mode, and confirm the source-order
     dependency **observably** (swap the class order live, watch the checkerboard
     appear) as feature 79 did.
   - Column divider dropped; no stray vertical stub at any track edge.
   - Collapsible + grid: grid applies within each `<details>`.
   - An all-`TWO_COLUMN` control case measured byte-identical to today.
3. Rail: third Row layout option, the new box appearing only in Grid mode,
   label-width and On-mobile both disappearing, help text in both states.
4. Round trip on the ACTIVE DJI template (44 rows, 9 sections — the real
   height case): rail → Save → Postgres → metaobject (`styling` overrides-only
   carrying `rowLayout: "GRID"`, `styling_css.classes` carrying `--layout-grid`
   in field order, `.vars` carrying `--appx-spec-grid-min-column` only when set)
   → rendered Horizon storefront.
5. **Measure the height win** on that storefront — table height in `TWO_COLUMN`
   vs `GRID`. The merchant case is a number; report the number.
6. Mobile ≤749px. ⚠️ `resize_window` does not reflow the viewport (feature 79);
   use the editor's **Mobile device preview**, or a harness at a genuinely narrow
   `innerWidth` with a computed-style probe proving the reflow fired (feature 81's
   fallback). The claim to check is that grid collapses to **one** track with no
   media query involved.
7. Edit grid unchanged; tripwired files byte-clean against `a7b304c`.

---

## Open decisions — need merchant sign-off before step 1

1. **Default minimum: 240px?** It gives 2 tracks at ~640px and 3 at ~1100px on a
   typical theme. Lower reads denser, higher reads safer. Cheap to change now,
   a repaint later.
2. **Stripes in Grid: stand down, or hide the option?** This doc specs stand-down
   plus a help-text caveat (the feature-79 precedent). The alternative is a
   `GRID`-aware Row-dividers list, which means the first per-option hide in the
   rail — more machinery than the case is worth, but it is the merchant's call.
3. **Does Grid belong in a B2 preset?** Screenshots 1 and 4 *are* a preset
   ("Compact grid" / "Two column grid"). If yes, this must land before B2 bakes
   `stylePresets.ts`, for exactly the reason feature 81 landed before B2.

---

## Deliberately out of scope

- **Type B — section-level multi-column** (screenshots 3 and 5), where whole
  sections flow into tracks. In the **collapsible** shape it is nearly free —
  each section is already a `<details>` with its own table, so `columns: 2` +
  `break-inside: avoid` on `.appx-spec-table__section-group` gets most of the
  look. In the **flat** shape it requires emitting one `<table>` per section
  unconditionally, which means a real change to `spec_table.liquid` **and** its
  hand-mirror, a new per-section `aria-label` (the split costs the
  `th scope="colgroup"` heading, the trade Step 9a already made once), and it
  **repaints every existing flat table** — breaking the no-repaint law that 78 /
  79 / 80 / 81 all honoured. A markup unit of its own, not a styling knob. If it
  is ever wanted, the cheap 80% is "collapsible only".
- **Down-then-across fill order** (screenshot 4) — rejected on a11y grounds
  above, not cost. Do not reopen it as "one CSS property"; the property is not
  the problem.
- **Per-section column counts.** A different count for Camera than for Display
  means a per-row-JSON field, which is content, not styling. Phase C at the
  earliest.
- **Explicit column count as a second knob** alongside the minimum. Two ways to
  say one thing, and the count is the one that makes the preview lie.
- **Balanced-height tracks** (screenshot 3's masonry look). That is Type B, and
  it needs `grid-template-rows: masonry` or JS. Not on the table.

---

## Docs to update when this ships

- `context/progress-tracker.md` — Completed entry; Next Up.
- `context/data-model.md` §5 (`TableStyling` — the new column and the third
  `rowLayout` member) + §10 (styling delivery).
- **B2 preset bundles** if open decision 3 comes back yes.
