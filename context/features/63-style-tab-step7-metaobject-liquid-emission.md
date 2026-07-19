# Feature 57 · Step 7 — Style tab: metaobject serialization + Liquid emission (the pipe complete)

## Goal in one sentence

Carry a template's styling the last mile — write it into the app-owned metaobject on save, and
have `spec_table.liquid` emit the same modifier classes + CSS custom properties the preview
already emits — so a merchant's Style-tab change finally **renders on the live storefront**,
matching the preview it saw.

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
7. **Metaobject serialization + Liquid emission (pipe complete) ← THIS DOC**
8. Remaining non-structural knobs
9. Collapsible sections (one-table-per-section `<details>` markup)
10. Colors + Typography groups
11. Live styling on the editing grid (visual knobs)
12. Reset + a11y + docs + B1 sign-off
13. Built-in preset constants + in-rail preset cards
14. Creation gallery popup

## Why this is its own step

- **It closes the promise the whole feature makes.** Since Step 6 the preview leads the storefront
  by one step: a merchant sees stripes in the preview and the unstyled default on their live
  product page. That gap is currently correct-by-design and explicitly flagged in the tracker, but
  it is also the one thing that makes the feature feel broken to a merchant. This step ends it.
- **It is the first slice that touches the live storefront.** Every prior Style-tab step was admin-
  only or provably dormant. This one changes what real shoppers see on real product pages, which is
  priority #2 in `CLAUDE.md`. It deserves to land alone, with its own regression proof that a
  default-styled template renders **byte-identically to today**.
- **It is a metaobject-definition migration**, and those carry real operational risk
  ([[shopify-metaobject-deploy-clean-lifecycle]]): the definition is declared in `shopify.app.toml`
  and distributed on deploy, `shopify app dev clean` wipes undeployed app-owned metaobject data, and
  a deleted-and-recreated definition poisons existing handles with `UNDEFINED_OBJECT_TYPE`. Adding a
  field is additive and safe, but it must be deployed deliberately, not bundled with UI work.

## Foundation carried

- **The Step 2 mapping** (`app/utils/tableStylingCss.ts`) — `stylingToModifierClasses`,
  `stylingToCssVars`, `formatCssVarDeclarations`. Step 6 made the preview its first consumer; this
  step makes the storefront its second. `formatCssVarDeclarations`' doc comment already names **this
  step's inline `style` attribute** as its other consumer.
- **The Step 3 stylesheet is already live on the storefront.** `assets/spec-table.css` ships every
  modifier rule set today (verified dormant in Step 3, and Step 6 proved the same bytes render
  correctly in the preview). **No CSS change is needed or permitted here** — the storefront is one
  `class` attribute away from being styled.
- **The metaobject already has a `styling` field**, declared in `shopify.app.toml` and written as the
  literal `"{}"` by `upsertSpecTableMetaobject` since Step 9.5. Its doc comment says "`styling` is
  `{}` for now (TableStyling is a later slice)" — this is that slice.
- **`serializeStylingOverrides`** (Step 1) is the ONE wire shape, already named by its doc comment as
  the content of the metaobject `styling` field.
- **`syncTemplateToMetaobject`** (`templateSync.server.ts`) is the single shared sync path both the
  editor Save action and the templates-list status-change action already run, so styling reaches the
  storefront through one function, not two.
- **The Liquid block's structure** (`blocks/spec_table.liquid`): the three-tier resolution, the
  50-row chunking, the `hideWhenEmpty` whole-cell gate, and the `<div class="appx-spec-table">`
  wrapper. Only the wrapper's attributes change.

## The central design decision: **the server precomputes; Liquid only prints**

Liquid cannot import the TypeScript mapping, so the styling→presentation translation has to happen
somewhere. Two options:

- **(A) Liquid derives** classes + vars from the raw overrides JSON. This means re-implementing a
  20-knob mapping — including the em/weight/line-height scales — in an untestable template language
  with no exhaustiveness checking, as a **fourth** copy of logic Step 2 exists specifically to
  centralize. A knob added in Step 8 or 10 would silently fail to render on the storefront only.
- **(B) The server precomputes** the exact strings at sync time and stores them on the metaobject;
  Liquid prints them verbatim.

**Locked: (B).** It keeps the Step 2 module the single source of truth across all consumers, makes
`formatCssVarDeclarations`' documented Step 7 role real, and keeps the storefront template dumb —
the same reasoning that made `renderSpecTableHtml` a hand-mirrored contract rather than a second
implementation. Liquid gains **no styling logic at all**.

### What this means for the data model (do this FIRST)

