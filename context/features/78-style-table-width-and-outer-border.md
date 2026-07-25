# Feature 78 — Table width + outer border (Style tab)

**Status:** ✅ shipped & fully live-verified on the dev store, 2026-07-25 —
editor → Postgres → metaobject → Liquid → rendered storefront.
**Depends on:** feature 77 — without it the max-width knob is inert.
**Migration:** `20260725143916_add_table_container_styling` (5 additive columns).

---

## The ask

Same merchant report as feature 77, second half: give them control of the table's
width, and *"our table does not have an outer border. I think we need an outer
border"* — with **width, color and radius** controllable from the editor.

## Vocabulary — 5 new `TableStyling` columns

| field | type | null means | delivery |
| --- | --- | --- | --- |
| `tableMaxWidthPx` | `Int?` 240–1600 | full width | `--appx-spec-table-max-width` |
| `tableAlign` | `String?` LEFT/CENTER/RIGHT | `LEFT` | `--align-left\|-center\|-right` class |
| `outerBorderWidthPx` | `Int?` 1–12 | no outer border | `--appx-spec-outer-border-width` |
| `outerBorderRadiusPx` | `Int?` 1–48 | square corners | `--appx-spec-outer-radius` |
| `outerBorderColor` | `String?` hex | follow `borderColor` | `--appx-spec-outer-border-color` |

Follows the locked Step 2 rule exactly — **nullable → custom property, non-null
keyword → modifier class** — so `tableAlign` is the only one of the five that
travels as a class.

### Three decisions worth keeping

**1. `null` here means "the default", not "inherit the theme".** Unlike the
colors and typography, there is no theme value to inherit — there is no such
thing as "the theme's table outline". This is also why **every integer minimum is
1, never 0**: a `0` would be a second spelling of the same off state, and
`serializeStylingOverrides` would then write it to the wire as an override of a
default that renders identically. One representation per state; clearing the
control is the only way to turn a container knob off.

> **Amended 2026-07-26 — Outline width accepts a typed `0`, as an alias.** The
> lock above is unchanged: 0 is still not a *stored* state. What changed is the
> failure mode when a merchant types it. Clamping 0 up to 1 gave them a frame
> they had just asked to remove, so `fromOuterBorderWidthControlValue` now maps
> anything rounding to ≤ 0 to `null` — the cleared box — before the clamp runs.
> For this knob specifically a 0 would be worse than merely redundant: it is
> non-null, so `--outer-border` is emitted, and that flag drops the last row's
> own bottom rule. A 0 px outline would paint no frame *and* lose a divider.
> Not surfaced in the help text (clearing stays the one documented gesture) and
> `min` stays 1 on the field, so the stepper still cannot reach it. Radius and
> Maximum width still clamp; extend only on a report.

**2. `max-width`, not `width`.** A `width: 900px` overflows a 360px phone. A
`max-width: 900px` caps a wide screen and shrinks below it, so the knob cannot
collide with the 749px mobile breakpoint or with either stacked layout. It also
means the knob composes with feature 77 rather than fighting it.

**3. The outline colour falls back THROUGH the row-rule colour:**

```css
var(--appx-spec-outer-border-color, var(--appx-spec-border-color, rgba(0,0,0,.1)))
```

A merchant who sets only the existing **Border** swatch gets a frame that matches
their row rules for free; the dedicated **Table outline** swatch exists for the
case where the frame should differ. Both halves verified live. The Border
swatch's help text changed from *"Row rules and the table outline"* to *"Row
rules, and the outline unless set below"* — without that, a merchant who sets
Border and watches the frame move with it reads the coupling as a bug.

### Where the outline colour control lives — and why it is not next to the others

The merchant asked for width/color/radius together, and the rail puts the colour
one group away, in **Colors**. That was not a preference: `stylingControls.test.ts`
derives the swatch list from `STYLING_FIELD_NAMES` and asserts `COLOR_KNOBS`
equals it, precisely so "an eighth color added to `StylingValues` fails here
instead of silently having no swatch". Placing the field outside the colors block
would have surfaced it as a stray swatch at the top of the rail or required
weakening that guard. It also matches what the rail already does: row-divider
*style* sits in Layout while its *colour* sits in Colors.

`outerBorderColor` therefore sits **after `borderColor`** in `STYLING_FIELD_NAMES`,
not with the container knobs — the ordering is load-bearing, and there is a
comment in `tableStyling.ts` saying so.

## Two presence flags, and why they had to exist

CSS cannot branch on whether a custom property is set, and both of these rules
need a branch that a value substitution cannot express:

- **`--outer-border`** drops the last visible row's own bottom rule, which would
  otherwise sit directly on the wrapper border and read as one thick line.
  Dropping it unconditionally would change every existing table.
- **`--outer-radius`** turns on `overflow: hidden` — without it a rounded corner
  does **not** clip the section band or the stripe fills behind it. Gated rather
  than always-on because clipping an over-wide table is worse than letting it
  overflow visibly, and only a radius needs the clipping.

Same idiom as `--collapsible`; emitted only when the knob is non-null.

### The last-row selector is three cases, not one

The block has two markup shapes, and one of them has two states:

