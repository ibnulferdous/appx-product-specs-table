# Template create-on-first-save (starter scaffold)

## Goal in one sentence

Replace the standalone "Create template" name/status **form** with a flow where
clicking **Create template** opens the **real editor** seeded with a starter
scaffold — **1 section header + 5 blank data rows** — and the Postgres row is
created **on the first Save** (create-on-first-save), so a merchant lands
straight in the spreadsheet instead of filling a form first.

## Why change the create flow

- **Fewer steps to value.** The old `/app/templates/new` route rendered a
  separate `NewTemplateForm` (name + status) the merchant had to submit before
  ever seeing a table. The create-on-first-save flow drops that gate: Create →
  editor with a usable scaffold → fill cells → Save.
- **One editor, one save path.** Editing an existing template already POSTs the
  row array as JSON to the route action and persists via `saveTemplateForShop`.
  The create flow now reuses the same editor and the same JSON submit; only the
  action branch differs (create vs. update). No second editor, no FormData path.
- **An empty editor is unhelpful.** A brand-new template with zero rows gives the
  merchant nothing to type into. The starter scaffold (1 section + 5 rows) is the
  smallest layout that reads as a real spec table and invites immediate editing.

## The starter scaffold

A new template opens with a deterministic seed produced by `createInitialRows()`
(`app/utils/rows.ts`):

- **1 `SECTION_HEADER`** (provisional key `section`), then
- **`INITIAL_DATA_ROW_COUNT` = 5 blank `DATA` rows** (provisional keys `row`,
  `row_2`, `row_3`, `row_4`, `row_5`).

The seed is built by folding the canonical `rowsReducer` from `[]` (one
`ADD_SECTION`, then five `ADD_ROW`), so it reuses the exact same key logic,
cap behavior, and row shape as interactive row creation — no parallel
construction path. Ids are minted via an injectable `mkId` (defaults to
`newRowId`) so the factory is deterministic under test.

`INITIAL_DATA_ROW_COUNT` is a named constant, not a magic number — the count may
change later (per the no-hardcoded-literal convention used for
`MAX_TEMPLATE_ROWS`).

## What changes (architecture)

### 1. `app/utils/rows.ts` — seed factory + constant

- `export const INITIAL_DATA_ROW_COUNT = 5;`
- `export function createInitialRows(mkId = newRowId): EditorRow[]` — folds
  `rowsReducer` from `[]`: one `ADD_SECTION`, then `INITIAL_DATA_ROW_COUNT`
  `ADD_ROW`s, minting each id via `mkId`. Framework-free, reuses canonical key
  logic, returns the provisional keys `section`, `row`, `row_2`…`row_5`.

### 2. `app/models/template.server.ts` — accept rows on create + default name

- `export const DEFAULT_TEMPLATE_NAME = "Untitled template";`
- `createTemplateForShop` now accepts an optional `rows` payload and mirrors
  `saveTemplateForShop`'s row handling: `parseRows` (narrow untrusted input),
  the shared `MAX_TEMPLATE_ROWS` cap, and key finalization via
  `reconcileRowKeys(incoming, [])` — a brand-new template has nothing persisted,
  so every row's key is finalized from its label. The validated name + status +
  finalized rows are written in one `prisma.template.create`. Shop scoping is
  unchanged (`shopId` in the `data`).

### 3. `app/routes/app.templates_.$id/route.tsx` — seed the loader, rewrite the new action, render the editor

- **Loader, `"new"` branch:** return a **synthetic** template
  `{ id: "new", name: DEFAULT_TEMPLATE_NAME, status: TemplateStatus.DRAFT, rows:
  createInitialRows() }`. The `params.id === "new"` short-circuit still does **no
  DB hit**; any other unknown id still throws 404.
- **Action, `"new"` branch:** read JSON `{ rows, name, status }` (the editor's
  submit shape, not FormData) → `createTemplateForShop(...)` → on failure return
  `{ ok: false, error }` (stays on `/new`, the editor toasts it) → run the
  metaobject sync helper (best-effort; the template is already durable in
  Postgres) → `redirect("/app/templates/${id}?created=1")`. The editor's
  `saveFetcher` follows the redirect and remounts at the real id in normal mode.
- **Metaobject sync extracted** to a local `syncTemplateToMetaobject(admin, shop,
  template) → { syncError, roundTripOk }` helper, called unchanged by the
  existing save branch (behavior-preserving) and by the new create branch.
- **Component:** always render `TemplateOverview` (the template is never null for
  `"new"` now). `TemplateOverview` already feeds `initialRows={parseRows(
  template.rows)}`, so the seed flows in with no editor change. Delete
  `NewTemplateForm`, `STATUS_OPTIONS`, and the now-unused imports (`Form`,
  `useActionData`, `useNavigation`).
- **`?created=1` toast:** `TemplateOverview` detects the param once on landing,
  toasts "Template created", and strips it.

## No editor-engine change

The editor already submits the current rows (seed + edits) as JSON to the route
action via `saveFetcher`. For `"new"`, the dirty baseline is the seed JSON, so:

- an untouched seed is **not dirty** → an abandoned `/new` persists nothing;
- the first edit raises the App Bridge SaveBar;
- **Discard** resets to the seed (the existing `editorNonce` remount).

The new-vs-existing branch lives entirely in the route action.

## Locked decisions

- **Create-on-first-save.** No Postgres row exists until the first Save; opening
  `/app/templates/new` and leaving creates nothing.
- **Scaffold = 1 section + 5 blank data rows**, built by folding the reducer
  (`createInitialRows`), provisional keys `section` / `row` / `row_2`…`row_5`,
  finalized from labels at Save like every other new row.
- **New templates default to name `"Untitled template"` and status `DRAFT`.** The
  editor rides `name`/`status` along unchanged (rename/status UI is a later
  slice — Phase F).
- **The create branch reads JSON**, matching the editor submit; the old FormData
  create form is deleted.
- **Sync is best-effort on create.** A sync failure does not block the redirect —
  the template is durable in Postgres, defaults to DRAFT (not storefront-rendered),
  and the next Save resyncs.

## Tests

- `createInitialRows()`: 1 `SECTION_HEADER` + 5 `DATA` rows, all blank, unique
  provisional keys; deterministic when ids are injected.
- `createTemplateForShop` with rows: name validation, cap rejection, key
  reconciliation (provisional → slug-from-label), shop-scoped write.
- The `"new"` action (create + redirect, unknown-id 404, cross-shop create
  blocked) is covered by the shop-scoped `createTemplateForShop` tests plus
  manual browser verification — the repo has no route-action integration harness
  (auth + admin client mocking), per the testing strategy of covering pure logic
  and security boundaries, not full route integration.

## Done when

1. Clicking **Create template** opens the editor with 1 section + 5 blank rows.
2. Filling a cell and Saving creates the Postgres row and flips the URL to the
   real cuid; a refresh persists the rows.
3. Create-then-leave (no edit) adds nothing to the templates list.
4. `createInitialRows` + `createTemplateForShop`-with-rows unit tests pass;
   `npm run test:run` and `npm run build` are green.
5. `progress-tracker.md` reflects the completed change.
