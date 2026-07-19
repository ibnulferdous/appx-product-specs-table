# Feature 57 · Step 10 — Style tab: Colors + Typography (the nullable knobs)

## Goal in one sentence

Make the **thirteen nullable knobs** reachable — seven color swatches, five typography controls and
`labelWidthPct` — by giving `null = inherit from the theme` a UI vocabulary it has never had, so that
after this step **every column in `StylingValues` has a control**.

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
10. **Colors + Typography ← THIS DOC** — proposed split **10a** (colors) / **10b** (typography +
    label width), see §The split
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It is the last step that adds knobs.** Steps 5, 8 and 9b covered the seven non-nullable knobs plus
  the one boolean. The thirteen that remain are exactly the nullable ones, and they were deferred
  together for one reason, stated in Step 8's entry: *"`labelWidthPct` sits visually in the Layout
  group and still waits for Step 10 with the colors and typography, because 'null = inherit' needs its
  own UI vocabulary (a Theme swatch state, an Inherit segment)."* This step builds that vocabulary
  once and spends it thirteen times.
- **It is the first step where the CONTROL, not the pipe, is the hard part.** Every control so far has
  been a select over a small non-null union where the default is a real value. Here absence is
  meaningful and must be expressible, un-expressible-by-accident, and distinguishable from "the
  merchant picked something that happens to match the theme".
- **`fontSize` is a genuinely three-shaped value** — `keyword | number | null` — and it is the only
  one in `StylingValues`. It gets its own decision below rather than being discovered mid-build.
- **Step 9 froze the markup** precisely so this step's selectors target a shape that is not about to
  move. That debt is paid; this step may not re-open it.

## Foundation carried — and the claim this step tests

- **The domain already owns all thirteen** (`app/utils/tableStyling.ts`, Step 1). Seven
  `string | null` colors; `fontSize: StylingFontSizeKeyword | number | null`; `fontWeight`,
  `fontStyle`, `lineHeight`, `labelCase` as nullable keywords; `labelWidthPct: number | null`.
  Parsing, clamping and the hex whitelist all exist and are tested.
- **The mapping already emits all thirteen** (`app/utils/tableStylingCss.ts`, Step 2). `SPEC_TABLE_CSS_VARS`
  carries a custom property for each, and `stylingToCssVars` **emits a key only when non-null** — never
  `""`, never `"inherit"` — so an all-inherit value yields `{}` and the theme wins. The scales
  (`FONT_SIZE_EM_SCALE`, `FONT_WEIGHT_SCALE`, `LINE_HEIGHT_SCALE`, `LABEL_CASE_TRANSFORMS`) are
  exported specifically so this step's controls can describe what they do without re-typing numbers.
- **The stylesheet already reads all thirteen** (`spec-table.css`, Step 3), each as
  `var(--appx-spec-*, <the pre-Step-3 literal>)`, and `specTableCssContract.test.ts` asserts every
  member of `SPEC_TABLE_CSS_VARS` appears in the real file.
- **The pipe is already total.** Steps 6 and 7 carry the vars into the preview `<style>` block and the
  storefront inline `style` attribute through the same `formatCssVarDeclarations`.

**Therefore the bar for this step is Step 8's bar: ZERO non-UI diff.** No migration, no
`shopify.app.toml`, no `spec-table.css`, no Liquid, no engine, no server or route change, no new
dependency, and **both CSS drift guards must pass unedited**. Step 8 made that claim from four knobs
and Step 9b honoured it; if Step 10 needs a CSS or Liquid change, that is a **finding about Steps 2/3**
to be raised, not a workaround to be applied here.

> The one thing worth verifying early rather than assuming: that every one of the thirteen actually
> reaches a visible surface. `stripeBgColor` only shows with `rowDividerStyle: STRIPES`, and
> `labelWidthPct` only with `rowLayout: TWO_COLUMN`. Those are composition facts, not gaps — but they
> are the two that will read as "my knob does nothing" if checked in the wrong combination.

## What changes (architecture)

### 1 · The `null` vocabulary — the real design work

Three shapes, and the choice between them is per-knob, not global:

