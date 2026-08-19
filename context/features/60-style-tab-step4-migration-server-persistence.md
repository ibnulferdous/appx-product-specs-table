# Feature 57 · Step 4 — Style tab: `add_table_styling` migration + server persistence

## Goal in one sentence

Create the `TableStyling` table (additive migration, exactly the model locked in
`data-model.md` §5) and teach the server to persist and load it — full-column overrides written
through the **shop-scoped template update**, read back through `parseStylingValues` — so the
DB ⇄ domain pipe is complete and unit-tested while **no UI sends or reads a single styling
value yet** (Step 5 wires the engine).

## Where this sits (feature 57 map)

Feature 57 is the **Style tab (Reshell Phase B)** — binding spec locked 2026-07-18 in
`admin-screen-plan.md` §Tab 2 + `data-model.md` §5/§10. The steps (B1 = 1–12, B2 = 13–14,
B3 outlined):

1. Pure styling domain module — **COMPLETE** (`57-…`, 2026-07-18)
2. Pure presentation mapping — **COMPLETE** (`58-…`, 2026-07-18)
3. Storefront stylesheet rules (dormant) + mobile-stacked default — **COMPLETE** (`59-…`, 2026-07-18)
4. **`add_table_styling` migration + server persistence ← THIS DOC**
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

- **It is the first schema change of Phase B**, and merchant data safety is priority #1. A
  migration + persistence layer that lands alone can be verified alone: the migration applies,
  every isolation path is tested, and nothing user-visible moved.
- **`TableStyling` has no `shopId` column** — isolation rides entirely on template ownership.
  That makes "how does a styling write stay shop-scoped?" the step's real design decision, and
  it deserves review without a UI diff on top.
- **Step 5 needs a finished contract to build on.** The engine's save round-trip is only
  writable against a persistence function whose semantics (what does `undefined` mean? what
  clears a field?) are already locked and tested.

## Foundation carried

- **The model is already locked** — `data-model.md` §5 contains the full `model TableStyling`
  block AND the `styling TableStyling?` back-relation on `Template`. **`schema.prisma` catches
  up to the doc verbatim**; if implementation wants any column changed, that is a data-model.md
  edit first, per the standing rules.
- **One vocabulary end to end** (Step 1 lock): TS field names = Prisma column names = wire keys.
  This is what makes the column mapping a loop, not a hand-written field list.
- **The overrides-only law** (Step 1, `serializeStylingOverrides` doc comment): the wire shape
  is overrides-only, but *"never the Prisma upsert input, which must write every column so a
  field reset to default is actually cleared in the DB."* This step is where that sentence
  becomes code.
- **Tolerant parse at every trust boundary** (Step 1): `parseStylingValues` never throws and
  degrades per-field — which lets it double as the DB-read decoder (below).
- Server conventions to mirror (`template.server.ts`): shop-scoped ownership read + shop-scoped
  write (double enforcement, `saveTemplateForShop`), `{ ok: true/false }` result objects,
  optional payload fields updated only when provided, mocked-Prisma unit tests
  ([[testing-strategy]] Phase 2 pattern).

## What changes (architecture)

**One migration + one server module extended + route plumbing. No component, no engine change,
no CSS, no Liquid, no metaobject change, no dependency.**

### 1 · `prisma/schema.prisma` + migration (additive)

- Add `model TableStyling` — **copied verbatim from `data-model.md` §5** (7 layout-knob columns
  with `sectionsCollapsible Boolean @default(false)` as the one non-null knob, 7 nullable color
  columns, 6 nullable typography/width columns with `fontSize String?` holding a keyword OR an
  all-digit px string and `labelWidthPct Int?`, plus `basedOnPreset String?` and
  `extraStyles Json @default("{}")`). `templateId String @unique` +
  `onDelete: Cascade` — one styling row per template, dies with its template.
- Add `styling TableStyling?` to `model Template` (the back-relation data-model.md already
  shows).
