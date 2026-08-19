# Feature 85 — Multi-column row flow (Style tab)

**Status:** 🛠️ **built 2026-07-26, full gate green (943 → 981 tests), CSS harness
run.** ⚠️ **Not signed off:** the feature-70 screen-reader pass below is still
owed, and it was a blocker in the plan. Built ahead of it at the merchant's
explicit instruction; do not treat this as shipped until that pass is green.

## ⚠️ Build log — three plan corrections the harness found

All three were **invisible-when-broken** and none was predicted correctly on
paper. This is the entry to read first if you are changing these rules.

1. 🔴 **The stripe stand-down LOST on specificity, not source order.** The plan
   said the two rules "tie at equal specificity, so source order decides". They
   do not tie. The fill rule is **four** compound parts
   (`--dividers-stripes` + `__row` + `:nth-child(even)` + `__label`); the short
   stand-down form the plan specified is **three**, so it loses wherever it sits
   and the checkerboard paints anyway — measured red fills on alternating rows
   in the harness. Fix: the stand-down MIRRORS the fill rule's shape, including
   `:nth-child(even)`, making it five parts. It now wins on specificity, and the
   source order is kept as belt-and-braces. Demonstrated live by swapping the
   short form back in and watching the fills return.
   **Second benefit:** narrowing to even rows also stops it overreaching — the
   broad form would have wiped a merchant's own `labelBgColor` / `valueBgColor`
   in Grid mode, since the base `__label` rule is what carries them.
2. 🔴 **`minmax(<min>, 1fr)` overflows when the minimum exceeds the container.**
   Measured **25px** of horizontal overflow at a 400px minimum in a 375px
   container, and **265px** at 640 — both reachable from the rail's own 160–640
   range. Fix: `minmax(min(var(--appx-spec-grid-min-column, 240px), 100%), 1fr)`.
   `min()` picks the px value whenever it fits, so no wide-container track count
   changed (measured before and after); it only removes the overflow case.
3. 🟠 **The `--outer-border` last-row exception is wrong in grid** — the
   checklist flagged this as "maybe" and it turned out to be real. It assumes
   the last DOM row is the row against the frame; across tracks the last DOM
   pair is the bottom-RIGHT one. Measured `1px,1px,1px,0px` across the final
   track row: three pairs ruled, one not, which reads as a defect. CSS cannot
   select "every item in the last grid row", so the exception now stands down in
   grid via `:not(.appx-spec-table--layout-grid)` on all three of its selectors.
   Non-grid tables are untouched (the `:not()` only raises specificity).

⚠️ **The backtick trap fired again** (feature 81 build log, trap 1): a comment
written for the stripe rule contained a backticked CSS snippet, which breaks the
`previewStyles.ts` mirror. The regeneration script now refuses to run when the
CSS contains one, rather than relying on remembering.
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
   members are unaffected and both behave correctly here.

   The rail hides the Stripes option in Grid mode, so this rule is NOT dead
   defensive code: the rail is not the only writer. A saved template, a B2 preset
   and the orphan-value case (a merchant who chose Stripes before switching to
   Grid) all deliver this combination. This is where it is actually enforced. */
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
| `rowDividerStyle = STRIPES` | option hidden in the rail; fill stands down in CSS for the writers the rail does not own | yes, rule + derived option list |
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

**Row dividers** hides its Stripes option in Grid mode (merchant call
2026-07-26 — this doc originally specced the feature-79 caveat instead; the
merchant chose hiding). This is the **first per-option hide in the rail**, so the
mechanism is written down here rather than invented at build time.

⚠️ **The orphan-value case is what makes this more than a `.filter()`.** The
Row-dividers select stays on screen in Grid mode, and a merchant who chose
`STRIPES` on a two-column table and then switched to Grid has a stored value that
is no longer in the list. `StyleTab.tsx` binds `value={styling.rowDividerStyle}`
and `selectedHelpText` falls back to `""`, so a naive filter ships a **blank
select with a blank help line** — a visibly broken control.

