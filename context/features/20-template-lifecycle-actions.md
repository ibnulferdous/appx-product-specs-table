# Template lifecycle actions (rename / duplicate / delete) + status badge

## Goal in one sentence

Give the editor page real **template-level** actions — **Rename**, **Duplicate**,
and **Delete** grouped in a header **"More actions" `<s-menu>`**, plus a read-only
**status `<s-badge slot="accessory">`** next to the heading — built on two
load-bearing prerequisites the current code lacks: the row engine must be visible
to the `<s-page>` header, and the dirty/save model must track **name** (and
status), not just the rows array.

## Scope

**In this slice**

1. **Prerequisite A** — lift `useRowEngine` so the `<s-page>` header can read
   `saving` / `isDirty` / `name` and trigger header actions.
2. **Prerequisite B** — extend the engine's dirty model beyond rows so a
   **rename** flips `isDirty`, opens the SaveBar, persists on Save, and is
   reverted by Discard.
3. **Read-only status badge** (`<s-badge slot="accessory">`) reusing the list
   page's `BADGE_TONES`.
4. **Rename** (modal → name state → existing Save flow).
5. **Duplicate template** (new server fn + route intent → navigate to the copy).
6. **Delete template** (confirm modal + new server fn + best-effort metaobject
   cleanup → navigate to the list).

**Deferred (explicitly not here)**

- **Editable status** (the `<s-select>` in the Settings-tab sidebar). Prerequisite
  B leaves `status` already wired into the meta-snapshot so this becomes a small
  follow-up, but this slice ships **no status editor** — only the read-only badge.
- **Preview** (standalone header button → live product page). Lands with the
  **product-assignment** slice, since there is no assigned product to preview
  until then.

## Why

- **The header is the only save-safe, always-reachable home for template-level
  commands.** Everything in the `<s-page>` header (`route.tsx`) renders ABOVE the
  `inert` freeze wrapper in `SpecTableEditor.tsx` (the `.stageFreeze` div wraps
  only `<EditorShell>`), so header controls stay clickable during an in-flight
  save — exactly like the `<SaveBar>` and the Insert-field modal, which both
  deliberately portal outside the freeze.
- **Naming collisions force header placement.** `RowActionsToolbar` already has a
  **Duplicate** button (duplicates the active *row* via `engine.handleDuplicate`),
  and every row has a **delete ✕** in `RowGutter` (`aria-label "Delete row N"`).
  A template-level Duplicate/Delete in or near the editor body would read as the
  same control. The header `<s-menu>` with verb+noun labels ("Duplicate template",
  "Delete template") and a "Danger zone" section is the disambiguation.
- **Rename is net-new UI.** There is no name input anywhere today:
  `DEFAULT_TEMPLATE_NAME` is fixed, `validateName` exists in
  `template.server.ts` but no UI calls it, and the engine rides `initialName`
  along unchanged (`useRowEngine.ts` `handleSave`). The heading
  (`<s-page heading={…}>`) is the live render target a rename must update.
- The admin plan already anticipates this exact shape — a header **⋯ more-actions
  menu** (Duplicate / Archive / Delete / Rename) and a header status affordance —
  see `context/admin-screen-plan.md` (the "Top bar" and "More-actions menu"
  notes). This slice realizes the rename + lifecycle half of that plan; the
  status *dropdown* half is deferred to the editable-status slice.

---

## Phase 1 — Prerequisites (ship first, no new user-facing actions)

Phase 1 is a **behavior-preserving refactor**: after it, the editor looks and
behaves identically (same SaveBar, same Discard, same create-on-first-save), but
the engine now lives where the header can use it and tracks name/status in its
dirty baseline. Build green before starting Phase 2.

### A. Lift the engine to the page owner

Today `useRowEngine` is called inside `SpecTableEditor`, one level **below** the
`<s-page>` header rendered by `TemplateOverview`. Lift it so a single engine
instance is shared by the header and the editor.

**Chosen structure** (`app/routes/app.templates_.$id/route.tsx`):

