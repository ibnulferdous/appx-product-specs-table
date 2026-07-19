# Feature 57 · Step 8 — Style tab: the remaining non-structural knobs (Layout · Sections · Rows)

## Goal in one sentence

Give the four remaining **non-nullable keyword knobs** — `rowLayout`, `mobileLayout`,
`sectionHeaderStyle`, `density` — their merchant-facing controls in the Style rail, so that every
knob the pipe already carries end-to-end becomes reachable, with **no server, schema, CSS, Liquid,
metaobject, or engine change whatsoever**.

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
7. Metaobject serialization + Liquid emission (pipe complete) — **COMPLETE** (`63-…`, 2026-07-19,
   one open question outstanding — see Preconditions)
8. **Remaining non-structural knobs ← THIS DOC**
9. Collapsible sections (one-table-per-section `<details>` markup)
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It is the cheapest step in Phase B, and that is the point.** Steps 1–7 built a total pipeline:
  domain → mapping → CSS → persistence → engine → preview → metaobject → storefront. Step 7 proved
  live that the pipe is **total over `StylingValues`**, not just over `rowDividerStyle` — the real
  product page already emits `--layout-two-column --mobile-stacked --section-banded
  --density-default` for a template whose merchant has never seen those words. This step is
  therefore **UI only**. If it turns out to need a CSS or server change, something in Steps 1–7 was
  wrong and that is the finding, not the workaround.
- **It converts an infrastructure claim into a merchant-visible one.** "Steps 8 and 10 need no
  storefront work" is written in the tracker as an inference from one knob. Four more knobs riding
  the same pipe with zero non-UI diff is the proof.
- **It is the last step before the Liquid changes shape.** Step 9 (collapsible sections) is the one
  later step that adds real markup — `<details>/<summary>`, one table per section. Landing the
  simple keyword knobs first means Step 9 opens a stable file.

## Foundation carried

- **The domain owns the vocabulary** (`app/utils/tableStyling.ts`, Step 1): `ROW_LAYOUTS`,
  `MOBILE_LAYOUTS`, `SECTION_HEADER_STYLES`, `DENSITIES` — first member is always the default, and
  all four knobs are **non-null** in `StylingValues`, so a control always has a concrete value to
  select. No new constant is needed; nothing here invents a value.
- **The mapping is already exhaustive** (`app/utils/tableStylingCss.ts`, Step 2): every member of
  all four lists already returns its modifier class (`--layout-stacked`,
  `--mobile-same-as-desktop`, `--section-text-only`, `--density-compact`, `--density-spacious`, …).
- **The CSS already exists and is no longer dormant** (`extensions/product-specs-table/assets/spec-table.css`,
  Step 3): rules are present for stacked layout, text-only section headers, and compact/spacious
  density. `--mobile-same-as-desktop` is **deliberately rule-less** ("same as desktop" = the absence
  of the stacking override) — that is correct, not a gap, and a test must pin it as intentional.
- **Persistence, engine state, dirty tracking and the save round-trip are generic** (Steps 4–5):
  `setStylingField` is keyed on `StylingFieldName`, the meta-JSON dirty snapshot covers the whole
  styling object, and `stylingToDbColumns` maps default → column NULL for every field. A new control
  needs no new plumbing at any layer.
- **Both consumers repaint for free**: the device previews (Step 6) and the live storefront (Step 7)
  both derive from the same mapping, so a knob flipped here shows up in the Desktop/Tablet/Mobile
  previews immediately and on the product page after Save.

## Preconditions (do this FIRST)

> **The section-header open question from Step 7 must be resolved before `sectionHeaderStyle`'s
> control ships.** Step 7 found live that the base rule `.appx-spec-table__section` (transparent +
> `border-block-end: 2px solid`) and the default modifier `--section-banded` (`rgba(0,0,0,0.06)` +
> no underline) disagree, so emitting classes changed the default look. The two resolutions are
> recorded in `progress-tracker.md`:
>
> - **(a) Accept** — BANDED is the documented default, the Step 6 preview has rendered banded all
>   along, and the pre-Step-7 storefront was showing the *unclassed base*, not the intended default.
>   Amend Step 7's byte-identical criterion to "identical except the intended section band."
>   **No code change.**
> - **(b) Revise Step 3** — make the base rule and `--section-banded` agree, which is a
>   `spec-table.css` edit and therefore also a **re-copy through the CSS drift guard** into
>   `previewStyles.ts`.
>
> This step must not paper over it: shipping a `Banded | Text only` control while the two options'
> visual relationship is unsettled would bake the ambiguity into merchant-visible behavior. Record
> the decision in the tracker before writing the control. If **(b)** is chosen, it lands as its own
> commit ahead of this step's UI work, with the drift guard green — not folded in.

