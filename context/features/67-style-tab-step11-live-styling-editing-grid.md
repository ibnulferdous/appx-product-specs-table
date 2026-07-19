# Feature 57 · Step 11 — Style tab: live styling on the editing grid

## Goal in one sentence

Make the **Content tab's editing grid** react to the merchant's visual styling — the seven colors and
the five typography knobs — so they are editing something that looks like their table, **without ever
letting merchant styling override an editor affordance**.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. Storefront stylesheet rules (dormant) + mobile-stacked default — **COMPLETE** (`59-…`, 2026-07-18)
4. `add_table_styling` migration + server persistence — **COMPLETE** (`60-…`, 2026-07-18)
5. Engine styling state + Dividers control + Save round-trip — **COMPLETE** (`61-…`, 2026-07-19)
6. Live styling in the device previews — **COMPLETE** (`62-…`, 2026-07-19)
7. Metaobject serialization + Liquid emission (pipe complete) — **COMPLETE** (`63-…`, 2026-07-19)
8. Remaining non-structural knobs — **COMPLETE** (`64-…`, 2026-07-19)
9. Collapsible sections (9a markup/CSS, 9b controls) — **COMPLETE** (`65-…`, 2026-07-19)
10. Colors + Typography (10a/10b) — **COMPLETE** (`66-…`, 2026-07-19). Every field in
    `STYLING_FIELD_NAMES` now has a control.
11. **Live styling on the editing grid ← THIS DOC**
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It is the third and last consumer of the Step 2 mapping — and the mapping has been waiting for it
  by name since it was written.** `tableStylingCss.ts`'s header comment says it: *"the storefront
  Liquid block (Step 7), the preview iframe (Step 6), and the live editing grid (Step 11) all consume
  THE SAME mapping."* Two of the three have shipped. This closes the set, and after it no fourth
  renderer exists to drift.
- **It is the first consumer whose target is NOT a spec table.** Steps 6 and 7 painted a
  `.appx-spec-table` block — the same markup, the same class names, the same `<table>`. The editing
  grid is a different document: no `<table>`, a **gutter column that has no storefront counterpart**,
  three editable cells with their own field chrome, and a set of interaction states (active row,
  selected row, focus ring, drag ghost, hover reveal) layered on top. So "apply the styling" is not a
  wiring job here — Step 6 proved the wiring is free. **It is a subsetting-and-precedence job**, and
  that is the whole of the work.
- **It is the first place merchant styling and app chrome compete for the same pixel.** Everywhere
  else the styling owned the entire surface. Here `valueBgColor` and `.rowSelected`'s blue fill want
  the same background; `labelTextColor` and the `.cellField` ink want the same text. Deciding who wins
  is a *rule*, and it must be written down once rather than discovered per-property.
- **It is the last step that changes how anything looks.** Step 12 is reset + a11y + docs + sign-off;
  13–14 are presets. If a visual decision is not made here it does not get made in B1.

## Foundation carried — and the claim this step tests

- **`engine.styling` is already live in state** (Step 5) and already re-renders the editor on every
  keystroke of a control. Step 6 established that **liveness is free** once the value is threaded: no
  effects, no new state, no save required.
- **The mapping is total and already proven twice.** `stylingToCssVars` emits a key only when non-null
  (all-inherit → `{}`); `formatCssVarDeclarations` is the one shared join, used by the preview
  `<style>` block and the storefront `style` attribute. This step must be its **third caller, not its
  first re-implementation** — no hand-typed `--appx-spec-*` string may appear in the editor.
- **The `var(--x, <literal>)` idiom is proven** (Step 3): each rule reads
  `var(--appx-spec-*, <the pre-existing literal>)`, so an all-inherit template renders the editor
  **byte-identically to today**. That is the same containment device that made Step 9's markup change
  safe, and it is what confines this step's risk to templates the merchant has deliberately styled.