- **Colors → a swatch with a Theme state.** `null` renders as a distinct "Theme" affordance (not a
  transparent square, which reads as "white" or "broken"), and there must be an explicit way back to
  it — clearing is a first-class action, not "retype nothing".
- **Nullable keywords (`fontWeight`, `fontStyle`, `lineHeight`, `labelCase`) → a select whose FIRST
  option is `Inherit`,** mapping to `null`. This keeps the Step 5/8/9b control shape and the existing
  `selectedHelpText` helper, and it puts the default first exactly as every other list does — the
  difference is only that this list's leading value is `null` rather than a domain member.
- **`labelWidthPct` → a bounded numeric input** (see §3).

**The trap to name up front:** the option `value` attribute on a `<s-select>` is a string, so `null`
needs a sentinel (`""` is the natural one). That sentinel must be converted at the **control boundary**
and must never reach `StylingValues`, the wire shape, or the DB — `parseStylingValues` would coerce a
stray `""` to `null` anyway, which means a bug here would be **invisible until someone diffed the
metaobject**. Convert once, in one helper, and unit-test the round trip both ways.

### 2 · `fontSize` — the three-shaped knob

`Inherit | S | M | L | Custom`, where Custom reveals a px input **clamped to 10–184**
(`FONT_SIZE_PX_MIN`/`MAX`, in the domain). Locked by `admin-screen-plan.md` §Tab 2: S/M/L are
**theme-relative em multipliers** (they survive a theme switch), and Custom is the **absolute** escape
hatch. The floor is an accessibility guard, not tidiness.

**LOCKED 2026-07-19: Custom seeds at `16`.**

A **fixed constant**, not a computed one. The tempting alternative — seed from the merchant's current
*effective* size so picking Custom is a visual no-op — is not actually implementable: the admin does
not know the merchant's theme base font, so `1em` could be anything and "effective size" is
unknowable from here. A constant is the honest choice.

`16` specifically because it is the web default and therefore what `MEDIUM` (`1em`) resolves to on most
themes, so picking Custom lands close to where the table already was. **The clamp floor of `10` was
considered and rejected as the seed**: it is an accessibility guard rail, not a sensible default, and
seeding there would shrink the table to its smallest legal size the instant a merchant clicked Custom,
leaving them to type their way back up.

### 2a · The px ceiling was raised 40 → 184 — and it is the ONE exception to the zero-diff bar

**LOCKED 2026-07-19: `FONT_SIZE_PX_MAX` is `184`, not `40`.** The Horizon theme editor's own font-size
control tops out at 184px, and a merchant should not be *more* constrained inside this app than in the
theme editor they came from. The floor stays `10` — that one is an accessibility guard and is not
negotiable; the ceiling was only ever a taste guard.

**This is a DOMAIN change, so it is honestly outside this step's "zero non-UI diff" bar** (§Foundation).
Rather than let it quietly contradict that bar, it is called out as a **scoped, one-constant
exception, landed and gate-verified on 2026-07-19 BEFORE 10a/10b begin**, so both halves still ship
against an unchanged domain:

- `app/utils/tableStyling.ts` — the constant, with the reasoning in a comment.
- `app/utils/tableStyling.test.ts` — the out-of-range probes now **derive from the bounds**
  (`MIN - 1` / `MAX + 1`) instead of the literals `9` / `100`. **This was a live trap, not a
  hypothetical:** `100` was the old "out of range" probe, and under a 184 ceiling it becomes an
  *in-range* value that no longer clamps — the test would have kept its name and its green tick while
  asserting nothing at all.
- `admin-screen-plan.md`, `data-model.md`, `progress-tracker.md` — all three stated `10–40`; all three
  amended.

**Accepted consequence, recorded so it is not later mistaken for a bug:** this var lands on
`.appx-spec-table__table`, so unlike Horizon's control — a **discrete preset list** applied to a single
product-title heading — it scales **labels and values together** across a data table. A very large
value will overflow its column on narrow viewports. That is the merchant's call, it is visible the
instant they pick it, and it is one control away from undo. Do not "fix" it by lowering the ceiling
without raising it as a decision.

**Leaving Custom must remember the typed px.** Switching S → Custom → S → Custom must return the
merchant's number, not `16` again. This is the same data-loss class as the On-mobile and
initial-state controls, and it is why the custom-px input is one of the four visibility rules in §4.

