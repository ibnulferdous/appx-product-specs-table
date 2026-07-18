# Feature 57 · Step 3 — Style tab: storefront stylesheet rules (dormant) + the mobile-stacked default

## Goal in one sentence

Teach `extensions/product-specs-table/assets/spec-table.css` the full Step 2 vocabulary — every
base rule rewritten as `var(--appx-spec-*, <today's exact value>)` plus one rule set per BEM
modifier class, and the `--mobile-stacked` media query — so the stylesheet is **complete and
dormant**: no markup carries a modifier class and no element sets a custom property yet, so the
rendered storefront is **byte-identical to today**, while `previewStyles.ts` is re-copied to keep
the feature 49 drift guard green.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. **Storefront stylesheet rules (dormant) + the mobile-stacked default ← THIS DOC**
4. `add-table-styling` migration + server persistence
5. Engine styling state + first control (Dividers) + Save round-trip
6. Live styling in the device previews
7. Metaobject serialization + Liquid emission (pipe complete)
8. Remaining non-structural knobs
9. Collapsible sections (one-table-per-section `<details>` markup)
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **Step 2 decided the names; this step decides what they *do*.** `stylingToCssVars` and
  `stylingToModifierClasses` currently emit strings that nothing consumes. Until a stylesheet
  answers them, every knob is a no-op — this is the other half of the contract.
- **It is the last step that can change the CSS design freely.** Once Step 6/7 start applying
  the output to real elements, a rule-set rewrite becomes a visible storefront change. Landing
  the whole stylesheet while it is provably inert means the risky CSS work happens with a
  zero-blast-radius verification: *does the page still render exactly as before?*
- **It isolates the one edit that trips the feature 49 drift guard.** `previewStyles.ts` mirrors
  this file byte-for-byte, guarded by a test. Doing the CSS in its own step keeps that expected
  failure-and-re-copy from being tangled up with a persistence or UI change.
- **Dormancy is testable.** "No selector in this file matches anything the storefront currently
  renders, except the base rules, whose fallbacks equal today's literals" is a claim a reviewer
  can check by reading the diff — and it is what makes this step safe to ship alone.

## Foundation carried

- **Step 2 locked the contract**: 13 custom properties (`SPEC_TABLE_CSS_VARS`), the modifier
  class names, and the em/weight/line-height/case scales. This step adds **no new var, no new
  class, and no new allowed value** — if a rule wants one, that is a Step 1/2 change first.
- **Today's literals become the fallbacks** (from the current file): `__label` `width: 33%` and
  `font-weight: 600`; `__row th/td` `padding: 0.5rem 0.75rem` and
  `border-block-end: 1px solid rgba(0, 0, 0, 0.1)`; `__section` `padding: 0.75rem`,
  `font-weight: 700`, `border-block-end: 2px solid currentColor`.
- **The block markup is fixed** (`blocks/spec_table.liquid`, unchanged here): a
  `div.appx-spec-table` wrapper → `table.appx-spec-table__table` → `tr.appx-spec-table__row`
  with `th.appx-spec-table__label[scope=row]` + `td.appx-spec-table__value`, and
  `tr.appx-spec-table__section-row` > `th.appx-spec-table__section[colspan=2]`.
- **CSS is delivered via the schema `stylesheet` attribute** — theme app extension blocks cannot
  use `{% stylesheet %}`. Unchanged.
- Preview device widths (feature 49 Step 5): mobile `375px`, tablet `768px`, desktop `100%` —
  the breakpoint below is chosen so those three sizes land where a merchant expects.

## What changes (architecture)

**Two files: the extension stylesheet and its verbatim mirror. No Liquid, no component, no
schema, no server, no new module, no dependency.**

### `extensions/product-specs-table/assets/spec-table.css` (REWRITTEN, still dormant)

#### Part A — base rules become var-with-fallback

Each hardcoded literal becomes `var(--appx-spec-*, <that same literal>)`. Because no element
sets any custom property yet, every `var()` resolves to its fallback and the computed styles are
**identical to today**. That equivalence is the whole safety argument for this step and should be
stated in a file comment.

