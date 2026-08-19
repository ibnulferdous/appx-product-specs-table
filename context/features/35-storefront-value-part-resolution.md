# Storefront slice 2 — value-part resolution (`SHOPIFY_FIELD` / `METAFIELD`)

**Status: ✅ Shipped + browser-verified on the dev store (DJI Air 3S product),
2026-07-02.** All four "Done when" criteria met — see the bottom of this doc.

> Verification was delayed by an unrelated **dev-store data-layer incident**, not
> by this slice's code: `shopify app dev clean` had wiped the app-owned metaobject
> definition because the app had never been deployed. The fix was to
> `shopify app deploy` (anchor the declarative definition in a released version),
> then reset the definition (remove→deploy→re-add→deploy) after the runtime→
> declarative migration left it unwritable. **Caveat learned:** deleting/recreating
> a declarative definition **poisons existing metaobject handles** — `template-{oldId}`
> handles then return `UNDEFINED_OBJECT_TYPE` on `metaobjectUpsert`, so templates
> created before the reset had to be re-created with fresh handles. See the
> `shopify-metaobject-deploy-clean-lifecycle` memory. None of this touched the
> slice-2 Liquid.

## Goal in one sentence

Replace the shopper-facing `[field:…]` / `[metafield:…]` placeholders in
`blocks/spec_table.liquid` with real values resolved against the live product —
and activate the `hideWhenEmpty` row rule — making the storefront table
shopper-ready.

## Why this is now

Slice 1 (feature 34) proved the pipeline but left dynamic value parts as raw
placeholder text on a live product page. That is a shipped bug the moment a
merchant activates a template with dynamic parts, so resolution precedes the
assignment engine and all styling work.

## Locked decisions (Step 0, 2026-07-02, confirmed with the merchant/user)

1. **Token scope** — resolve the "clean" tokens now; a token that Liquid cannot
   express cleanly resolves to **empty** (silent, no placeholder). Research
   outcome below moved `category` and `selected_options` into the resolvable
   set; only `total_inventory` resolves to empty.
2. **Variant fields resolve against `product.first_available_variant`** (the
   default variant). Selected-variant resolution + live variant-switch JS
   re-rendering are deferred until users request them (open question in
   `progress-tracker.md` stays open).