### 3 · `labelWidthPct` — and a finding that contradicts the plan

`admin-screen-plan.md` §Tab 2 line 194 says **"Label width % slider"**. **Polaris web components ship
no slider/range element** — the available field primitives are `s-number-field` (with `min`, `max`,
`step`, `suffix`) and the text/color fields. Verified against
`node_modules/@shopify/polaris-types/dist/polaris.d.ts` on 2026-07-19: there is no `s-slider`,
`s-range`, or equivalent.

**LOCKED 2026-07-19 (with the project owner): `s-number-field` with `min={20} max={80} suffix="%"`.**
Native, accessible, keyboard-friendly, zero custom code, and it matches every other control's "Polaris
does the work" posture. The rejected alternative was a raw `<input type="range">` styled to sit in a
Polaris rail: it matches the plan's original word but costs a bespoke control that will look foreign
and owes its own a11y pass.

**`admin-screen-plan.md` line 194 was amended on 2026-07-19, before any code**, per the standing rule
("if implementation changes the architecture, scope, or standards documented in the context files,
update the relevant file **before** continuing"). The plan's *intent* — a bounded label-width control
visible for two-column only, where value % = 100 − label % — is unchanged.

Visibility: **two-column only** (a stacked table has no label column to size), which is the third
instance of the hide-when-irrelevant pattern.

### 4 · The hide-when-irrelevant generalisation is now DUE

Step 9's spec said it explicitly: *"This is the second instance of the pattern; if a third appears in
Step 10, that is when to consider generalising it — not now."* Step 10 brings **two more**:
`labelWidthPct` (two-column only) and the `fontSize` custom-px input (Custom only). That is four.

The generalisation was therefore evaluated, and **LOCKED 2026-07-19: keep four independent predicates,
generalise the TEST.**

- The four predicates stay as one-line pure reads, kept **adjacent** in `stylingControls.ts`. They
  look at genuinely different things (`rowLayout`, `sectionsCollapsible`, `rowLayout` again,
  `fontSize`), so merging them into a `VISIBILITY_RULES` record would save ~4 lines while adding a
  layer of indirection — the same trade that correctly killed `<StylingSelect>` twice.
- **One shared test helper asserts the preserve-on-hide law over all four**, as a table. Adding a
  fifth control in a later step means adding one row.

**The reasoning, worth keeping because it generalises past this case:** the value in this pattern was
never the predicate — it was the *law* that hiding is a read, never a write. The real risk is not
"someone wrote a similar one-line function again", it is **"someone adds a fifth control and forgets
the law"**. A shared test catches that; merging the code does not. So generalise the law, not the
implementation.

### 5 · Color input — component and alpha

Polaris ships **`s-color-field`** and **`s-color-picker`**, both with an **`alpha`** prop
(verified 2026-07-19). This matters because `parseColor` already accepts **`#rgb` / `#rrggbb` /
`#rrggbbaa`** — 8-digit hex with alpha parses today, and nothing in the UI can currently produce it.

**LOCKED 2026-07-19 (with the project owner): alpha ON for the five SURFACE colors, OFF for the two
TEXT colors.**

- **`alpha` enabled** — `headerBgColor`, `labelBgColor`, `valueBgColor`, `stripeBgColor`, `borderColor`.
  The stylesheet's own defaults are translucent (`rgba(0,0,0,0.06)` band, `rgba(0,0,0,0.04)` stripes,
  `rgba(0,0,0,0.1)` borders), so an opaque-only picker **cannot reproduce the default look**. A
  merchant wanting a slightly warmer band would be forced into a solid slab that reads heavier than
  the surrounding theme, with no way back except returning to Theme.
- **`alpha` disabled** — `labelTextColor`, `valueTextColor`. Translucent body text is a
  contrast/readability bug, not a design feature.

No domain change is needed: `parseColor` already accepts `#rgb` / `#rrggbb` / `#rrggbbaa`.

**Deliberately NOT handled — locked 2026-07-19.** A fully transparent override (`#00000000`) renders
identically to the "Theme" (inherit) state, even though one is an override and the other is an
absence. **Accepted as a non-problem and left alone**: it is reachable only on purpose, and guarding
it would cost real UI complexity (a blocked value or a special swatch state) for an edge nobody is
walking into by accident. Do not add a guard for it later without a new reason.