| Selector | Property | After |
| --- | --- | --- |
| `.appx-spec-table__label` | `width` | `var(--appx-spec-label-width, 33%)` |
| `.appx-spec-table__label` | `font-weight` | `var(--appx-spec-font-weight, 600)` |
| `.appx-spec-table__label` | `background` | `var(--appx-spec-label-bg, transparent)` |
| `.appx-spec-table__label` | `color` | `var(--appx-spec-label-color, inherit)` |
| `.appx-spec-table__label` | `text-transform` | `var(--appx-spec-label-transform, none)` |
| `.appx-spec-table__value` | `background` | `var(--appx-spec-value-bg, transparent)` |
| `.appx-spec-table__value` | `color` | `var(--appx-spec-value-color, inherit)` |
| `.appx-spec-table__row th/td` | `border-block-end` | `1px solid var(--appx-spec-border-color, rgba(0, 0, 0, 0.1))` |
| `.appx-spec-table__section` | `background` | `var(--appx-spec-header-bg, transparent)` |
| `.appx-spec-table__section` | `border-block-end` | `2px solid var(--appx-spec-border-color, currentColor)` |
| `.appx-spec-table__table` | `font-size` | `var(--appx-spec-font-size, inherit)` |
| `.appx-spec-table__table` | `font-style` | `var(--appx-spec-font-style, inherit)` |
| `.appx-spec-table__table` | `line-height` | `var(--appx-spec-line-height, inherit)` |

Notes on the non-obvious ones:

- **`--appx-spec-font-weight` lands on `__label` only**, not the table. The knob is "label
  weight" in the rail (`admin-screen-plan.md` §Tab 2) and the existing `600` is a label-only
  literal; putting it on the table would silently re-weight value text too.
- **Typography vars sit on `__table`, not the wrapper**, so `em` sizes multiply the theme's base
  font once, at the table, rather than compounding through a nested wrapper.
- **`--appx-spec-stripe-bg` appears in Part B only** — a stripe has no base-rule home; it exists
  solely under `--dividers-stripes`.
- **`inherit` fallbacks are correct here and are not the same thing as an emitted `"inherit"`**
  (which Step 2 forbids). Step 2 forbids the *variable* being set to `inherit`; the *fallback*
  being `inherit` is exactly how "merchant's theme wins when unset" is spelled.

#### Part B — one rule set per modifier class (dormant)

Every one of these selectors is compound (`.appx-spec-table--x .appx-spec-table__y`), and **no
element carries a modifier class until Step 6/7/11**. They are inert on arrival.

