# Progress Tracker

Update this file after every meaningful implementation change.

---

## Current Phase

Building the MVP

## Current Goal

Build the custom spec-table editor incrementally, following the revised 13-step build order (per-step docs in `context/features/`). Steps 1 (reducer + static rows + add/delete/duplicate + 200-row cap), 2 (segmented value cell + pills + toolbar + gutter), and 3 (review & harden Steps 1–2 — no new features) are complete; next is Step 4 (Claude-style inline pills) before the field picker, drag, paste, and persistence layer on top.

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
- **Editor Step 1 complete** (reducer + static rows + add/delete/duplicate + cap). See `context/features/02-editor-step1-reducer-static-rows.md`. Built:
  - `app/utils/rows.ts` — single source of truth for the row array: `MAX_TEMPLATE_ROWS` constant (read by UI now, server later), `EditorRow`/`ValuePart` types matching `data-model.md` §6–7, key helpers (`slugifyKey`, `uniqueKey`), `newRowId` (crypto.randomUUID, kept out of the reducer), `normalizeRows`, and the pure `rowsReducer` (`ADD_ROW`, `DUPLICATE_ROW`, `DELETE_ROW`, `SET_LABEL`, `SET_VALUE_TEXT`).
  - Converted the flat route `app.templates_.$id.tsx` into a folder route (`app.templates_.$id/route.tsx`) so the editor can be co-located, and added `app.templates_.$id/SpecTableEditor.tsx` — a memoized two-column Label/Value editor (Polaris web components) with per-row duplicate/delete, an `Add row` button, and a live `Rows: N / 200` counter that disables Add/Duplicate and shows an at-limit banner at the cap.
  - Cap is enforced inside the reducer (not just disabled buttons); duplicate mints a fresh `id` + unique `key`; editing a label never rewrites the row's `key`. New data rows store one `TEXT` `valuePart` so Step 2 extends it in place.
  - Step 1 is local React state only — no Save/loader/action/Postgres/metaobject yet. The `action` still returns `{ ok: false }` for non-`new` POSTs.
  - `npm run typecheck`, `npm run lint`, and `npm run build` all pass clean.