The one place the overlap is actually visible, recorded so it is not re-diagnosed as a bug: a
transparent override still **writes a DB value and emits a CSS variable**, so such a template reads as
"theme-looking but set" when inspecting the `TableStyling` row or the metaobject. That is correct
behaviour, not drift.

### 6 · Rail placement

Per `admin-screen-plan.md` §Tab 2, groups in order: **Layout · Sections · Rows · Colors · Typography**.

- `labelWidthPct` joins the **existing Layout group**, under Row layout and beside On mobile — the
  slot Step 8 deliberately left for it.
- **Colors** is a new group: seven swatches in the plan's order (section-header bg, label bg, value bg,
  stripe bg, border, label text, value text).
- **Typography** is a new group: font size, label weight, style, line height, label case.

Seven swatches in a ~300px rail is a density problem worth solving deliberately (a two-column grid of
swatch + name is the obvious answer). **Disclosure groups are Step 12's item**, not this one — do not
pre-build them here.

### 7 · A documentation contradiction — RESOLVED before the code

`admin-screen-plan.md` §Tab 2 carried an explicit open detail: *"Whether weight applies to the label
only or label + value is still an open detail, carried over."*

**The code had already answered it.** `spec-table.css` puts `--appx-spec-font-weight` on
`.appx-spec-table__label` only, with the Step 3 comment: *"The font-weight var is the LABEL-weight
knob: the 600 was always a label-only literal, so the var lands here, not on the table — value text
keeps the theme's weight."*

**LOCKED 2026-07-19: label column only** — decided in Step 3, shipped since, and the plan text was
amended on 2026-07-19 to say so rather than leave a contradiction that invites someone to "complete"
it later. Two consequences for this step:

- The control is labelled **"Label weight"**, not "Font weight", so the UI itself states the scope.
- The same check was run on `labelCase`: `.appx-spec-table__section` sets `font-weight: 700` as a
  literal and takes no case var, so `labelCase` never touches the section header. Confirmed and
  recorded in the plan.

**Neither var may be extended to the value cell or the section header in this step.** That would
change every merchant's live table and is not what a controls-only step does.

## Locked decisions

- **Zero non-UI diff.** No migration, server, CSS, Liquid, metaobject, engine or dependency change;
  both CSS drift guards pass unedited. A diff touching any of those is a signal to stop.
- **`null` is a first-class, reachable UI state** for all thirteen — never an accident, never only
  reachable by clearing a text field.
- **The null sentinel never escapes the control layer.** Converted in one helper, tested both ways.
- **S/M/L are theme-relative em; Custom px is absolute and clamped 10–184.** Carried from Step 1/2,
  ceiling amended 2026-07-19 (see §2a).