3. **`hideWhenEmpty` is a whole-cell character test** — not the dynamic-part
   rule previously written in `data-model.md` §10. The row hides when
   `hideWhenEmpty = true` **and** the fully resolved value cell contains zero
   non-whitespace characters (all parts joined, dynamic parts resolved,
   `LINE_BREAK`s ignored for the count). A mixed cell like
   `"Up to " + [empty metafield] + " hours"` therefore **renders** (it has
   literal text); the orphaned-text edge is accepted for now and revisited only
   if it becomes a real problem. **`data-model.md` §10 must be rewritten to
   this rule when this slice lands** (its current "leftover TEXT is hidden with
   the row" language becomes wrong).

## Verified field-mapping table (Step 1, 2026-07-02)

Verified against shopify.dev Liquid docs (`objects/product`, `objects/variant`,
`objects/taxonomy_category`, `objects/product_option`,
`filters/weight_with_unit`, `filters/metafield_text`, `objects/metafield`) and
a full draft resolver snippet passed Theme Check via the Shopify dev MCP
(`validate_theme`, artifact `artifact-5adc9e3d`, scratchpad draft — not
committed).

`v` below = `product.first_available_variant`.

| # | Token (locked, `shopifyFields.ts`) | Liquid expression | Notes / guards |
|---|---|---|---|
| 1 | `vendor` | `{{ product.vendor \| escape }}` | — |
| 2 | `product_type` | `{{ product.type \| escape }}` | Property is `type`, **not** `product_type`. |
| 3 | `category` | `{{ product.category.name \| escape }}` | `taxonomy_category.name`, localized. **Cleanly expressible → resolves now** (research overturned the Step-0 defer). Empty when no taxonomy category set. |
| 4 | `tags` | `{{ product.tags \| join: ", " \| escape }}` | Array of strings, alphabetical order. |
| 5 | `total_inventory` | *(empty string)* | **No product-level Liquid property.** Summing `variant.inventory_quantity` over `product.variants` is dirty: 50-iteration `for` cap and untracked variants return "items sold". Resolves to empty for now. |
| 6 | `available_for_sale` | `{% if product.available %}Yes{% else %}No{% endif %}` | Boolean; raw output would print `true`/`false`. Yes/No copy goes through the extension's locale file (`{{ 'key' \| t }}`). |
| 7 | `selected_options` | `{{ v.options \| join: " / " \| escape }}` | `variant.options` = the variant's option **values** (e.g. `S / Low`). **Expressible → resolves now** against the default variant, same semantics as the other variant fields (it shows the *default* variant's options, not a shopper selection — consistent with decision 2). |
| 8 | `weight` | `{% if v.weight > 0 %}{{ v.weight_in_unit \| weight_with_unit: v.weight_unit }}{% endif %}` | Docs-recommended pairing (`weight_in_unit` + the variant's own unit). `weight == 0` (unset) → empty. |
| 9 | `sku` | `{{ v.sku \| escape }}` | Empty string when unset. |
| 10 | `barcode` | `{{ v.barcode \| escape }}` | Empty string when unset. |
| 11 | `price` | `{{ v.price \| money }}` | Subunits → `money` filter, presentment currency. Variant-sourced for consistency (not `product.price` min). `money` output is plain text. |
| 12 | `compare_at_price` | `{% if v.compare_at_price %}{{ v.compare_at_price \| money }}{% endif %}` | `nil`/unset → empty (never renders `$0.00`). |
| 13 | `inventory_quantity` | `{% if v.inventory_management %}{{ v.inventory_quantity }}{% endif %}` | **Guard:** when inventory isn't tracked (`inventory_management == nil`), `inventory_quantity` returns *number of items sold* — meaningless/misleading → resolve to empty instead. |

### `METAFIELD` parts

```liquid
{{ product.metafields[part.namespace][part.key] | metafield_text | escape | newline_to_br }}
```

- Dynamic double-bracket access verified (namespace/key are strings from the
  rows JSON).
- **`metafield_text`** generates a plain-text version of *any* basic metafield
  type (single/multi-line text, integers, decimals, dates, boolean, money,
  rating, references…) — one generic path instead of per-type branches.
  Known caveat: list types other than `list.single_line_text_field` and
  `list.metaobject_reference` are unsupported (render empty) — acceptable for
  MVP.

### 🔴 Correction (2026-08-04) — the metaobject-reference branch

The line above is **not** sufficient, and the caveat as written was wrong in a
load-bearing way. `metafield_text` does support `metaobject_reference` and
`list.metaobject_reference`, **but only when passed the `field:` parameter**
naming which field of the referenced metaobject to print — the filter has no
default field, so the un-parameterised call renders an **empty string**.

That is not a corner: **every choice-list attribute in Shopify's standard
product taxonomy is metaobject-backed**, and those are the entire `shopify.*`
namespace (`shopify.battery-type`, `shopify.power-source`,
`shopify.color-pattern`, …). `metafieldDefinitions.server.ts` lists them
alongside merchant definitions, so the picker offers them like anything else —
and every one resolved to a blank cell on the storefront. Live symptom:
`SHOPIFY_FIELD` parts rendered, `METAFIELD` parts did not.

The snippet now branches on `metafield.type contains "metaobject_reference"`
and takes the first non-blank of
`metafield_text: field: "label"` → `"name"` → `"title"`
(`label` is what Shopify's taxonomy metaobjects use; `name`/`title` are the
common custom-definition keys). `field:` may only reference a
`single_line_text_field`; a miss renders blank rather than raising, so the chain
is safe and all-three-blank stays silent per the unknown-token rule.

Routed through the filter rather than walking `metafield.value` by hand, so the
single/list split stays inside Shopify's implementation: a list renders in
sentence format ("A, B, and C") and never meets the 50-iteration `for` cap.

### Follow-up (2026-08-04) — the generic list branch

The remaining hole is now closed. `metafield_text` supports **no** list type
except `list.single_line_text_field` and `list.metaobject_reference`, so
`list.number_integer`, `list.dimension`, `list.product_reference`,
`list.color` … all rendered an empty cell. They are now rendered item by item
in the snippet, joined with `", "`.

🔴 **The per-item shape is DUCK-TYPED, not switched on the metafield type.**
Shopify's *measurement* family is open and still growing — the published type
list already carries `dimension`, `weight`, `volume`, `voltage`, `temperature`,
`speed`, `antenna_gain`, `volumetric_flow_rate` and more — and every member is
the same `measurement` object (`.value` + `.unit`). A `case` over type names
would silently drop each new member on the day Shopify ships it; a test for
`.unit` cannot. The same argument covers the reference types, which differ only
in which display property they carry. The chain, most specific first:

| test | output | covers |
|---|---|---|
| `item.unit` | `value unit` | every measurement type, present and future |
| `item.rating` | `rating` | `rating` |
| `item.title` | `title` | product / variant / collection / page / article / blog / link |
| `item.name` | `name` | company / customer / order / taxonomy value |
| `item.url` → `item.src` | the URL | `file_reference` (generic_file, then media) |
| *(fallthrough)* | `{{ item }}` | strings, numbers, dates, colors, urls, booleans |

A scalar answers `nil` to every property test and falls through — which is the
correct rendering for it, not an accident.

**Live-verified 2026-08-04** on `appx-dev` with a purpose-built fixture:
`custom.appx_list_check` (`list.number_integer`, Storefront API access on) set to
`12 / 71 / 350` on the DJI product and pilled into the NPU row renders
**`12, 71, 350`**, with 184 data rows and 0 blank value cells. ⚠️ That exercises
the loop, the chunking, the `", "` join and the `{{ item }}` fallthrough — the
**`.unit` measurement branch is still unexercised** and needs a `list.dimension`
fixture. Nothing above the fallthrough row of the table has been run live.

**Length:** reference lists are CONNECTIONS and answer `.count`; non-reference
lists are arrays and answer `.size` (metafield object docs, "Determining the
length of a list metafield"), hence `count | default: size | default: 0`. Lists
run to 128 items (256 for metaobject references) against Liquid's 50-iteration
`for` cap, so the branch chunks by 50 exactly like the parts loop.

⚠️ **Accepted divergence:** Shopify renders its two supported list types in
*localized sentence format* ("A, B, and C"); this branch joins with `", "`.
Matching it means either hardcoding an English "and" — an i18n bug the moment
the storefront is translated — or a locale key plus a last-item lookahead that
the blank-item skip makes unreliable. A comma list also reads better in a spec
table. The two Shopify-rendered types keep their sentence format rather than
regress a live-verified path for cosmetic consistency.
- Filter order matters: `escape` **before** `newline_to_br` so the `<br>` for
  `multi_line_text_field` values survives escaping.
- Unknown namespace/key resolves to `nil` → empty string. Silent by design.

## Implementation plan (next stage)

1. **`snippets/spec-table-value.liquid`** — new snippet in the extension
   (theme app extensions support `snippets/`); LiquidDoc header; takes
   `row` + `product`; contains the part loop + both resolvers from the table
   above (structure already validated). The block's inline part loop and the
   `appx-spec-table__pending` placeholder spans are removed.
2. **Rewire `blocks/spec_table.liquid`** — per data row:
   `{% capture %}{% render 'spec-table-value', row: row, product: product %}{% endcapture %}`,
   then the **whole-cell emptiness gate**:
   `captured | strip_html | strip` blank + `row.hideWhenEmpty` → skip the
   `<tr>`; otherwise output the captured HTML unfiltered. (`strip_html` drops
   the `LINE_BREAK` `<br>`s so they don't count as characters — matching
   decision 3. TEXT-only rows always have characters → always render.)
   Section headers unchanged.
3. **Locale key** for the `available_for_sale` Yes/No copy in
   `locales/en.default.json` of the extension (`{{ '…yes' | t }}`), keeping
   shopper-facing literals out of Liquid.
4. **Remove the now-dead `.appx-spec-table__pending` rule** from
   `assets/spec-table.css` (verify it exists first).
5. **Validate + browser-verify** (dev store, DJI drone product):
   - `validate_theme` on both Liquid files.
   - Vendor / type / tags / price / sku render real values; no `[field:…]`
     text remains anywhere.
   - Set one real product metafield value → renders; a row whose metafield is
     unset + `hideWhenEmpty=true` → row absent from DOM; same row with
     `hideWhenEmpty=false` → renders with empty value cell.
   - A multiline (`LINE_BREAK`) value still renders `<br>` correctly through
     the capture path.
6. **Docs (batched at the end):** `progress-tracker.md` (slice → Completed,
   Next Up reordered), **`data-model.md` §10 rewrite** (whole-cell emptiness
   rule replaces the dynamic-part rule; first-available-variant decision
   recorded in §9's variant note), this file's status updated.

## Boundaries (not this slice)

- Assignment engine / assignment UI (next unit, rides Reshell Phase E).
- Styling, Style tab, CSS-var theming (only the dead `__pending` rule is
  touched).
- Selected-variant resolution + variant-switch JS re-render (deferred, see
  decision 2).
- `total_inventory` real resolution (needs server-side data or a different
  delivery shape — post-MVP if requested).
- Editor changes of any kind (`shopifyFields.ts` tokens are locked and
  untouched).

## Testing / verification

No unit-testable server logic (pure Liquid); verification is Theme Check +
browser on the `shopify app dev` preview, per the feature-34 precedent. The
emptiness gate has enough branches that each browser check in step 5 maps to
one branch.

## Open questions

- None blocking. Revisit orphaned-text (`"Up to  hours"`) only if real usage
  surfaces it; revisit `total_inventory` if a merchant asks for it.

## Done when — ✅ all met (2026-07-02, browser-verified)

1. ✅ No `[field:…]` / `[metafield:…]` placeholder text renders on any product
   page; the resolvable tokens show live values (price `$155,000.00`, vendor,
   product_type), `total_inventory` shows nothing.
2. ✅ `hideWhenEmpty` hides exactly the rows whose resolved cell is
   zero-characters (browser-verified both ways — empty SKU / metafield /
   "no value" rows absent while their section still renders).
3. ✅ Theme Check passes on both extension Liquid files.
4. ✅ `data-model.md` §10 rewritten to the whole-cell rule;
   `progress-tracker.md` updated.