- The engine owner is the component that renders `<s-page>` (keep the name
  `TemplateOverview`). It calls `useRowEngine(...)` and renders **both** the
  header slots (badge, More-actions menu, modals) **and**
  `<SpecTableEditor engine={engine} />`.
- `SpecTableEditor` stops calling `useRowEngine`; it accepts `engine` as a prop
  and renders only `<EditorShell stage={<ContentTab engine={engine} />} />` plus
  the `<SaveBar>` (its `inert`-freeze effect is unchanged — it still wraps only
  `EditorShell`).
- `<s-page heading={engine.name}>` — the heading binds to **live engine name**, so
  a rename updates the H1 immediately and Discard reverts it.

**Preserve the remount-based reset by moving the key up — do NOT add a reducer
reset.** The current `key={`${template.id}:${editorNonce}`}` on `SpecTableEditor`
does two jobs (see the comment at `route.tsx`): it remounts on `id` change
(create-on-first-save: `"new"` → real cuid) and on `editorNonce` bump (Discard).
Moving the engine up means moving that key up to the **engine owner** so both jobs
keep working without a new `rowsReducer` reset action:

- `TemplateEditorPage` (the default export) owns `editorNonce` and passes
  `onDiscard={() => setEditorNonce((n) => n + 1)}` down.
- It renders `<TemplateOverview key={`${template.id}:${editorNonce}`} … />`.
- `TemplateOverview` (now the engine owner) remounts on id-change and on discard,
  exactly as `SpecTableEditor` does today — so the reducer reseeds from the
  persisted `initialRows`, and `name`/`status` reseed from
  `initialName`/`initialStatus`, with **no** reducer-reset action.

> Why not React Context or a reducer reset? The header is a *parent/sibling* of
> the editor, so context can't flow upward without lifting the provider anyway;
> and lifting the key one level preserves the existing "no reducer reset needed"
> decision from the reshell (feature 18). The only cost is remounting the
> lightweight `<s-page>` chrome on Discard — negligible, and the `?created=1`
> toast effect is idempotent (the param is already stripped by then).

### B. Extend the dirty model beyond rows (name + status meta-snapshot)

Today the only dirty signal is a JSON compare of the **rows** array
(`currentRowsJson !== savedRowsJson`), and `handleSave` sends
`name: initialName, status: initialStatus` verbatim (`useRowEngine.ts`). Generalize
this so name (and status) participate.

In `useRowEngine`:

- Add `const [name, setName] = useState(initialName)` and
  `const [status, setStatus] = useState(initialStatus)`. (This slice wires a
  setter only for **name**, via Rename. `status` has no editor yet — it stays at
  `initialStatus`; including it now makes the editable-status slice a drop-in.)
- Replace the rows-only baseline with a **meta-snapshot**:
  `const currentMetaJson = JSON.stringify({ rows, name, status })`. Keep the same
  ref + `savedMetaJson` state pattern; `isDirty = currentMetaJson !== savedMetaJson`.
- `handleSave` sends `{ rows, name, status }` from **state**, and snapshots the
  **submitted meta-JSON** (rename `submittedRowsJsonRef` → `submittedMetaJsonRef`).
  The completion effect resets the baseline to that submitted snapshot (unchanged
  rationale: an edit made during an in-flight save must stay dirty, never be
  silently marked saved).
- Expose `name`, `setName`, `status` on the returned engine. (No `setStatus`
  surface yet — keep it internal/forward-looking, or expose it unused; do not add
  a status UI in this slice.)
- Discard is unchanged in spirit: `handleDiscard` clears dirty + calls `onDiscard`
  (the parent nonce bump remounts the owner, reseeding name/status/rows).

`saveTemplateForShop` already updates `name`/`status` only when provided and valid
(`template.server.ts`), so **no server change is needed** for rename/status — they
ride the existing Save payload.

---

## Phase 2 — Status badge + lifecycle actions

### A. Read-only status badge (`<s-badge slot="accessory">`)

