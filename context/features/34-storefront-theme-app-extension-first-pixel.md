# Storefront slice 1 — Theme App Extension: first pixel (admin → storefront)

## Goal in one sentence

Prove the **admin → storefront data connection** by rendering a product's assigned
spec table **as plain text** on the storefront product page, built up in small,
independently verifiable steps — starting from a static "the block renders" placeholder
and ending at "real rows from our metaobject appear on the page."

## Why this is now

The editor authoring experience is in good shape, but nothing the merchant builds is
visible on a storefront yet. Building the Theme App Extension now closes the vertical
slice (create → save → assign → **live**) and gives us the whole-app picture: we can
see how admin work reflects on the storefront and catch mistakes early. Styling, shapes,
and the Style/Settings/device tabs come **after** this connection works — this slice is
deliberately unstyled.

## The resolved read path (decision — closes a standing open question)

`data-model.md` §9 left the storefront read path partially open: an **app-reserved**
metaobject (`$app:appx_spec_table`) cannot be read by a bare handle-string lookup in
Liquid. Verified against Shopify docs (2026-07):

- **A product points at its template's metaobject via a `metaobject_reference` product
  metafield — not a handle string.** Docs are explicit: *"Don't store handles or IDs in
  plain text fields to create relationships. This breaks the connection between related
  data and prevents Shopify from retrieving it efficiently in Liquid or the Storefront
  API."* This **supersedes** the `appx.spec_table_template_handle` (single-line text)
  sketch in `data-model.md` §9 for the storefront pointer.
- **Metafields are always readable in Liquid**, regardless of the Storefront API access
  setting: *"This setting doesn't affect Liquid templates — metafields are always
  accessible in Liquid."* So the storefront render does not depend on Storefront API
  scopes.
- **Access shape:** `product.metafields.<ns>.<key>.value` resolves directly to the
  metaobject object; its `json`-typed `rows` field is read as `...rows.value` and is an
  **iterable array** in Liquid (the `value` of a `json` metafield/field is a parsed
  object, not a raw string).
- **Empirical unknown to confirm on the dev store (at Step 4):** the exact Liquid
  namespace for an **app-owned** metafield/metaobject (reserved `app` namespace access,
  e.g. `product.metafields.app.spec_table`) and that an app-owned `metaobject_reference`
  resolves its app-owned metaobject on the storefront. This is a "verify live" detail,
  not an architecture risk — the metafield-reference approach itself is confirmed.

## Small-step plan (each step verified on its own)

> **STATUS: ALL 5 STEPS COMPLETE + browser-verified on the dev store (2026-07-01).**
> Steps 1–3 done by hand (block placeholder → TOML definitions → metafield set on the
> DJI drone product); Steps 4–5 shipped in `blocks/spec_table.liquid`. The live product
> page renders a semantic table (40 rows, 9 sections) with `LINE_BREAK` → `<br>` and
> deferred `[field:…]` placeholders. Note: Step 2 became **declarative TOML for BOTH
> the metaobject and the reference metafield** (not the runtime `metafieldDefinitionCreate`
> originally sketched) — see the Open questions + `data-model.md` §9/§10.

1. **Scaffold + static block renders** *(this step)* — a Theme App Extension with one
   app block (`blocks/spec_table.liquid`, `target: "section"`, `enabled_on` product
   templates) that renders a placeholder. Verify: the block is addable in the theme
   editor and the placeholder shows on a storefront product page. **No app data.**
2. **`metaobject_reference` product metafield definition** — create the definition that
   lets a product reference an `$app:appx_spec_table` entry (namespace/key TBD, e.g.
   `appx` / `spec_table`). Definition only; no values written yet.
3. **Point one test product at one template** — set that product's metafield to a real
   template's metaobject (manually in Admin first, to decouple from building assign UI).
   This is the minimum slice of "assignment" — the full engine (product-type, priority,
   conflict index, webhooks) is out of scope here.
4. **Block reads metafield → metaobject → dumps rows as plain text** — iterate
   `rows.value`, print each row's `label` and a naive join of its `TEXT` value parts,
   with graceful fallbacks (no metafield set, `status != ACTIVE`, empty rows). **This is
   the first storefront pixel with real data.**