- **The editor CSS module is already custom-property-shaped**, which is a real piece of luck worth
  naming: it is deliberately hex-free apart from one documented exception, and already routes its
  accent through `var(--appx-token-color, currentColor)`. The pattern this step needs is the pattern
  the file already uses.

**The bar: zero non-UI diff, same as Steps 8 and 10.** No migration, no server, no schema, no
`spec-table.css`, no `previewStyles.ts`, no Liquid, no metaobject, no `shopify.app.toml`, no
`useRowEngine.ts`, no new dependency; **both CSS drift guards must pass unedited**. The one file this
step *does* edit that the previous three did not is **`SpecTableEditor.module.css`** — the editor's own
stylesheet, which is not under a drift guard and has no storefront counterpart. If this step needs a
change to `spec-table.css` or the mapping, **that is a finding about Steps 2/3 to be raised, not a
workaround to apply here.**

## What changes (architecture)

### 1 · The subset — which of the twenty fields apply

Three buckets, all settled (§Decisions settled).

**APPLY — the visual knobs (twelve).** Each is a pure value substitution with an obvious counterpart
in the grid:

| Field | Grid surface |
| --- | --- |
| `labelTextColor` | `.cellInput` ink (the Label column) |
| `valueTextColor` | `.surface` ink (the value contenteditable) |
| `labelBgColor` / `valueBgColor` | the two data cells' resting background |
| `headerBgColor` | the `.rowSection` band (today a hard-coded `#f6f7f9`) |
| `borderColor` | `--appx-cell-line` on `.rowsScroller` — one variable, every hairline |
| `stripeBgColor` | **none — deliberately inert** (dividers do not apply; Q1) |
| `fontSize`, `fontStyle`, `lineHeight` | `.cellField` (inherited by all three cells) |
| `fontWeight`, `labelCase` | **`.cellInput` only** — the §7 label-column scope lock from Step 10 |

The `fontWeight` / `labelCase` scope is **not re-litigated here**. Step 10 proved from a live storefront
that both vars land on the label column only; the grid must match, or the editor would lie about the
storefront in the one place a merchant is most likely to believe it.

**DO NOT APPLY — the interaction model (four).** `rowLayout`, `mobileLayout`, `sectionsCollapsible`,
`sectionsInitialState`. The grid's shape *is* the editing affordance: a gutter, a Label input and a
Value cell, one row per row, all rows visible. Stacking them, or collapsing sections behind a
`<details>`, would hide rows the merchant is trying to edit and break `useGridKeyboardNav`'s cell model.
The device preview already answers "what will this look like stacked?" — that is what it is for.

**DO NOT APPLY — the structural-but-cosmetic four.** `density`, `rowDividerStyle`,
`sectionHeaderStyle`, `labelWidthPct` — **excluded 2026-07-19** (Q1). Each *could* have applied; each
cost more than it returned, and excluding them is what keeps this step to pure value substitution.

### 2 · The precedence law — merchant styling paints the RESTING state only

The single rule this step exists to establish:

> **Merchant styling paints a row at rest. Editor state always wins over it.**

The states that must remain unmistakable no matter what the merchant picks: the **active-row** accent
bar + tint, the **selected-row** fill, the **focus ring** on any cell, the **drag ghost**, the **hover
gutter reveal**, and the **select/delete/drag controls** themselves. These are not decoration — they
are how the merchant knows what they are about to edit or delete. A merchant who sets `valueBgColor`
to the same blue as the selection must still be able to see what is selected.