- **Editor Step 2 complete** (segmented value cell + pills + toolbar + row gutter). See `context/features/03-editor-step2-segmented-value-cell.md`. Built:
  - `app/utils/rows.ts` — extended the reducer in place: `SET_VALUE_TEXT` now takes `partIndex` (edits one TEXT segment); added `REMOVE_VALUE_PART` (drop a part, then `normalizeValueParts` merges adjacent TEXT and guarantees ≥1 TEXT), `INSERT_VALUE_PART` (append a part, ensure a trailing empty TEXT), and `ADD_SECTION`. `ADD_ROW`/`ADD_SECTION` gained an optional `afterId` (insert below the active row; append when absent) via the `insertRowAfter` helper. Added `createSectionRow`, `placeholderMetafieldPart` (keyless `METAFIELD` — Step 3 fills it). Reducer stays pure; cap re-checked inside every row-creating action; 25-case logic check passed (text/insert/remove/merge/insert-below/cap).
  - `app/routes/app.templates_.$id/SpecTableEditor.tsx` + `SpecTableEditor.module.css` — value cell renders `valueParts` inline: TEXT → borderless, content-sized native `<input>` (the token-editor inline flow Polaris fields can't express); METAFIELD/SHOPIFY_FIELD → an `<s-chip color="strong">` with a field icon (`metafields`/`product`). Toolbar above the table (Add row / Add section / Duplicate) inserts below `activeRowId` (UI state; set on focus, shown with a subdued bg + left accent), with a separate bottom Add row that appends. Each row's gutter pairs an inert `drag-handle` (reorder wired in Step 4) with a delete. Section rows render as a distinct full-width header. Cap gates all three row-creating buttons (disabled at limit, refused in the reducer). 200 stays the single `MAX_TEMPLATE_ROWS` constant.
  - **Verified end to end in the real embedded app** (Shopify Admin dev store, not just a harness): authored "Up to `[Metafield · choose field]` hours", edited segments, removed the pill (text merged to "Up to  hours"), added rows below the active row, added a distinct section row, duplicated a row below its source, deleted via the gutter, and confirmed the bottom Add row appends. `npm run typecheck`, `npm run lint`, `npm run build` all pass clean. Still local React state only — no Save/persist yet (Step 6).

- **Editor Step 3 complete** (review & harden Steps 1–2 — no new reducer actions, no new UI surfaces). See `context/features/04-editor-step3-review-harden.md`. Read every Step 1–2 surface (A–I) against `data-model.md` and `code-standards.md`; the reducer / value-part foundation is sound. Outcome:
  - **Confirmed-sound invariants (no change):** reducer is pure (ids minted by `newRowId`, never inside the reducer); the 200-cap is enforced inside `ADD_ROW`/`ADD_SECTION`/`DUPLICATE_ROW` (not just on disabled buttons) and is unbreakable from any path; `DUPLICATE_ROW` mints a fresh `id` + fresh unique `key` and deep-copies `valueParts` (a per-part spread is a full copy — parts are flat); `SET_LABEL` never rewrites `key`; the three value-part actions no-op safely on a missing id and on `SECTION_HEADER` rows; `normalizeValueParts` merges adjacent TEXT and always keeps ≥1 TEXT, pills never end up adjacent (insert always leaves a trailing TEXT), and the empty TEXT kept between two pills is an intentional caret target; memoization holds (only the edited row re-renders); `activeRowId` clears on active-row delete; `scrollTargetRef` scrolls a new row in exactly once. Polaris usage is `<s-…>` + tokens only (no legacy `@shopify/polaris` React imports, no overridden internals); scoped CSS has no hex (only `currentColor`/`transparent` + rem/ch); a11y holds (every control keyboard-reachable + SR-labelled, drag handle `aria-hidden` and not a focus trap, row activation via `onFocusCapture`). `200` is still only `MAX_TEMPLATE_ROWS` (the lone literal; the `small-200` hits are Polaris spacing tokens). Shop isolation in `template.server.ts` re-confirmed (priority #1): `shopId` in every `where`/`data`.
  - **Fixed now (comment-only, zero behavior change):** (1) corrected the misleading `slugifyKey` doc comment — it claimed "derived at creation," but UI rows are created blank so it is never called there — and recorded the owned label→key decision (below); (2) documented why the toolbar uses `<s-stack>` not `<s-button-group>`; (3) documented the two pill workarounds (`strong` tone, explicit ✕ button) so a future cleanup can't regress them to a blue/`removable` chip.
  - **Owned decision — label → key (finding #1):** keep the provisional `row_N`/`section_N` key during editing and **derive the human-readable slug from the label at Save (Step 6)** via the retained `slugifyKey`, for rows still carrying a provisional key, never rewriting once finalized. This keeps Step 3 a true behavior freeze (no new action/surface), keeps `slugifyKey` as the Step 6 tool (not dead code), and satisfies `data-model.md` §7 + the comparison-readiness invariant (keys end up human-readable, not opaque). Rejected: opaque `row_N` keys forever (would weaken the cross-product alignment invariant and waste the separate `key`).
  - **Decisions noted:** the section header already renders full-width — its grid `2.75rem 1fr` places the title in a single `1fr` track that fills everything after the gutter (finding #2, not a bug); duplicating a `SECTION_HEADER` is intended and yields a valid section copy (finding #5).
  - **Gates:** `npm run typecheck`, `npm run lint`, `npm run build` all pass clean. **Browser re-verified (Done-when #7)** in the real embedded app (dev store, `TS template`): add row (counter `0→N` accurate, the new row auto-activates and Duplicate enables); authored "Up to `[Metafield · choose field]` hours" (type → insert pill → type); edited the leading/trailing TEXT segments independently with the pill intact between them; ✕ removed the pill and the surrounding text merged to a single "Up to  hours" segment; Add section inserted below the active row and rendered **full-width** (finding #2 confirmed) and distinct from data rows; section title edited; Add row / Duplicate inserted below the active row; the duplicate **deep-copies** (editing the copy left the source unchanged); gutter delete removed the row, decremented the counter, and cleared `activeRowId` (Duplicate re-disabled); the bottom Add row appended to the end regardless of the active row. No console errors. The 200-cap blocking-all-three + banner was not exercised by hand (impractical to create 200 rows) — it is enforced in the reducer and the counter stayed accurate throughout. Editor is still local React state only (no Save), so the test rows were not persisted.
  - Not-fixed-now items are tracked under "Step 3 Follow-ups (tracked)" below, each tagged with the step that owns it.

## In Progress

- None active. Step 3 (review & harden) is complete; **Step 4 — Claude-style inline pills** is next up (see Next Up; its per-step doc lands when Step 4 starts).

---

## Next Up

The editor build now follows a revised 13-step order (Steps 1–3 done). Remaining editor steps:

- **Step 4 — Claude-style inline pills:** replace the chip+✕ pill with an inline, link-styled token deleted as one unit by backspace/delete (no per-pill ✕). Reuses `REMOVE_VALUE_PART`; the work is caret/selection handling (likely consolidating the per-segment `<input>`s into one contenteditable surface) + token-driven styling.
- **Step 5 — Field-picker popover shell:** clicking a pill opens an empty popover anchored to it; closes on outside-click + Esc and traps focus. No data inside yet — just the escaping-popover mechanics.
- **Step 6 — Native Shopify fields in the picker (static list):** a hardcoded list (Vendor, Price, SKU, Title…); clicking one writes the pill's `SHOPIFY_FIELD` part so it relabels. No API calls.
- **Step 7 — Search / filter inside the picker:** a keyboard-navigable search box over the Step 6 list (pure UI layer).
- **Step 8 — Fetch the shop's metafield definitions:** loader/route call to Admin GraphQL, shop-scoped, with explicit loading / empty / error states. Fetch only — not rendered in the picker yet.
- **Step 9 — Metafield section in the picker (live data):** render fetched definitions below the native fields, covered by the Step 7 search; clicking inserts a `METAFIELD` pill carrying namespace + key. Completes the "smart pill."
- **Step 10 — Mouse drag reorder:** install `@dnd-kit` (`core` + `sortable`), wire the ⠿ gutter handle, add a `MOVE_ROW` action (array move on the reducer). Mouse only.
- **Step 11 — Keyboard reorder + accessibility:** keyboard sensor, focusable handle, screen-reader announcements; confirm section rows reorder correctly.
- **Step 12 — Parse pasted clipboard tables:** capture paste and parse the HTML table / TSV into a 2-D grid in a pure, testable helper (Excel / Google Sheets / web tables). Parse + log only — no rows inserted.
- **Step 13 — Bulk-insert rows from paste:** `PASTE_ROWS` action (col 1 → Label, remaining cols → joined plain-text Value), enforcing the 200-row cap on paste (truncate + tell the merchant what was dropped).

- **Deferred / no longer numbered editor steps:** undo/redo, WYSIWYG storefront styling, and the Desktop / Tablet / Mobile viewport toggle move to the later styling/persistence slice (not the interaction build above).
- **Remaining first-slice work after the editor:** wire **Save** (server-side 200-row + `shopId` re-check), save template rows to Postgres, sync active/draft/archived payload to the Shopify metaobject, assign a template to one product, write the product metafield, and render via the Theme App Extension app block.

## Step 3 Follow-ups (tracked)

Logged during the Step 3 review; deliberately not fixed there to keep the step a behavior freeze (no new reducer action, no new UI surface). Each is tagged with the step that owns it.

- **[Step 4] Caret/focus loss on pill remove & after insert (finding #3).** Index-based React keys (`` `${partIndex}:TEXT` ``) plus the narrow empty TEXT segment lose focus/caret when parts are removed/merged or after an insert. Step 4 consolidates the per-segment `<input>`s into one inline contenteditable token surface and owns caret/selection — do not patch the per-segment inputs first.
- **[Step 4] Duplicate `aria-label`s on multi-TEXT cells.** A value with >1 TEXT segment ("Up to `[pill]` hours") gives both `<input>`s the same `aria-label` ("Value text for <row>"), so SR users can't tell the leading segment from the trailing one. Resolve in the Step 4 rewrite rather than over-polishing a surface that is about to be replaced.
- **[Step 4] Empty TEXT segment is fiddly to click (carried from Step 2).** ~2ch min-width; consider auto-focusing the trailing TEXT right after `INSERT_VALUE_PART`. Part of Step 4's caret work.
- **[Step 6] `normalizeRows` does no per-row validation (finding #4).** It casts `value as EditorRow[]` for any array. No live risk today (no Save path writes `rows`; loaded templates carry `[]`), but malformed persisted rows would render garbage / crash once Save lands. Add a safe per-row parse (narrow `unknown` → typed row) at the load/save boundary, and re-validate server-side.
- **[Step 6] Finalize provisional row keys at Save (finding #1 follow-through).** Derive `slugifyKey(label)` for rows still carrying a provisional `row_N`/`section_N` key, enforce uniqueness within the template, and never re-derive a finalized key. Watch the case where a merchant-typed label legitimately slugs to `row`/`section` — track "was this key ever finalized?" rather than matching the string alone. Bundle with the server-side 200-row + `shopId` re-check.
- **[Later, low priority] `insertActive` optimism at the cap.** `insertActive` sets `scrollTargetRef`/`activeRowId` before the reducer runs; at the cap the reducer no-ops (returns the same array), so `activeRowId` could point at a never-added row and the scroll ref stays stale. Unreachable today (all row-creating buttons are `disabled` at the cap), but if a later step adds a keyboard shortcut / programmatic add that bypasses the disabled button, guard `insertActive` on `!atCap` or only set active/scroll when `rows.length` actually grows.

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
  - Suggested build order: (1) reducer + static row render + add/delete/duplicate + 200-row cap; (2) segmented value cell + pills; (3) field picker + native Shopify fields (metafield definitions as a sub-step); (4) `@dnd-kit` reorder + keyboard nav; (5) clipboard paste-in of multi-cell tables → bulk row creation; (6) undo/redo + storefront-styled WYSIWYG rendering (incl. viewport toggle) + wire Save (server-side 200-row + `shopId` re-check). **(Later refined into the 13-step order — see the "Editor Roadmap Revision (Session 2026-06-13)" note below.)**

- **Editor UX Decisions (Session 2026-06-11):** Reviewed an app's Excel-like editor and confirmed the structured-row-editor direction. Decisions locked:
  - **WYSIWYG editor, no preview panel:** the editing table renders exactly like the storefront table with the current `TableStyling` at all times. No separate live-preview panel and no edit/preview mode switch. A Desktop / Tablet / Mobile viewport toggle changes the rendered layout (mobile = stacked label-over-value), and the table stays fully editable in every viewport.
  - **Clipboard paste is an MVP feature:** pasting a multi-cell table copied from any website / Excel / Google Sheets bulk-creates rows — first pasted column → label, remaining columns → manual TEXT value; 200-row cap enforced on paste. Multi cell copy paste ability should be implemented.
  - **Row cap is configurable:** 200 is the MVP value and may increase post-MVP. Implement it as a single shared constant read by both the editor UI and server-side save validation — never a hardcoded literal.

- **Editor Step 2 Decisions (Session 2026-06-13):** Built and verified the segmented value cell, pills, toolbar, and row gutter in the real embedded app. Decisions locked + open questions resolved:
  - **Open question — pill label format (resolved):** `Metafield · <key>` and `Field · <field>`. A placeholder pill with no field chosen yet (pre-Step 3) reads `Metafield · choose field` / `Field · choose field`. Icons: `metafields` for METAFIELD, `product` for SHOPIFY_FIELD.
  - **Open question — empty-value / `hideWhenEmpty` rule (resolved):** purely a storefront concern (Step 6). The editor does not hide or special-case rows whose value is an empty TEXT part; it always keeps ≥1 editable TEXT part in the cell.
  - **Pill = chip + explicit ✕ button (not chip `removable`):** `<s-chip removable>` does **not** paint a visible remove control in the current Polaris CDN build (confirmed in-browser — no ✕ even on hover), even though the `removable`/`onRemove` props exist in `@shopify/polaris-types`. So the pill is `<s-chip color="strong">` + an adjacent `<s-button icon="x">` wired to `REMOVE_VALUE_PART`. Polaris chips also have no blue variant (only `subdued`/`base`/`strong`) and `code-standards.md` forbids overriding component internals, so the mockup's "blue pill" is realized as the `strong` chip tone.
  - **Toolbar uses `<s-stack direction="inline">`, not `<s-button-group>`:** `<s-button-group>` renders a shadow root with no `<slot>` in the current build, so its child buttons disappear (confirmed in-browser). `<s-stack>` projects children correctly.
  - **TEXT segments are native `<input>`:** borderless, content-sized (via the `size` attr), inside an `<s-box>` field container — the token-editor inline flow that `code-standards.md` anticipates Polaris fields can't model. Scoped CSS in `SpecTableEditor.module.css` uses only `currentColor` + rem (no hardcoded hex).
  - **Minor UX follow-up (deferred):** an empty TEXT segment is narrow (~2ch) and fiddly to click to continue typing after an insert. The primary `type → insert → type` flow works; consider auto-focusing the trailing segment right after `INSERT_VALUE_PART` (caret handling is explicitly deferred per the Step 2 feature file). In the revised roadmap this caret/focus work belongs to **Step 4** (the Claude-style inline pill rework), which consolidates the per-segment inputs and owns caret handling — see `context/features/04-editor-step3-review-harden.md` finding #3.

- **Editor Roadmap Revision (Session 2026-06-13):** The original 6-step editor build order (in the 2026-06-10 decision above) was refined into a more granular **13-step** order so each step is independently buildable and verifiable. Key changes:
  - Old Step 3 ("field picker") is now **Step 3 = review & harden Steps 1–2** (no new features) — `context/features/04-editor-step3-review-harden.md`. The picker itself splits across **Steps 5–9**: popover shell → native Shopify fields (static) → search/filter → fetch metafield definitions → live metafield section.
  - The **Claude-style inline pill** rework (link-styled, keyboard-deletable token, no per-pill ✕) is now its own **Step 4**, before the picker inserts into it.
  - `@dnd-kit` reorder splits into **Step 10 (mouse)** + **Step 11 (keyboard / a11y)**; clipboard paste splits into **Step 12 (parse → 2-D grid)** + **Step 13 (bulk insert + cap)**.
  - **Undo/redo, WYSIWYG storefront styling, and the viewport toggle are no longer numbered editor steps** — they move to the later styling/persistence slice alongside wiring Save.
  - Per-step docs live in `context/features/`; the file prefix is step + 1 (e.g. Step 3 → `04-…`) because `01-one-route-editor.md` predates the editor steps.

- **Editor Step 3 (Session 2026-06-13):** Reviewed & hardened Steps 1–2 — full triage, confirmed invariants, and the three comment-only fixes are in the "Editor Step 3 complete" entry under Completed; not-fixed-now items are under "Step 3 Follow-ups (tracked)." Two open questions from the Step 3 doc resolved: **label → key** — derive the slug from the label at **Save (Step 6)**, keeping provisional `row_N` keys during editing and never rewriting a finalized key (keeps `slugifyKey` alive as the Step 6 tool); **section full-width** — already correct (the `2.75rem 1fr` section grid fills the full post-gutter width), and the data-column header intentionally does not get a matching treatment because sections are meant to break the two-column grid. `npm run typecheck` / `lint` / `build` pass, and the core flows were re-verified live in the embedded app (see the Step 3 "Gates" bullet under Completed) — section full-width (finding #2) and the duplicate deep-copy both confirmed, no console errors.