- **Nullable keyword lists lead with `Inherit`**, matching "default leads" as every other list does.
- **`fontWeight` is LABEL weight** (settled by Step 3's CSS); the plan text gets corrected here.
- **Hiding never clears** — the Step 8/9b law, now applying to four controls.
- **`labelWidthPct` is an `s-number-field`** (20–80, `%` suffix), not a slider — Polaris ships none.
  §3; `admin-screen-plan.md` amended 2026-07-19.
- **`fontWeight` is LABEL weight**, and the control says so. §7; plan amended 2026-07-19.
- **Alpha ON for the five surface colors, OFF for the two text colors.** §5; plan amended 2026-07-19.
- **A fully transparent override looking like Theme is accepted and not guarded.** §5.
- **Custom font size seeds at `16` and remembers the merchant's px on the way out.** §2.
- **Four visibility predicates stay; one shared TEST enforces the preserve-on-hide law.** §4.
- **The editing grid is untouched** (Step 11); **Reset to theme defaults is Step 12**, not here.
- **Option lists stay `Record`-keyed on the domain union then `.map`ped** over the domain constant, so
  adding a domain value is a compile error rather than a stale control.

## Decisions settled 2026-07-19 (with the project owner) — ALL RESOLVED, none open

- ✅ **`labelWidthPct` → Polaris number field** (20–80, `%` suffix), not a slider — §3.
  `admin-screen-plan.md` amended.
- ✅ **`fontWeight` → label column only**, control labelled "Label weight" — §7. Plan amended.
- ✅ **Alpha ON for the five surface colors** (header bg, label bg, value bg, stripe bg, border) — §5.
- ✅ **Alpha OFF for the two text colors** (label text, value text) — §5.
- ✅ **The transparent-vs-Theme overlap is accepted and left unguarded** — §5.
- ✅ **Custom font size seeds at `16`** (a fixed constant; the `10` floor was considered and rejected
  as a seed), and leaving Custom **remembers** the typed px — §2.
- ✅ **Custom px ceiling raised 40 → 184** to match the Horizon theme editor's max — §2a. Landed as a
  scoped one-constant exception before 10a/10b; four docs amended; the stale `100` test probe fixed.
- ✅ **Four visibility predicates kept; the TEST is generalised, not the code** — §4.
- ✅ **Step 10 splits into 10a (colors) / 10b (typography + label width)** — §The split.

**No open questions remain. This step is ready to build.**

## What this step does *not* own (boundary with later steps)

- **The editing grid reacting to any of this** → **Step 11**.
- **Reset to theme defaults, disclosure groups, the rail a11y pass, docs, B1 sign-off** → **Step 12**.
  In particular: **contrast checking** (a merchant can pick white-on-white here) belongs to Step 12's
  a11y item, but this step should **record whether it is a warning or a block** so Step 12 inherits a
  decision rather than a discovery.
- **Presets** → **Steps 13–14**. `basedOnPreset` stays unwritten.
- **A font-family picker, letter spacing, wrap control, per-side padding** — all explicitly rejected in
  §Tab 2 as option-overload. Do not add them.

## Testing

### Unit

- **`stylingControls.test.ts`** — the bulk of it:
  - The four nullable keyword lists join the `describe.each` table **with an adapted contract**. The
    existing five assertions do **not** all apply unchanged: "offers exactly the domain's values in
    domain order" becomes "`Inherit` plus the domain's values, in order", and "leads with the default"
    becomes "leads with `Inherit`, whose value is the null sentinel". Extend the table's shape rather
    than loosening the existing assertions — the Step 8/9b lists must keep failing if they regress.
  - The null-sentinel round trip: `toControlValue(null) === ""` and `fromControlValue("") === null`,
    plus every domain member surviving both directions.
  - `showsLabelWidthControl` and `showsCustomFontSizeInput`, each including **preserve-on-hide**.
- **A shared preserve-on-hide test helper** over all four visibility predicates (per §4b), so a fifth
  knob added in a later step inherits the law by adding one table row.
- **`tableStyling.test.ts` / `tableStylingCss.test.ts`** — **unchanged**. If either needs an edit,
  something is wrong: the domain and the mapping already cover these thirteen, and that is the premise
  the step rests on.
- **`specTablePreviewHtml.test.ts`** — no new markup, so only the existing Step 6 assertions apply. A
  new test is warranted for one thing only: that a **fully-overridden** value emits all thirteen
  declarations into the preview's var block (totality through the real UI-reachable range).

### Live verification

Restore every knob touched and leave the DB as found — **through the UI, not SQL**, so the metaobject
re-syncs (the standing rule from Step 8's entry).

1. **The regression first:** a default-styled ACTIVE template renders unchanged against the recorded
   baseline — **DJI Mavic: 44 rows, 9 sections, banded `rgba(0,0,0,0.06)`, `8px` label padding, table
   height 2980px**, `style=""` (all-inherit). If this moved, stop.
2. Each of the **seven swatches** changes the surface it names, and only that surface — check the two
   composition traps: **`stripeBgColor` needs `rowDividerStyle: STRIPES`** and **`labelWidthPct` needs
   `rowLayout: TWO_COLUMN`** to be visible at all.
3. **Theme ↔ set ↔ back to Theme** on one color: the var appears in the inline `style` attribute and
   then **disappears entirely** (not `""`, not `inherit`) — the override-clearing behaviour Step 5
   proved for keywords, now for colors.
4. **The `fontSize` matrix**: Inherit → no var; S/M/L → the em value from `FONT_SIZE_EM_SCALE`; Custom
   → `<n>px`. Confirm **em multiplies the theme base exactly once** (the reason Step 3 put typography
   vars on `__table`, not the wrapper) by checking a computed px against the theme's base.
5. **Bounds are real**: an out-of-range Custom px lands inside 10–184; the same for label width and
   20–80. Clamped, not rejected. Probe with values DERIVED from the constants, not literals — a
   hard-coded probe is exactly what went stale when the ceiling moved (§2a).
6. **All four hide rules**, each with the off→on data-loss check.
7. **Save, reload, and check the live product page** — the wrapper's inline `style` carries exactly the
   overrides set and nothing else.
8. **Restore and re-confirm the baseline numbers from (1).**

## File placement (per `code-standards.md`)

- `app/routes/app.templates_.$id/stylingControls.ts` — **edit** (four nullable option lists, the
  null-sentinel helpers, two new visibility predicates, and the `CUSTOM_FONT_SIZE_SEED_PX = 16`
  constant). **The seed lives HERE, not in `tableStyling.ts`** — it is a UI affordance ("what the box
  shows when you first open it"), not a domain fact. The domain already owns the only numbers that
  constrain it, `FONT_SIZE_PX_MIN`/`MAX` (10/40, verified 2026-07-19); putting a *default* beside those
  *bounds* would imply the domain has an opinion about unset values, which it deliberately does not —
  unset is `null`.
- `app/routes/app.templates_.$id/StyleTab.tsx` — **edit** (Colors + Typography groups; `labelWidthPct`
  into the existing Layout group).
- `app/routes/app.templates_.$id/stylingControls.test.ts` — **edit**.
- `app/routes/app.templates_.$id/specTablePreviewHtml.test.ts` — **edit** (the one totality test).
- `context/admin-screen-plan.md` — **edit BEFORE the code** (§3 slider→number field if (a); §7 the
  label-weight and label-case corrections).

**No** schema, migration, server, `metaobjects.server.ts`, `templateSync.server.ts`,
`shopify.app.toml`, `spec-table.css`, `previewStyles.ts`, Liquid, `useRowEngine.ts` or dependency
change.

## The split — LOCKED 2026-07-19, decided before any code

Thirteen knobs and three new control shapes is the largest UI unit in B1, so the Step 3/5/9 pattern
applies:

### 10a — Colors

Seven swatches, one new control shape (`s-color-field`), one new group. Ships the entire `null`
vocabulary for colors including the Theme state and the alpha decision. **Verifiable on its own** and
the smaller risk, since a color is a pure value substitution with no visibility rule attached.

### 10b — Typography + label width

Five typography controls plus `labelWidthPct`. Carries the three genuinely fiddly pieces — the
`fontSize` tri-state, the two new visibility rules, and the bounded numeric inputs. Landing it second
means the null vocabulary is already proven by 10a, so 10b's novelty is confined to shape, not
semantics.

**Both halves inherit the zero-non-UI-diff bar.** If either needs a CSS or Liquid change, that is the
finding.

## Done when

**10a:**

1. Seven swatches render in a new Colors group, each showing Theme for `null` and its hex when set.
2. Setting a color emits exactly one declaration; clearing it removes the declaration entirely.
3. The alpha decision (§5) is implemented and a fully-transparent value is not confusable with Theme.
4. Zero non-UI diff; both CSS drift guards pass unedited; full gate green.
5. Live-verified incl. the `stripeBgColor` composition trap, then restored to baseline.

**10b:**

6. Five typography controls plus label width render in their locked groups, `Inherit` leading each
   nullable list.
7. The `fontSize` matrix is correct across Inherit / S / M / L / Custom, bounds clamp, and leaving
   Custom behaves per the §2 decision.
8. Both new visibility rules hide without clearing, unit-tested alongside the existing two.
9. `admin-screen-plan.md` reflects the number-field and label-weight corrections.
10. Zero non-UI diff; full gate green; live matrix passes; DB restored to baseline.
11. **Every field in `STYLING_FIELD_NAMES` now has a control** — the assertion worth making explicitly,
    since it is the claim that closes the knob-building half of Phase B.
12. `progress-tracker.md` updated — Step 10 complete, next → Step 11 (live styling on the editing grid).