`data-model.md` §10 currently documents exactly five metaobject fields and defines `styling` as
overrides-only JSON. Option (B) adds a sixth. Per the standing rules in `CLAUDE.md`, **update
`data-model.md` §10 before writing code** — this is an architecture change, not an implementation
detail.

- **`styling` keeps its documented meaning** — raw overrides JSON (`serializeStylingOverrides`), the
  same wire shape as the save payload. It is the DATA: debuggable, migration-proof, and independent
  of CSS naming.
- **New field `styling_css`, type `json`**, holding the precomputed PRESENTATION:
  `{ "classes": "<space-joined modifier classes>", "vars": "<--k: v; declarations>" }`.
  **`json`, not `single_line_text_field`** — a fully-overridden value produces ~450 characters of
  declarations, which risks a single-line length cap, and `json` matches how `rows`/`styling` are
  already typed.

Keeping data and presentation as separate fields means a future CSS-variable rename is a resync, not
a data migration, and the raw overrides stay readable for Step 13's preset provenance.

## What changes (architecture)

**One TOML definition field + one server serialization + one Liquid wrapper change. No schema
change, no CSS change, no dependency, no editor/admin UI change.**

### 1 · Metaobject definition (`shopify.app.toml`) — a migration

- Add `[metaobjects.app.appx_spec_table.fields.styling_css]`, `type = "json"`, beside the existing
  `styling` field. Purely **additive**: existing entries keep working with the field absent.
- **Never delete or recreate the definition** — that poisons every existing handle with
  `UNDEFINED_OBJECT_TYPE` ([[shopify-metaobject-deploy-clean-lifecycle]]).
- Requires **`shopify app deploy`** to distribute. Note in the step's live-verification that a
  `dev`-only session will not have the field until deployed.

### 2 · Sync serialization (`metaobjects.server.ts` + `templateSync.server.ts`)

