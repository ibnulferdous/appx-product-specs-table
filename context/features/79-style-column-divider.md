# Feature 79 — Column divider (Style tab)

**Status:** ✅ shipped & fully live-verified on the dev store, 2026-07-26 —
rail → Postgres → metaobject → rendered storefront, both suppressions included.
**Depends on:** nothing new. It is the third side of a grid whose other two
sides already shipped — row rules (feature 57 Step 5) and the outer frame
(feature 78).
**Migration:** `20260725161912_add_column_divider_styling` (1 additive column).

---

## The ask

The merchant sent two competitor product pages (techlandbd, AppleGadgets) whose
spec tables render a **complete grid**, and observed that our editor has no
option for a column border.

Reading the screenshots against what already ships, only **one** edge was
missing:

| edge of the grid | already ours |
| --- | --- |
| horizontal rules between rows | `rowDividerStyle: LINES` (feature 57 Step 5) |
| the frame around the table | `outerBorderWidthPx` (feature 78) |
| **the vertical rule between label and value** | **this feature** |

In a two-column table that vertical rule is the **only interior column edge that
exists**, so "column border" is one knob, not a family of them.

## Vocabulary — 1 new `TableStyling` column

| field | type | null means | delivery |
| --- | --- | --- | --- |
| `columnDividerStyle` | `String?` `NONE`/`LINE` | `NONE` | `--column-divider-none\|-line` class |

Follows the locked Step 2 rule: **non-null keyword knob → modifier class**, not a
custom property. It selects between two rule sets (a border, or none) rather
than substituting a value, which is exactly what a class is for.

`NONE` leads the domain array because it is the default. Every table that
exists today has no column rule, and adding this knob must not repaint any of
them — the `--column-divider-none` rule is an explicit `border-inline-end: none`,
so "default" is a real rule at equal specificity rather than the absence of one.

Singular `LINE`, against the row knob's plural `LINES`: there is exactly one
column rule however many rows the table has.

## The three merchant decisions (2026-07-26)

**1. A style keyword, not a px width.** The plan originally specced
`columnDividerWidthPx: number | null` (1–12) to match feature 78's outline. The
merchant chose a plain `None / Line` with a fixed 1px hairline instead, and that
is the better shape for a reason worth keeping: **row-divider width is not
configurable**, so a width box here would let a 4px column rule sit on 1px row
rules. The knob that cannot express the ugly case is the right knob. The 1px and
the color are hardcoded in the ON rule — if the column rule ever needs to differ
from the row rules, that is a new knob and a new decision, not a quiet
parameterisation of this one.

**2. No dedicated color swatch.** The rule reads `--appx-spec-border-color`, the
same variable the row rules use, so it matches them by construction and the
Colors group stays at eight swatches. In both reference storefronts the vertical
rule is the same color as the horizontal ones. A `columnDividerColor` remains
addable later without a breaking migration (a nullable column, same fallback
chain as `outerBorderColor`) if a merchant ever asks to split them.

**3. Not hidden on stacked layouts.** This would have been the sixth
hide-when-irrelevant predicate — a stacked table has no label/value seam, so the
rule is suppressed there. The merchant chose to leave the control visible and
revisit if it confuses anyone. That decision has a **cost that had to be paid
somewhere**: the merchant can now pick `Line` on a stacked table and see nothing
happen. It is paid in the option's own help text ("two-column layouts only"),
which is therefore a shipped requirement rather than prose, and is pinned by a
test asserting the caveat is present.

## Where the rule hangs, and why that is the whole design

`border-inline-end` on **the label cell** — not `border-inline-start` on the
value — so the rule sits at the label/value seam and nowhere else. That one
choice is what makes both markup shapes work with **no special cases at all**:

- a section header is a `th[colspan=2]`, so it is not a label; the rule stops at
  every section band, which is the look both reference storefronts have;
- in the collapsible shape each section owns its own `<table>`, so the rule is
  per-section and needs no knowledge of `<details>`;
- it is **interior**, so `border-collapse: collapse` has nothing to resolve it
  against and it can never double against the wrapper's outer border — unlike
  the last-row rule, which needed three selector cases in feature 78.

`border-INLINE-end`, not `border-right`: the seam follows the writing direction,
so an RTL storefront gets the rule on the correct side for free. Same logical
convention as `border-block-end` everywhere else in the file.

## The one hazard: source order, not specificity

Both stacked shapes have to **drop** the rule — a stacked label is a full-width
block with its value underneath, so a surviving `border-inline-end` paints as a
stray vertical stub down the right edge.

Every selector involved is **two classes**:

```
.appx-spec-table--column-divider-line .appx-spec-table__label   /* ON  */
.appx-spec-table--layout-stacked      .appx-spec-table__label   /* off */
.appx-spec-table--mobile-stacked      .appx-spec-table__label   /* off */
```

So specificity is a **tie**, and source order is the only thing deciding the
winner. The ON rule is therefore declared with the dividers block, *before* the
layout block — which is the file's existing documented ordering rule ("the layout
rules come AFTER dividers/density so stacked-mode refinements layer over
whichever divider/density member is active"), now load-bearing for one more knob.