## What changes (architecture)

Exactly **two files**. That is the acceptance bar as much as it is a plan.

### 1 · Option lists (`app/routes/app.templates_.$id/stylingControls.ts`)

Four new lists beside `ROW_DIVIDER_OPTIONS`, built the same way: a `Record<Member, {label,
helpText}>` mapped **over the domain constant**, never hand-typed as an array. The `Record` key type
makes adding a domain value a **compile error** here rather than a control that silently offers a
stale set — that is the whole reason the Step 5 shape exists, and it must not be relaxed for
brevity.

Labels follow `admin-screen-plan.md` §Tab 2 wording, which is merchant-facing copy, not developer
naming:

- `ROW_LAYOUT_OPTIONS` — `TWO_COLUMN` → "Two-column", `STACKED` → "Stacked" (label on top).
- `MOBILE_LAYOUT_OPTIONS` — `STACKED` → "Stacked", `SAME_AS_DESKTOP` → "Same as desktop".
- `SECTION_HEADER_OPTIONS` — `BANDED` → "Banded", `TEXT_ONLY` → "Text only".
- `DENSITY_OPTIONS` — `DEFAULT` → "Default", `COMPACT` → "Compact", `SPACIOUS` → "Spacious".

Help text stays one short line (the rail is ~300px) and describes **what the merchant will see**,
not the CSS. Density in particular is a padding scale, so its help text should say so in plain
terms rather than quoting values.

### 2 · Rail groups (`app/routes/app.templates_.$id/StyleTab.tsx`)

The existing single-select panel grows into the rail's first three groups, in the
`admin-screen-plan.md` §Tab 2 order — **Layout · Sections · Rows** — with the existing Dividers
control moving under **Rows** unchanged (same control, new heading; no behavior diff).

Each control repeats the Step 5 shape verbatim: `s-select` + `readValue(event)` + the
`setStylingField` cast justified by the option list's provenance + the subdued help line for the
selected option. **Repetition is correct here.** A generic `<StylingSelect knob={…}>` abstraction is
explicitly rejected for this step: with four controls the abstraction would be bigger than the code
it removes, and Steps 9/10 introduce non-select shapes (toggle, swatch, segmented, slider) that
would immediately break its assumptions. Revisit only if Step 10 finds real duplication.

**Conditional visibility — the one piece of real logic.** `mobileLayout` is meaningful for
two-column tables only ("stacked desktop is already stacked everywhere"). Locked: **hide the
On-mobile control when `rowLayout === "STACKED"`**, do not disable it and do not gray it out — a
control whose only two options mean the same thing is noise. Two consequences to hold:

- **Hiding must not mutate state.** The stored `mobileLayout` value is preserved while hidden, so
  switching to Stacked and back restores the merchant's choice. A hidden control that silently
  resets to the default is a data-loss bug, and it must be unit-tested as such.
- **The emitted class is unaffected.** `stylingToModifierClasses` still emits the mobile modifier
  for a stacked table; that is correct (the CSS for stacked layout already wins) and must not be
  "fixed" by special-casing the mapping. Visibility is a rail concern only.

Group headings use the same `s-text type="strong"` treatment as the existing "Style" heading; the
existing `<s-stack>` gains nested stacks per group. No disclosure/accordion behavior yet — the
"disclosure groups" in the plan arrive when the rail is full enough to need them (Step 10/12).

## Locked decisions

- **Scope is the four non-nullable keyword knobs, nothing else.** The boundary is not "the rest of
  the Layout/Sections/Rows groups" but **nullability**: every remaining knob is either nullable
  (`labelWidthPct`, all seven colors, all five typography knobs → Step 10, where "null = inherit"
  needs its own UI vocabulary — a Theme swatch state, an Inherit segment) or markup-bearing
  (`sectionsCollapsible`, `sectionsInitialState` → Step 9). `labelWidthPct` sits visually inside the
  Layout group and still waits for Step 10; the group is knowingly incomplete after this step.
- **Zero non-UI diff.** No migration, no `shopify.app.toml` change, no `spec-table.css` edit, no
  Liquid edit, no `useRowEngine.ts` edit, no server/route change, no new dependency. Both CSS drift
  guards must pass **unedited**. If precondition (b) is chosen, the CSS commit precedes this one and
  is not counted against this rule.
- **No preview or storefront work.** Steps 6 and 7 already consume the mapping totally. If a knob
  flipped in the rail does not repaint the preview, the bug is in Step 6, not here.
