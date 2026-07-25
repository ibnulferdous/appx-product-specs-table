# Feature 80 — Section separation + section gap (Style tab)

**Status:** ✅ shipped & fully live-verified on the dev store, 2026-07-26 —
rail → Postgres → metaobject → rendered storefront, both parts, plus the
`[open]` reactivity and the stand-down measured on the live page.
**Reported:** 2026-07-26, merchant screenshot of the ACTIVE "DJI Mavic 4 Pro Fly
More Combo" template on the live storefront, every section collapsed.
**Depends on:** feature 57 Step 9a (collapsible sections) and Step 8 (section
header styles). Nothing new.
**Migration:** `20260725181733_add_section_gap_styling` (1 additive column).
**Numbering:** this takes **80**, so Reshell Phase B2 starts at **81**.

> Everything below the "Build order" heading was written as a plan and is kept
> as the record. Two things changed during the build — see **Corrections** at the
> end; the gap rule is gated on the presence class rather than relying on the
> custom property's fallback, and that is now the reason the third flag exists.

---

## The ask

> "I collapsed all the sections. Now we can't separate one section from another
> section. Is there something we can do to separate each section header? Also,
> can we provide the option of creating gap between sections?"

With **Section headers = Banded** and **Collapsible sections = on**, a table whose
sections are all closed renders as a single unbroken grey slab: nine section
titles stacked with no edge between them. The merchant asked for two distinct
things, and they are two distinct things:

| # | ask | shape |
| --- | --- | --- |
| **A** | separate one section header from the next | a **fix** — base CSS rule, no knob |
| **B** | an option to put a gap between sections | a **knob** — one new `TableStyling` column |

They ship as one feature because they are one report on one surface and B's
presence changes A's selector (see "Why A stands down when B is set"). **A is
independently shippable** — if B is cut, A still closes the defect.

## Root cause

One rule, doing exactly what it was written to do
(`extensions/product-specs-table/assets/spec-table.css`):

```css
.appx-spec-table--collapsible.appx-spec-table--section-banded
  .appx-spec-table__section-summary {
  background: var(--appx-spec-header-bg, rgba(0, 0, 0, 0.06));
  border-block-end: none;   /* the band edge is the separator */
}
```

"The band edge replaces the heavy rule" is **true when a band is followed by
rows** — grey → white *is* the edge. It is **false when a band is followed by
another band**, which is only reachable once sections collapse. Step 9a shipped
the collapsible markup and Step 8 shipped BANDED; the state where they meet with
every disclosure closed was never rendered against.

So this is a gap in the banded rule's reasoning, **not** a missing feature and not
a regression from features 77–79. `TEXT_ONLY` is unaffected: its summary variant
keeps `border-block-end: 2px solid`, so closed sections there are already
separated — which is also the merchant's **zero-code workaround today** (Style →
Section headers → Text only), at the cost of the band.

---

## Part A — the separator (base rule, no knob)

A band touching a band with no edge is wrong in **every** theme, so it is not a
merchant decision. Same category as feature 77's container stretch: a base rule.

### The rule

```css
.appx-spec-table--collapsible.appx-spec-table--section-banded:not(
    .appx-spec-table--section-gap
  )
  .appx-spec-table__section-group:not([open])
  + .appx-spec-table__section-group
  > .appx-spec-table__section-summary {
  border-block-start: 1px solid var(--appx-spec-border-color, rgba(0, 0, 0, 0.1));
}
```

Four decisions, each load-bearing:

**1. `border-block-START`, not `-end`.** The banded rule above sets
`border-block-end: none` on the same element. Using the opposite side means the
two rules touch **different properties** — no specificity contest, no source-order
hazard, no `!important`, and the file's design rules stay intact. (Contrast
feature 79, where a same-property tie made source order load-bearing.)