Resolution: `rowDividerOptionsFor(styling)`, a derived list, replacing the bare
`ROW_DIVIDER_OPTIONS` constant at both StyleTab call sites (`details=` and the
`.map`). `ROW_DIVIDER_OPTIONS` stays exported as the unfiltered base.

- `rowLayout !== "GRID"` → all three, unchanged.
- `rowLayout === "GRID"` and the stored value is not `STRIPES` → Lines / None.
  Stripes is simply gone; this is every merchant who has not chosen it.
- `rowLayout === "GRID"` and the stored value **is** `STRIPES` → Lines / None
  plus a trailing `STRIPES` entry labelled "Stripes — not available in Grid",
  help text "Stripes do not apply in Grid layout. Pick Lines or None." The value
  displays honestly, the CSS has already stood it down, and picking anything else
  drops the entry for good.

🚫 **Not coercing the value on switch.** Forcing `STRIPES → LINES` when a merchant
picks Grid is the tidier-looking option and is rejected twice over: it destroys a
setting the preserve-on-hide law exists to protect, and it is a cross-field write
driven by a layout change, where every visibility rule in this rail is a pure
read.

⚠️ **The CSS stand-down rule still ships, and is now the enforcement rather than a
cosmetic caveat.** Hiding the option narrows the rail, not the data: a `GRID` +
`STRIPES` pair still reaches the storefront from an existing saved template, from
the orphan case above, and — per settled decision 3 — from a **B2 preset**. The
rail is not the only writer, so the stylesheet cannot assume the combination is
unreachable.

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

⚠️ **7, not 8 — the Stripes hide does NOT join `VISIBILITY_PREDICATES`.** That
registry exists to enforce the preserve-on-hide law on whole *controls*: a hidden
control keeps its value because it is not rendered, so it cannot lie. The Stripes
rule filters an *option* inside a control that stays rendered, which is a
different mechanism with a different failure mode (the orphan value above), and
registering it would assert a law it does not obey. It gets its own tests
instead.

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
   `showsMobileLayoutControl` extended, `rowDividerOptionsFor`; `StyleTab.tsx`
   one new number field under Row layout, plus both Row-dividers call sites
   moved onto the derived option list.

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
| `stylingControls.test.ts` | `VISIBILITY_PREDICATES` length **7** (update 965) and the Stripes filter deliberately absent from it; the new predicate registered so it inherits the preserve-on-hide law; `showsMobileLayoutControl` false for `GRID`; `showsLabelWidthControl` false for `GRID` (free, but pin it); `rowDividerOptionsFor` — all 3 outside `GRID`, 2 in `GRID` when the value is not `STRIPES`, **3 in `GRID` when it is** (the orphan case, with the "not available" label), and `rowDividerStyle` never mutated by a `rowLayout` change |
| `specTableCssContract.test.ts` | the grid rule set present with the `240px` literal fallback; `grid-column: 1 / -1` on the section row; **the stripe-standdown rule appears AFTER the `--dividers-stripes` fill rule** — the invisible-when-broken ordering; `border-inline-end: none` present in the grid label rule; **no `--layout-grid` selector inside the `@media` block**; previewStyles drift (existing, automatic) |
| `specTableAriaContract.test.ts` | extend the `display: block` scan to `display: grid`; `--layout-grid` classes all carry a role |
| `templateSync.test.ts` | the all-fields fixture gains `gridMinColumnWidthPx: null` |

Expect roughly **943 → ~965**. Budget for the pre-existing totality guards to
fire across five all-fields fixtures on the first run — that is them working, not
breakage (feature 81 build log, item 2).

---

## Live verification — RESULTS (2026-07-26)

Harness first, then the storefront, same shape as 78/79/80/81.

**Migration non-repainting** — 6 `TableStyling` rows, **0** with a non-null
`gridMinColumnWidthPx`, **0** with `rowLayout = 'GRID'`.

**CSS harness** (26 cases against the real `spec-table.css`) — this is where the
three plan corrections above were found. After the fixes:

| case | result |
| --- | --- |
| `grid-column: 1 / -1` under `auto-fit` | ✅ section header measured **1000px in a 1000px tbody** across 4 tracks — the one unproven interaction works |
| track counts (container × minimum) | ✅ 1440→6/3/2 at 240/400/640; 900→3/2/1; 640→2/1; 375→1 at every minimum |
| null minimum | ✅ 1000px container → 4 × 250px, identical to an explicit 240 |
| overflow at 375px | ✅ **0** at every minimum after the `min()` fix (was 25px / 265px) |
| stripes in grid | ✅ all fills transparent; two-column control still alternates |
| source-order/specificity dependency | ✅ demonstrated **observably** — swapping the short-form selector in live brought the checkerboard back, restoring it removed it |
| column divider | ✅ label `border-inline-end: 0px`, no stub at any track edge |
| collapsible + grid | ✅ grid applies within each `<details>` |
| all-`TWO_COLUMN` control | ✅ **394px, byte-identical before and after the feature** — the no-repaint claim measured, not asserted |

**Round trip on the ACTIVE DJI template** (44 rows, 9 sections) — rail → Save →
Postgres (`rowLayout='GRID'`, `gridMinColumnWidthPx=400`) → metaobject → rendered
Horizon storefront. On the wire:

- `styling` (overrides-only) carries `"rowLayout":"GRID","gridMinColumnWidthPx":400`
- `styling_css.classes` carries `appx-spec-table--layout-grid` **in field order**,
  and the class list is the **same length** as before — the no-new-presence-flag
  claim, measured on the wire
- `styling_css.vars` carries `--appx-spec-grid-min-column: 400px`

Storefront: `tbody` computed `display: grid`, tracks `480px 480px 480px` in a
1440px wrapper, page overflow **0**, all 9 disclosures intact. Stripe stand-down
and the dropped column divider re-verified against the production stylesheet.

### 🔴 The height win is REAL but roughly HALF what the plan claimed

The plan's arithmetic — "44 rows becomes ~15, everything below moves up a screen
and a half" — assumes every pair is the same height. On the real DJI template it
is not: value heights measured **median 43px, max 536px** (Hover Accuracy Range
is six lines). **A grid row is as tall as its tallest member**, so ragged content
gives back a large share of the theoretical saving.

Measured on the live storefront, all 9 sections open, 1440px wrapper:

| layout | height | vs two-column |
| --- | --- | --- |
| `STACKED` | 5425px | +37% |
| `TWO_COLUMN` | 3963px | — |
| `GRID` @ 640 (2 tracks) | 3892px | −2% |
| `GRID` @ 400 (3 tracks) | 3359px | −15% |
| `GRID` @ 320 (4 tracks) | 3208px | −19% |
| **`GRID` @ 240 (6 tracks)** | **2848px** | **−28%** |
| `GRID` @ 160 (9 tracks) | 2893px | −27% |

**Two things to carry forward.** The honest merchant number is **~1100px saved,
28%** — about one screen, not a screen and a half. And the win **peaks at the
default 240 and gets WORSE below it**: narrower tracks make long values wrap
more, so each ragged row grows taller. That is an empirical vindication of
settled decision 1, and it is the guidance to give a merchant who assumes
"narrower = shorter".

### The two deferred checks — both closed 2026-07-26 (second pass)

✅ **The Stripes orphan renders exactly as specced**, confirmed in the DOM on the
Moto G35 template (saved `TWO_COLUMN` + `STRIPES`). Switching Row layout to Grid:

- the select reads **"Stripes"** with the help line **"Stripes do not apply in
  Grid layout. Pick Lines or None."** — the stored value is displayed and
  explained, NOT blank, which is the whole reason this is a derived list rather
  than a `.filter()`;
- the editor preview's stripe fill **disappeared** the moment Grid was picked —
  the CSS stand-down is visible in the preview surface, not just the storefront;
- walking the list with the keyboard proves the ORDER: Up from Stripes lands on
  **None** (help text "No rules and no shading."), so the orphan is the trailing
  entry after Lines/None;
- pressing Down twice from None **stays on None** — the orphan entry is gone for
  good once another member is picked, exactly as designed.