| Class | Rules (summary) |
| --- | --- |
| `--layout-two-column` | The current table presentation; explicit so the default is a rule, not an absence. |
| `--layout-stacked` | `tr`/`th`/`td` → `display: block`; label full-width above value; label keeps its own padding, value gets a small block-start offset. |
| `--mobile-stacked` | The `--layout-stacked` body, wrapped in the media query below. |
| `--mobile-same-as-desktop` | No rules — deliberately empty (see Locked decisions). |
| `--section-banded` | `__section` gets `--appx-spec-header-bg` as a real band + drops the bottom rule. |
| `--section-text-only` | `__section` background stays transparent; keeps the bottom rule. |
| `--dividers-lines` | The current hairline `border-block-end` on `__row` cells. |
| `--dividers-stripes` | `border-block-end: none`; `__row:nth-child(even) th/td` gets `--appx-spec-stripe-bg` (fallback a faint neutral). |
| `--dividers-none` | `border-block-end: none`, no stripe. |
| `--density-default` | `padding: 0.5rem 0.75rem` on `__row` cells (today's value). |
| `--density-compact` | Tighter block padding. |
| `--density-spacious` | Looser block padding. |
| `--collapsible` | **No rules in this step** — a presence flag whose `<details>` markup does not exist until Step 9. Declared as a comment placeholder only. |

- **`nth-child(even)` is chosen over `nth-of-type`** because section-header rows are `tr`s too;
  banding must count real rendered rows. Step 9's one-table-per-section markup will re-open this
  — noted there, not solved here.
- **Density owns `padding` and nothing else**; it must not touch font size, or two knobs fight.
- **All modifier rules use exactly one class + one element selector** (specificity 0,2,0), so
  every knob's rules sit at equal weight and no `!important` or source-order trick is needed —
  the reason Step 2 emits a class even at the default.

#### Part C — the mobile-stacked default

```css
@media (max-width: 749px) {
  .appx-spec-table--mobile-stacked .appx-spec-table__row,
  .appx-spec-table--mobile-stacked .appx-spec-table__row th,
  .appx-spec-table--mobile-stacked .appx-spec-table__row td { … }
}
```

- **749px** matches Shopify Dawn's mobile breakpoint, so the table flips at the same width the
  surrounding theme does. It also puts the feature 49 preview sizes on the intended sides:
  mobile `375px` → stacked, tablet `768px` and desktop → two-column.
- `mobileLayout`'s **default is `STACKED`** (Step 1), so from Step 7 onward a default table is
  two-column on desktop and stacked on phones with no merchant action — the "mobile-stacked
  default" this step's title names.
- Scoped **entirely inside the modifier class**, so `--mobile-same-as-desktop` needs no override
  rule to opt out: it simply never matches.

### `app/routes/app.templates_.$id/previewStyles.ts` (re-copy)

`SPEC_TABLE_CSS` is a verbatim mirror of the extension file, guarded by a byte-equality test
(`specTablePreviewHtml.test.ts`, feature 49 Step 4). **That test will fail the moment the
extension file is edited — this is expected, not a regression.** The fix is to re-copy the new
file contents into the template literal (edit the extension file first, then mirror), leaving
`PREVIEW_AMBIENT` and `PREVIEW_AFFORDANCES` untouched. Watch for backticks and `${` in the CSS
(there are none today, and none should be introduced).

## Locked decisions

- **Fallback = today's literal, exactly.** Every rewritten base rule must compute to what it
  computes now. If a value looks wrong, it is still copied verbatim here and changed in a later,
  visible step.
- **Dormant on arrival.** After this step the storefront renders identically. The only selectors
  that can match are the base rules; modifier-class selectors match nothing until markup carries
  the classes.
- **Every knob gets a rule set, defaults included** — the mirror of Step 2's "every knob emits a
  class". `--layout-two-column`, `--dividers-lines`, and `--density-default` restate today's
  presentation as explicit rules so all members of a knob live at equal specificity.
- **`--mobile-same-as-desktop` is deliberately empty** (a comment, no rules). "Same as desktop"
  means *no mobile override exists*; writing rules to undo the stacked ones would be a
  specificity fight with no benefit. This asymmetry is intentional and must be commented, or a
  future reader will "fix" it.
- **`--collapsible` ships as a comment placeholder** — its markup arrives in Step 9. Adding
  speculative rules for elements that do not exist is the drift this sequencing avoids.
- **Breakpoint is 749px**, one place, one comment explaining the Dawn alignment.
- **No `!important`, anywhere.** Equal-specificity modifiers is the design; reaching for
  `!important` means a rule is wrong.
- **The stylesheet stays the single source**; `previewStyles.ts` follows it, never the reverse.

## Accessibility note (real, and honest about the trade-off)

`--layout-stacked` sets `display: block` on `tr`/`th`/`td`, which **removes the implicit table
semantics** those elements carry — assistive technology stops announcing row/column
relationships. The mitigation here is that the stacked presentation puts each label directly
above its own value in DOM order, so the content still reads as coherent label/value pairs, and
`scope="row"` stays in the markup for the two-column case. A fuller fix (explicit ARIA table
roles re-applied under the stacked modifier, or a real markup switch) is **Step 12's** a11y pass,
where a screen-reader check is in scope. This is recorded here so Step 12 inherits a known item
rather than discovering it.

## What this step does *not* own (boundary with later steps)

- **Applying any class or var to an element** — preview iframe → **Step 6**, storefront Liquid
  wrapper → **Step 7**, editing grid → **Step 11**. Nothing in this step touches
  `spec_table.liquid`.
- **Prisma model / migration / persistence** → **Step 4**; **engine state + the first rail
  control** → **Step 5**; **`<details>` markup, `sectionsInitialState`, and the `--collapsible`
  rules** → **Step 9**; **preset bundles** → **Step 13**.
- **The a11y remediation for stacked mode** → **Step 12** (see above).
- **Any change to `tableStyling.ts` / `tableStylingCss.ts`** — both are consumed conceptually
  here (the var names and class names come from Step 2) but neither is imported or edited; CSS
  cannot import TypeScript. The two name lists are kept in agreement by the tests below.

## Testing

There is no new pure module here, so coverage is targeted rather than exhaustive:

1. **Drift guard re-green** — `specTablePreviewHtml.test.ts` asserts the extension file equals
   `SPEC_TABLE_CSS`. It must fail before the mirror is updated and pass after; confirm both.
2. **Name agreement (new, cheap, high value)** — a test reads the real `spec-table.css` and
   asserts that **every** value of `SPEC_TABLE_CSS_VARS` appears in the file, and that **every**
   class `stylingToModifierClasses` can produce (loop the allowed-value arrays) appears as a
   selector — with the two documented exemptions (`--mobile-same-as-desktop` and
   `--collapsible`) asserted as *known-absent* so the exemption list is explicit and shrinks in
   Step 9 rather than being forgotten.
3. **No `!important`** — the same test asserts the file contains none.
4. **Existing preview tests stay green** — the preview renders no modifier classes, so its
   snapshot/markup tests must be unaffected. Any change there means the step was not dormant.
5. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
   npm run build` all green.

### Browser check (the first one in feature 57 — small but worth it)

Unlike Steps 1 and 2, this step ships bytes to a live storefront, so verify dormancy visually:
open a product page with an ACTIVE assigned template and confirm the table is **unchanged** —
same label width, same hairlines, same section header. Then confirm the same in the editor's
device previews (desktop/tablet/mobile), which now serve the rewritten CSS via the mirror. A
temporary devtools experiment — adding `appx-spec-table--dividers-stripes` to the wrapper by
hand — is a useful sanity check that Part B is live-but-unreferenced, and must be reverted (it
is a devtools-only edit; nothing is committed).

## File placement (per `code-standards.md`)

- Rewritten stylesheet → **`extensions/product-specs-table/assets/spec-table.css`**.
- Mirror re-copy → **`app/routes/app.templates_.$id/previewStyles.ts`** (`SPEC_TABLE_CSS` only).
- New name-agreement test → beside the existing preview tests in
  **`app/routes/app.templates_.$id/`**, since it reads the extension file the same way the
  drift guard already does.
- **Unchanged:** `blocks/spec_table.liquid`, both snippets, `tableStyling.ts`,
  `tableStylingCss.ts`, `rows.ts`, `useRowEngine.ts`, `route.tsx`, `template.server.ts`,
  `metaobjects.server.ts`, `prisma/schema.prisma`, `SpecTableEditor.*`, `package.json`.

## Done when

1. `spec-table.css` contains the var-with-fallback base rules (Part A), a rule set for every
   modifier class (Part B, with the two documented exemptions), and the 749px mobile-stacked
   media query (Part C).
2. The storefront renders **byte-identically to before** — no element sets a var, no element
   carries a modifier class; verified in the browser on a live product page.
3. `previewStyles.ts` is re-copied and the feature 49 byte-equality guard is green again.
4. The name-agreement test passes, pinning the CSS to the Step 2 vocabulary in both directions.
5. Full gate passes (typecheck, lint, format, test, build).
6. `progress-tracker.md` updated — feature 57 Step 3 complete; point at **Step 4
   (`add-table-styling` migration + server persistence)**, and carry forward the stacked-mode
   a11y item for Step 12 and the `--collapsible` rules for Step 9.