- Extract `BADGE_TONES` (currently a local const in `app/routes/app.templates.tsx`)
  to a shared module — e.g. `app/utils/templateStatus.ts` exporting
  `BADGE_TONES` (and reuse it in both the list page and the editor header so the
  tones can't drift). Map is unchanged: `ACTIVE→success`, `DRAFT→warning`,
  `ARCHIVED→neutral`.
- In `TemplateOverview`, render
  `<s-badge slot="accessory" tone={BADGE_TONES[template.status]}>{template.status}</s-badge>`.
- **The badge reads `template.status` from the loader (persisted), not
  `engine.status`** — it is a read-only indicator this slice. After a Save
  revalidates the loader, the badge re-tones to the saved status.

### B. "More actions" menu (header)

- One `<s-button slot="secondary-actions" icon="menu-horizontal">` ("More
  actions") whose `commandFor` targets an id-matched `<s-menu>`. Menu items:
  - **Rename template** (`icon="edit"`),
  - **Duplicate template** (`icon="duplicate"`), then
  - a **Danger zone** group: **Delete template** (`icon="delete"`,
    `tone="critical"`).
- **Budget:** 1 visible secondary (the menu); well under the s-page "1 primary +
  3 secondary" cap, leaving room for Preview later.
- **Verify `<s-menu>` renders in the current Polaris CDN build before committing.**
  This app has a documented history of light-DOM web-component quirks
  (`<s-button-group>` renders 0×0; see `[[polaris-web-component-gotchas]]` and
  `RowActionsToolbar.tsx`). **Fallback if `<s-menu>` is broken:** render
  `[Rename] [Duplicate] [Delete tone="critical"]` as three standalone
  `slot="secondary-actions"` buttons (still within the 3-secondary budget). Note
  which path was used in the progress tracker.

### C. Rename (modal → name state → existing Save)

- The menu item opens an `<s-modal>` (portaled outside the freeze) with a single
  `<s-text-field>` seeded from `engine.name` and a primary "Rename" button.
- Confirm → `engine.setName(trimmed)` → close modal. This flips `isDirty` and
  opens the SaveBar; **persistence happens on the SaveBar Save** (the existing
  `handleSave` sends the new name). No new server fn, no new fetcher, no new
  intent.
- Client-side guard in the modal mirrors `validateName` (non-empty,
  ≤ `NAME_MAX_LENGTH` = 100) for instant feedback; the server re-validates on Save
  and the existing error toast surfaces any rejection.

### D. Duplicate template (server fn + route intent)

- Menu item → if `isDirty`, guard with `shopify.saveBar.leaveConfirmation()` (the
  clone reflects **saved** state) → submit `{ intent: "duplicate" }` via a
  dedicated fetcher → the action calls `duplicateTemplateForShop` → returns
  `redirect("/app/templates/{newId}")`; the fetcher follows the redirect into the
  new template's editor (same mechanism the create flow already uses).
- **Hidden/disabled on `"new"`** (no persisted cuid to clone) and disabled while
  `engine.saving`.

### E. Delete template (confirm modal + server fn + metaobject cleanup)

- Menu item (Danger zone, `tone="critical"`) → opens a confirmation `<s-modal>`
  (portaled outside the freeze) with a warning `<s-banner>` ("This action cannot
  be undone."), a critical primary button (`variant="primary" tone="critical"`,
  async/loading), and Cancel. **Never deletes on first click.**
- Confirm → submit `{ intent: "delete" }` via a dedicated fetcher → the action
  calls `deleteTemplateForShop` (+ best-effort metaobject cleanup) → returns
  `redirect("/app/templates")`.
- **Hidden/disabled on `"new"`** (nothing persisted) and disabled while
  `engine.saving`. The confirmation modal copy doubles as the unsaved-edits guard:
  deleting discards any unsaved rows by definition, so the copy notes pending
  edits will be lost.

---

## New server functions

### `duplicateTemplateForShop(shopId, templateId)` — `app/models/template.server.ts`

- Read the owned template shop-scoped (`findFirst({ where: { id, shopId } })`);
  return `{ ok: false, error: "Template not found" }` if absent (shop isolation,
  priority #1).
- Create a new template for the same shop with:
  - `name` = `validateName("{name} (copy)")` (trim/length enforced; the copy can
    keep the same name — uniqueness is not enforced elsewhere, so "(copy)" is a UX
    courtesy, not a constraint),
  - `status` = **`DRAFT`** (a fresh copy must not be live on the storefront),
  - `rows` = the persisted rows, finalized via `reconcileRowKeys(rows, [])` exactly
    like `createTemplateForShop` (a brand-new row set, reconciled against `[]`).
- Return `{ ok: true, data: newTemplate }`.
- **No immediate metaobject sync** — the copy defaults to DRAFT (not
  storefront-rendered), so the next Save syncs it; this avoids an extra Admin API
  call on duplicate.

### `deleteTemplateForShop(shopId, templateId)` — `app/models/template.server.ts`

- Shop-scoped delete: `deleteMany({ where: { id, shopId } })` (a cross-shop id is a
  no-op, not a leak — priority #1). Return `{ ok, count }` so the route can 404 a
  not-found delete.
- Postgres is the source of truth; the route performs the metaobject cleanup
  around this call (see ordering below).

### `deleteSpecTableMetaobject(admin, { gid, templateId })` — `app/shopify/metaobjects.server.ts`

- New `metaobjectDelete(id: $id)` mutation (validate with
  `validate_graphql_codeblocks` at API version **2025-10**, like the other ops in
  this file), returning `deletedId` + `userErrors`. Resolve the GID from the
  template's stored `shopifyMetaobjectGid`; if absent, look it up by handle
  (`specTableHandle(templateId)`) first.
- **Best-effort:** wrap in try/catch, log on failure, never throw to the caller —
  reuse `readUserErrors` for the narrowing, add a small `readMetaobjectDeleteId`
  pure helper if a return value is needed.

**Delete ordering (route action):** remove the **metaobject first (best-effort)**,
then delete the Postgres row. Rationale: if Postgres deletion succeeded first and
the metaobject delete then failed, the storefront-readable metaobject would
outlive its template (priority #2, storefront correctness). With assignment not
yet built nothing points at an orphan metaobject, but deleting it first keeps the
invariant honest. A metaobject-delete failure logs and proceeds — the durable
Postgres delete is what matters.

## Route action intents — `app/routes/app.templates_.$id/route.tsx`

The action currently branches on `params.id === "new"` (create) vs. else (save).
Add an `intent` discriminator to the JSON payload
(`{ rows?, name?, status?, intent? }`); absent/`"save"` keeps today's behavior.

```
// params.id === "new": always create (lifecycle actions are disabled on /new)
// else:
//   intent === "duplicate" → duplicateTemplateForShop → redirect to /app/templates/{newId}
//   intent === "delete"    → deleteSpecTableMetaobject (best-effort) + deleteTemplateForShop → redirect to /app/templates
//   default                → saveTemplateForShop (+ syncTemplateToMetaobject), as today
```

Save uses the existing `saveFetcher`; Duplicate and Delete use **separate
fetchers** (in the engine owner) so their request state never collides with the
SaveBar's `saving` state. Both reuse the route's existing `authenticate.admin` +
`upsertShop` (one auth surface).

---

## Edge cases (keep these in mind)

| Action | `"new"` sentinel | During save (`engine.saving`) | Dirty rows | Naming |
|---|---|---|---|---|
| **Status badge** | Shows `DRAFT` (synthetic loader status) — correct/harmless | Header (outside freeze) — stays visible | Reflects persisted status only (no editor) | n/a |
| **Rename** | **Enabled** — edits the in-memory name carried into create-on-first-save; modal copy must not imply DB persistence | Disable the menu item while saving; the modal portals outside the freeze | Rides the SaveBar; Discard (remount) reverts the name | Client mirror of `validateName`; server re-validates on Save |
| **Duplicate** | **Hidden/disabled** (no cuid to clone) | Disabled | `leaveConfirmation()` before navigating so the clone is of saved rows | Clone named "{name} (copy)" server-side |
| **Delete** | **Hidden/disabled** (nothing persisted) | Disabled | Confirmation modal is the guard; copy warns unsaved edits are lost | "Delete template" + Danger zone separates it from the per-row delete ✕ |

A single `params.id === "new"` check in the engine owner hides/disables Duplicate
+ Delete and leaves Rename enabled; the four header commands disable on the lifted
`engine.saving`. Modals are hidden on save-start the same way the Insert-field
modal already is (`shopify.modal.hide(...)` in the `saving` effect) to block any
mutate-mid-save path.

## Locked decisions

- **Header, not the editor body.** All template-level commands live in the
  `<s-page>` header (outside the `inert` freeze); the editor card stays
  row-scoped. This is the answer to the Duplicate/Delete naming collisions.
- **Rename rides the dirty/Save flow** (name in the meta-snapshot), not a separate
  immediate-persist fetcher. Duplicate and Delete are navigational and use their
  own intents/fetchers.
- **Duplicate copies as DRAFT**; status of a copy is never inherited as ACTIVE.
- **Delete removes the metaobject first (best-effort), then Postgres.**
- **Status is read-only this slice** — a `<s-badge slot="accessory">` reading the
  persisted status. The editable `<s-select>` (Settings-tab sidebar) and **Preview**
  are deferred (Preview rides the product-assignment slice).
- **Engine lift preserves the remount-based reset** by moving the existing key to
  the engine owner — no `rowsReducer` reset action is introduced.

## Tests

Follow the existing strategy (`[[testing-strategy]]`): unit-test pure logic and
shop-isolation boundaries with mocked Prisma; the engine/UI wiring (App Bridge,
fetchers, Polaris web components) is covered by **manual browser verification**
(jsdom can't render Polaris web components; there's no route-action integration
harness).

- **`duplicateTemplateForShop`** — shop-scoped read + create; copy is DRAFT; rows
  reconciled against `[]`; name "(copy)"; **cross-shop duplicate blocked** (a
  foreign id reads nothing → `{ ok: false }`, creates nothing).
- **`deleteTemplateForShop`** — shop-scoped delete; **cross-shop delete is a no-op**
  (`count === 0`), deletes nothing from the other shop.
- **`deleteSpecTableMetaobject`** — pure narrowing of the `metaobjectDelete`
  payload (reuse `readUserErrors`); best-effort (a thrown/`userErrors` response is
  swallowed + logged, never bubbles).
- **Manual browser checks:** rename opens the SaveBar and persists/reverts on
  Save/Discard; the heading + badge update after Save revalidates; Duplicate lands
  in the copy's editor; Delete (after confirm) returns to the list; all four
  commands are correctly gated on `"new"` and during save; `<s-menu>` renders (or
  the fallback path is used).

## Done when

1. **Phase 1** lands as a behavior-preserving refactor: the engine is owned by the
   page component, the header can read `saving`/`isDirty`/`name`, the dirty model
   tracks the name/status meta-snapshot, and create-on-first-save + Discard behave
   exactly as before. `npm run build` + `npm run test:run` green.
2. The status badge shows next to the heading with the correct tone and updates
   after a Save.
3. Rename opens a modal, flips the SaveBar, persists on Save, and reverts on
   Discard; the heading reflects the live name.
4. Duplicate creates a DRAFT copy and navigates to it; Delete confirms, removes
   the template (and best-effort its metaobject), and returns to the list.
5. All four commands are hidden/disabled on `"new"` and disabled during a save.
6. `duplicateTemplateForShop` / `deleteTemplateForShop` / `deleteSpecTableMetaobject`
   unit tests (incl. cross-shop isolation) pass; `npm run build` is green.
7. `context/progress-tracker.md` reflects the completed work (and records whether
   `<s-menu>` or the 3-button fallback shipped).