- **`upsertSpecTableMetaobject` gains a `styling: StylingValues` argument** (a resolved value, like
  Step 6's renderers — never optional, never `unknown`). It writes two fields:
  - `styling` → `JSON.stringify(serializeStylingOverrides(styling))` (replacing the hardcoded `"{}"`)
  - `styling_css` → `JSON.stringify({ classes: stylingToModifierClasses(styling).join(" "), vars: formatCssVarDeclarations(stylingToCssVars(styling)) })`
- **`syncTemplateToMetaobject` threads styling through.** Its `template` argument gains the styling
  row; it resolves it with the SAME `parseStylingValues` the loader uses, so a missing row (a
  template that never touched the Style tab) resolves to `DEFAULT_STYLING_VALUES` rather than blank.
- **The hazard to lock: a status change must not blank styling.** The templates-list
  status-change action calls the same sync, and `setTemplateStatusForShop` does a plain status
  update — if its returned row lacks `styling`, an ACTIVE→DRAFT→ACTIVE flip would rewrite the
  metaobject with default styling and **silently reset a merchant's live table**. Whatever the
  threading looks like, both call sites must carry the CURRENT persisted styling. This deserves an
  explicit unit test, not just care.

### 3 · Liquid emission (`blocks/spec_table.liquid`)

The only markup change, on the wrapper element:

```liquid
{%- assign styling_css = spec.styling_css.value -%}
<div class="appx-spec-table {{ styling_css.classes }}" style="{{ styling_css.vars }}" {{ block.shopify_attributes }}>
```

- **Classes** append to the existing block class — the modifiers are BEM modifiers on
  `appx-spec-table`, which is exactly what Step 3's compound selectors expect.
- **Vars** go in an inline `style` attribute (the Step 2 lock: preview uses a `<style>` block, the
  storefront uses the attribute; both join through `formatCssVarDeclarations` so they cannot drift).
- **A legacy entry (synced before this deploy) has no `styling_css`** → both interpolations are
  blank → `class="appx-spec-table "` with an empty `style`, which is **today's exact rendering**.
  Graceful degradation is the backfill strategy (see below).
- **Escaping:** values are whitelist-validated at `parseStylingValues` (hex colors, clamped
  integers, list-checked keywords) and shape-guarded by a Step 2 test, so nothing unsafe can reach
  here. Apply Liquid's `escape` anyway as defense in depth, and confirm it does not mangle the
  declarations (it should be a no-op — the output contains no quotes or angle brackets).
- **No other Liquid change**: resolution tiers, chunking, the `hideWhenEmpty` gate, and
  `spec-table-value.liquid` are untouched.

### 4 · Backfill: lazy, by design

Existing metaobjects gain `styling_css` on their **next save or status change**, not retroactively.
This matches Step 4's no-backfill decision and the "data self-heals on save" behavior in
[[shopify-metaobject-deploy-clean-lifecycle]]. Because a missing field renders exactly as today, the
lazy window is invisible to shoppers. **Say so in the tracker** — a merchant whose template was last
saved before this deploy sees no storefront change until they re-save, which is expected, not a bug.

## Locked decisions

- **The server precomputes presentation; Liquid contains zero styling logic.** No mapping is
  re-implemented in Liquid, now or in Steps 8–10.
- **`styling` stays raw overrides JSON; `styling_css` carries precomputed classes + vars.** Data and
  presentation are separate fields with separate lifetimes.
- **`styling_css` is `json`**, not a single-line text field (length headroom + consistency).
- **The definition edit is additive only** — never delete/recreate; deploy deliberately.
- **A status change must preserve the persisted styling** in the metaobject. Unit-tested.
- **Default-styled templates must render byte-identically to today** — **AMENDED 2026-07-19 to
  "identical except the intended section band."** Step 3 restated the defaults to be equivalent to the
  base rules; live verification found one exception, `sectionHeaderStyle`, where the base rule
  (transparent + 2px underline) and the default modifier `--section-banded` (`rgba(0,0,0,0.06)` + no
  underline) disagree. Resolved as **(a) accept**, not as a Step 3 revision: BANDED is the documented
  default and the Step 6 preview has rendered banded since it shipped, so the pre-Step-7 storefront was
  rendering the *unclassed base* and never the intended default. Step 7 brought the storefront into
  line with the preview, which is what the step is for. **No CSS change, no drift-guard re-copy.**
  Every other knob was byte-identical. The remaining rule stands: any *other* base/modifier
  disagreement is a **Step 3 revision** with its own drift-guard re-copy, not an inline CSS fix here.
- **Lazy backfill.** No bulk resync, no migration script.
- **No `spec-table.css` change** (the rules already ship) and **no admin UI change** (Step 6 already
  renders the preview).

## What this step does *not* own (boundary with later steps)

- **The remaining knob CONTROLS** (row layout, mobile layout, section header style, density → Step 8;
  colors + typography → Step 10). This step's pipe carries them the moment their controls exist —
  the mapping is already total, so **no further storefront work is needed for any of them**.
- **Collapsible sections** → Step 9, which adds `<details>` MARKUP to the Liquid (the one later step
  that does change this file structurally) and retires the `--collapsible` CSS-contract exemption.
- **The editing grid** reacting to styling → Step 11.
- **Reset + the a11y pass** — including Step 3's carried item that stacked mode's `display:block`
  strips implicit table semantics, which this step makes reachable on the storefront for the first
  time → **Step 12**.
- **Presets / `basedOnPreset` writes** → Steps 13–14.
- **Extending the round-trip check to styling.** `readSpecTableMetaobjectRows` verifies rows only;
  adding a styling read-back is a reasonable follow-up but is deliberately out of scope — call it
  out rather than smuggling it in.
- **Any change to** `tableStyling.ts`, `tableStylingCss.ts`, `spec-table.css`, `previewStyles.ts`,
  `specTablePreviewHtml.ts`, `prisma/schema.prisma`, or the editor components.

## Testing

### Unit

`metaobjects.server.ts` keeps its established split: pure narrowing helpers are unit-tested, live
`admin.graphql` calls are mocked at the boundary.

1. **Field payload** — the upsert's `fields` array carries `styling` as the overrides-only JSON
   (`{}` for an all-default template, `{"rowDividerStyle":"STRIPES"}` for one override) and
   `styling_css` as `{classes, vars}` whose values equal the Step 2 mapping's output for the same
   value. Assert against the mapping functions, never hand-typed strings.
2. **Defaults still emit classes** — an all-default template writes the five default modifier
   classes and an EMPTY `vars` string (all-inherit → `{}` → `""`). This is the case that must render
   identically to today.
3. **The status-change hazard** — syncing after a status change writes the template's CURRENT
   persisted styling, not defaults. (Construct the regression: template with `STRIPES`, flip status,
   assert the payload still says `STRIPES`.)
4. **Missing styling row** — a template with no `TableStyling` resolves through `parseStylingValues`
   to defaults; the payload is well-formed, never `null`/`undefined`/`"undefined"`.
5. **Malformed persisted styling degrades** rather than throwing (the Step 1 tolerance law holding at
   one more boundary).
6. **Existing metaobject tests stay green**, including the rows round-trip check.
7. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
   npm run build` all green.

Liquid is not unit-testable here; its correctness is established by the live verification below.

### Live verification (this step changes the LIVE STOREFRONT — this is the real proof)

Deploy first (`shopify app deploy`) so the `styling_css` field exists, then, on the dev store:

1. **The regression that matters most** — on a product whose assigned ACTIVE template has
   **default** styling: re-save the template (to write the new fields), then load the product page
   and confirm it renders **exactly as before** (hairline dividers, ~33% bold label column, section
   rules). Inspect the wrapper: it now carries the five default modifier classes and an empty
   `style`, and looks unchanged. If anything shifts, that is a Step 3 defect — stop and fix it there.
2. **The payoff** — set Dividers to **Stripes**, Save, reload the product page: the live storefront
   table is **striped**, matching the Desktop preview. Then **None** → no rules, no shading. This is
   the first time preview and storefront agree.
3. **Preview/storefront parity** — with a non-default value, compare the admin Desktop preview and
   the real product page side by side; the wrapper's class list should be the same in both.
4. **Mobile parity** — on a real phone viewport (or a 375px browser width) the live product page
   renders the **stacked** layout the Mobile preview showed. This is Step 3's Part C reaching real
   shoppers for the first time.
5. **Status-change safety** — flip the styled template ACTIVE→DRAFT→ACTIVE from the templates list
   and confirm the storefront styling **survives** (the §2 hazard, live).
6. **Legacy entry** — a template not re-saved since the deploy still renders (unstyled default, no
   broken markup, no stray `undefined` in the class or style attribute).
7. **Verify the metaobject directly** — read the entry back (Admin API or the metaobject UI) and
   confirm `styling` holds the overrides JSON and `styling_css` holds the precomputed pair.
8. **Non-regressions** — the three resolution tiers still resolve, the `hideWhenEmpty` gate still
   hides rows, a DRAFT template still renders nothing, and the storefront console is clean.
9. Clean up any scratch template; confirm no orphan metaobjects.

## File placement (per `code-standards.md`)

- Definition field → **`shopify.app.toml`** (`[metaobjects.app.appx_spec_table.fields.styling_css]`).
- Serialization → **`app/shopify/metaobjects.server.ts`** (the upsert's field list).
- Threading → **`app/shopify/templateSync.server.ts`** and its two call sites
  (**`app/routes/app.templates_.$id/route.tsx`**, **`app/routes/app.templates.tsx`**).
- Storefront emission → **`extensions/product-specs-table/blocks/spec_table.liquid`** (wrapper only).
- Docs → **`context/data-model.md`** §10 (the new field — **updated before the code**).
- Tests → **`app/shopify/metaobjects.test.ts`** (+ a status-change regression wherever the sync path
  is covered).
- **Unchanged:** `app/utils/tableStyling.ts`, `app/utils/tableStylingCss.ts`,
  `extensions/product-specs-table/assets/spec-table.css`,
  `extensions/product-specs-table/snippets/*`, `previewStyles.ts`, `specTablePreviewHtml.ts`,
  `prisma/schema.prisma`, every editor component, `package.json`.

## Notes carried in

- **Validate any GraphQL against 2025-10**, not the `2026-07` in `shopify.app.toml` — the runtime
  Admin client is October25 ([[admin-api-version-mismatch]]). The upsert's shape does not change
  (one more entry in an existing `fields` array), so no new operation needs validating.
- **`shopify app dev clean` wipes undeployed app-owned metaobject data**
  ([[shopify-metaobject-deploy-clean-lifecycle]]) — deploy before relying on the new field, and
  don't run `clean` mid-verification.

## Done when

1. `shopify.app.toml` declares `styling_css` (`json`), deployed, with `data-model.md` §10 updated
   **first** to document both it and the unchanged meaning of `styling`.
2. The metaobject upsert writes real styling: `styling` = overrides-only JSON, `styling_css` =
   precomputed `{classes, vars}` from the Step 2 mapping — with no styling logic anywhere in Liquid.
3. Both sync call sites carry the template's current persisted styling; a status change provably does
   not reset it.
4. `spec_table.liquid` emits the classes and the inline `style` on the wrapper, and a legacy entry
   without the field still renders exactly as today.
5. **Live-verified:** a default-styled template renders identically to before **except the intended
   section band** (see the amended criterion above); a Stripes/None
   change reaches the live product page and matches the preview; the mobile stacked layout reaches
   real shoppers; status flips preserve styling.
6. No CSS, schema, dependency, or admin-UI change shipped; all new tests green; full gate passes.
7. `progress-tracker.md` updated — feature 57 Step 7 complete, **the preview-leads-storefront gap
   from Step 6 is closed** (remove/supersede that note), the lazy-backfill window is stated, and the
   pointer moves to **Step 8 (remaining non-structural knobs)** — which now needs **no storefront
   work at all**, since this pipe is total over `StylingValues`.
