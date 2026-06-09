# Create Template (name + status only)

## Scope

### In

- New route `/app/templates/new` with name + status form
- New route `/app/templates/:id` (placeholder — shows name, status badge, and a "Rows editor coming in the next phase" stub)
- `createTemplateForShop` and `getTemplateByIdForShop` in `app/models/template.server.ts`
- Inline error UX on the create form
- Shop-scoped reads and writes on every query

### Out (deferred to later)

- AG Grid rows editor
- 200-row validation
- Shopify metaobject sync
- Product assignment
- Table styling
- Description field
- Polaris toast / flash messages

---

## Changes

| #   | File                                       | What                                                                                                                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `app/models/template.server.ts`            | Add `createTemplateForShop(shopId, { name, status })` and `getTemplateByIdForShop(shopId, id)`                                        |
| 2   | `app/routes/app.templates_.new.tsx` _(new)_ | Loader: `authenticate.admin` + `upsertShop`. Action: validate inputs, create row with `rows: []`, redirect to `/app/templates/:id`    |
| 3   | `app/routes/app.templates_.$id.tsx` _(new)_ | Loader fetches template by id (404 if not found or wrong shop). Renders name, status badge, "Rows editor coming soon" stub, back link |
| 4   | `context/progress-tracker.md`              | Move Slice A items to Completed; update In Progress and Next Up                                                                       |

---

## UX decisions

- **Default status on create:** `DRAFT` — matches Shopify product behavior; publishing is an explicit choice
- **Name validation:** required, trimmed, 1–100 chars; reject empty or whitespace-only
- **Description field:** schema allows null, no UI yet
- **Duplicate names:** allowed; Shopify itself allows duplicate product titles
- **Error UX:** action returns `{ ok: false, error: "..." }`, form re-renders with an inline error message
- **Shop scoping:** every read and write filters by `shopId` resolved from the authenticated session

---

## Action response shape

Follows the convention in `context/code-standards.md`:

```ts
// success
{ ok: true, data: { id, name, status } }
// failure
{ ok: false, error: "Name is required" }
```

On success the action returns a `redirect()` instead of the success object, so the form does not need to handle the `ok: true` branch.

---

## Verification checklist

1. `/app/templates/new` loads; form renders with name input and status radio (default Draft)
2. Submit with empty or whitespace name → inline error, no row written to Neon
3. Submit with valid name + Draft → row exists in Neon, redirected to `/app/templates/:id`
4. `/app/templates/:id` renders the template name and status badge
5. Visit `/app/templates/:id` for a non-existent id → 404
6. Visit a template id belonging to a different shop → 404 (no leakage)
7. Back to `/app/templates` — new template appears with correct status badge and `0` row count
8. `npm run build` passes
