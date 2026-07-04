# Feature 36 — Template status change (list + editor Settings tab)

## Goal

Let a merchant change a template's status (`DRAFT` / `ACTIVE` / `ARCHIVED`) from
**two** places:

1. **Templates list** — a new **"Change status"** item in each row's ⋯ menu,
   opening a small **modal picker** (mirrors the existing Rename/Delete modals).
2. **Editor → Settings tab** — a status control in the left sidebar (the
   `settingsPanel` slot that is currently a placeholder).

Primary motivation: templates default to `DRAFT` and the storefront only renders
`ACTIVE` metaobjects, so a merchant currently has no way to publish a table for
live testing.

## Decisions (settled 2026-07-02)

- **Status set:** full Shopify-product-style **Draft / Active / Archived**
  (matches the model's 3 `TemplateStatus` values and the list's existing
  Draft/Active/Archived filter tabs).
- **List UX:** a single **"Change status"** ⋯-menu item → **modal picker** with a
  status selector + Save/Cancel (consistent with Rename/Delete; leaves room for a
  "this makes it live" note when choosing Active).
- **Editor UX:** the Settings control rides the **existing dirty/SaveBar flow** —
  changing status flips `isDirty`, and Save persists + re-syncs the metaobject
  (both already wired). No separate "publish" button.

## What already exists (so we don't rebuild it)

- `status` is a `Template` column and already flows through
  `saveTemplateForShop` (updated only when provided) via `resolveStatus`.
- **The editor engine already carries `status` in its dirty snapshot and Save
  payload** (`useRowEngine`: `currentMetaJson = {rows, name, status}`,
  `handleSave` submits `{rows, name, status}`). It is only missing a **setter** —
  `const [status] = useState(initialStatus)` was left deliberately read-only as a
  "drop-in" for exactly this slice.
- The editor Save action (`app.templates_.$id/route.tsx`) already calls
  `syncTemplateToMetaobject` after the Postgres write, which pushes the current
  `status` into the metaobject's `status` field.

**Consequence:** the editor path needs almost no server work. The list path is
the one that needs new server plumbing (rows-untouching status write + a
metaobject re-sync so a to/from-`ACTIVE` change flips storefront visibility).

## Correctness invariants (must hold)

