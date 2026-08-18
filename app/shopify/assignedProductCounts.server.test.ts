import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  groupAssignments,
  collectLookups,
  escapeProductSearchValue,
  buildAssignedCountQuery,
  parseAssignedCountResponse,
  computeTemplateAssignedCount,
  resolveAssignedProductCounts,
  type TemplateAssignment,
  type ResolvedCounts,
} from "./assignedProductCounts.server";

// The query BUILDER, response NARROWER, grouping, and per-template arithmetic are
// pure and tested directly; the live `admin.graphql` runner + Prisma read are
// exercised with mocks at the boundary (per the testing strategy — test the pure
// parts, mock at the boundary).

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    productAssignment: { findMany: vi.fn() },
  },
}));
vi.mock("../db.server", () => ({ default: prismaMock }));

beforeEach(() => {
  vi.resetAllMocks();
});

type Row = {
  templateId: string;
  scope: string;
  scopeValue: string | null;
  mode: "INCLUDE" | "EXCLUDE";
};
const row = (
  templateId: string,
  scope: string,
  scopeValue: string | null,
  mode: "INCLUDE" | "EXCLUDE" = "INCLUDE",
): Row => ({ templateId, scope, scopeValue, mode });

const emptyResolved = (): ResolvedCounts => ({
  shopTotal: null,
  byCollection: new Map(),
  byType: new Map(),
  byVendor: new Map(),
});

// --- groupAssignments -------------------------------------------------------

describe("groupAssignments", () => {
  it("folds a single INCLUDE PRODUCT row into one product value", () => {
    const [a] = groupAssignments([
      row("t1", "PRODUCT", "gid://shopify/Product/1") as never,
    ]);
    expect(a).toEqual({
      templateId: "t1",
      scope: "PRODUCT",
      includeValues: ["gid://shopify/Product/1"],
      excludeCount: 0,
    });
  });

  it("collects 1..N distinct PRODUCT values and dedupes repeats", () => {
    const [a] = groupAssignments([
      row("t1", "PRODUCT", "gid://shopify/Product/1") as never,
      row("t1", "PRODUCT", "gid://shopify/Product/2") as never,
      row("t1", "PRODUCT", "gid://shopify/Product/1") as never, // dup
    ]);
    expect(a.includeValues).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
    ]);
  });

  it("treats ALL_PRODUCTS as a valued-less scope and counts EXCLUDE carve-outs", () => {
    const [a] = groupAssignments([
      row("t1", "ALL_PRODUCTS", null) as never,
      row("t1", "PRODUCT", "gid://shopify/Product/9", "EXCLUDE") as never,
      row("t1", "PRODUCT", "gid://shopify/Product/8", "EXCLUDE") as never,
    ]);
    expect(a).toEqual({
      templateId: "t1",
      scope: "ALL_PRODUCTS",
      includeValues: [],
      excludeCount: 2,
    });
  });

  it("an orphan EXCLUDE-only template has a null scope (matches nothing)", () => {
    const [a] = groupAssignments([
      row("t1", "PRODUCT", "gid://shopify/Product/9", "EXCLUDE") as never,
    ]);
    expect(a.scope).toBeNull();
    expect(a.excludeCount).toBe(1);
  });

  it("keeps templates separate", () => {
    const result = groupAssignments([
      row("t1", "ALL_PRODUCTS", null) as never,
      row("t2", "COLLECTION", "gid://shopify/Collection/5") as never,
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.templateId).sort()).toEqual(["t1", "t2"]);
  });
});

// --- collectLookups ---------------------------------------------------------

describe("collectLookups", () => {
  it("needs nothing for PRODUCT / NONE only (no live lookup)", () => {
    const lookups = collectLookups([
      {
        templateId: "t1",
        scope: "PRODUCT",
        includeValues: ["g1"],
        excludeCount: 0,
      },
      { templateId: "t2", scope: null, includeValues: [], excludeCount: 0 },
    ]);
    expect(lookups).toEqual({
      needShopTotal: false,
      collectionGids: [],
      productTypes: [],
      vendors: [],
    });
  });

  it("collects distinct broad-scope lookups + the shop total", () => {
    const lookups = collectLookups([
      {
        templateId: "t1",
        scope: "ALL_PRODUCTS",
        includeValues: [],
        excludeCount: 3,
      },
      {
        templateId: "t2",
        scope: "COLLECTION",
        includeValues: ["c1", "c2"],
        excludeCount: 0,
      },
      {
        templateId: "t3",
        scope: "COLLECTION",
        includeValues: ["c1"],
        excludeCount: 0,
      },
      {
        templateId: "t4",
        scope: "PRODUCT_TYPE",
        includeValues: ["Drones"],
        excludeCount: 0,
      },
      {
        templateId: "t5",
        scope: "VENDOR",
        includeValues: ["DJI"],
        excludeCount: 0,
      },
    ]);
    expect(lookups.needShopTotal).toBe(true);
    expect(lookups.collectionGids.sort()).toEqual(["c1", "c2"]);
    expect(lookups.productTypes).toEqual(["Drones"]);
    expect(lookups.vendors).toEqual(["DJI"]);
  });
});