```
> .appx-spec-table__table:last-child          → the flat shape
> details:last-child > .appx-spec-table__table → collapsible, last section OPEN
> details:last-child:not([open]) > summary     → collapsible, last section CLOSED
```

The third is easy to miss: with the final section collapsed the **summary** is
the last thing painted, and in the Text-only header style it carries the same
heavy rule. All three verified live, along with the negative case — a *middle*
section's last row and a *middle* closed summary both keep their rules.

## Where the pieces live

- `app/utils/tableStyling.ts` — constants, bounds, `TableAlign`, the five fields,
  and `parseBoundedInt` (shared by all four `Int?` fields; `parseLabelWidthPct`
  was folded into it — identical behaviour, one clamp).
- `app/utils/tableStylingCss.ts` — four var names, the px emission loop,
  `tableAlignClass`, the two presence flags.
- `prisma/schema.prisma` + `20260725143916_add_table_container_styling`.
- `app/models/template.server.ts` — `TableStylingColumns` + `stylingToDbColumns`.
- `extensions/product-specs-table/assets/spec-table.css` + the byte mirror
  `previewStyles.ts`.
- `app/routes/app.templates_.$id/stylingControls.ts` — `TABLE_ALIGN_OPTIONS`,
  `showsTableAlignControl`, the shared bounded-int converters, the new swatch.
- `app/routes/app.templates_.$id/StyleTab.tsx` — the new **Size & frame** group.

**No Liquid change.** The "server precomputes `styling_css`, Liquid only prints"
pipe is total over `StylingValues`, so five new knobs cost the storefront block
nothing — the first real payoff of that Step 7 rule.

## The fifth hide rule

`showsTableAlignControl` hides Alignment at full width, where all three options
render identically. It is registered in `VISIBILITY_PREDICATES`, so it inherits
the preserve-on-hide law automatically — clearing the max width keeps the
merchant's alignment, and re-capping restores it. That is exactly the
"someone adds a fifth control and forgets the law" case the Step 10 §4
generalisation was written for, and it cost one row.

## Done when

1. ✅ Full gate green — typecheck · lint · format · **876 tests** · build.
2. ✅ Every guard test that *should* have failed did, and was updated
   deliberately: the class-list totality tests, the producible-class count
   (13 → 18), the DB all-null column shape, the `COLOR_KNOBS` derivation, the
   preview var totality, and three fully-overridden fixtures.
3. ✅ Stylesheet contract verified on the **live storefront** by applying the
   exact classes + vars the server emits: 900px wide, centred (269/269),
   2px border, 12px radius, `overflow: hidden`, last-row and closed-summary
   rules dropped, middle-section rules kept, and both halves of the colour
   fallback chain.
4. ✅ **Editor round-trip clicked through** on the dev store, 2026-07-25, against
   the live ACTIVE DJI template. Set Maximum width 900 · Alignment Center ·
   Outline width 2 · Corner radius 12 · Table outline `#C026D3` → Save → verified
   at all three layers:
   - **Postgres:** all five columns persisted; `borderColor` correctly `null`
     (it was briefly typed into and then cleared — the clear round-tripped as
     null rather than as an empty string).
   - **Metaobject → Liquid:** `styling_css.classes` carried exactly
     `--align-center --outer-border --outer-radius` in field order, and
     `styling_css.vars` printed
     `--appx-spec-table-max-width: 900px; --appx-spec-outer-border-width: 2px;
     --appx-spec-outer-radius: 12px; --appx-spec-outer-border-color: #C026D3;`.
   - **Rendered storefront:** 900px wide, centred (203/203), `2px solid
     rgb(192,38,211)`, 12px radius, `overflow: hidden`, last row's rule dropped,
     middle section's kept, collapsible jitter still 0.
   - **The cap shrinks, never overflows:** measured 900 / 700 / 360 in
     1438 / 700 / 360px containers, with no horizontal scroll at any size.

### One environment trap worth recording

The first attempt failed silently — the SaveBar returned to "Unsaved changes"
and nothing was written. The cause was **not** in the code: `shopify app dev`
was running from before the migration, and while Vite HMR picked up the new app
code (the new controls rendered fine), `@prisma/client` lives in `node_modules`
and stays in Node's require cache, so the server was calling a client that did
not know the five new columns. `prisma generate` had also reported
`EPERM ... rename query_engine-windows.dll.node` for the same reason — the
running server holds that file open.

**Any migration during a `shopify app dev` session needs the dev server
restarted**, and a save that silently fails right after adding columns is that,
not a bug in the save path. The way to tell them apart in one step: run the
nested upsert from a fresh `node -e` process. If it writes, the code is fine and
the server is stale.

## Notes for B2 (presets)

The five fields must appear in the built-in preset bundles. Doing this **before**
B2 means the preset constants are authored once against the final field set
rather than being amended a step later.

## Deliberately not built

- **A percentage width.** Merchants match a theme's content width in pixels, and
  a percentage cannot express "cap at 900px on a wide monitor".
- **Per-side borders / per-corner radii.** Same call as the rejected per-side
  padding (2026-07-18): four controls to express what one expresses, on a
  surface that is a spec table rather than a canvas.
- **A `0` value meaning off.** See decision 1 above.
