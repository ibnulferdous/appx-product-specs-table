# Value textarea — Step 6: docs + live sign-off

**Status: ✅ Shipped 2026-08-07.** Part 6 of 6 (features 109–114). Documentation and
the end-to-end live verification that closes the migration. No product code changes
beyond doc/comment fixes surfaced during verification.

## Verification (2026-08-07) — ✅ all checks passed

Live on dev store **`appx-dev`**, embedded editor, via Claude-in-Chrome (the "dev
previews (1)" badge confirmed the live dev build). Test artifact: draft template
"Untitled template" (`cmsieep340001vptwi9mbgglv`) — safe to delete.

| # | Check | Result |
|---|-------|--------|
| 1 | **Undo/redo** | ✅ Native Ctrl+Z peels keystrokes; Ctrl+Y redoes. Original contenteditable defect gone. |
| 2 | **Insert field** | ✅ Modal opens **create-only** (heading "Insert field", button "Insert" — step-112 copy). Vendor → spliced `{% field vendor %} ` at the caret after "Made by ". |
| 3 | **Multiline** | ✅ The snowboard row renders two lines in editor, preview, and after save/reload. |
| 4 | **Bulk paste** | ✅ (verified live in Step 111; the paste path is unchanged by 112–113 — re-confirmed by grep, no code delta). |
| 5 | **Preview parity** | ✅ Preview renders `Metafield · snowboard_length` and `Field · vendor` as **labeled pills**, no raw `{% %}`. Directly validates the Step-113 `tokenLabels` relocation. |
| 6 | **Storefront unchanged** | ✅ **Definitional no-op for 112–113:** `git` confirms zero changes under `extensions/` and to `spec-table-value.liquid`; the `ValuePart[]` round-trip is proven by check 7; the preview shares the storefront's `part.type` switch. Last *direct* storefront sign-off was Step 111 (the only step that changed value production). |
| 7 | **Save/reload round-trip** | ✅ Saved `Made by {% field vendor %}`; after a full reload the textarea text + multiline row were identical (metaobject `ValuePart[]` unchanged in shape). |
| + | **Grid nav (owed from 113)** | ✅ Ctrl+↓ moved Weight→Display, Ctrl+↑ moved back, caret at end each time (markers landed appended) — the Step-111 regression the Step-113 fix repaired. Both directions. |

**Console:** only `ApolloError: Failed to fetch` from `cdn.shopify.com/shopifycloud/*`
(Shopify's own admin-shell telemetry). **No app-side errors.**

---

## Original plan (below) — retained for reference

## Goal in one sentence

Record the new value-editing architecture in the context files and prove, on the
live dev store, that the textarea surface works end-to-end while the storefront and
save pipeline are unchanged.

## Docs to update

### `context/data-model.md`
- Add a short subsection to the value-cell / `valueParts` area: **the canonical
  value shape is still `ValuePart[]`** (persisted, delivered to the metaobject, and
  rendered by the storefront + preview — all unchanged). The **editor surface** is a
  native `<textarea>` using a `{% … %}` **text codec** (`app/utils/valueText.ts`,
  feature 109); `partsToText` / `textToParts` convert at the editor boundary only.
- Record the token grammar (the locked table from feature 109) as the source of
  truth: `{% field <token> %}`, `{% mf <namespace>.<key> %}`, `\n` = `LINE_BREAK`.
- Note the accepted limitation: a literal `{% mf x.y %}` typed as prose is treated
  as a token (no escape hatch in MVP).
- Note what was retired: the inline pill, click-to-edit-pill, and the
  linear-caret/contenteditable model (features 112–113).

### `context/progress-tracker.md`
- Move features 109–114 to Completed with a one-line outcome each.
- Close/annotate any editor open question that referenced the contenteditable
  caret model or the Ctrl+Z bug (now resolved by the native textarea).

### This feature file
- Fill in the verification results at the bottom with the date and the product
  used, matching the feature-35 precedent.

## Live verification (dev store, embedded editor)

Editor is behind Shopify auth — verify on the `shopify app dev` preview via
Claude-in-Chrome (per the browser-verify memory), not a bare devtools MCP.

1. **Undo/redo** — type a long value, Ctrl+Z repeatedly restores keystroke-by-
   keystroke, Ctrl+Y redoes. (The original defect is gone.)
2. **Insert field** — from the toolbar, insert a native field and a metafield;
   both land as `{% … %}` text at the caret with a trailing space; typing
   continues cleanly after.
3. **Multiline** — Enter creates real newlines; the textarea auto-grows; a
   multiline value saves and reloads intact.
4. **Bulk paste** — paste a multi-cell table; it still becomes rows.
5. **Preview parity** — the live preview pane shows *resolved* values (not raw
   tokens) and matches the saved template.
6. **Storefront unchanged** — on the DJI product (feature-35 fixture), the
   rendered spec table is identical to before the migration: dynamic fields
   resolve, `hideWhenEmpty` still hides empty rows, `<br>` multiline renders. This
   is the proof that keeping `ValuePart[]` canonical kept the storefront a no-op.
7. **Save/reload round-trip** — edit, save, reload the editor; the textarea shows
   the same `{% … %}` text; `valueParts` in the metaobject is unchanged in shape.

## Files

- **Touched:** `context/data-model.md`, `context/progress-tracker.md`, this file.
- Product code: only doc/comment fixes if verification surfaces a stale comment.

## Done when

1. `data-model.md` records the codec + textarea surface and states `ValuePart[]`
   remains canonical; the grammar table is captured; retired pieces noted.
2. `progress-tracker.md` shows features 109–114 complete.
3. All seven live checks pass and are written up here with date + product.
4. The storefront render is confirmed **identical** to pre-migration (the
   migration was editor-only).
5. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` are
   green on the final tree.