**2. `:not([open]) +` — only when the preceding section is CLOSED.** This is what
keeps the **no-repaint law** (feature 79: "adding this must not repaint any table
that exists today"). The default `sectionsInitialState` is `ALL_OPEN`, so an
unconditional rule would add a second hairline above every band on every
collapsible+banded table already live — 1px row rule + 1px band border = a 2px
boundary where a 1px one ships today. Scoped this way, **only the broken state
changes**.

Bonus property, free: `[open]` is a live attribute, so the separator appears and
disappears as a shopper toggles a section. Zero JS, correct by construction.

**3. It reads `--appx-spec-border-color`.** Same swatch as the row rules and the
column divider, so it matches them by construction — the feature 79 call, made
again. No new color knob.

**4. `.appx-spec-table__section-group`, not bare `details`.** The file currently
mixes both (`details[open] >` in Step 9a, `> details:last-child` in feature 78).
New rules use the class form. Not worth churning the existing ones.

### Known gap, accepted

An **open but empty** section (a named section whose rows are all hidden — the
locked Step 9a "empty collapsible" case, and feature 74's R3) renders a
zero-height table, so its band still abuts the next one and `:not([open])` does
not match. Accepted deliberately: closing it means dropping `:not([open])`, which
repaints every ALL_OPEN table in the wild to fix a state that requires a named
section with zero visible rows *followed by* another section. The no-repaint law
wins. Revisit only on a merchant report.

### Flat shape

No-op. `.appx-spec-table--collapsible` gates the selector, and the flat shape has
no `<details>` at all — section headers there are `<tr>`s inside one `<table>`,
already separated by the row rules around them.

---

## Part B — the gap knob

### Vocabulary — 1 new `TableStyling` column

| field | type | null means | delivery |
| --- | --- | --- | --- |
| `sectionGapPx` | `Int?`, 1–48 | no gap | `--appx-spec-section-gap` var **+** `--section-gap` presence class |

- **px, not a keyword.** Feature 79 chose a keyword because a px width could
  clash with the fixed 1px row rules. Nothing clashes here — a gap is pure
  whitespace between blocks — and merchants match spacing to their theme's
  rhythm, which a three-member scale cannot do.
- **`null` = off, minimum 1, never 0** — the feature 78 container lock verbatim.
  One stored spelling per state, so `serializeStylingOverrides` has nothing to
  write for a default table.
- **Bounds 1–48.** Ceiling matched to `OUTER_BORDER_RADIUS_PX_MAX` for
  consistency; past ~48px the sections stop reading as one table. The cost of a
  large value is visible the instant it is picked and is one control away from
  being undone.

### The rules

```css
/* AS SHIPPED — the plan had `.appx-spec-table--collapsible` here; see
   Corrections. Gating on the presence class is what keeps an untouched table
   from declaring the property at all. */
.appx-spec-table--section-gap
  .appx-spec-table__section-group:not(:first-child) {
  margin-block-start: var(--appx-spec-section-gap, 0);
}
```

**`:not(:first-child)`, not `+`.** Rows appearing *before* the first section
header render in a leading bare `<table>` with no `<details>`
(`spec_table.liquid`, the lazy-open branch). An adjacent-sibling selector would
skip that boundary; `:not(:first-child)` covers it and still never adds a leading
gap inside the frame.

### Why A stands down when B is set

With a gap, adjacent bands are already separated by whitespace, and A's hairline
would paint as a stray line across the top of every band but the first. So B
emits a **presence class**, `appx-spec-table--section-gap`, and A's selector
carries `:not(.appx-spec-table--section-gap)` on the wrapper.

That is the **third presence flag** (`--outer-border`, `--outer-radius`,
`--section-gap`) and it exists for exactly one reason — CSS cannot branch on
whether a custom property is set, and A must know whether B is on. The gap rule
itself does **not** need the class (`var(…, 0)` is already inert when unset); the
flag is bought solely to let the separator stand down. One visual job, one
mechanism.

> Cheap escape if the merchant wants both: delete the `:not()` from A's selector.
> One token, no other change.

### The control

**Sections group**, directly under "When the page loads"
(`StyleTab.tsx`) — a `<s-number-field label="Gap between sections" suffix="px">`
using the **zero-means-off** box idiom
(`toZeroMeansOffControlValue` / `ZERO_MEANS_OFF_CONTROL_MIN`), which as of the
current working tree backs both Outline width and Corner radius. A gap of `0` is
precisely what "off" looks like on a px control, so a blank box would be the
wrong affordance here — same argument that file already makes.

`details` text: `"No gap between sections."` when null, `"Space between each
collapsible section."` when set.

### Hidden when collapsing is off — the 6th predicate

```ts
export function showsSectionGapControl(styling: StylingValues): boolean {
  return styling.sectionsCollapsible;
}
```

Identical in shape to `showsSectionsInitialStateControl`, and hidden for the same
reason: in the flat shape sections are `<tr>`s in a single `<table>`, and **a
`<tr>` takes no margin**. Registering it in `stylingControls.test.ts`'s
`VISIBILITY_PREDICATES` array picks up the shared **preserve-on-hide law** test
automatically — hiding is a pure READ, so a trip through off and back on returns
the merchant's own value.

> 🚫 **Do not approximate a flat-shape gap** with `border-block-start: Npx solid
> transparent` on `.appx-spec-table__section`. Under `border-collapse: collapse`
> the wider border wins the shared edge, so an N>1 transparent border would
> silently delete the previous row's divider. Rejected before it is tried.

---

## Interaction checklist (verify each; none expected to need code)

| interaction | expectation |
| --- | --- |
| `--outer-border` last-row rule drop | unaffected — its three selectors key on `> details:last-child`, which margins do not move |
| `--outer-radius` + `overflow: hidden` | gaps fall inside the clipped box; page background shows between bands, inside the frame — intended |
| `--dividers-stripes` | stripe parity already restarts per section (locked Step 9a); a gap makes that read as deliberate rather than arbitrary |
| `--column-divider-line` | untouched; the rule stops at every band already |
| `--layout-stacked` / mobile ≤749px | sections are still sibling blocks — gap applies, correctly |
| RTL | `margin-block-start` / `border-block-start` are logical properties; correct for free |
| blank section header (feature 74 R1) | skipped before any `<details>` is opened, so it cannot produce a gap to nothing |
| flat shape | Part A gated by `--collapsible`; Part B control hidden |
| Edit grid | unchanged — the binding rule holds, tripwired files untouched |

## What must NOT change

- **No Liquid change, no extension TOML change.** Both parts are a class and a
  var, and `styling_css` is precomputed server-side — the third feature running
  that the "server precomputes; Liquid only prints" pipe pays for.
- **No `!important`, anywhere.**
- `SpecTableEditor.module.css` / `RowGrid.tsx` stay byte-clean against `a7b304c`.
- `previewStyles.ts` is a **verbatim mirror** of `spec-table.css` — every CSS edit
  must be copied across or the byte-exact drift guard in
  `specTableCssContract.test.ts` fails. That guard is the point; do not relax it.

## Build order

Each step ends green on the full gate (typecheck · lint · format · test · build).

1. **Part A — CSS only.** New rule (initially without the `:not(--section-gap)`
   token, which step 3 adds) + `previewStyles.ts` mirror + contract tests.
   Independently shippable; closes the reported defect on its own.
2. **Domain** — `tableStyling.ts`: `SECTION_GAP_PX_MIN/MAX`, `sectionGapPx` in
   `StylingValues`, `STYLING_FIELD_NAMES` (after `sectionsInitialState`),
   `DEFAULT_STYLING_VALUES` (`null`), `parseStylingValues` via `parseBoundedInt`.
3. **Mapping + CSS** — `tableStylingCss.ts`: `SPEC_TABLE_CSS_VARS.sectionGapPx`,
   the `pxFields` loop, the presence class pushed with the other two. Gap rule in
   `spec-table.css`, `:not(.appx-spec-table--section-gap)` added to Part A's
   selector, mirror regenerated.
4. **Persistence** — `prisma/schema.prisma` `sectionGapPx Int?` + migration
   `add_section_gap_styling`; `template.server.ts` column type +
   `stylingToDbColumns` line.
5. **Rail** — `stylingControls.ts`: `fromSectionGapControlValue` (zero-means-off)
   + `showsSectionGapControl` + `VISIBILITY_PREDICATES` row; `StyleTab.tsx`
   control in the Sections group.

> ⚠️ **Restart `shopify app dev` after step 4.** Vite HMR reloads app code but not
> `@prisma/client` (require cache), so the first save after a migration fails
> silently against a stale client — feature 78's trap. Tell it apart from a real
> bug by running the upsert from a fresh `node -e`.

## Tests to add

| file | assertions |
| --- | --- |
| `tableStyling.test.ts` | default `null`; clamp 1–48; non-integer / string / NaN → null; omitted from overrides when null; round-trip law |
| `tableStylingCss.test.ts` | var emitted as `Npx` only when non-null; `--section-gap` class present iff non-null; class order stable |
| `stylingControls.test.ts` | `0` / `0.4` / `-5` / `""` → null, `0.6` → 1, `999` → 48; `showsSectionGapControl`; registration in `VISIBILITY_PREDICATES` (inherits the preserve-on-hide law) |
| `specTableCssContract.test.ts` | Part A's rule exists and carries both `:not([open])` and `:not(.appx-spec-table--section-gap)`; gap rule uses `:not(:first-child)`; `1px` + `--appx-spec-border-color` literals; previewStyles drift (existing, automatic) |
| `templateSync.test.ts` | the all-fields fixture gains `sectionGapPx: null` |

Expect roughly **889 → ~903**.

> Test-authoring trap inherited from feature 79: anchor selector assertions on
> `selector + " {"`, not the bare selector — several selectors appear twice in the
> file, once inside a grouped list.

## Live verification (2026-07-26, ACTIVE "DJI Mavic 4 Pro Fly More Combo", 44 rows, 9 sections)

Full round trip, on the same template features 78 and 79 were signed off on.

**0. Isolated CSS harness first.** Before touching the merchant's template, the
REAL `spec-table.css` was exercised against hand-written markup in six states
(Chrome, computed styles). This is what made the storefront pass a confirmation
rather than an exploration:

| harness case | measured |
| --- | --- |
| banded + collapsible, all closed | sections 2–3 `border-block-start: 0.909091px`; section 1 `0px` (nothing precedes it) |
| same, first section open | the band **after the open one** drops to `0px`; the next one keeps its rule |
| gap 12px | every `border-block-start` `0px`, `margin-block-start` `12px` on all but the first |
| leading bare table + gap | the first `<details>` **does** get `12px` — the boundary `+ details` would have missed |
| TEXT_ONLY, all closed | `border-block-end: 1.81818px` unchanged, `border-block-start: 0px` — untouched |
| banded, ALL_OPEN, no gap | every `border-block-start` `0px` — **the no-repaint claim, measured** |

1. **Migration is non-repainting.** Before anything else: 6 `TableStyling` rows,
   **0** with a non-null `sectionGapPx`.
2. **Rail.** "Gap between sections" renders directly under "When the page loads",
   shows `0`, help text "No gap between sections."
3. **Part A on the live storefront**, with the gap still off. All 9 sections, in
   `FIRST_OPEN`: Aircraft open; **Gimbal (following the OPEN section) `0px`**;
   Vision System, Infrared Sensing System, Camera, Remote Controller, Intelligent
   Flight Battery, App / Live View and Warranty **all `0.909091px solid
   rgba(0, 0, 0, 0.1)`** — the hairline, in the shared border color, on every
   band that follows a closed one. The reported slab is gone.
4. **`[open]` reactivity, measured on the live page.** A shopper closing Aircraft
   gave Gimbal its separator (`0px → 0.909091px`); opening Vision System took the
   separator off Infrared Sensing System (`0.909091px → 0px`); closing it again
   restored both. **Zero JavaScript of ours** — the attribute is live and the CSS
   follows it.
5. **Postgres** — `sectionGapPx = 12` after typing 12 and saving.
6. **Metaobject** (`template-cmrqedsff0001vpjs4hdjmyz8`, Admin GraphQL 2025-10):
   `styling` = `{"sectionsCollapsible":true,"sectionsInitialState":"FIRST_OPEN",
   "sectionGapPx":12,"columnDividerStyle":"LINE","density":"SPACIOUS"}` —
   overrides-only intact, and note `sectionHeaderStyle` is **absent** because
   BANDED is the default. `styling_css.classes` ends with
   `appx-spec-table--section-gap`; `.vars` = `--appx-spec-section-gap: 12px;`.
7. **Part B on the live storefront** — wrapper carries the class, inline style is
   `--appx-spec-section-gap: 12px;`, section 1 `margin-block-start: 0px` (no
   leading gap), sections 2–9 all `12px`, and **every `border-block-start` is
   `0px`**: the separator stood down exactly as the `:not()` intends.
8. **Frame interaction, probed live without saving** (the feature-79 technique —
   add the classes/vars on the real page, measure, revert). With
   `--outer-border` + `--outer-radius` on: border `1.81818px`, radius `12px`,
   `overflow: hidden`, and the gaps **survive inside the frame** (first `0px`,
   second `12px`). The last summary's `border-block-end` is `0px` both before and
   after — the banded rule already removed it, so feature 78's last-row drop has
   nothing to double against here. Table width `1440px` throughout: feature 77's
   stretch is unaffected, jitter still 0.
9. **Mobile ≤749px**, in the editor's Mobile preview (a real ~375px iframe on the
   same stylesheet): stacked layout, gap renders between the bands, no stray
   artifacts. ⚠️ `resize_window` still does not reflow the viewport (feature 79) —
   the Mobile device preview is what gives a genuine narrow render.
10. **Edit grid unchanged**, and `SpecTableEditor.module.css` / `RowGrid.tsx` are
    byte-clean against `a7b304c`, as the binding rule requires.

**Left in place:** the DJI template is saved with **Section headers = Banded** and
**Gap between sections = 12px**. It had been on `TEXT_ONLY` — which was the
workaround for this very bug — and was switched to Banded to verify the fix.
Revert in two controls: Section headers → Text only, Gap → 0.

## Corrections to the plan

**1. The gap rule is gated on the presence class; the plan said it need not be.**
The plan argued `margin-block-start: var(--appx-spec-section-gap, 0)` could hang
off `.appx-spec-table--collapsible` because the fallback makes it inert. It is
inert as a *value* but not as a *declaration*: it would set `margin-block-start`
on every disclosure of every collapsible table from a two-class selector, which
**beats a theme's own element-level `details` margin**. That silently restyles
tables whose merchant never touched this knob — the same no-repaint law Part A's
`:not([open])` scope exists to honour. So the rule now sits behind
`.appx-spec-table--section-gap`, and the presence flag has two jobs instead of
one. A contract test pins that the file declares `margin-block-start` **exactly
once**, inside that rule.

**2. `s-number-field` commits on blur, not per keystroke.** Typing `12` left the
help text reading "No gap between sections." and raised no SaveBar until focus
left the field. Not introduced here — Outline width and Corner radius behave the
same way — but worth knowing before anyone tests a px knob and concludes it is
dead. Tabbing out flipped the help text, raised the SaveBar, and updated the
preview in one go.

**Tests 892 → 914.** Full gate green (typecheck · lint · format · test · build).

## Deliberately out of scope

- **A gap in the flat (non-collapsible) shape.** See the `border-collapse` note
  above; the control is hidden instead.
- **Per-section radius / "accordion cards".** Gap + a `border-radius` on the
  summary would turn each closed section into a discrete card. A bigger visual
  departure — ship these two first and see whether it is still wanted.
- **A separate `sectionSeparatorColor`.** Part A reads the shared border swatch by
  construction, exactly as feature 79's column divider does.
- **Suppressing the separator for TEXT_ONLY.** Not needed — that variant already
  keeps its own 2px rule.

## Docs to update when this ships

- `context/progress-tracker.md` — Completed entry, and **Next Up: B2 starts at
  81**.
- `context/data-model.md` §5 (`TableStyling` columns) + §10 (styling delivery).
- **B2 preset bundles**: `sectionGapPx` joins feature 78's five and feature 79's
  divider in the built-in bundles — gap + banded + collapsible *is* the
  "Accordion" preset.
