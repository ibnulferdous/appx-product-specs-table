# Feature 57 · Step 5 — Style tab: engine styling state + Dividers control + Save round-trip

## Goal in one sentence

Give the editor engine a `styling` state that rides the existing dirty snapshot and Save
payload, fill the `stylePanel` slot with **one real control — Dividers (Lines / Stripes /
None)** — and prove the whole pipe end to end: a merchant changes Dividers, the SaveBar opens,
Save persists it, a reload brings it back, and Discard reverts it.

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. Storefront stylesheet rules (dormant) + mobile-stacked default — **COMPLETE** (`59-…`, 2026-07-18)
4. `add_table_styling` migration + server persistence — **COMPLETE** (`60-…`, 2026-07-18)
5. **Engine styling state + first control (Dividers) + Save round-trip ← THIS DOC**
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

- **It is the first slice a merchant can see.** Steps 1–4 were provably dormant: a pure domain
  module, a pure mapping, a dormant stylesheet, and a dormant migration. This step joins them
  into a working circuit, and joining is exactly the risky part — it deserves to land alone,
  browser-verified, before eighteen more knobs pile on top.
- **One control proves the mechanism for all twenty.** Dividers is a plain 3-way keyword knob
  with a non-null default — the simplest possible shape in `StylingValues`. Whatever the rail
  control pattern, the dirty-snapshot integration, and the payload plumbing look like here is
  what Steps 8/10 copy for the remaining knobs. Getting the pattern wrong once is cheap; getting
  it wrong across twenty controls is a rewrite.
- **The round-trip is where the three encodings meet.** Wire (overrides-only), DB (full columns
  with explicit `NULL`s), domain (resolved `StylingValues`) — Steps 1 and 4 defined each mapping
  in isolation and unit-proved them. Only an end-to-end save/reload demonstrates that the three
  actually compose in a live request.

## Foundation carried

- **`StylingValues` + `parseStylingValues` + `serializeStylingOverrides` + `stylingEquals`**
  (Step 1). All four get their first real consumer here. `stylingEquals` was written *for* this
  step's dirty tracking; `serializeStylingOverrides`' doc comment already names this step as
  the owner of `payload.styling`.
- **Server persistence is finished and tested** (Step 4): `saveTemplateForShop` accepts an
  optional `styling`, `undefined` leaves it untouched, present replaces in full through the
  shop-scoped nested upsert. The action already accepts `payload.styling` on **both** branches
  (update and create-on-first-save). The loader already returns resolved
  `styling: StylingValues`. **This step sends and reads what Step 4 already built** — no server
  change is expected (see "does not own").
- **The engine's dirty model** (`useRowEngine.ts`): a `currentMetaJson` snapshot of every
  editable surface (`rows`, `name`, `status`, `scope`, `scopeValues`, `excludes`), compared
  against `savedMetaJson`; `handleSave` re-serializes the same shape into
  `submittedMetaJsonRef` at click time so an edit during an in-flight save stays dirty. Styling
  joins that snapshot as one more key — no new dirty mechanism.
- **Remount-on-Discard**: the engine owner is keyed on `${id}:${nonce}`, so Discard reseeds
  every `initial*` prop from the loader. Styling seeds the same way and reverts for free.