Mechanically this means the state rules are **declared after** the merchant-var rules in the module and
carry at least equal specificity — the ordering discipline `.rowActive` already relies on ("its CSS is
declared last so it wins the background when a row is both selected/section and active"). It is a
one-line comment in the file and a test; it is not a new abstraction.

**The failure mode to name:** merchant backgrounds are opaque, the editor's state tints are
`color-mix(…, 6%, transparent)` — i.e. *translucent by design*, so they compose over whatever is
beneath rather than replacing it. That mostly works in our favour (a 6% blue over a merchant's cream
still reads as tinted), but it does mean the state tint's **contrast against the merchant's background
is not fixed**. Verify the extremes live rather than reasoning about them.

### 3 · Where the vars land — one element, one call

One inline `style` on a single wrapper — the same shape as Step 6's `<style>` block and Step 7's
attribute, from the same call:

```
formatCssVarDeclarations(stylingToCssVars(engine.styling))
```

Emitted unconditionally (an all-inherit template yields `""`), so there is one component shape and no
conditional branch. It belongs on the element that encloses **the rows and the column header** and
nothing else — the merchant's typography must not leak into the toolbar, the tabs, the tips footer, or
the Style rail itself. **`.rowsScroller` is the natural host**: it already publishes `--appx-cell-line`
for exactly this "one source of truth all descendants inherit" reason.

**The Style rail must never be styled** — it is the escape hatch. A merchant who has made their grid
unreadable has to be able to reach the control that undoes it. That is a hard constraint, not a nicety
(see §5).

### 4 · Modifier classes meet CSS modules — a finding, RESOLVED by Q1

`stylingToModifierClasses` returns **global BEM strings** (`appx-spec-table--density-compact`).
`SpecTableEditor.module.css` is a **CSS module**, so its class names are hashed at build time and a
literal `.appx-spec-table--density-compact` selector there would compile to a hashed name that nothing
emits. The escape is `:global(...)`, which works but puts unhashed global selectors into a file whose
entire premise is local scoping.

**Q1's exclusion resolves this to nothing.** With the four structural knobs excluded, **no modifier
class is needed at all** — `stylingToModifierClasses` is simply not called by the editor, and the
CSS-module tension never arises. This section stays in the doc as the *reason* the mapping has one
caller fewer than the module header implies, so a future step does not "fix" the omission.

If a later step ever does need a modifier class here, `:global()` is the escape and the cost is paid
once for the whole set. Do **not** resolve it by inventing a third mapping or hand-typing class names.

### 5 · The contrast trap is worse here than on the storefront — and Step 12 needs the answer

Step 10 deferred contrast checking to Step 12's a11y item and asked this step to **record whether it is
a warning or a block**. Step 11 sharpens the question:

- On the **storefront**, white-on-white is ugly and the merchant sees it in the preview.
- In the **editor**, white-on-white makes the merchant's own text **invisible while they are typing
  it** — including the text they would need to read to understand what went wrong.

That is a materially worse failure, and it is this step that creates it. Two things make it survivable
and both should be verified rather than assumed: the **Style rail stays unstyled** (§3), so the control
is always reachable; and the **device previews stay authoritative**, so the merchant has a second
rendering to compare against.

**Recommendation to carry into Step 12: a warning, not a block.** A block would have to decide *which*
pairs to check (label ink vs label bg, but also vs the active-row tint, and vs the selection fill — a
combinatorial mess), and it would forbid legitimate choices on themes whose backgrounds we cannot see
from the admin. A non-blocking contrast warning on the two text colors is honest about what we know.
**Step 12 owns the decision; this step owes it the evidence** — record what the worst realistic
combination actually looks like once it is live.

### 6 · Two existing colors the merchant's colors will now sit beside

- **`.rowSection`'s `#f6f7f9`** — the module's one documented hex exception, chosen because Polaris's
  surface tokens are not exposed to light-DOM CSS ([[polaris-web-component-gotchas]]). If
  `headerBgColor` applies (it is in the APPLY bucket), this literal becomes the `var()` **fallback**,
  which is the Step 3 idiom and strictly an improvement — the hex stops being unconditional.
- **`--appx-token-color`** — the runtime-captured Polaris link blue behind the active accent, the focus
  ring, the value tokens and the checkbox. It is **editor chrome and stays chrome**: it is on the
  winning side of §2's precedence law and no merchant color may replace it.

### 7 · The grid is an approximation; the preview is the fidelity contract

Worth stating because it decides borderline cases. `specTablePreviewHtml.ts` is the hand-mirrored
fidelity contract with the storefront Liquid — it has no gutter, no inputs, and renders a real
`<table>`. The grid **cannot** be pixel-faithful and should not pretend to be: it has a 5.5rem gutter
column, field padding, and focus rings that the storefront has none of.

**So the test for a borderline knob is not "can we?" but "does applying it make the grid meaningfully
more representative, without degrading editing?"** A knob that would read as a fidelity promise the
grid cannot keep is better left out — the preview is one click away and answers the question exactly.

## Locked decisions

- **Consume the Step 2 mapping verbatim.** No hand-typed `--appx-spec-*` or modifier-class strings in
  the editor; this is the mapping's third caller.
- **Editor state always wins over merchant styling** (§2). Merchant styling paints the resting state.
- **The interaction-model four never apply** (§1): `rowLayout`, `mobileLayout`, `sectionsCollapsible`,
  `sectionsInitialState`.
- **The structural-but-cosmetic four never apply either** (Q1): `density`, `rowDividerStyle`,
  `sectionHeaderStyle`, `labelWidthPct` — so **no modifier class reaches the editor** and
  `stripeBgColor` is **deliberately inert** in the grid.
- **`fontSize` is honoured uncapped to 184px** (Q2); the Style rail must stay reachable at that size.
- **Cell backgrounds paint the full padded cell box** (Q3). **No opt-out toggle** (Q4).
- **Split 11a (typography + text colors) → 11b (surface colors)** (Q5), in that order.
- **`fontWeight` / `labelCase` are label-column only** in the grid too — the Step 10 §7 scope lock,
  proven live. The grid must not contradict the storefront.
- **The Style rail, toolbar, tabs and tips footer are never styled** (§3) — the escape hatch.
- **Live off `engine.styling`, no save required** (the Step 6 precedent); vars emitted unconditionally.
- **An all-inherit template renders the editor byte-identically to today** via `var(--x, <literal>)`.
- **Zero non-UI diff**; both CSS drift guards pass unedited; the only new-in-this-step file is
  `SpecTableEditor.module.css`.
- **No new control** — Step 10 was the last knob step.
- **Reset / a11y / contrast decision / docs → Step 12; presets → 13–14.**

## Decisions settled 2026-07-19 (with the project owner) — ALL RESOLVED, none open

**✅ Q1 · NONE of the four structural-but-cosmetic knobs apply.** `density`, `rowDividerStyle`,
`sectionHeaderStyle` and `labelWidthPct` are **excluded** — the grid keeps its own row rhythm,
hairlines, band and column split, which are editing affordances rather than decoration. `density`
fights `useScrollRegionHeight` and the row-height model; `labelWidthPct` fights `DATA_COLUMNS`, which
the column header shares so the two would have to move together; `rowDividerStyle: NONE` would remove
the very separation that makes the grid legible as a grid.

**Three consequences, all of them simplifications:**

- **`stylingToModifierClasses` is NOT called by the editor.** No modifier classes reach the grid, so
  the CSS-module `:global()` tension in §4 **never arises** — the step is pure value substitution.
- **`stripeBgColor` has no grid surface at all.** Recorded here rather than discovered: one of the
  twelve APPLY fields is deliberately inert in the editor, because without `rowDividerStyle: STRIPES`
  there is nothing for it to paint. **The `GRID_STYLED_FIELDS` test must encode this as an intentional
  exclusion with this reason attached**, not as an oversight — that is the whole point of the test.
- **The APPLY set is therefore eleven live fields plus one recorded-inert one.**

**✅ Q2 · The grid honours an absolute `fontSize` px, uncapped, to the full 184px ceiling.** Capping
would make the editor disagree with both the preview and the storefront — the exact drift this step
exists to prevent — and the setting is honest, instantly visible, and one control away from undo.
**Live verification must confirm the Style rail stays reachable at 184px** (it sits outside the styled
scroller, so it should be unaffected — verify, don't assume). If it somehow is not, that is a finding
about §3's host element, not a reason to cap.

**✅ Q3 · Cell backgrounds paint the full padded cell box**, not just the text row. Matches the
storefront's intent; the discrepancy against the storefront is padding, not color.

**✅ Q4 · No opt-out toggle.** It would be a new control in a step that locked "no new control", and it
would double the states every future editor change must be checked against. The merchant already has
two ways out: change the knob, or look at the preview. Revisit only if live verification finds a
combination that is genuinely *unusable* rather than merely ugly.

**✅ Q5 · Split into 11a and 11b**, the 10a/10b pattern:

- **11a — typography + the two text colors.** `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`,
  `labelCase`, `labelTextColor`, `valueTextColor`. Pure inheritance: **nothing it sets competes with an
  editor state**, so it lands and verifies cleanly and proves the §3 plumbing on its own.
- **11b — the surface colors.** `labelBgColor`, `valueBgColor`, `headerBgColor`, `borderColor` (plus
  the inert `stripeBgColor`). **Every §2 precedence fight lives here** — backgrounds versus selection
  fill, active tint, and the section band.

Ordering matters for the same reason it did in Step 10: the mechanism is proven before the hard half
starts, so a visual regression in 11b bisects to a four-field commit rather than a twelve-field one.

**No open questions remain. This step is ready to build.**

**Two live-verification debts carried in from Step 10** should be paid opportunistically here, since
this step needs the same templates: the **left-column color swatches** were never driven live, and
**`labelWidthPct` / `stripeBgColor`** need a `TWO_COLUMN` + `STRIPES` template to be visible at all.
Building that template for Q1's verification pays both.

> ⚠️ **`Unikyy Blade Pro Turbo Fan` still carries Step 10 test overrides** (`fontSize=22`,
> `fontWeight=BOLD`, `labelCase=UPPERCASE`, `labelTextColor=#1A4D8F`) by agreement. That is
> **convenient for this step** — it is a ready-made non-default template — but it is test residue, not
> a baseline. See the tracker's dev-store note before recording any measurement.

## What this step does *not* own (boundary with later steps)

- **Reset to theme defaults, disclosure groups in the rail, the a11y pass, the contrast
  warn-vs-block decision, docs, B1 sign-off** → **Step 12**.
- **Presets** → **Steps 13–14**. `basedOnPreset` stays unwritten.
- **The device previews** → already correct; unchanged here.
- **The storefront** → already correct; unchanged here. Any change to `spec-table.css`,
  `previewStyles.ts`, the `extensions/` tree, `tableStyling.ts`, `tableStylingCss.ts`,
  `useRowEngine.ts`, `template.server.ts`, `schema.prisma`, or `package.json` is out of scope and a
  signal to stop.

## Testing

### Unit

- **A new `editorStyling.test.ts`** (or an extension of an existing route test) for the one pure thing
  this step adds: the var-record → inline-`style` string for the grid host, asserted **against
  `stylingToCssVars` / `formatCssVarDeclarations` output**, never a hand-typed string. All-inherit → `""`.
- **A totality test in the same shape as Step 10's**: a fully-overridden value emits exactly the APPLY
  subset — asserted against an explicit `GRID_STYLED_FIELDS` list — so adding a fourteenth knob later
  **fails** rather than silently never reaching the grid. This is the test that makes Q1's answer
  durable instead of tribal knowledge, and it must carry **`stripeBgColor`'s exclusion with its reason
  attached** so the one inert field reads as a decision, not an oversight.
- **`tableStyling.test.ts` / `tableStylingCss.test.ts` / `specTablePreviewHtml.test.ts` — unchanged.**
  If any needs an edit, something is wrong: this step adds a consumer, not a capability.
- **Both CSS drift guards unedited and green.**

### Live verification

The precedence law (§2) is a *visual* claim, so this is the real proof.

1. **The regression first:** an all-inherit template's editor renders **byte-identically to today** —
   row rhythm, hairlines, section band, focus ring, active accent. If this moved, stop.
2. **Each of the eleven live APPLY fields** changes the grid surface it names, **and only that
   surface** —
   in particular `fontWeight` / `labelCase` must leave the Value cell alone, mirroring the storefront
   result Step 10 recorded.
3. **The precedence matrix — the headline.** With an aggressive styling set (dark backgrounds, a
   colored label ink), confirm every state is still unmistakable: active row, selected row, focused
   cell, dragging row, hovered gutter, and a row that is **section + selected + active at once**.
4. **The adversarial case:** set `valueBgColor` to approximately the selection blue and confirm
   selection is still legible — the §2 failure mode, tested deliberately rather than hoped past.
5. **Editing still works** under a heavy styling: type in a Label, type and break a line in a Value,
   drag-reorder, Ctrl+Arrow cell nav, bulk-select and delete.
6. **The escape hatch:** at `fontSize` 184px and with a hostile color set, the **Style rail is
   unaffected and reachable** and the knob can be undone (Q2 / §5).
7. **Liveness:** changing a knob repaints the grid **immediately, unsaved**; **Discard** reverts grid
   and control together; Save + reload agrees from the loader path.
8. **The two carried debts** (§Open questions) paid on a `TWO_COLUMN` + `STRIPES` template.
9. **Boundary:** the storefront product page and the device previews render **unchanged** by this step;
   console clean throughout.
10. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
    npm run build` all green.

## File placement (per `code-standards.md`)

- `app/routes/app.templates_.$id/SpecTableEditor.module.css` — **edit** (the `var(--appx-spec-*,
  <existing literal>)` swaps + the precedence ordering comment). The bulk of the step.
- `app/routes/app.templates_.$id/RowGrid.tsx` — **edit** (the one inline `style` on `.rowsScroller`).
- `app/routes/app.templates_.$id/ContentTab.tsx` — **edit only if** the styling has to be threaded to
  reach `RowGrid`; prefer reading it from the `engine` prop already in scope.
- A small pure helper + its test alongside the other route-local modules, if the `style` computation
  warrants one (it is one call — inline it rather than abstracting for the sake of a test file).

**No** change to `tableStyling.ts`, `tableStylingCss.ts`, `spec-table.css`, `previewStyles.ts`,
`specTablePreviewHtml.ts`, `useRowEngine.ts`, `StyleTab.tsx`, `stylingControls.ts`, the loader/action,
`template.server.ts`, `prisma/schema.prisma`, the `extensions/` tree, or `package.json`.

## Done when

1. The grid reflects the **eleven live APPLY fields** live and unsaved, consuming the Step 2 mapping as
   its third caller — no hand-typed var strings, and (per Q1) **no modifier classes** anywhere in the
   editor.
2. An all-inherit template renders the editor byte-identically to before the step.
3. **The precedence law holds under adversarial styling** — every editor state (active, selected,
   focused, dragging, hovered, and the section+selected+active combination) stays unmistakable.
4. Editing — typing, line breaks, drag reorder, keyboard cell nav, bulk select/delete — is unaffected
   under a heavy styling.
5. The Style rail is never styled and is always reachable, including at `fontSize` 184px.
6. Q1's answer is encoded in a test (`GRID_STYLED_FIELDS`) — including `stripeBgColor`'s reasoned
   exclusion — so a future knob cannot silently miss the grid.
7. **11a and 11b land as separate commits**, in that order, each independently gate-green.
8. Zero non-UI diff; both CSS drift guards pass unedited; full gate green.
9. Live-verified on the dev store, including the two verification debts carried from Step 10.
10. The contrast evidence (§5) is recorded for **Step 12** to decide warn-vs-block from, rather than
    rediscover.
11. `progress-tracker.md` updated — Step 11 complete, **next → Step 12 (reset + a11y + docs + B1
    sign-off)**, the last step in B1.