// --- escapeProductSearchValue ----------------------------------------------

describe("escapeProductSearchValue", () => {
  it("escapes backslashes then single quotes (injection-safe)", () => {
    expect(escapeProductSearchValue("O'Neil")).toBe("O\\'Neil");
    expect(escapeProductSearchValue("a\\b")).toBe("a\\\\b");
    expect(escapeProductSearchValue("plain")).toBe("plain");
  });
});

// --- buildAssignedCountQuery ------------------------------------------------

describe("buildAssignedCountQuery", () => {
  it("returns null when nothing needs a live count", () => {
    expect(
      buildAssignedCountQuery({
        needShopTotal: false,
        collectionGids: [],
        productTypes: [],
        vendors: [],
      }),
    ).toBeNull();
  });

  it("emits a param-less query for the shop total alone", () => {
    const built = buildAssignedCountQuery({
      needShopTotal: true,
      collectionGids: [],
      productTypes: [],
      vendors: [],
    })!;
    expect(built.query).toContain("query AssignedProductCounts {");
    expect(built.query).toContain(
      "shopTotal: productsCount(limit: null) { count }",
    );
    expect(built.variables).toEqual({});
    expect(built.aliases.shopTotal).toBe(true);
  });

  it("aliases and variable-binds collections / types / vendors", () => {
    const built = buildAssignedCountQuery({
      needShopTotal: true,
      collectionGids: ["gid://shopify/Collection/5"],
      productTypes: ["Drones"],
      vendors: ["O'Neil"],
    })!;
    // Declared params, one per aliased lookup.
    expect(built.query).toContain("$col0: ID!");
    expect(built.query).toContain("$ptype0: String!");
    expect(built.query).toContain("$vendor0: String!");
    // Bodies reference the variables (never inline the raw value).
    expect(built.query).toContain(
      "col0: collection(id: $col0) { productsCount { count } }",
    );
    expect(built.query).toContain(
      "ptype0: productsCount(query: $ptype0, limit: null) { count }",
    );
    // Variables carry the search terms; the merchant string is escaped.
    expect(built.variables.col0).toBe("gid://shopify/Collection/5");
    expect(built.variables.ptype0).toBe("product_type:'Drones'");
    expect(built.variables.vendor0).toBe("vendor:'O\\'Neil'");
    // Alias maps let the narrower find each field.
    expect(built.aliases.collection.get("gid://shopify/Collection/5")).toBe(
      "col0",
    );
    expect(built.aliases.type.get("Drones")).toBe("ptype0");
    expect(built.aliases.vendor.get("O'Neil")).toBe("vendor0");
  });
});

// --- parseAssignedCountResponse ---------------------------------------------

describe("parseAssignedCountResponse", () => {
  const aliases = {
    shopTotal: true,
    collection: new Map([["c1", "col0"]]),
    type: new Map([["Drones", "ptype0"]]),
    vendor: new Map([["DJI", "vendor0"]]),
  };

  it("reads every count out of a well-formed aliased response", () => {
    const resolved = parseAssignedCountResponse(
      {
        data: {
          shopTotal: { count: 42 },
          col0: { productsCount: { count: 7 } },
          ptype0: { count: 3 },
          vendor0: { count: 5 },
        },
      },
      aliases,
    );
    expect(resolved.shopTotal).toBe(42);
    expect(resolved.byCollection.get("c1")).toBe(7);
    expect(resolved.byType.get("Drones")).toBe(3);
    expect(resolved.byVendor.get("DJI")).toBe(5);
  });

  it("treats a null collection node (deleted collection) as 0 products", () => {
    const resolved = parseAssignedCountResponse(
      {
        data: {
          shopTotal: { count: 1 },
          col0: null,
          ptype0: { count: 0 },
          vendor0: { count: 0 },
        },
      },
      aliases,
    );
    expect(resolved.byCollection.get("c1")).toBe(0);
  });

  it("leaves malformed / missing fields unknown (absent from the map)", () => {
    const resolved = parseAssignedCountResponse(
      { data: { shopTotal: {}, col0: { productsCount: {} } } },
      aliases,
    );
    expect(resolved.shopTotal).toBeNull();
    expect(resolved.byCollection.has("c1")).toBe(false);
    expect(resolved.byType.has("Drones")).toBe(false);
  });

  it("returns all-unknown for a non-object payload", () => {
    const resolved = parseAssignedCountResponse(null, aliases);
    expect(resolved.shopTotal).toBeNull();
    expect(resolved.byCollection.size).toBe(0);
  });
});

// --- computeTemplateAssignedCount -------------------------------------------