- **Shop isolation (priority #1):** every status write is scoped
  `update where { id, shopId }` (mirrors `renameTemplateForShop`); a
  cross-shop/unknown id is "not found", never a cross-shop write.
- **Storefront visibility (priority #2):** the storefront gates on the
  **metaobject's** `status == ACTIVE` (data-model §8/§10). Therefore **any** status
  change that can leave/enter `ACTIVE` **must re-sync the metaobject**, or an
  ex-`ACTIVE` template would keep rendering. The editor path already re-syncs on
  Save; the list path must call the same sync helper.
- Status is **not** part of the template name/rows; the list write must not touch
  `rows` (reuse the rows-untouching pattern, never `saveTemplateForShop`).

---

## Steps (each independently testable)

### Step 1 — Shared status validation helper

- In `app/utils/templateStatus.ts` (currently only `BADGE_TONES`, client-safe),
  add:
  - `TEMPLATE_STATUSES` — the `["DRAFT","ACTIVE","ARCHIVED"]` string-literal list
    (no runtime `@prisma/client` enum import — keep it client-safe like
    `BADGE_TONES`).
  - `validateTemplateStatus(value): { ok: true; status } | { ok: false; error }`
    — trims/checks membership; rejects empty/unknown/wrong-case. Mirrors
    `validateTemplateName`.
- Refactor `template.server.ts` to import `TEMPLATE_STATUSES` from the util
  (remove its local duplicate `TEMPLATE_STATUSES`/`TEMPLATE_STATUS_SET`);
  `resolveStatus` stays for the tolerant create/save paths.
- **Test:** unit tests for `validateTemplateStatus` (each valid status passes;
  `""`, `"draft"`, `"foo"` rejected). `npm run build` + existing suite green.

### Step 2 — `setTemplateStatusForShop` server fn

- In `template.server.ts`, add `setTemplateStatusForShop(shopId, id, status)`:
  validate via `validateTemplateStatus` first, then shop-scoped
  `prisma.template.update({ where: { id, shopId }, data: { status } })` — writes
  **only** `status`, leaves `rows`/`name` alone. Returns `{ ok, data }` /
  `{ ok: false, error }`. Structural twin of `renameTemplateForShop`. **No**
  metaobject sync here — the caller owns that (so the fn stays reusable +
  unit-testable without Admin).
- **Test:** unit test with mocked Prisma — asserts the `data` contains only
  `status`, the `where` carries `shopId`, an invalid status is rejected before any
  DB call, and an unknown-id P2025 surfaces as `{ ok: false }`. Mirrors the
  existing rename/shop-isolation tests.

### Step 3 — Editor Settings tab status control (rides Save)

- `useRowEngine`: change `const [status] = useState(initialStatus)` →
  `const [status, setStatus] = useState(initialStatus)` and expose `setStatus` in
  the returned object (next to `name`/`setName`).
- New presentational `app/routes/app.templates_.$id/SettingsTab.tsx`: a status
  selector (Polaris `s-select` or a segmented control) bound to `engine.status` →
  `engine.setStatus`, plus a short helper note — e.g. *"Active makes this table
  eligible to show on the storefront for its assigned products. Draft and Archived
  are hidden."* (honest: `ACTIVE` alone doesn't render until a product is assigned
  — the assignment engine is a later slice).
- `SpecTableEditor`: pass `settingsPanel={<SettingsTab engine={engine} />}` to
  `EditorShell` (replaces the "Controls for this tab arrive in a later step."
  placeholder).
- **No server change** — Save already sends `status`, `saveTemplateForShop`
  already persists it, and the action already re-syncs the metaobject.
- **Notes:** the header badge (`TemplateHeaderActions`) keeps reading the
  **persisted** loader status; the Settings control reflects the **pending**
  `engine.status`. They converge after Save + revalidate. Works on the `/new`
  sentinel too (status rides create-on-first-save, like Rename).
- **Test (browser):** Settings tab → Draft→Active flips the control, SaveBar
  opens → Save → "Saved" toast, header badge re-tones to Active after revalidate.
  Discard reverts a pending status change. Set Active + Save on a product with the
  spec-table metafield assigned → table renders on storefront; switch to Draft +
  Save → it disappears. Confirm the metaobject `status` field updated (Admin
  GraphQL round-trip or the storefront behavior).

### Step 4 — Extract the shared metaobject sync helper

- Move `syncTemplateToMetaobject` out of `app.templates_.$id/route.tsx` into a
  shared server module (e.g. `app/shopify/templateSync.server.ts`); `route.tsx`
  imports it. **Behavior-preserving** — no logic change.
- Rationale: the list action (Step 5) needs the identical persist→sync→gate
  behavior; a shared module keeps the two surfaces from drifting (this is the
  extraction the tracker's "Archive deferred" open question anticipated).
- **Test:** editor Save still works exactly as before (regression: save a row
  edit, confirm "Saved" + storefront reflects). `npm run build` + suite green.

### Step 5 — Templates-list "Change status" modal + action intent

- **UI (`app.templates.tsx`):**
  - Add a **"Change status"** item to the row ⋯ `<s-menu>` (between Rename and
    Delete).
  - Add one shared status modal (constant id, like `RENAME_MODAL_ID`):
    `pendingStatus` carries `{ id, name, status }`; a status selector seeded from
    the row's current status; Save/Cancel. Reuse the existing **shared fetcher +
    `busy` gate** (so a status change can't race a Duplicate/Delete/Rename), and
    the settle effect toasts "Status updated" + closes the modal.
- **Action (`app.templates.tsx` `action`):** new `intent === "status"` branch —
  `validateTemplateStatus(payload.status)`; read the owned template shop-scoped
  (`getTemplateByIdForShop`) for the metaobject GID/rows; `setTemplateStatusForShop`;
  then `syncTemplateToMetaobject(admin, shop, updated)` (re-sync so a to/from-Active
  change flips storefront visibility — and a never-synced draft going Active gets
  its metaobject upserted). Return `{ ok: true, intent: "status" }` → list
  revalidates the badge in place.
- **Test (browser):** list ⋯ → Change status → Active → row badge flips to Active,
  "Status updated" toast; storefront renders for an assigned product. Change back
  to Draft → badge flips, storefront hides. Archived → badge neutral + hidden. A
  status change while another row mutation is in flight is blocked by `busy`.

### Step 6 — Docs + tests wrap-up

- Update `context/progress-tracker.md`: add a completed line for feature 36 and
  **resolve** the "Templates-list Archive — deferred / needs `setTemplateStatusForShop`
  + shared sync" open question (now shipped).
- Update `context/data-model.md` if wording is needed: status is now editable from
  two surfaces and **both re-sync the metaobject**.
- Confirm unit coverage: `validateTemplateStatus` + `setTemplateStatusForShop`
  shop-isolation. `npm run build` green.

---

## Out of scope

- Product assignment (a template being `ACTIVE` only renders once a product points
  at it — the assignment engine is the next major slice).
- Bulk multi-row status change from the list (Templates-list Phase 2).
- Scheduled/versioned publishing (explicitly a non-goal per data-model §8).

## Optional / open

- **Confirm before Active?** Not required for MVP (Save/modal is the deliberate
  action). Could add a one-line "goes live" note in the copy instead of a second
  confirm — folded into Steps 3/5 copy.
- **Editor status control widget:** `s-select` vs a segmented control — settle
  during Step 3 by what reads cleanest in the 300px sidebar.