- **The `stylePanel` slot already exists** (`EditorShell.tsx` — `activeTab === "style"` renders
  `stylePanel`, currently a `SidebarPlaceholder` reading "Controls for this tab arrive in a
  later step"). This step supplies the real panel; the shell itself does not change.
- **`SettingsTab.tsx` is the pattern to mirror** — a presentational panel taking
  `{ engine }`, rendering into the sidebar slot, reading engine state and calling engine
  setters. `StyleTab.tsx` is its sibling, not a new concept.

## What changes (architecture)

**One engine extension + one new panel component + one slot fill. No server change, no schema
change, no CSS change, no Liquid change, no dependency.**

### 1 · Engine styling state (`useRowEngine.ts`)

- **`UseRowEngineArgs` gains `initialStyling: StylingValues`** — the loader's resolved value,
  seeded like `initialName` / `initialStatus`. Reseeded on every remount, so Discard reverts a
  styling change with no extra code.
- **`const [styling, setStyling] = useState(initialStyling)`** — the whole resolved value in
  one state cell, never a field-per-cell spread. This is what makes the payload a whole-value
  replace (Step 4's locked "no field-level patch API") and what lets Steps 8/10 add knobs
  without touching the engine again.
- **`setStylingField(field, value)`** — the ONE mutator the rail controls call, a typed
  `<K extends keyof StylingValues>(field: K, value: StylingValues[K]) => void` doing a
  `setStyling(prev => ({ ...prev, [field]: value }))`. Every future control uses it; no knob
  gets a bespoke setter.
- **Dirty snapshot**: `styling` joins `currentMetaJson` **and** the `submittedMetaJsonRef`
  snapshot in `handleSave` — the two must stay in lockstep or the edit-during-save guard
  silently breaks. Both serialize it the same way (see below).
- **Save payload**: `handleSave` sends
  `styling: serializeStylingOverrides(styling)` — the overrides-only wire shape, not the
  resolved value. An all-default template sends `styling: {}`, which Step 4 writes as an
  all-`NULL` row (equivalent to no row) — correct and harmless.
- **Exposed on the engine return**: `styling`, `setStylingField`. Read by `StyleTab` now, by
  the preview in Step 6 and the grid in Step 11.

> **Snapshot serialization note.** The snapshot key must be *stable* — the existing snapshot is
> a hand-built object with a fixed key order precisely because `JSON.stringify` is
> order-sensitive. `serializeStylingOverrides` builds its object by iterating
> `STYLING_FIELD_NAMES` in a fixed order, so its output is already stable, and it is the same
> value the payload sends. Use it for both. (`stylingEquals` stays available for the Step 13
> "Customized" hint, which compares against a preset rather than a baseline.)

### 2 · The Dividers control (`StyleTab.tsx`, new)

- A presentational panel `StyleTab({ engine })` rendering into `EditorShell`'s `stylePanel`
  slot — sibling of `SettingsTab.tsx`, same file placement, same props convention.
- **One group, one control** this step: a **Rows** (or equivalently named) group holding
  **Dividers** with three options — **Lines** (default) / **Stripes** / **None** — sourced from
  `ROW_DIVIDER_STYLES`, never a hand-typed literal list. Labels are merchant-facing prose; the
  values are the domain constants.
- Reads `engine.styling.rowDividerStyle`, calls
  `engine.setStylingField("rowDividerStyle", …)`. Changing it flips `isDirty` and opens the
  SaveBar — the same behavior a rename or a scope change already has.
- Control choice: a Polaris select/choice-list per `admin-screen-plan.md` §Tab 2. Mind
  [[polaris-web-component-gotchas]] when picking the component — verify the rendered affordance
  in-browser rather than trusting the component name.
- **No preview reaction yet.** Changing Dividers changes state and persists; the stage does not
  repaint (Step 6 does previews, Step 11 the grid). Say so in the panel's code comment so the
  next reader doesn't file it as a bug.

### 3 · Route plumbing (`route.tsx` / `SpecTableEditor.tsx`)

- Pass the loader's `styling` into the engine as `initialStyling`.
- Fill the slot: `stylePanel={<StyleTab engine={engine} />}` alongside the existing
  `settingsPanel`.
- The action needs no change — it has accepted `payload.styling` since Step 4, on both the
  update and the create-on-first-save branch. **Both paths get exercised live** (see below);
  the create path in particular has never run with a real payload.

## Locked decisions

- **One state cell holding the whole resolved value**, one generic `setStylingField` mutator.
  No per-knob state, no per-knob setter, no field-level patch API — the client always holds and
  sends the complete value.
- **The payload is the overrides-only wire shape** (`serializeStylingOverrides`), and the
  dirty snapshot uses that same serialization so the two can never disagree.
- **Styling rides the existing dirty/Save/Discard machinery.** No second SaveBar, no autosave,
  no per-control save. A styling change is dirty exactly like a rename is dirty.
- **One control this step.** The remaining structural knobs are Step 8, colors/typography are
  Step 10, collapsible sections are Step 9. Resisting "while I'm here" is the point of the
  step boundary.
- **No server, schema, or persistence change.** If this step discovers that Step 4's contract
  is wrong, that is a Step 4 revision with its own tests — not an inline fix here.
- **No preview or grid reaction.** The knob persists; it does not repaint anything yet.
- **Metaobject sync stays untouched** — styling reaches the storefront in Step 7. A styling
  save must not trigger or alter a metaobject write (regression-checked, since Save does sync
  the metaobject for rows).

## What this step does *not* own (boundary with later steps)

- **Preview consumption of styling** (the `--appx-spec-*` vars actually reaching the iframe) →
  **Step 6**.
- **Metaobject `styling` field + Liquid emission** → **Step 7** (the definition TOML edit is a
  migration per [[shopify-metaobject-deploy-clean-lifecycle]]).
- **The other structural knobs** (row layout, mobile layout, section header style, density) →
  **Step 8**; **collapsible sections** → Step 9; **colors + typography** → Step 10; **grid
  styling** → Step 11; **Reset-to-default + the a11y pass + B1 sign-off** → Step 12.
- **Presets / `basedOnPreset` writes / the gallery** → Steps 13–14.
- **Any change to** `tableStyling.ts`, `tableStylingCss.ts`, `spec-table.css`,
  `previewStyles.ts`, `template.server.ts`, `schema.prisma`, or the `extensions/` tree.

## Testing

### Unit

`useRowEngine` is a hook over Polaris-adjacent components, and jsdom cannot render Polaris web
components ([[testing-strategy]]) — so the test weight sits on the pure boundaries the engine
delegates to, plus whatever of the hook is reachable without rendering the shell.

1. **Payload shape** — the value handed to `saveFetcher.submit` carries
   `styling: <overrides-only object>`; an all-default styling sends `{}`; a single override
   sends exactly `{ rowDividerStyle: "STRIPES" }` and nothing else.
2. **Dirty flip** — changing `rowDividerStyle` alone makes the snapshot differ from the
   baseline (i.e. `isDirty`); setting it *back* to `LINES` makes it equal again (no false
   dirty). Assert on the serialization the snapshot uses, so the test pins the real mechanism.
3. **Snapshot/payload agreement** — the styling serialization used in `currentMetaJson`,
   in `submittedMetaJsonRef`, and in the submitted payload is the same function on the same
   value. (A regression here is the edit-during-save bug, which is invisible until it bites.)
4. **Seed** — `initialStyling` seeds state verbatim; a remount with a different
   `initialStyling` reseeds (the Discard path).
5. **`setStylingField`** — updates one field and leaves the other nineteen untouched.
6. **Control options** — the Dividers option list is derived from `ROW_DIVIDER_STYLES` (length
   and members agree), so adding a divider style can't leave a stale hand-typed list.
7. Existing suites stay green — in particular the engine's existing dirty/save tests, which now
   have one more key in the snapshot.
8. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
   npm run build` all green.

### Live verification (this is the step's real proof — it ships the first visible behavior)

On the dev store editor, on a **real** template:

1. Open the **Style** tab → the placeholder is gone, a Dividers control shows **Lines**
   selected (the default).
2. Change to **Stripes** → the **SaveBar opens** (dirty flips on a styling change alone, with
   no row edit).
3. **Discard** → the control returns to Lines, SaveBar closes (the remount reseed works).
4. Change to **Stripes** again → **Save** → "Saved" toast; confirm via Neon `run_sql` that the
   template has one `TableStyling` row with `rowDividerStyle = 'STRIPES'` and **every other
   override column `NULL`** (the full-column write with explicit nulls, live).
5. **Reload the page** → the control still reads **Stripes** (the loader → `parseStylingValues`
   → seed path), and the SaveBar is **closed** (a reload is not dirty).
6. Set it back to **None**, save, re-query → `rowDividerStyle = 'NONE'`. Set back to **Lines**
   (the default), save, re-query → the column is **`NULL`**, proving a reset-to-default
   actually *clears* the override rather than storing the string.
7. **The create-on-first-save path**: on `/app/templates/new`, set Dividers before the first
   save, add a row, Save → the new template gets both its rows and a `TableStyling` row in one
   flow. This branch has never run with a real payload. Clean up the scratch template after.
8. **Regressions**: a rows-only save still leaves styling untouched (Step 4's clobber guard,
   now with a row actually present — re-check the column after a rename-only save); the
   metaobject sync still fires for rows and is unchanged by a styling-only save; the storefront
   still renders identically (styling is not delivered until Step 7 — **a merchant will see the
   knob persist in the admin but see no storefront change yet**, which is expected and worth
   noting in the tracker).
9. Console clean throughout (no CSP / hydration / Polaris warnings).

## File placement (per `code-standards.md`)

- Engine state + payload → **`app/routes/app.templates_.$id/useRowEngine.ts`** (extended).
- The panel → **`app/routes/app.templates_.$id/StyleTab.tsx`** (new — sibling of
  `SettingsTab.tsx`).
- Slot fill + `initialStyling` wiring → **`app/routes/app.templates_.$id/SpecTableEditor.tsx`**
  and **`route.tsx`**.
- Tests → **`app/routes/app.templates_.$id/useRowEngine.test.ts`** (or the existing engine test
  file) + a small pure test for the option-list derivation.
- Any panel-local styles → the existing **`SpecTableEditor.module.css`**.
- **Unchanged:** `app/utils/tableStyling.ts`, `app/utils/tableStylingCss.ts`,
  `app/models/template.server.ts`, `prisma/schema.prisma`, `EditorShell.tsx`,
  `previewStyles.ts`, the entire `extensions/` tree, `package.json`.

## Done when

1. The engine holds `styling` as one resolved value, seeded from the loader, mutated through
   `setStylingField`, riding the dirty snapshot and the Save payload as the overrides-only wire
   shape — with the snapshot and the payload provably using the same serialization.
2. The Style tab renders a working **Dividers** control derived from `ROW_DIVIDER_STYLES`;
   changing it opens the SaveBar; Discard reverts it.
3. Save persists it; reload restores it; resetting to the default clears the DB column to
   `NULL`. Both the update path and the create-on-first-save path are live-verified.
4. No server, schema, CSS, Liquid, metaobject, or dependency change shipped.
5. All new tests green; full gate passes.
6. `progress-tracker.md` updated — feature 57 Step 5 complete, with the "persists but does not
   yet render" state called out explicitly; point at **Step 6 (live styling in the device
   previews)** — the step that makes the knob visible.
