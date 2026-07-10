import { describe, it, expect } from "vitest";
import {
  buildRoutingProjection,
  type RoutingRule,
  type RoutingProjection,
} from "./routingProjection";

// Pure builder — no DB, no Admin API. Every case feeds a flat rule list and
// asserts the projected map, mirroring the `assignmentOverlap.test.ts` style.

const rule = (
  scope: RoutingRule["scope"],
  scopeValue: string | null,
  templateHandle: string,
  mode: RoutingRule["mode"] = "INCLUDE",
): RoutingRule => ({ scope, scopeValue, mode, templateHandle });

const EMPTY: RoutingProjection = {
  defaultTemplateHandle: null,
  byType: {},
  byVendor: {},
  byCollection: {},
  byTag: {},
  byProduct: {},
  excludedProductGids: [],
};

describe("buildRoutingProjection", () => {
  it("returns all-empty defaults for an empty rule list", () => {
    expect(buildRoutingProjection([])).toEqual(EMPTY);
  });

  it("routes ALL_PRODUCTS INCLUDE to defaultTemplateHandle", () => {
    const p = buildRoutingProjection([
      rule("ALL_PRODUCTS", null, "template-default"),
    ]);
    expect(p.defaultTemplateHandle).toBe("template-default");
    expect(p).toEqual({ ...EMPTY, defaultTemplateHandle: "template-default" });
  });

  it("routes PRODUCT_TYPE and VENDOR by their raw string value", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", "template-phones"),
      rule("VENDOR", "Acme", "template-acme"),
    ]);
    expect(p.byType).toEqual({ Phones: "template-phones" });
    expect(p.byVendor).toEqual({ Acme: "template-acme" });
  });

  it("routes COLLECTION and PRODUCT keyed by the raw GID (verbatim, lossless)", () => {
    const p = buildRoutingProjection([
      rule("COLLECTION", "gid://shopify/Collection/123", "template-col"),
      rule("PRODUCT", "gid://shopify/Product/456", "template-prod"),
    ]);
    expect(p.byCollection).toEqual({
      "gid://shopify/Collection/123": "template-col",
    });
    expect(p.byProduct).toEqual({
      "gid://shopify/Product/456": "template-prod",
    });
  });

  it("routes an EXCLUDE PRODUCT rule into excludedProductGids (verbatim GID)", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT", "gid://shopify/Product/999", "template-x", "EXCLUDE"),
    ]);
    expect(p.excludedProductGids).toEqual(["gid://shopify/Product/999"]);
    // An EXCLUDE never lands in byProduct.
    expect(p.byProduct).toEqual({});
  });

  it("ignores a non-PRODUCT EXCLUDE (undefined in MVP)", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", "template-x", "EXCLUDE"),
    ]);
    expect(p).toEqual(EMPTY);
  });

  it("projects a multi-rule mix across every dimension into the right maps", () => {
    const p = buildRoutingProjection([
      rule("ALL_PRODUCTS", null, "template-default"),
      rule("PRODUCT_TYPE", "Phones", "template-phones"),
      rule("VENDOR", "Acme", "template-acme"),
      rule("COLLECTION", "gid://shopify/Collection/1", "template-col"),
      rule("PRODUCT", "gid://shopify/Product/2", "template-prod"),
      rule("PRODUCT", "gid://shopify/Product/3", "template-x", "EXCLUDE"),
    ]);
    expect(p).toEqual({
      defaultTemplateHandle: "template-default",
      byType: { Phones: "template-phones" },
      byVendor: { Acme: "template-acme" },
      byCollection: { "gid://shopify/Collection/1": "template-col" },
      byTag: {},
      byProduct: { "gid://shopify/Product/2": "template-prod" },
      excludedProductGids: ["gid://shopify/Product/3"],
    });
  });

  it("skips a rule with a blank/whitespace handle (no null pointers)", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", ""),
      rule("VENDOR", "Acme", "   "),
      rule("ALL_PRODUCTS", null, "  "),
    ]);
    expect(p).toEqual(EMPTY);
  });

  it("trims the handle before storing it", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", "  template-phones  "),
    ]);
    expect(p.byType).toEqual({ Phones: "template-phones" });
  });

  it("skips a valued scope whose scopeValue is missing", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", null, "template-x"),
      rule("VENDOR", "", "template-y"),
    ]);
    expect(p).toEqual(EMPTY);
  });

  it("leaves byTag empty (TAG is post-MVP)", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", "template-phones"),
    ]);
    expect(p.byTag).toEqual({});
  });

  it("is deterministic last-wins on a duplicate key (assumed-disjoint contract)", () => {
    const p = buildRoutingProjection([
      rule("PRODUCT_TYPE", "Phones", "template-first"),
      rule("PRODUCT_TYPE", "Phones", "template-second"),
    ]);
    expect(p.byType).toEqual({ Phones: "template-second" });
  });

  it("does not mutate the input rule list", () => {
    const rules = [rule("PRODUCT_TYPE", "Phones", "template-phones")];
    const snapshot = JSON.parse(JSON.stringify(rules));
    buildRoutingProjection(rules);
    expect(rules).toEqual(snapshot);
  });
});