The template was left untouched (Discard; Postgres re-read confirms `rowLayout`
still null and `rowDividerStyle` still `STRIPES`).

✅ **Mobile measured at a genuine narrow viewport**, and the doc's original claim
needs splitting in two. The live storefront sends `frame-ancestors 'none'` so it
cannot be framed; the probe is instead the REAL markup plus the REAL deployed
`spec-table.css` (fetched from the extension CDN — which already carried the
`min()` fix) in a `srcdoc` iframe, where the media query evaluates against the
iframe's own viewport.

| viewport | `--mobile-stacked` (the default) | `--mobile-same-as-desktop` |
| --- | --- | --- |
| 1200px | grid, 2 tracks | grid, 2 tracks |
| 800px | grid, **1 track (781px)** — auto-fit collapsed it *above* the breakpoint | same |
| 749px and below | media query fires, `tbody` → `display: block`, **grid OFF**, renders stacked | grid **stays on**, 1 track |
| 375px | stacked | grid, **1 track at 356px** |
| 320px, min 640 | stacked | grid, **1 track at 301px** |

**Horizontal overflow was 0 in every single case.**

⚠️ **So "no media query" is true only on the `SAME_AS_DESKTOP` path.** On the
default `STACKED` path the pre-existing `--mobile-stacked` rule is later in the
file and wins, turning the grid off and rendering stacked below 749px. The
outcome is visually the same (one column, label above value) but the mechanism is
not what this doc originally described. Above the breakpoint, `auto-fit` genuinely
does collapse on its own — measured at 800px.

⚠️ **This is what retro-justifies build-log fix 2 as more than theory.** The
`SAME_AS_DESKTOP` path IS reachable: the rail hides the On-mobile control in Grid
without clearing it, so a merchant who chose Same-as-desktop before switching
keeps it. Without `min(…, 100%)` that merchant's 640px minimum would have pushed
a 320px phone sideways by 320px. With it, the track is 301px and overflow is 0.

**Left saved:** the ACTIVE DJI template is on **Grid + minimum 400**. Revert =
two controls. ⚠️ Consider clearing the 400 — 240 measured materially shorter.

---

## Live verification plan (original)

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
   label-width and On-mobile both disappearing, help text in both states. Then
   the Stripes hide, **including the orphan path**: set Stripes on a two-column
   table, switch to Grid, and confirm the select reads "Stripes — not available
   in Grid" rather than going blank; pick Lines, confirm the entry is gone;
   switch back to Two-column and confirm Stripes is offered again.
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

## Settled decisions — merchant sign-off 2026-07-26

All three answered; step 1 is unblocked on this axis (the feature-70 pass above
is still the one blocker).

1. ✅ **Default minimum stays 240px.** 2 tracks at ~640px, 3 at ~1100px on a
   typical theme. Fixed now because it is the blank-box value: changing it later
   repaints every table that left the box blank, while a merchant's own typed
   160–640 never affects anyone else.
2. ✅ **Hide the Stripes option in Grid**, not the specced caveat. Mechanism,
   orphan-value resolution and the rejected coercion are in "The controls"
   above. The CSS stand-down rule is unaffected and becomes the enforcement.
3. ✅ **Grid is part of a B2 preset.** Consequences, all live now rather than at
   B2 time:
   - 🔴 **Feature 85 must land before B2 bakes `stylePresets.ts`**, exactly as
     feature 81 did. B2 cannot express a Grid preset against a `ROW_LAYOUTS`
     that has two members.
   - A Grid preset carries `rowLayout: "GRID"` plus a `gridMinColumnWidthPx`
     (or null for 240) and a **non-`STRIPES`** `rowDividerStyle`.
   - ⚠️ A preset is a **second writer** of styling values that never passes
     through the rail's option list. It is the reason the Stripes stand-down
     rule is load-bearing rather than defensive, and the reason B2's own tests
     must assert no bundle ships `GRID` + `STRIPES`.

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
- **B2 preset bundles** — settled yes, so B2's spec gains the Grid preset and the
  "no bundle ships `GRID` + `STRIPES`" assertion, and B2 is sequenced after this
  feature.
