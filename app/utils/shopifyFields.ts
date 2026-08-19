// Static catalog of native Shopify product fields offered in the editor's
// "Insert field" modal.
//
// Native product fields are a Shopify *platform-defined* schema — they exist on
// every product in every shop and never vary — so a static constant IS the source
// of truth, not a cache. Metafields are the opposite (merchant-defined, per-shop),
// which is why they are fetched from Admin GraphQL rather than listed here.

import type { MetafieldDefinitionSummary } from "../shopify/metafieldDefinitions.server";

export interface NativeShopifyField {
  /**
   * The token persisted in a SHOPIFY_FIELD value part — the storefront-resolver
   * contract. 🔴 LOCKED: changing one orphans every saved reference to it.
   */
  field: string;
  /** Human-readable name shown in the picker (never persisted). */
  label: string;
}

/**
 * The native fields offered in the picker, in display order.
 *
 * No product-vs-variant `source` flag: the editor never resolves values, so the
 * product/variant distinction and its fallback are the storefront resolver's job.
 *
 * ⚠️ The native set can shift across Shopify API versions — update this constant
 * when the API version is bumped.
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

// Collapse runs of non-alphanumerics to single spaces (after trim + lowercase)
// so the query and the haystacks compare on the same token shape — `product_type`
// and `custom.battery_life` match despite their separators.
function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
}

/**
 * The shared matching rule for the modal's search box. Both the needle and the
 * haystacks are normalised through `normalizeSearchText`, so one rule serves both
 * the native-field and metafield lists regardless of separator style.
 */
function matchesQuery(needle: string, ...haystacks: string[]): boolean {
  const normalizedNeedle = normalizeSearchText(needle);
  return haystacks.some((haystack) =>
    normalizeSearchText(haystack).includes(normalizedNeedle),
  );
}

/**
 * Filter the native field list by the modal's search query.
 *
 * An empty query returns the full list. Otherwise a case-insensitive substring
 * match against the human `label` or the `field` token with underscores read as
 * spaces — so "compare at" surfaces *Compare-at price*. Search only reads tokens;
 * the locked `field` strings are never rewritten.
 */
export function filterNativeFields(query: string): NativeShopifyField[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...NATIVE_SHOPIFY_FIELDS];
  }
  return NATIVE_SHOPIFY_FIELDS.filter((entry) =>
    matchesQuery(
      needle,
      entry.label.toLowerCase(),
      entry.field.toLowerCase().replace(/_/g, " "),
    ),
  );
}

/**
 * Filter fetched metafield definitions by the same rule as `filterNativeFields`.
 * Matches the human `name` or the `namespace.key` token with non-alphanumeric
 * runs read as spaces, so `custom.battery_life` matches "battery", "battery life"
 * and "custom".
 */
export function filterMetafieldDefinitions(
  definitions: readonly MetafieldDefinitionSummary[],
  query: string,
): MetafieldDefinitionSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...definitions];
  }
  return definitions.filter((definition) =>
    matchesQuery(
      needle,
      definition.name.toLowerCase(),
      `${definition.namespace}.${definition.key}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " "),
    ),
  );
}