describe("computeTemplateAssignedCount", () => {
  const assign = (
    scope: TemplateAssignment["scope"],
    includeValues: string[],
    excludeCount = 0,
  ): TemplateAssignment => ({
    templateId: "t",
    scope,
    includeValues,
    excludeCount,
  });

  it("a scope-less template covers 0 products", () => {
    expect(
      computeTemplateAssignedCount(assign(null, []), emptyResolved()),
    ).toBe(0);
  });

  it("PRODUCT counts its distinct product values (no live lookup)", () => {
    expect(
      computeTemplateAssignedCount(
        assign("PRODUCT", ["g1", "g2", "g3"]),
        emptyResolved(),
      ),
    ).toBe(3);
  });

  it("ALL_PRODUCTS = shop total minus excludes, clamped at 0", () => {
    const resolved = { ...emptyResolved(), shopTotal: 10 };
    expect(
      computeTemplateAssignedCount(assign("ALL_PRODUCTS", [], 3), resolved),
    ).toBe(7);
    // More excludes than the catalog holds can't go negative.
    expect(
      computeTemplateAssignedCount(assign("ALL_PRODUCTS", [], 99), resolved),
    ).toBe(0);
  });

  it("ALL_PRODUCTS is unknown (null) when the shop total is unavailable", () => {
    expect(
      computeTemplateAssignedCount(
        assign("ALL_PRODUCTS", [], 3),
        emptyResolved(),
      ),
    ).toBeNull();
  });

  it("COLLECTION sums its collections; an unknown member makes the whole cell unknown", () => {
    const resolved = {
      ...emptyResolved(),
      byCollection: new Map([
        ["c1", 4],
        ["c2", 6],
      ]),
    };
    expect(
      computeTemplateAssignedCount(
        assign("COLLECTION", ["c1", "c2"]),
        resolved,
      ),
    ).toBe(10);
    expect(
      computeTemplateAssignedCount(
        assign("COLLECTION", ["c1", "cX"]),
        resolved,
      ),
    ).toBeNull();
  });

  it("PRODUCT_TYPE / VENDOR read their single value or fall to null when unknown", () => {
    const resolved = {
      ...emptyResolved(),
      byType: new Map([["Drones", 12]]),
      byVendor: new Map([["DJI", 8]]),
    };
    expect(
      computeTemplateAssignedCount(
        assign("PRODUCT_TYPE", ["Drones"]),
        resolved,
      ),
    ).toBe(12);
    expect(
      computeTemplateAssignedCount(assign("VENDOR", ["DJI"]), resolved),
    ).toBe(8);
    expect(
      computeTemplateAssignedCount(assign("VENDOR", ["Acme"]), resolved),
    ).toBeNull();
  });
});

// --- resolveAssignedProductCounts (orchestrator, mocked) --------------------

function mockAdmin(json: unknown, ok = true): AdminApiContext {
  return {
    graphql: vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: async () => json,
    }),
  } as unknown as AdminApiContext;
}

describe("resolveAssignedProductCounts", () => {
  it("reads the shop's assignment rows scoped by shopId", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([]);
    const admin = mockAdmin({ data: {} });

    await resolveAssignedProductCounts(admin, "shop_A");

    expect(prismaMock.productAssignment.findMany).toHaveBeenCalledWith({
      where: { shopId: "shop_A" },
      select: { templateId: true, scope: true, scopeValue: true, mode: true },
    });
  });

  it("skips the Admin API entirely when only PRODUCT / NONE templates exist", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      row("t1", "PRODUCT", "gid://shopify/Product/1"),
      row("t1", "PRODUCT", "gid://shopify/Product/2"),
    ]);
    const admin = mockAdmin({ data: {} });

    const counts = await resolveAssignedProductCounts(admin, "shop_A");

    expect(admin.graphql).not.toHaveBeenCalled();
    expect(counts.get("t1")).toBe(2);
  });

  it("resolves broad-scope counts from one batched query", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      row("t1", "ALL_PRODUCTS", null),
      row("t1", "PRODUCT", "gid://shopify/Product/9", "EXCLUDE"),
      row("t2", "COLLECTION", "gid://shopify/Collection/5"),
      row("t3", "PRODUCT", "gid://shopify/Product/1"),
    ]);
    const admin = mockAdmin({
      data: {
        shopTotal: { count: 20 },
        col0: { productsCount: { count: 6 } },
      },
    });

    const counts = await resolveAssignedProductCounts(admin, "shop_A");

    expect(admin.graphql).toHaveBeenCalledTimes(1);
    expect(counts.get("t1")).toBe(19); // 20 total − 1 exclude
    expect(counts.get("t2")).toBe(6); // collection productsCount
    expect(counts.get("t3")).toBe(1); // PRODUCT, no live lookup
  });

  it("is fail-soft: an Admin failure nulls live counts but keeps PRODUCT counts", async () => {
    prismaMock.productAssignment.findMany.mockResolvedValue([
      row("t1", "ALL_PRODUCTS", null),
      row("t2", "PRODUCT", "gid://shopify/Product/1"),
    ]);
    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as AdminApiContext;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const counts = await resolveAssignedProductCounts(admin, "shop_A");

    expect(counts.get("t1")).toBeNull(); // live count unknown → "—"
    expect(counts.get("t2")).toBe(1); // still resolves from Postgres
    errorSpy.mockRestore();
  });
});
