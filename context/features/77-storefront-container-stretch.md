# Feature 77 — The block fills its container (storefront width bug)

**Status:** ✅ shipped & live-verified on the dev store, 2026-07-25
**Kind:** CSS-only bug fix. No schema, no UI, no Liquid, no metaobject change.
**Blocks:** feature 78 (table width + outer border knobs) — the max-width knob is
inert without this.

---

## The report

A merchant looking at a live product page: *"we don't have any control on the
width of our table. It depends on the content size. If the section headers are
collapsible, the width of the table increases and decreases by opening and
closing."*

Reproduced and measured on the dev store's DJI Mavic template (9 collapsible
sections), viewport 1563 CSS px:

| state | rendered `.appx-spec-table` width |
| --- | --- |
| all sections open | **1264px** |
| all sections closed | **206px** |
| space actually available | 1438px |

A shopper opening one disclosure resized the whole table. That is a bug in every
theme, not a missing feature.

## Root cause — and the trap in the obvious fix

The theme's section content wrapper is `display: flex; flex-direction: column;
align-items: center` (Horizon's `--horizontal-alignment` maps to `align-items`).
That makes **Shopify's own `.shopify-app-block` wrapper** a shrink-to-fit flex
item, so its width resolves to the table's max-content width. Our
`.appx-spec-table__table { width: 100% }` then resolves against a
content-derived box.

**The obvious fix does nothing.** Measured live: adding `width: 100%` to
`.appx-spec-table` left it at 1264px. A percentage resolves against the
already-shrunk parent, and a child's percentage does not feed back into that
parent's intrinsic sizing. Anything that only touches our own element is a
no-op here — the sizing decision happens one level up, on markup we do not
emit.

## The fix

```css
.shopify-app-block:has(> .appx-spec-table) {
  align-self: stretch;
  justify-self: stretch;
}
```

`:has()` is the only way for a stylesheet we ship to reach an element we do not
render. `CSS.supports('selector(.a:has(> .b))')` returns true in the live
storefront browser and it is Baseline-wide; browsers without it keep the old
content-driven behaviour rather than breaking.

### Why `align-self`, not `width: 100%`

Both give the full 1438px in the column-flex case that produced the report. They
differ in the case that did **not**:

- `align-self` addresses the **cross** axis. In a theme that lays app blocks out
  in a **row**, it applies to the height and leaves the width alone.
- `width: 100%` would apply in both, and in a row container it would make the
  block fight its siblings for space or overflow outright.

Verified both ways live — with the parent forced to `flex-direction: row`, the
`align-self` rule left the block at its natural 1264px with **no overflow**.
`justify-self` covers the same intent for a grid parent and is inert in flex.

### Why it is a base rule, not a knob

A table that resizes when a shopper opens a section is wrong everywhere. There
is no merchant for whom the old behaviour is the right default, so this is not
gated behind a modifier class. The width knobs in feature 78 layer **on top** of
a block that already fills its container.

## Where the pieces live

- `extensions/product-specs-table/assets/spec-table.css` — the rule, at the top,
  ahead of the `.appx-spec-table` base rule.
- `app/routes/app.templates_.$id/previewStyles.ts` — the byte-exact mirror
  (regenerated from the extension file, not hand-edited; the equality test in
  `specTablePreviewHtml.test.ts` guards it).

The rule is **inert in the editor previews** — the preview document has no
`.shopify-app-block` ancestor. That is also why no preview ever showed this bug,
which is worth remembering: "the previews are storefront-faithful" has a hole
exactly where the surrounding theme's layout wraps the block, and no preview can
close it.

## Done when — all met

1. ✅ Full gate green (typecheck · lint · format · test · build).
2. ✅ CSS mirror byte-equal (drift test passes).
3. ✅ Live on the dev store storefront: `align-self` computes to `stretch`,
   width is 1438px with sections **open and closed** — jitter **0px**, down from
   a 1058px swing.
4. ✅ No rows, styling, assignment, Liquid or metaobject change.

## Risks accepted

- **`.shopify-app-block` is a Shopify-generated class name.** If Shopify renames
  it the rule silently stops applying and the old content-driven behaviour
  returns — a regression to today, not a break. The bare `:has(> .appx-spec-table)`
  form (no class prefix) would be immune but would match whatever the parent
  happens to be, so the class prefix is the deliberate trade.
- A theme that genuinely wants a shrink-wrapped, content-width table can no
  longer get one by centring its section. Feature 78's max-width knob is the
  supported way to narrow the table.
