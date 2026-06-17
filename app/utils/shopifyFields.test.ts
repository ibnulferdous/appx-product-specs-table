import { describe, it, expect } from "vitest";
import { NATIVE_SHOPIFY_FIELDS, findNativeField } from "./shopifyFields";

// The `field` tokens are the locked storefront-resolver contract (persisted in
// SHOPIFY_FIELD value parts), so this suite pins the exact set and order — a
// change here is a change to saved-data semantics and must be deliberate.

describe("NATIVE_SHOPIFY_FIELDS", () => {
  it("lists exactly the thirteen locked native fields", () => {
    expect(NATIVE_SHOPIFY_FIELDS).toHaveLength(13);
  });

  it("uses the locked snake_case field tokens in the agreed order", () => {
    expect(NATIVE_SHOPIFY_FIELDS.map((entry) => entry.field)).toEqual([
      "vendor",
      "product_type",
      "category",
      "tags",
      "total_inventory",
      "available_for_sale",
      "selected_options",
      "weight",
      "sku",
      "barcode",
      "price",
      "compare_at_price",
      "inventory_quantity",
    ]);
  });

  it("has a unique field token for every entry", () => {
    const tokens = NATIVE_SHOPIFY_FIELDS.map((entry) => entry.field);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("gives every entry a non-empty human label", () => {
    for (const entry of NATIVE_SHOPIFY_FIELDS) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("findNativeField", () => {
  it("returns the matching entry for a known token", () => {
    expect(findNativeField("price")).toEqual({ field: "price", label: "Price" });
    expect(findNativeField("compare_at_price")).toEqual({
      field: "compare_at_price",
      label: "Compare-at price",
    });
  });

  it("returns undefined for an unknown token (e.g. a metafield key)", () => {
    expect(findNativeField("battery_life")).toBeUndefined();
    expect(findNativeField("")).toBeUndefined();
  });
});