- `npx prisma migrate dev --name add_table_styling` against the Neon dev branch. **Purely
  additive** — new table + FK, no existing-row rewrite, no backfill (see the no-row rule
  below), zero downtime.
- `data-model.md` needs **no edit** — this step implements what §5 already records.

### 2 · The column semantics (the write/read mapping)

> **Columns store overrides.** A knob at its flagged default → `NULL` (per the §5 column
> comments: "null = the flagged default"); a nullable field at inherit → `NULL`;
> `sectionsCollapsible` is written verbatim (its default `false` IS the column default);
> a domain `fontSize` number → the all-digit string (`18` → `"18"`).

- **Write = full-column, always.** `stylingToDbColumns(values)` — one loop over
  `STYLING_FIELD_NAMES` — emits **every** column, explicit `null`s included, so a merchant
  resetting a knob to default actually clears the stored override. Never a partial patch.
- **Read = `parseStylingValues(row)`.** The Step 1 tolerant parse is the decoder: `NULL` knob →
  flagged default, `NULL` color/typography → inherit, `"18"` → `18`, and a corrupt or legacy
  column value (a future rename, a manual DB edit) degrades to that field's default instead of
  crashing the editor. Extra row keys (`id`, `templateId`, `basedOnPreset`, `extraStyles`) are
  ignored by the parse — no projection needed.
- **Round-trip law (tested):** for every valid `v`,
  `parseStylingValues(stylingToDbColumns(v))` deep-equals `v`. The DB is just another wire.
- **No row = all defaults.** A template with no `TableStyling` row is a fully-default table.
  The row is created **lazily on first styling save** — no backfill for existing templates, and
  `createTemplateForShop` does not create one. Loader-side: missing row →
  `DEFAULT_STYLING_VALUES` (equivalently `parseStylingValues({})` — same thing by the Step 1
  contract).
- `stylingToDbColumns` lives in **`template.server.ts`** (exported for tests): the domain module
  `tableStyling.ts` stays the client-safe vocabulary; column shape is a persistence concern.

### 3 · Persistence (`app/models/template.server.ts`)

- **`saveTemplateForShop` gains an optional `styling` payload field** (alongside
  `rows`/`name`/`status`, same optionality convention):
  - `styling === undefined` → **styling untouched.** A rows-only or rename save can never
    clobber a template's look.
  - `styling` present → `parseStylingValues(payload.styling)` (never trust the client — same
    posture as `parseRows`), then `stylingToDbColumns`, then a **nested upsert through the
    shop-scoped template update**:

    ```ts
    prisma.template.update({
      where: { id, shopId }, // the write itself carries shopId
      data: { ...data, styling: { upsert: { create: cols, update: cols } } },
    });
    ```

  This is the isolation answer for a model with no `shopId` column: the styling write only
  exists inside a template write that is itself shop-scoped (extended where-unique), on top of
  the existing ownership read — the same double enforcement as every other write in the module.
  There is deliberately **no free-standing `upsertTableStyling(templateId, …)`** anywhere; a
  bare-`templateId` write path would be a cross-shop hole waiting for a careless caller.
  - The tolerant parse **cannot fail**, so a malformed styling payload degrades to defaults
    rather than blocking a save that also carries rows — consistent with "per-field
    degradation, never throw" (Step 1). Rows keep their own stricter gate (`parseRowsWithinCap`)
    exactly as today.
- **`getTemplateByIdForShop` gains `include: { styling: true }`.** All callers (loader, action
  ownership reads) tolerate the extra key; reads stay one query.
- **`duplicateTemplateForShop` copies the styling row** when the source has one (same
  full-column values; fresh row for the new template). Copy semantics (§5): duplicating a
  styled template must not silently produce an unstyled twin. `basedOnPreset` is copied too
  (provenance travels with the copy); `extraStyles` copied verbatim.
