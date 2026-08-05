import { describe, it, expect } from "vitest";
import {
  buildRoutingProjection,
  compactRoutingForDelivery,
  ROUTING_WIRE_VERSION,
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

describe("multi-value scope (feature 46) — N rows from one template", () => {
  it("N PRODUCT INCLUDE rows all map into byProduct under the one handle", () => {
    const A = "gid://shopify/Product/A";
    const B = "gid://shopify/Product/B";
    const projection = buildRoutingProjection([
      rule("PRODUCT", A, "template-a"),
      rule("PRODUCT", B, "template-a"),
    ]);
    expect(projection.byProduct).toEqual({
      [A]: "template-a",
      [B]: "template-a",
    });
  });

  it("N COLLECTION INCLUDE rows all map into byCollection under the one handle", () => {
    const C1 = "gid://shopify/Collection/1";
    const C2 = "gid://shopify/Collection/2";
    const projection = buildRoutingProjection([
      rule("COLLECTION", C1, "template-c"),
      rule("COLLECTION", C2, "template-c"),
    ]);
    expect(projection.byCollection).toEqual({
      [C1]: "template-c",
      [C2]: "template-c",
    });
  });
});

// The DELIVERY wire (Option 1). Compaction is lossless over the routing information
// but reshapes it: bare-id keys, interned handle indices, `excluded` as a membership
// set, `byTag` dropped. These pin the shape the storefront resolver decodes.
describe("compactRoutingForDelivery", () => {
  it("stamps the wire version", () => {
    expect(ROUTING_WIRE_VERSION).toBe(2);
    expect(compactRoutingForDelivery(buildRoutingProjection([])).v).toBe(2);
  });

  it("compacts an empty projection to the versioned empty wire (no byTag key)", () => {
    const c = compactRoutingForDelivery(buildRoutingProjection([]));
    expect(c).toEqual({
      v: ROUTING_WIRE_VERSION,
      handles: [],
      def: null,
      byType: {},
      byVendor: {},
      byCollection: {},
      byProduct: {},
      excluded: {},
    });
    // byTag is omitted entirely — the storefront never reads it.
    expect(c).not.toHaveProperty("byTag");
  });

  it("strips GIDs to bare numeric ids for product/collection/excluded keys", () => {
    const c = compactRoutingForDelivery(
      buildRoutingProjection([
        rule("PRODUCT", "gid://shopify/Product/12345", "template-a"),
        rule("COLLECTION", "gid://shopify/Collection/678", "template-a"),
        rule("PRODUCT", "gid://shopify/Product/999", "template-a", "EXCLUDE"),
      ]),
    );
    expect(c.byProduct).toEqual({ "12345": 0 });
    expect(c.byCollection).toEqual({ "678": 0 });
    expect(c.excluded).toEqual({ "999": 1 });
  });

  it("keeps byType/byVendor keys raw (they match product.type/vendor directly)", () => {
    const c = compactRoutingForDelivery(
      buildRoutingProjection([
        rule("PRODUCT_TYPE", "Phones", "template-a"),
        rule("VENDOR", "Ünïcödé Çø", "template-a"),
      ]),
    );
    expect(c.byType).toEqual({ Phones: 0 });
    expect(c.byVendor).toEqual({ "Ünïcödé Çø": 0 });
  });

  it("interns a shared handle once and references it by index (def interned first)", () => {
    const c = compactRoutingForDelivery(
      buildRoutingProjection([
        rule("ALL_PRODUCTS", null, "template-shared"),
        rule("PRODUCT_TYPE", "Phone", "template-shared"),
        rule("VENDOR", "Acme", "template-other"),
      ]),
    );
    expect(c.handles).toEqual(["template-shared", "template-other"]);
    expect(c.def).toBe(0); // ALL_PRODUCTS default is interned first
    expect(c.byType).toEqual({ Phone: 0 }); // reuses the shared index
    expect(c.byVendor).toEqual({ Acme: 1 });
  });

  it("leaves def null when there is no ALL_PRODUCTS default", () => {
    const c = compactRoutingForDelivery(
      buildRoutingProjection([rule("PRODUCT_TYPE", "Phones", "template-a")]),
    );
    expect(c.def).toBeNull();
  });

  it("does not mutate the projection it reads", () => {
    const projection = buildRoutingProjection([
      rule("PRODUCT", "gid://shopify/Product/1", "template-a"),
    ]);
    const snapshot = JSON.parse(JSON.stringify(projection));
    compactRoutingForDelivery(projection);
    expect(projection).toEqual(snapshot);
  });
});