This is invisible if broken: reorder the file and stacked layouts silently regain
the stub, in the previews and on the storefront at once, looking like a design
choice. Three tests in `specTableCssContract.test.ts` pin it — the 1px literal,
that both stacked rules carry `border-inline-end: none`, and that the ON rule is
declared before both. **No `!important` anywhere**, per the file's design rules.

> Test-authoring trap, found while writing them: each stacked label selector
> appears **twice** in the file — once inside the grouped `display: block`
> selector list (followed by a comma) and once as its own rule (followed by
> ` {`). Anchoring on the bare selector measures the wrong block. The tests
> anchor on `selector + " {"`.

## What did NOT change

- **No Liquid change, no extension TOML change.** The "server precomputes
  styling; Liquid only prints" pipe paid off for the second feature running: the
  class list is a total function of `StylingValues`, so the block picked the new
  modifier up with zero storefront work.
- **No presence flag.** Unlike `--outer-border` / `--outer-radius`, this knob
  needs no companion class: it is already a class, and nothing else has to be
  conditionally undone.
- Tripwired `SpecTableEditor.module.css` / `RowGrid.tsx` untouched — the Edit
  grid never reflects merchant styling.

## Touched files

| file | change |
| --- | --- |
| `app/utils/tableStyling.ts` | `COLUMN_DIVIDER_STYLES`, type, field, default, parse |
| `app/utils/tableStylingCss.ts` | `columnDividerStyleClass` + one push |
| `extensions/.../spec-table.css` | 2 new rules + `border-inline-end: none` in both stacked rules |
| `app/routes/.../previewStyles.ts` | verbatim mirror (regenerated, drift-tested) |
| `prisma/schema.prisma` + migration | `columnDividerStyle String?` |
| `app/models/template.server.ts` | column type + `stylingToDbColumns` line |
| `app/routes/.../stylingControls.ts` | `COLUMN_DIVIDER_OPTIONS` |
| `app/routes/.../StyleTab.tsx` | `<s-select>` under Row dividers |

Tests 879 → 887.

## Live verification (2026-07-26, ACTIVE "DJI Mavic 4 Pro Fly More Combo", 44 rows)

Full round trip, on the same template feature 78 was verified on.

1. **Migration is non-repainting.** Before touching anything, `columnDividerStyle`
   read `null` on **every** existing row — so the additive column leaves every
   table already in the wild exactly as it was.
2. **Rail.** The control renders directly under Row dividers, defaulting to
   `None` ("No rule between label and value."). Picking `Line` swapped the help
   text to the two-column caveat and raised the SaveBar.
3. **Desktop preview.** Rule renders at the label/value seam and **stops at the
   section band** — the reference look. (Only visible with the feature-76 rail
   collapsed; at rail-open width the preview is legitimately under 749px and
   stacks, which is feature 75/76's known limit, not a bug here.)
4. **Postgres.** `columnDividerStyle = "LINE"`.
5. **Metaobject** (`template-cmrqedsff0001vpjs4hdjmyz8`, read back via Admin
   GraphQL 2025-10): `styling` = `{"sectionsCollapsible":true,
   "columnDividerStyle":"LINE"}` — overrides-only wire shape intact — and
   `styling_css.classes` carries `appx-spec-table--column-divider-line` in
   `STYLING_FIELD_NAMES` order (between `--dividers-lines` and
   `--density-default`). **`vars` is `""`** — the knob correctly contributes no
   custom property.
6. **Live storefront** (Horizon theme, product `dji-mavic-4-pro-fly-more-combo`):
   rule renders, stops at every section band. The **"matches the row rules by
   construction" claim is proven numerically** — the label's computed
   `border-inline-end` and `border-block-end` are *both*
   `0.727273px solid rgba(0, 0, 0, 0.1)`. (The odd sub-pixel is the theme's own
   scaling; what matters is that the two are identical.)
7. **The CDN-served stylesheet** (fetched from the live storefront, not the repo)
   contains all four rules, including both `border-inline-end: none` suppressions
   and the `@media (max-width: 749px)` block.
8. **The source-order hazard, verified observably.** On the live page, with
   `--column-divider-line` still on the wrapper, swapping the layout class to
   `--layout-stacked` dropped the computed border `0.727273px → 0px`, and
   restoring it returned `0.727273px`. That is the specificity tie being decided
   by source order, measured rather than reasoned about.
9. **Mobile ≤749px**, in the editor's Mobile preview (a real ~375px iframe on the
   same stylesheet): stacked, row rules present, **no vertical rule and no stray
   right-edge stub**.
10. **Edit grid unaffected**, as the binding rule requires.

> ⚠️ **Tooling note:** `resize_window` reported success but the viewport never
> reflowed (`innerWidth` stayed 1397), so a narrow *browser* viewport was not
> available. The Mobile device preview is what supplied the genuine ≤749px
> render — worth knowing before anyone plans a responsive check around resizing.

**Left in place:** the DJI template is still saved with `Column divider = Line`.
Revert by setting it back to `None` and saving.