- **`deleteTemplateForShop` needs no change** — `onDelete: Cascade` removes the styling row;
  a test pins that expectation.

### 4 · Route plumbing (`app/routes/app.templates_.$id/route.tsx`) — dormant

- **Action**: the JSON payload type gains `styling?: unknown`, passed through to
  `saveTemplateForShop` on **both** branches (the update path directly; the create-on-first-save
  path persists it after `createTemplateForShop` returns the new id, via the same
  save function). No UI sends it yet — the field is simply accepted.
- **Loader**: returns `styling: StylingValues` — `parseStylingValues(template.styling ?? {})` —
  alongside the existing template/assignment data (`DEFAULT_STYLING_VALUES` for `/new`). No
  component reads it yet; Step 5 seeds the engine from it.
- The loader value is the **resolved domain shape**, never raw DB columns: the client's one
  styling vocabulary is `StylingValues`, and the decode happens server-side exactly once.

## Locked decisions

- **Schema = `data-model.md` §5, verbatim.** Any deviation is a doc change first.
- **Columns store overrides; `NULL` = default/inherit; writes are full-column.** The three
  serialization surfaces stay distinct on purpose: wire = overrides-only object (Step 1), DB =
  full columns with explicit `NULL`s, domain = resolved `StylingValues`. One vocabulary, three
  encodings, each with a single mapping function.
- **`parseStylingValues` is the one DB decoder.** No second "fromRow" mapping to drift.
- **No styling row = all defaults; lazy create on first styling save; no backfill.**
- **All styling writes ride the shop-scoped template update** (nested upsert). No free-standing
  styling write function exists.
- **`styling === undefined` leaves the row untouched**; present = full replace. There is no
  field-level patch API — the client always holds and sends the whole resolved value (Step 5's
  engine state), so a partial-merge API would only add ambiguity.
- **Duplicate copies styling** (incl. `basedOnPreset` provenance). **Delete cascades.**
- **`basedOnPreset` / `extraStyles` are created by the migration but never written by this
  step** — Step 13 (presets) and post-MVP own them. `stylingToDbColumns` does not emit them.
- **Metaobject sync untouched** — styling reaches the storefront in Step 7; a styling save in
  Step 4/5 must not trigger or alter any metaobject write.
- **Dormant on arrival**: no UI sends `styling`, no component reads the loader field; the only
  observable change for a merchant is nothing.

## What this step does *not* own (boundary with later steps)

- **Engine styling state, the dirty snapshot, any rail control, and the Save payload actually
  carrying `styling`** → **Step 5** (the first end-to-end round-trip, browser-verified there).
- **Preview consumption of styling** → **Step 6**; **metaobject `styling` field + Liquid
  emission** → **Step 7** (the metaobject definition TOML edit is a migration per
  [[shopify-metaobject-deploy-clean-lifecycle]] — deliberately NOT this step).
- **Preset constants / `StylePreset` model / the field-set drift test** → **Steps 13–14**
  (phase 2 for the saved-preset model).
- **Any change to** `tableStyling.ts` / `tableStylingCss.ts` / `spec-table.css` /
  `previewStyles.ts` / the engine / any component. If the mapping needs a domain change, that
  is a Step 1 revision first.

## Testing (unit — mocked Prisma, per [[testing-strategy]] Phase 2; plus the pure mapping)

`template.server.test.ts` (extended) + pure mapping cases:

1. **`stylingToDbColumns`** — all-defaults → every nullable column `null` +
   `sectionsCollapsible: false`; a fully-overridden value → every column populated; keyword
   `fontSize` stays a keyword string, numeric `18` → `"18"`; `labelWidthPct` stays an Int;
   `basedOnPreset`/`extraStyles` absent from the output.