- **Order follows the plan, not convenience.** Layout → Sections → Rows, matching
  `admin-screen-plan.md` §Tab 2 items 2–4, so the rail's final shape is predictable as Steps 9/10
  fill in around these.

## What this step does *not* own (boundary with later steps)

- **Collapsible sections** (`sectionsCollapsible`, `sectionsInitialState`) → **Step 9**, which adds
  the `<details>/<summary>` markup. The Sections group deliberately ships with one control.
- **Label width slider** (`labelWidthPct`), **Colors** (seven swatches), **Typography** (five knobs)
  → **Step 10**, where nullable "inherit" state gets its UI vocabulary.
- **The editing grid** reacting to these knobs → **Step 11**. Until then the previews are the
  feedback surface, exactly as after Step 6.
- **Reset to theme defaults**, rail a11y pass, disclosure groups, docs, B1 sign-off → **Step 12**.
- **Presets** (which set all these knobs at once) → **Steps 13–14**.

## Testing

### Unit

`stylingControls.test.ts` extends with a table-driven block over all four new lists:

- **Exhaustive and ordered**: each option list's `value`s equal its domain constant **in order**
  (so the default stays first and the select's initial render is the default).
- **Complete copy**: every option has a non-empty `label` and `helpText`, and no label is duplicated
  within a list.
- **Derivation, proven**: the lists are `.map`ped from the constants — assert length equality
  against the domain constant rather than a hard-coded number, so adding a domain value fails the
  test instead of quietly shrinking the control.

New pure helper + test for the visibility rule (keep it out of the component so it is testable
without rendering Polaris web components — see the testing-strategy note that jsdom cannot render
them):

- `showsMobileLayoutControl(styling)` → false for `STACKED`, true for `TWO_COLUMN`.
- Hiding preserves state: setting `mobileLayout`, switching `rowLayout` to `STACKED` and back leaves
  `mobileLayout` at the merchant's value.

`tableStylingCss` already has exhaustive mapping tests from Step 2 — do not duplicate them. Add one
assertion only if missing: that `--mobile-same-as-desktop` is emitted but **intentionally
rule-less** in the stylesheet, so a future reader does not "fix" it.

### Live verification

The pipe is proven; this step verifies the **controls**, so the live pass is short and the DB must
be left as found (restore every knob touched):

1. Open a template's Style tab — all four new controls render at their current values, Dividers is
   under **Rows**, group order is Layout · Sections · Rows.
2. Flip **Row layout → Stacked**: the Desktop preview restacks, and the **On mobile** control
   disappears. Flip back → it reappears **at its previous value**, not the default.
3. Flip **Density → Compact** and **Spacious**: preview padding visibly tightens/loosens.
4. Flip **Section headers → Text only**: the band clears in the preview. (This is where the
   precondition's decision becomes visible — confirm the two options read as a deliberate pair.)
5. Each flip opens the contextual SaveBar; **Discard** reverts the control *and* the preview.
6. **Save one non-default combination, then reload** — the controls come back at the saved values.
7. Set the template ACTIVE and check the live product page: the wrapper's modifier classes match
   the chosen knobs, and the storefront matches the Desktop preview. **This is the step's payoff —
   four more knobs reaching real shoppers with no storefront diff.**
8. Restore the template to its original styling and status.

## File placement (per `code-standards.md`)

- `app/routes/app.templates_.$id/stylingControls.ts` — **edit** (four option lists + the visibility
  predicate; stays pure and framework-free, importing only from `app/utils/tableStyling.ts`).
- `app/routes/app.templates_.$id/StyleTab.tsx` — **edit** (three groups; presentational, no new
  state).
- `app/routes/app.templates_.$id/stylingControls.test.ts` — **edit** (new blocks).

Nothing else. A diff touching a fifth file is a signal to stop and re-read this doc.

## Done when

1. All four controls render, mutate engine state, ride the SaveBar, and survive a save + reload.
2. The On-mobile control hides for stacked layout **without losing its value**.
3. The device previews repaint on every knob, with no Step 6 changes.
4. The live storefront reflects the knobs after Save, with no Step 3/7 changes.
5. The section-header question is **resolved and recorded** before the control shipped.
6. Exactly three files changed (plus, if precondition (b) was chosen, its separate prior CSS commit).
7. Both CSS drift guards pass unedited; full gate green (tests, typecheck, lint, `format:check`,
   `npm run build`).
8. `progress-tracker.md` updated: Step 8 complete, next → Step 9 (collapsible sections), and Step 7's
   🛑 open question closed with the decision taken.
