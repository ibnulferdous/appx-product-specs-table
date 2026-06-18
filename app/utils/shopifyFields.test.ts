import { describe, it, expect } from "vitest";
import {
  NATIVE_SHOPIFY_FIELDS,
  findNativeField,
  filterNativeFields,
  filterMetafieldDefinitions,
} from "./shopifyFields";
import type { MetafieldDefinitionSummary } from "../shopify/metafieldDefinitions.server";

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

describe("filterNativeFields", () => {
  const tokensOf = (query: string) =>
    filterNativeFields(query).map((entry) => entry.field);

  it("returns the full list in order for an empty query", () => {
    expect(filterNativeFields("")).toEqual(NATIVE_SHOPIFY_FIELDS);
  });

  it("returns the full list in order for a whitespace-only query", () => {
    expect(filterNativeFields("   ")).toEqual(NATIVE_SHOPIFY_FIELDS);
  });

  it("matches on the human label, preserving original order", () => {
    // "price" appears in both Price and Compare-at price; order follows the
    // source list (compare_at_price comes after price).
    expect(tokensOf("price")).toEqual(["price", "compare_at_price"]);
  });

  it("matches a multi-word label fragment", () => {
    expect(tokensOf("type")).toEqual(["product_type"]);
  });

  it("is case-insensitive", () => {
    expect(tokensOf("PRICE")).toEqual(tokensOf("price"));
    expect(tokensOf("Vendor")).toEqual(["vendor"]);
  });

  it("matches the snake_case token with underscores read as spaces", () => {
    // The label is "Compare-at price" (hyphen), but the token normalises to
    // "compare at price", so "compare at" still finds it.
    expect(tokensOf("compare at")).toEqual(["compare_at_price"]);
    expect(tokensOf("available for")).toEqual(["available_for_sale"]);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(tokensOf("  vendor  ")).toEqual(["vendor"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterNativeFields("zzz")).toEqual([]);
  });

  it("does not mutate the source constant", () => {
    const before = NATIVE_SHOPIFY_FIELDS.map((entry) => entry.field);
    filterNativeFields("price");
    filterNativeFields("");
    expect(NATIVE_SHOPIFY_FIELDS.map((entry) => entry.field)).toEqual(before);
  });

  it("returns a fresh array for the empty-query identity view", () => {
    // The full-list path must be a copy, not the readonly source, so callers
    // can treat the result as a plain mutable array.
    expect(filterNativeFields("")).not.toBe(NATIVE_SHOPIFY_FIELDS);
  });
});

describe("filterMetafieldDefinitions", () => {
  // A small fixture mirroring the shape the Step 8 fetch produces. `name` is the
  // human label; `namespace`/`key` are the locked pill contract.
  const DEFINITIONS: MetafieldDefinitionSummary[] = [
    {
      id: "gid://1",
      namespace: "custom",
      key: "battery_life",
      name: "Battery life",
      type: "number_integer",
    },
    {
      id: "gid://2",
      namespace: "custom",
      key: "chipset",
      name: "Chipset",
      type: "single_line_text_field",
    },
    {
      id: "gid://3",
      namespace: "specs",
      key: "weight_grams",
      name: "Weight (g)",
      type: "number_decimal",
    },
  ];

  const keysOf = (query: string) =>
    filterMetafieldDefinitions(DEFINITIONS, query).map((d) => d.key);

  it("returns the full list in order for an empty query", () => {
    expect(filterMetafieldDefinitions(DEFINITIONS, "")).toEqual(DEFINITIONS);
  });

  it("returns the full list in order for a whitespace-only query", () => {
    expect(filterMetafieldDefinitions(DEFINITIONS, "   ")).toEqual(DEFINITIONS);
  });

  it("matches on the human name, preserving original order", () => {
    expect(keysOf("battery")).toEqual(["battery_life"]);
  });

  it("matches via the namespace.key token", () => {
    // "battery" is also present in the key token (battery_life); "specs" only
    // appears in the namespace.
    expect(keysOf("specs")).toEqual(["weight_grams"]);
  });

  it("reads the namespace.key token's non-alphanumerics as spaces", () => {
    // `custom.battery_life` normalises to "custom battery life", so the
    // multi-word fragment "battery life" still finds it via the token.
    expect(keysOf("battery life")).toEqual(["battery_life"]);
    // The leading namespace + dot is matchable as "custom battery".
    expect(keysOf("custom battery")).toEqual(["battery_life"]);
  });

  it("matches the namespace prefix shared by several definitions", () => {
    expect(keysOf("custom")).toEqual(["battery_life", "chipset"]);
  });

  it("is case-insensitive", () => {
    expect(keysOf("CHIPSET")).toEqual(keysOf("chipset"));
    expect(keysOf("Weight")).toEqual(["weight_grams"]);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(keysOf("  chipset  ")).toEqual(["chipset"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMetafieldDefinitions(DEFINITIONS, "zzz")).toEqual([]);
  });

  it("returns an empty array for an empty source list", () => {
    expect(filterMetafieldDefinitions([], "battery")).toEqual([]);
  });

  it("does not mutate the source array", () => {
    const before = DEFINITIONS.map((d) => d.key);
    filterMetafieldDefinitions(DEFINITIONS, "battery");
    filterMetafieldDefinitions(DEFINITIONS, "");
    expect(DEFINITIONS.map((d) => d.key)).toEqual(before);
  });

  it("returns a fresh array for the empty-query identity view", () => {
    expect(filterMetafieldDefinitions(DEFINITIONS, "")).not.toBe(DEFINITIONS);
  });
});
