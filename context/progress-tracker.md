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
  - Template Editor rows tab (custom React editor, local React state until Save)
  - save template to Postgres
  - validate the 200-row limit
  - sync active/draft/archived template payload to Shopify metaobject
  - assign template to one product
  - write product metafield pointing to the template metaobject handle
  - render the table through the Theme App Extension app block

---

## Next Up

-

## Open Questions

- Exact Shopify Admin API mutations for creating/updating the app-owned metaobject definition and entries
- Exact Liquid syntax for reading the product metafield and metaobject payload in the Theme App Extension
- Best storefront event strategy for selected variant changes across Shopify themes
- Exact UX for preventing or warning about assignment conflicts in MVP

## Session Notes

- Build the complete create/save/sync/assign/render flow before expanding advanced styling, import/export, AI, analytics, or bulk assignment.

- **Editor Build Decision (Session 2026-06-10):** The spec-table editor will be a **custom React editor — no AG Grid.** Rationale: the table is only 2 columns, capped at 200 rows; the value cell is a `valueParts` token editor (manual text + dynamic-field pills) with escaping popovers, which a generic data grid models poorly and which `code-standards.md` already forbids fighting. AG Grid would remove almost none of the real work (pill editor, field picker, undo/redo, preview are custom regardless). Decisions locked:
  - **Drag-and-drop:** `@dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`) — one new dependency; keyboard-accessible reordering.
  - **Value editor:** segmented "Insert field" model (text inputs + removable pill chips + field picker).
  - Suggested build order: (1) reducer + static row render + add/delete/duplicate + 200-row cap; (2) segmented value cell + pills; (3) field picker + native Shopify fields (metafield definitions as a sub-step); (4) `@dnd-kit` reorder + keyboard nav; (5) clipboard paste-in of multi-cell tables → bulk row creation; (6) undo/redo + storefront-styled WYSIWYG rendering (incl. viewport toggle) + wire Save (server-side 200-row + `shopId` re-check).

- **Editor UX Decisions (Session 2026-06-11):** Reviewed an app's Excel-like editor and confirmed the structured-row-editor direction. Decisions locked:
  - **WYSIWYG editor, no preview panel:** the editing table renders exactly like the storefront table with the current `TableStyling` at all times. No separate live-preview panel and no edit/preview mode switch. A Desktop / Tablet / Mobile viewport toggle changes the rendered layout (mobile = stacked label-over-value), and the table stays fully editable in every viewport.
  - **Clipboard paste is an MVP feature:** pasting a multi-cell table copied from any website / Excel / Google Sheets bulk-creates rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste. Multi cell copy paste ability should be implemented.
  - **Row cap is configurable:** 200 is the MVP value and may increase post-MVP. Implement it as a single shared constant read by both the editor UI and server-side save validation — never a hardcoded literal.
