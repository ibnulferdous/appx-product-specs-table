# Templates list — Rename (immediate-persist) menu action (suggestions §3)

## Goal in one sentence

The per-row overflow menu gains **Rename** as its first item — a `<s-modal>` with a
single `<s-text-field>` that **persists immediately** through a **new rows-untouching
`renameTemplateForShop`** server function and a new `rename` list-route intent, then
revalidates the list — because the list has no editor/SaveBar to ride (unlike the
detail-page rename in feature 20).

## Why this is its own step

Rename looks like Duplicate/Delete but is **not pure reuse**:

- **It can't reuse `saveTemplateForShop`.** That function always narrows + caps
  `rows` and `parseRows(undefined) → []`, so calling it with only a name would
  **wipe the template's rows**. The list page has no in-memory rows to resend, so
  Rename needs a **new server function that touches `name` only** and leaves `rows`
  (and `status`) alone.
- **It's a different mechanism than the editor's rename.** The detail-page rename
  (feature 20, `TemplateHeaderActions`) sets `engine.name`, which flips `isDirty`
  and rides the **SaveBar** — persistence happens on Save. The list has no engine
  and no SaveBar, so Rename here is **immediate-persist**: submit → server writes →
  revalidate. Same `validateTemplateName` validator on both sides so they can't
  drift.

Splitting it off keeps file 26 (Duplicate/Delete = zero new server code) low-risk.

## What changes (architecture)

### 1. New server function — `renameTemplateForShop` — `app/models/template.server.ts`

A focused, **rows-untouching** sibling of `saveTemplateForShop` (single-purpose, per
`code-standards.md`):

```ts
export async function renameTemplateForShop(
  shopId: string,
  id: string,
  name: unknown,
) {
  const nameResult = validateTemplateName(name); // shared validator (trim, ≤100)
  if (!nameResult.ok) return { ok: false as const, error: nameResult.error };
  try {
    const template = await prisma.template.update({
      where: { id, shopId }, // shop-scoped write (priority #1; Prisma 5+ extended
                             // where-unique — a foreign id → P2025, caught below)
      data: { name: nameResult.name }, // ONLY name; rows + status untouched
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not rename template" };
  }
}
```

- **Shop isolation (priority #1):** the `{ id, shopId }` where-unique scopes the
  write itself — a cross-shop id is "not found" (P2025), never a rename of another
  shop's template. Mirrors `setTemplateMetaobjectRef`'s shop-scoped write.
- **No metaobject sync** — a name is not part of the storefront delivery copy (the
  metaobject carries rows + status, not name), so renaming needs no Admin API call.

> **Decision — dedicated function over generalizing `saveTemplateForShop`.** Making
> `rows` optional in `saveTemplateForShop` would also work, but it weakens that
> function's "rows are always validated + capped" guarantee and mixes two concerns
> on the load-bearing save path. A separate single-purpose function is safer and
> reads clearer. (Same reasoning that produced `duplicate`/`deleteTemplateForShop`
> as their own functions in feature 20.)

### 2. New `rename` intent — list-route `action` — `app/routes/app.templates.tsx`

Extend file 26's `action` discriminator with a third branch:

```
// intent === "rename" → renameTemplateForShop(shop.id, id, name)
//                       → { ok, error? }   (revalidate; the row's name + the §25
//                         2-line clamp update in place)
```

Payload is `{ intent: "rename"; id: string; name: string }`. Same auth surface; the
server **re-validates** the name (never trusts the client) and the existing list
loader auto-revalidates after the submission.

### 3. Rename menu item + modal — `app/routes/app.templates.tsx`

- Insert **Rename** as the **first** `<s-menu>` item in `TemplateTableRow` (order:
  Rename / Duplicate / Delete — matching the editor header and the suggestions doc),
  `icon="edit"`, `onClick={() => onRequestRename(template.id, template.name)}`.
- A **single shared rename `<s-modal>`** at the page level (like the delete modal),
  driven by `pendingRename` state (`{ id, name } | null`):
  - `onRequestRename(id, name)` seeds the field value from `name`, sets
    `pendingRename`, and `shopify.modal.show(...)`.
  - Body: one `<s-text-field label="Template name">` with `maxLength={NAME_MAX_LENGTH}`,
    seeded from the current name; a **client-side mirror of `validateTemplateName`**
    for instant feedback (non-empty, ≤ `NAME_MAX_LENGTH`) driving the field `error`
    and disabling the primary button while invalid.
  - Confirm → `fetcher.submit({ intent: "rename", id, name: trimmed }, { method:
    "post", encType: "application/json" })`; on completion hide + clear, toast
    **"Template renamed"** (or the server error). The server re-validation is the
    real gate; the client mirror is UX.
  - Cancel / Esc / outside-click → hide + clear; renames nothing.
- Reuse the field-value reader inline (a tiny `(e) => (e.target as
  HTMLInputElement).value`); **do not import** the detail route's
  `editorShared.readValue` (avoid cross-route coupling — the list is a sibling
  route, not part of the editor module).

The rename fetcher can be the **same page-level fetcher** as Duplicate/Delete (all
three actions are mutually exclusive in time and all post to the list route), or a
dedicated one if the toast-effect branching reads cleaner — implementer's call;
note it in the tracker.

## Locked decisions

- **Immediate-persist, not SaveBar-ride.** The list rename writes on confirm and
  revalidates; it does **not** reuse the editor's dirty/Save flow (there is no engine
  on the list). The detail-page rename (feature 20) is unchanged.
