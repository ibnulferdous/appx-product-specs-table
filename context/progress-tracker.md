# Progress Tracker

Update this file after every meaningful implementation change.

---

## Current Phase

Building the MVP

## Current Goal

Build the first vertical slice incrementally, starting with template CRUD now that the shop persistence foundation is in place.

---

## Completed

- Installed Shopify app template (React Router TypeScript version)
- Database: PostgreSQL (Neon DB)
- Successfully received and stored Shopify session data in Neon DB
- Installed the app on the development store
- Confirmed the development store's shop record is now stored in Neon
- Added shop-scoped template list access through `app/models/template.server.ts`
- Added the read-only `/app/templates` screen with empty state, status filters, and template table
- Added `createTemplateForShop` and `getTemplateByIdForShop` helpers in `app/models/template.server.ts`
- Added `/app/templates/new` route with name + status form, server-side validation, and inline error UX
- Added `/app/templates/:id` placeholder route showing name, status badge, and a "Rows editor coming soon" stub (404 when not found or wrong shop)
- Consolidated the editor into a single dynamic route: merged `app.templates_.new.tsx` into `app.templates_.$id.tsx`, branching on `params.id === "new"` (blank scaffold) vs. an existing template (fetch + 404). Deleted the standalone `new` route; `/app/templates/new` now resolves to the dynamic route. `npm run build` and ESLint pass clean.

## In Progress

- Build the first vertical slice:
  - Template Editor rows tab (AG Grid, local React state until Save)
  - save template to Postgres
  - validate the 200-row limit
  - sync active/draft/archived template payload to Shopify metaobject
  - assign template to one product
  - write product metafield pointing to the template metaobject handle
  - render the table through the Theme App Extension app block

---

## Next Up

- Build the Template Editor rows tab inside the unified `/app/templates/:id` route, keeping row edits in local React state until Save (client-generated UUID row IDs). The route already branches new-vs-edit; the rows editor extends the existing single-step create form.

## Open Questions

- Exact Shopify Admin API mutations for creating/updating the app-owned metaobject definition and entries
- Exact Liquid syntax for reading the product metafield and metaobject payload in the Theme App Extension
- Best storefront event strategy for selected variant changes across Shopify themes
- Exact UX for preventing or warning about assignment conflicts in MVP

## Session Notes

- Recommended initial admin screens:
  - Dashboard / onboarding checklist
  - Templates list
  - Template editor
  - Product assignment page
  - Styling and preview area, likely inside the template editor
- Build the complete create/save/sync/assign/render flow before expanding advanced styling, import/export, AI, analytics, or bulk assignment.
- Template persistence foundation is now in place; do not add assignment, styling, billing, or storefront sync before the rows editor and save path work.

- **One-Route Editor Decision (Session 2026-06-06):** Adopted a single editor route with single-step create-on-save (name/status are part of the editor, not a separate screen), modeled on the Shopify QR-code tutorial (`context/sample-code/dynamic-route.jsx`) and `context/features/03-one-route-editor.md`. The `"new"` sentinel is collision-proof because template ids are server-generated cuids. Verified safe; no layout refactor needed (`app.templates.tsx` is a leaf route, not a parent `Outlet`). **Deferred conditions to honor when the rows editor / update path is built (currently the merged action only handles create; a non-`new` POST returns `{ ok: false }`):**
  - Validate the 200-row limit **server-side** in the action before any save.
  - Re-check `shopId` ownership via `getTemplateByIdForShop` before any update mutation.
  - Add a `useEffect` resetting form + save-bar on `[params.id, loaderData]` change once the editor holds local state (prevents stale data leaking when navigating new↔edit without a remount).
  - Order metaobject sync Postgres-first and make it idempotent (deterministic `template-{id}` handle).