5. **Render rows as a simple (unstyled) list/table** — semantic-ish output, honor
   `LINE_BREAK`, respect `hideWhenEmpty`. Note the boundary: resolving `SHOPIFY_FIELD` /
   `METAFIELD` value parts against the live product is a **later** step; step 5 may show
   those as placeholders.

## What changes (architecture)

- **New:** `extensions/product-specs-table/` Theme App Extension (Liquid app block, no
  build step). Steps 2–3 add a product metafield **definition** + a value on one product.
- **Deferred within this slice:** any assignment **UI**, the assignment resolution
  engine, `ProductAssignment` / `ProductAssignmentIndex` models, styling, device
  previews.
- **No change (this slice):** `schema.prisma` (assignment/styling models stay unbuilt),
  the editor, `metaobjects.server.ts` sync (already writes the `rows`/`status` fields the
  block reads).

## Boundaries (what this slice does *not* own)

- **Full product assignment** (by product type, priority, conflict, webhooks, index) —
  its own later slice. Step 3 sets one metafield by hand.
- **Styling / shapes / real table markup** — Style tab and storefront CSS-var wiring come
  after the connection works.
- **`SHOPIFY_FIELD` / `METAFIELD` value-part resolution** on the storefront — later; this
  slice proves the pipeline with `TEXT` parts + labels.
- **`DRAFT`/`ARCHIVED` gating** beyond a simple `status == 'ACTIVE'` check.

## Testing / verification

Theme app extension Liquid is **browser-verified** on the `shopify app dev` preview (it
does not run in jsdom, and there is no server logic to unit-test in this slice). Validate
Liquid with the Shopify theme validator before each verification cycle.

- **Step 1 done when:** the block appears in the theme editor's app-block picker on the
  product template, and its placeholder renders on a storefront product page with no
  console errors.

## Open questions — all RESOLVED (verified live, 2026-07-01)

- ~~Product metafield **namespace/key** for the pointer.~~ **App-reserved:** namespace
  `$app`, key `spec_table`, declared in `shopify.app.toml` (`[product.metafields.app.spec_table]`).
  Liquid access is the reserved-prefix **bracket** form
  `product.metafields["$app"].spec_table.value` (dot form does not resolve the reserved
  namespace). Requires `access.storefront = "public_read"` — app-owned metafields are
  **not** Liquid-readable by default (the admin "Storefront API access" toggle is
  non-representative for app-owned defs).
- ~~Whether an app-owned `metaobject_reference` resolves its app-owned metaobject on the
  storefront.~~ **Yes** — confirmed by the live render (status + rows read off the
  referenced metaobject). The metaobject definition also carries `storefront = public_read`.
- ~~Whether `metaobject_reference` validations can target `$app:appx_spec_table`.~~
  **Yes** — via the TOML shorthand `type = "metaobject_reference<$app:appx_spec_table>"`
  (replaces the `metaobject_definition_id` validation).

**Decision change during the slice:** definitions moved from **runtime**
`metaobjectDefinitionCreate` to **declarative TOML** for both the metaobject and the new
reference metafield (Shopify-recommended; required for the deploy-time reference).
`ensureSpecTableDefinition` / `setShopMetaobjectDefinitionGid` removed;
`Shop.metaobjectDefinitionGid` is now vestigial. See `data-model.md` §9/§10.

## Done when (this slice) — ✅ ALL MET

1. ✅ Scaffold in place; block renders its placeholder on a storefront product page.
2. ✅ Metafield definition exists (TOML); the DJI drone product references a real
   template's metaobject.
3. ✅ That product page renders the template's rows on the storefront — Step 5 renders a
   semantic (unstyled) table, not just plain text.
4. ✅ `progress-tracker.md` reflects the completed steps; browser-verified in the dev store.

## Follow-on (next slice, not this one)

- **Value-part resolution:** `SHOPIFY_FIELD` / `METAFIELD` parts currently render as
  shopper-facing `[field:…]` / `[metafield:…]` placeholders. Resolving them against the
  live product — and activating the real `hideWhenEmpty` whole-row emptiness rule
  (`data-model.md` §9) — is the immediate next unit, before this is shopper-ready.
