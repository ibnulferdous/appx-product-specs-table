// Static catalog of native Shopify product fields offered in the editor's
// "Insert field" modal (Step 6).
//
// Native product fields are a Shopify *platform-defined* schema — `vendor`,
// `price`, `sku`, … exist on every product in every shop and never vary per
// shop — so a static constant IS the source of truth, not a cache. (Metafields
// are the opposite: merchant-defined `namespace`/`key` that genuinely vary per
// shop, which is why they are fetched shop-scoped from Admin GraphQL in
// Steps 8–9, not listed here.)
//
// Framework-free and pure on purpose: the editor renders it now, Step 7 filters
// it, and the storefront resolver reads the same `field` tokens later.

export interface NativeShopifyField {
  /**
   * The token persisted in a SHOPIFY_FIELD value part. This is the
   * storefront-resolver contract: it is saved in `valueParts` and later drives
   * the Theme App Extension's Liquid resolution, so these strings are LOCKED —
   * changing one would orphan every saved pill that referenced it. Shopify
   * product-object-aligned snake_case.
   */
  field: string;
  /** Human-readable name shown in the picker (never persisted). */
  label: string;
}

/**
 * The thirteen native fields offered in the picker, in display order (mirrors
 * `context/prd.md`). The entry shape is `{ field, label }` only — no
 * product-vs-variant `source` flag (decided 2026-06-16): the editor never
 * resolves values, so the product/variant distinction (and the selected-variant
 * / first-variant fallback) is the storefront resolver's job, not this module's.
 *
 * Maintenance: the native set can shift across Shopify API versions; update this
 * one tested constant when the API version is bumped — a code change, not
 * runtime data.
 */
export const NATIVE_SHOPIFY_FIELDS: readonly NativeShopifyField[] = [
  { field: "vendor", label: "Vendor" },
  { field: "product_type", label: "Product type" },
  { field: "category", label: "Category" },
  { field: "tags", label: "Tags" },
  { field: "total_inventory", label: "Total inventory" },
  { field: "available_for_sale", label: "Available for sale" },
  { field: "selected_options", label: "Selected options" },
  { field: "weight", label: "Weight" },
  { field: "sku", label: "SKU" },
  { field: "barcode", label: "Barcode" },
  { field: "price", label: "Price" },
  { field: "compare_at_price", label: "Compare-at price" },
  { field: "inventory_quantity", label: "Inventory quantity" },
];

/**
 * Look up a native field entry by its `field` token. Returns `undefined` for an
 * unknown token (e.g. a metafield key), which the editor uses to decide whether
 * a clicked pill can be pre-selected in the native list.
 */
export function findNativeField(field: string): NativeShopifyField | undefined {
  return NATIVE_SHOPIFY_FIELDS.find((entry) => entry.field === field);
}