2. **Round-trip law** — `parseStylingValues(stylingToDbColumns(v))` deep-equals `v` for the
   defaults, a fully-overridden fixture (reuse Step 1's `FULLY_OVERRIDDEN`), and a
   px-fontSize value.
3. **DB-shape decode** — a realistic row object (with `id`/`templateId`/`basedOnPreset`/
   `extraStyles` present and every knob `NULL`) parses to `DEFAULT_STYLING_VALUES`; a corrupt
   column value (`rowLayout: "LEGACY"`) degrades to that field's default only.
4. **Save: styling undefined** — `prisma.template.update` receives **no `styling` key** in
   `data` (rows-only saves can't clobber).
5. **Save: styling present** — `data.styling.upsert.create/update` both equal the full-column
   shape, explicit `null`s included; a malformed `styling` payload (string, array) degrades to
   the all-defaults column shape and the save still succeeds.
6. **Shop isolation** — wrong `shopId` + styling payload → `{ ok: false }`, and no update call
   reaches Prisma (the ownership read gate), mirroring the existing isolation cases.
7. **Duplicate** — source with a styling row → `create` includes a full styling copy (incl.
   `basedOnPreset`); source without → no styling in the create.
8. **Cascade expectation** — delete path unchanged; a test documents that styling removal is
   the FK's job (no explicit styling delete call).
9. Gate: `npm run typecheck && npm run lint && npm run format:check && npm run test:run &&
   npm run build` all green.

### Live verification (small — this step ships a migration)

- `npx prisma migrate dev --name add_table_styling` applies cleanly against the Neon dev
  branch; `TableStyling` exists and has **zero rows** (no backfill — via the Neon MCP
  `run_sql`, or Prisma Studio).
- **Regression, not features**: open the editor on the dev store, save a template (rows-only),
  confirm the save succeeds and the styling row count is still zero (undefined = untouched,
  proven live).
- Optional dormant-pipe smoke: from the embedded app's devtools console, re-send the editor's
  save fetch with a hand-added `styling: { rowDividerStyle: "STRIPES" }` — expect one
  `TableStyling` row with `rowDividerStyle = 'STRIPES'` and every other override column `NULL`,
  and the loader (page reload → network tab) returning the resolved value. Delete the row (or
  re-send with `styling: {}`) afterwards — wait: `styling: {}` parses to all-defaults and
  writes all-`NULL` columns (the row remains, all defaults — equivalent to no row). Either end
  state is fine; note which one was left.

## File placement (per `code-standards.md`)

- Schema → **`prisma/schema.prisma`**; migration → **`prisma/migrations/…_add_table_styling/`**
  (generated, never hand-edited after apply).
- Persistence + `stylingToDbColumns` → **`app/models/template.server.ts`** (styling is
  template-owned; no new module until presets need one in Step 13+).
- Tests → **`app/models/template.server.test.ts`** (extended).
- Route plumbing → **`app/routes/app.templates_.$id/route.tsx`** (payload type + loader field
  only).
- **Unchanged:** `app/utils/tableStyling.ts`, `app/utils/tableStylingCss.ts`,
  `useRowEngine.ts`, all components, `metaobjects.server.ts`, the entire `extensions/` tree,
  `package.json`.

## Done when

1. The migration is applied to the dev branch DB; `TableStyling` matches `data-model.md` §5;
   Prisma client regenerated.
2. `saveTemplateForShop` persists a parsed, full-column styling upsert through the shop-scoped
   template update; `undefined` leaves styling untouched; duplicate copies; delete cascades.
3. Loader returns resolved `styling: StylingValues` (defaults when no row); action accepts
   `payload.styling` on both branches. No UI change anywhere.
4. All new tests green (mapping, round-trip, decode, isolation, clobber-guard, duplicate);
   full gate passes.
5. Live check done: migration applied, rows-only save leaves zero styling rows.
6. `progress-tracker.md` updated — feature 57 Step 4 complete; point at **Step 5 (engine
   styling state + Dividers control + Save round-trip)** — the first slice where a merchant
   can change something and see it survive a reload.
