# Templates list — per-row overflow `<s-menu>` + Duplicate + Delete (suggestions §3)

## Goal in one sentence

Every row in the Templates list gets a trailing **overflow `<s-button> → <s-menu>`**
with **Duplicate** and **Delete** (Rename lands in file 27), wired through a **new
list-route `action`** that **reuses the existing shop-scoped server functions**
(`duplicateTemplateForShop`, `deleteTemplateForShop`, `deleteSpecTableMetaobject`)
and **revalidates the list in place** — no navigation away from the list.

## Why this is now

Per the suggestions doc, per-row actions are the **"build first"** item and the
biggest UX win: the server logic already exists (built for the editor header in
feature 20), so the list only needs the menu UI + a thin list-route `action` that
calls the same functions. Duplicate and Delete come first because they are **pure
reuse** — zero new server code beyond wiring. Rename (file 27) needs a new
rows-untouching server function, so it is split off to keep this step low-risk.

## Why a list-route `action`, not the detail route

The list route (`app.templates.tsx`) is **loader-only today**. Row actions could
POST to the per-row detail route (`/app/templates/{id}`, which already has
`duplicate`/`delete` intents), but that route's redirects are detail-page-centric
(duplicate → the copy's editor; delete → the list). On the list we want the native
index-table behavior: **stay on the list and revalidate in place** so the table
updates without a context switch. So this step adds an `action` to the **list**
route with its own `intent` discriminator, and every row action returns data (not a
redirect) — React Router auto-revalidates the list loader after a fetcher
submission, so the table refreshes itself.

## What changes (architecture)

### 1. New list-route `action` — `app/routes/app.templates.tsx`

Add an `action` alongside the existing `loader`. Same auth surface as the loader
(`authenticate.admin` + `upsertShop`). It reads a JSON payload
`{ intent: "duplicate" | "delete"; id: string }` and shop-scopes everything through
`shop.id` (priority #1 — never trust the client's id without the `shopId` filter,
which every reused function already enforces):

```
// intent === "duplicate" → duplicateTemplateForShop(shop.id, id)
//                          → { ok, error? }   (revalidate; the "(copy)" row
//                            appears at the top — orderBy updatedAt desc)
// intent === "delete"    → getTemplateByIdForShop(shop.id, id) then, if owned:
//                            deleteSpecTableMetaobject(admin, { gid, templateId })  // best-effort, FIRST
//                            deleteTemplateForShop(shop.id, id)                      // durable Postgres delete, SECOND
//                          → { ok: true }     (revalidate; the row disappears)
```

This **mirrors the detail route's delete branch exactly** (metaobject first so a
storefront-readable metaobject can't outlive its template — priority #2; then the
durable Postgres delete). The only difference is the **return value**: `{ ok }` data
instead of `redirect(...)`, so the list stays put and revalidates.

No new server function in this step — `duplicateTemplateForShop`,
`deleteTemplateForShop`, and `deleteSpecTableMetaobject` already exist
(`template.server.ts` / `metaobjects.server.ts`) and carry their own shop-isolation.

### 2. Per-row overflow menu — `TemplateTableRow`

Add a trailing actions cell to the row (and a matching header cell). The trigger +
menu are **per row**, so each needs a unique id derived from the template id:

```tsx
const menuId = `template-actions-${template.id}`;
// ...trailing cell:
<s-table-cell>
  <s-button
    icon="menu-horizontal"
    accessibilityLabel={`Actions for ${template.name}`}
    commandFor={menuId}
  />
  <s-menu id={menuId} accessibilityLabel={`Actions for ${template.name}`}>
    <s-button icon="duplicate" onClick={() => onDuplicate(template.id)}>
      Duplicate
    </s-button>
    <s-button
      icon="delete"
      tone="critical"
      onClick={() => onRequestDelete(template.id, template.name)}
    >
      Delete
    </s-button>
  </s-menu>
</s-table-cell>
```

- Add a sixth `<s-table-header>` for the actions column (label e.g. an
  `accessibilityLabel="Actions"` empty header, matching native index tables that
  leave the action column visually unlabeled).
- The row stays presentational: handlers come **down as props**
  (`onDuplicate(id)`, `onRequestDelete(id, name)`) from the page component. State,
  the fetcher, the App Bridge, and the confirm modal live **once at the page level**
  — not duplicated per row.

### 3. Page-level wiring — `TemplatesPage`

- `useAppBridge()` for toasts + modal control (the list page does not import App
  Bridge today — add it).
- One `useFetcher()` for the menu actions (`duplicate`/`delete` are mutually
  exclusive in time, so a shared fetcher is fine; Rename gets its own in file 27).
- **Duplicate** → `fetcher.submit({ intent: "duplicate", id }, { method: "post",
  encType: "application/json" })`. No confirmation (nothing is destructive or
  unsaved on a list). On success toast **"Template duplicated"**; on
  `{ ok: false }` toast the error.