- **New rows-untouching `renameTemplateForShop`** — `saveTemplateForShop` is *not*
  reused (it would clobber rows). Status is likewise untouched.
- **Shared validator both sides** — `validateTemplateName` (client mirror for
  feedback, server for the real gate) so the two never drift.
- **No metaobject sync on rename** — name is not in the storefront delivery copy.
- **Single shared rename modal + `pendingRename` state**, mirroring the delete
  modal; Rename is the first menu item (Rename / Duplicate / Delete order).

## What this step does *not* own (boundary)

- **Archive / status change** — deferred entirely (needs a `setTemplateStatusForShop`
  **and** a storefront metaobject re-sync; revisit when product assignment ships).
- **The menu shell + Duplicate + Delete** — file 26 (this step only adds the Rename
  item + its modal + the `rename` intent + `renameTemplateForShop`).
- **Search / sort / pagination / bulk actions** — later Phase-2 steps.

## File placement (per `code-standards.md`)

- `renameTemplateForShop` → **`app/models/template.server.ts`** (next to
  `saveTemplateForShop` / `duplicateTemplateForShop`).
- `rename` action branch, rename menu item, rename modal, `pendingRename` →
  **`app/routes/app.templates.tsx`**.
- **No change** to `metaobjects.server.ts`, `templateName.ts`, `templateStatus.ts`,
  the editor route, or the schema. `validateTemplateName`/`NAME_MAX_LENGTH` are
  imported, not modified.

## Testing

Add a unit test for the new server function (pure-logic + shop-isolation boundary
with mocked Prisma, per `[[testing-strategy]]`); the modal/fetcher/toast UI is
browser-verified.

- **`renameTemplateForShop`** — renames an owned template (name only; rows + status
  unchanged); rejects an invalid name via `validateTemplateName` (empty / > 100);
  **cross-shop rename is a no-op** (a foreign `{ id, shopId }` → P2025 → `{ ok:
  false }`, the other shop's template untouched).

**Browser verification (embedded app):**

- Rename is the first menu item; opening it seeds the field with the current name.
- An empty / too-long name disables the primary button and shows the field error;
  a valid rename persists, closes the modal, toasts "Template renamed", and the
  row name (+ the §25 clamp) updates in place — no navigation.
- A server-rejected name surfaces the error toast and leaves the name unchanged.
- The template's **rows are intact** after a rename (open the editor to confirm the
  rows weren't clobbered — the core risk this step guards against).

## Done when

1. Rename opens a seeded modal, validates client-side, persists via
   `renameTemplateForShop`, and revalidates the row in place with a toast.
2. The renamed template's **rows and status are unchanged** (verified).
3. `renameTemplateForShop` unit tests (incl. cross-shop isolation + invalid-name
   rejection) pass.
4. `npm run build`, `typecheck`, `lint`, `format:check`, and `test:run` pass.
5. `context/progress-tracker.md` updated; browser-verified in the embedded app.