- **Delete** → opens a **single shared confirmation `<s-modal>`** (not one per row)
  driven by `pendingDelete` state (`{ id, name } | null`):
  - `onRequestDelete(id, name)` sets `pendingDelete` and `shopify.modal.show(...)`.
  - The modal copy names the target (`Delete "{pendingDelete.name}"?`) with a
    `tone="warning"` banner ("This action cannot be undone.") and a critical primary
    button (`variant="primary" tone="critical"`, `loading` while the fetcher runs).
  - Confirm → `fetcher.submit({ intent: "delete", id: pendingDelete.id }, …)`; on
    completion hide the modal, clear `pendingDelete`, toast **"Template deleted"**.
  - Cancel / Esc / outside-click → hide + clear; deletes nothing. **Never deletes on
    first click.**
- A `useEffect` watching `fetcher.state`/`fetcher.data` surfaces the success/error
  toast once the submission settles (the list loader auto-revalidates, so the table
  is already correct by then).

### 4. `<s-menu>` render check + fallback

This app has a documented history of light-DOM web-component quirks (e.g.
`<s-button-group>` renders 0×0; see `[[polaris-web-component-gotchas]]` and
`RowActionsToolbar.tsx`). `<s-menu>` is the **same component the editor header uses**
(`TemplateHeaderActions.tsx`, feature 20) and renders there, so it is expected to
work — but **verify in the embedded app before committing**. **Fallback** if a
per-row `<s-menu>` misbehaves inside `<s-table-cell>`: render the actions as a small
inline cluster of plain `<s-button>`s in the cell (Duplicate, Delete
`tone="critical"`). Record which path shipped in the progress tracker.

## Locked decisions

- **List-route `action`, revalidate in place.** Row actions return `{ ok }` data and
  let React Router revalidate the list loader; **no redirect / no navigation** (the
  native index-table feel). This is the deliberate divergence from the detail
  route's redirecting duplicate/delete.
- **Duplicate stays on the list.** The new "(copy)" (DRAFT) row appears at the top
  after revalidation; the merchant is **not** thrown into the copy's editor.
  (Discarded alternative: navigate to the copy — rejected as a surprise context
  switch from a bulk-management surface.)
- **Delete: metaobject first (best-effort), Postgres second** — identical ordering
  to the detail route so a storefront-readable metaobject can't outlive its
  template (priority #2). Reuses the existing functions verbatim.
- **Single shared confirm modal + `pendingDelete` state**, not one `<s-modal>` per
  row (lighter DOM, one focus trap). Confirmation is mandatory; cancel/Esc/outside
  add nothing.
- **Rows stay presentational**; all state/fetcher/modal/App-Bridge logic lives at
  the page level and flows down as `onDuplicate`/`onRequestDelete` callbacks.
- **No new server function this step** — Duplicate/Delete are pure reuse of feature
  20's shop-scoped functions.

## What this step does *not* own (boundary)

- **Rename** — file 27 (needs a new rows-untouching `renameTemplateForShop`; reusing
  `saveTemplateForShop` would clobber rows, since `parseRows(undefined) → []`).
- **Archive** — deferred entirely (storefront metaobject re-sync + a status setter;
  revisit when product assignment ships). The menu shows only Duplicate/Delete now
  (Rename added in file 27).
- **Search / sort / pagination / multi-select bulk actions** — later Phase-2 steps.
- **The clamp** — file 25.

## File placement (per `code-standards.md`)

- List `action`, page-level fetcher/modal/toast wiring, `TemplateTableRow` menu →
  **`app/routes/app.templates.tsx`**.
- **No change** to `template.server.ts`, `metaobjects.server.ts`,
  `templateName.ts`, `templateStatus.ts`, the editor route, or the schema.

## Testing

The reused server functions (`duplicateTemplateForShop`, `deleteTemplateForShop`,
`deleteSpecTableMetaobject`) **already have unit coverage including cross-shop
isolation** (feature 20). This step adds only the list `action` wiring (thin
dispatch over those functions) and App-Bridge-imperative UI (menu, confirm modal,
toasts, fetcher) — no new extractable pure logic — so it is covered by **browser
verification**, per `[[testing-strategy]]` (jsdom can't render Polaris web
components; there is no route-action integration harness). Suite count unchanged.

**Browser verification (embedded app):**

- The overflow menu opens per row; `<s-menu>` renders (or the fallback shipped).
- **Duplicate** adds a DRAFT "{name} (copy)" row at the top of the list and toasts
  "Template duplicated" — no navigation.
- **Delete** opens the confirm modal naming the right template; Cancel/Esc/outside
  add nothing; Confirm removes the row, toasts "Template deleted", and the
  storefront metaobject is cleaned up (best-effort).
- A failed action (e.g. forced error) surfaces an error toast and leaves the list
  unchanged.

## Done when

1. Each row shows a working overflow menu with Duplicate + Delete.
2. Duplicate revalidates the list with the new DRAFT copy at the top; Delete
   confirms then removes the row (Postgres + best-effort metaobject) and
   revalidates — both **without leaving the list**.
3. `npm run build`, `typecheck`, `lint`, `format:check`, and `test:run` pass
   (suite count unchanged).
4. No new server function, dependency, schema, or CSS; only `app.templates.tsx`
   touched.
5. `context/progress-tracker.md` updated; browser-verified, noting whether
   `<s-menu>` or the inline-button fallback shipped.
