import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prisma is mocked at the boundary (same pattern as template.server.test.ts): the
// pure glue is asserted directly; the orchestrator is exercised with mocked Prisma
// + `admin.graphql`.
vi.mock("../db.server", () => ({
  default: {
    template: { findMany: vi.fn() },
    shop: { findUnique: vi.fn(), update: vi.fn() },
    shopStorefrontRouting: { upsert: vi.fn(), update: vi.fn() },
  },
}));

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  compactRoutingForDelivery,
  type RoutingProjection,
} from "../utils/routingProjection";
import {
  flattenActiveRulesToRoutingRules,
  buildRoutingMetafieldInput,
  readMetafieldsSetResult,
  rebuildShopRouting,
  ROUTING_METAFIELD_NAMESPACE,
  ROUTING_METAFIELD_KEY,
  type ActiveTemplateForRouting,
} from "./routing.server";

const prismaMock = prisma as unknown as {
  template: { findMany: ReturnType<typeof vi.fn> };
  shop: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  shopStorefrontRouting: {
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const EMPTY_PROJECTION: RoutingProjection = {
  defaultTemplateHandle: null,
  byType: {},
  byVendor: {},
  byCollection: {},
  byTag: {},
  byProduct: {},
  excludedProductGids: [],
};

describe("flattenActiveRulesToRoutingRules", () => {
  it("attaches each template's handle to each of its rules", () => {
    const templates: ActiveTemplateForRouting[] = [
      {
        shopifyMetaobjectHandle: "template-a",
        assignments: [
          { scope: "PRODUCT_TYPE", scopeValue: "Phones", mode: "INCLUDE" },
          {
            scope: "PRODUCT",
            scopeValue: "gid://shopify/Product/1",
            mode: "EXCLUDE",
          },
        ],
      },
      {
        shopifyMetaobjectHandle: "template-b",
        assignments: [{ scope: "VENDOR", scopeValue: "Acme", mode: "INCLUDE" }],
      },
    ];

    expect(flattenActiveRulesToRoutingRules(templates)).toEqual([
      {
        scope: "PRODUCT_TYPE",
        scopeValue: "Phones",
        mode: "INCLUDE",
        templateHandle: "template-a",
      },
      {
        scope: "PRODUCT",
        scopeValue: "gid://shopify/Product/1",
        mode: "EXCLUDE",
        templateHandle: "template-a",
      },
      {
        scope: "VENDOR",
        scopeValue: "Acme",
        mode: "INCLUDE",
        templateHandle: "template-b",
      },
    ]);
  });

  it("passes a null handle through as an empty string (feature 40 drops it)", () => {
    const templates: ActiveTemplateForRouting[] = [
      {
        shopifyMetaobjectHandle: null,
        assignments: [
          { scope: "PRODUCT_TYPE", scopeValue: "Phones", mode: "INCLUDE" },
        ],
      },
    ];
    expect(flattenActiveRulesToRoutingRules(templates)).toEqual([
      {
        scope: "PRODUCT_TYPE",
        scopeValue: "Phones",
        mode: "INCLUDE",
        templateHandle: "",
      },
    ]);
  });

  it("returns [] for no templates or a template with no assignments", () => {
    expect(flattenActiveRulesToRoutingRules([])).toEqual([]);
    expect(
      flattenActiveRulesToRoutingRules([
        { shopifyMetaobjectHandle: "template-a", assignments: [] },
      ]),
    ).toEqual([]);
  });

  it("multi-value (feature 46): one template's N INCLUDE rows all carry its handle", () => {
    const A = "gid://shopify/Product/A";
    const B = "gid://shopify/Product/B";
    const templates: ActiveTemplateForRouting[] = [
      {
        shopifyMetaobjectHandle: "template-a",
        assignments: [
          { scope: "PRODUCT", scopeValue: A, mode: "INCLUDE" },
          { scope: "PRODUCT", scopeValue: B, mode: "INCLUDE" },
        ],
      },
    ];
    expect(flattenActiveRulesToRoutingRules(templates)).toEqual([
      {
        scope: "PRODUCT",
        scopeValue: A,
        mode: "INCLUDE",
        templateHandle: "template-a",
      },
      {
        scope: "PRODUCT",
        scopeValue: B,
        mode: "INCLUDE",
        templateHandle: "template-a",
      },
    ]);
  });
});

describe("buildRoutingMetafieldInput", () => {
  it("builds the metafieldsSet variables with reserved $app / routing / json", () => {
    const projection: RoutingProjection = {
      ...EMPTY_PROJECTION,
      byType: { Phones: "template-phones" },
    };
    const input = buildRoutingMetafieldInput(
      "gid://shopify/Shop/42",
      projection,
    );
    expect(input).toEqual({
      metafields: [
        {
          ownerId: "gid://shopify/Shop/42",
          namespace: "$app",
          key: "routing",
          type: "json",
          // Delivery is the COMPACT wire (Option 1), not the raw projection.
          value: JSON.stringify(compactRoutingForDelivery(projection)),
        },
      ],
    });
    // Value round-trips to the compact delivery shape: interned handle, index value.
    expect(JSON.parse(input.metafields[0].value)).toEqual({
      v: 2,
      handles: ["template-phones"],
      def: null,
      byType: { Phones: 0 },
      byVendor: {},
      byCollection: {},
      byProduct: {},
      excluded: {},
    });
  });

  it("uses the exported namespace/key constants", () => {
    expect(ROUTING_METAFIELD_NAMESPACE).toBe("$app");
    expect(ROUTING_METAFIELD_KEY).toBe("routing");
  });
});

describe("readMetafieldsSetResult", () => {
  it("returns the metafield gid on success", () => {
    const json = {
      data: {
        metafieldsSet: {
          metafields: [{ id: "gid://shopify/Metafield/9", namespace: "$app" }],
          userErrors: [],
        },
      },
    };
    expect(readMetafieldsSetResult(json)).toEqual({
      ok: true,
      metafieldGid: "gid://shopify/Metafield/9",
    });
  });

  it("fails on a userErrors payload (joining messages)", () => {
    const json = {
      data: {
        metafieldsSet: {
          metafields: [],
          userErrors: [{ field: ["value"], message: "bad json" }],
        },
      },
    };
    const result = readMetafieldsSetResult(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/bad json/);
  });

  it("fails on a missing metafield or a malformed payload", () => {
    expect(
      readMetafieldsSetResult({
        data: { metafieldsSet: { metafields: [], userErrors: [] } },
      }).ok,
    ).toBe(false);
    expect(readMetafieldsSetResult({}).ok).toBe(false);
    expect(readMetafieldsSetResult(null).ok).toBe(false);
  });
});

describe("rebuildShopRouting", () => {
  function mockAdmin(
    graphqlImpl: (op: string, opts?: unknown) => Promise<unknown>,
  ): AdminApiContext {
    return { graphql: vi.fn(graphqlImpl) } as unknown as AdminApiContext;
  }

  // A happy-path admin: shop-id query then a successful metafieldsSet.
  function okAdmin() {
    return mockAdmin(async (op: string) => {
      if (op.includes("ShopId")) {
        return {
          ok: true,
          json: async () => ({
            data: { shop: { id: "gid://shopify/Shop/7" } },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [{ id: "gid://shopify/Metafield/1" }],
              userErrors: [],
            },
          },
        }),
      };
    });
  }

  beforeEach(() => {
    prismaMock.template.findMany.mockReset();
    prismaMock.shop.findUnique.mockReset();
    prismaMock.shop.update.mockReset();
    prismaMock.shopStorefrontRouting.upsert.mockReset();
    prismaMock.shopStorefrontRouting.update.mockReset();
    // Default to a cache MISS so these tests exercise the `{ shop { id } }`
    // fetch path; the cache-hit path has its own test below.
    prismaMock.shop.findUnique.mockResolvedValue({ shopGid: null });
    prismaMock.shop.update.mockResolvedValue({});
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({});
    prismaMock.shopStorefrontRouting.update.mockResolvedValue({});
  });

  it("reads ACTIVE rules, upserts the row, sets the metafield, and stamps sync", async () => {
    prismaMock.template.findMany.mockResolvedValue([
      {
        shopifyMetaobjectHandle: "template-a",
        assignments: [
          { scope: "PRODUCT_TYPE", scopeValue: "Phones", mode: "INCLUDE" },
        ],
      },
    ]);

    const result = await rebuildShopRouting(okAdmin(), "shop_1");

    expect(result).toEqual({
      ok: true,
      metafieldGid: "gid://shopify/Metafield/1",
    });

    // ACTIVE + shop-scoped read.
    expect(prismaMock.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: "shop_1", status: "ACTIVE" },
      }),
    );
    // Row upserted with the projected map (byType from the one rule).
    const upsertArg = prismaMock.shopStorefrontRouting.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ shopId: "shop_1" });
    expect(upsertArg.create.byType).toEqual({ Phones: "template-a" });
    // Sync state stamped after the write.
    const updateArg = prismaMock.shopStorefrontRouting.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ shopId: "shop_1" });
    expect(updateArg.data.shopMetafieldGid).toBe("gid://shopify/Metafield/1");
    expect(updateArg.data.syncedToShopifyAt).toBeInstanceOf(Date);
  });

  it("writes an empty map when there are no ACTIVE rules (clears the storefront)", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);

    const result = await rebuildShopRouting(okAdmin(), "shop_1");

    expect(result.ok).toBe(true);
    const upsertArg = prismaMock.shopStorefrontRouting.upsert.mock.calls[0][0];
    expect(upsertArg.create).toEqual({ shopId: "shop_1", ...EMPTY_PROJECTION });
  });

  it("returns an error and does NOT stamp sync state on a userErrors response", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    const admin = mockAdmin(async (op: string) => {
      if (op.includes("ShopId")) {
        return {
          ok: true,
          json: async () => ({
            data: { shop: { id: "gid://shopify/Shop/7" } },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [],
              userErrors: [{ message: "invalid value" }],
            },
          },
        }),
      };
    });

    const result = await rebuildShopRouting(admin, "shop_1");

    expect(result.ok).toBe(false);
    // Row still persisted (Postgres is source of truth); sync NOT stamped.
    expect(prismaMock.shopStorefrontRouting.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.shopStorefrontRouting.update).not.toHaveBeenCalled();
  });

  it("returns an error (not a throw) when the shop GID can't be resolved", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    const admin = mockAdmin(async () => ({
      ok: true,
      json: async () => ({ data: { shop: {} } }),
    }));

    const result = await rebuildShopRouting(admin, "shop_1");

    expect(result.ok).toBe(false);
    expect(prismaMock.shopStorefrontRouting.update).not.toHaveBeenCalled();
  });

  it("uses the cached shop GID and skips the ShopId query on a cache hit", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    prismaMock.shop.findUnique.mockResolvedValue({
      shopGid: "gid://shopify/Shop/CACHED",
    });
    const admin = okAdmin();

    const result = await rebuildShopRouting(admin, "shop_1");

    expect(result).toEqual({
      ok: true,
      metafieldGid: "gid://shopify/Metafield/1",
    });
    // No `{ shop { id } }` round-trip — the GID came from Postgres.
    const ops = (admin.graphql as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(ops.some((op) => op.includes("ShopId"))).toBe(false);
    // And nothing was written back to the cache (it was already warm).
    expect(prismaMock.shop.update).not.toHaveBeenCalled();
    // The cached GID is what got written as the metafield owner.
    const metafieldsCall = (
      admin.graphql as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => (c[0] as string).includes("metafieldsSet"));
    const ownerId = (
      metafieldsCall?.[1] as {
        variables: { metafields: { ownerId: string }[] };
      }
    ).variables.metafields[0].ownerId;
    expect(ownerId).toBe("gid://shopify/Shop/CACHED");
  });

  it("caches the shop GID on a miss so the next rebuild can skip the query", async () => {
    prismaMock.template.findMany.mockResolvedValue([]);
    prismaMock.shop.findUnique.mockResolvedValue({ shopGid: null });

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(prismaMock.shop.update).toHaveBeenCalledWith({
      where: { id: "shop_1" },
      data: { shopGid: "gid://shopify/Shop/7" },
    });
  });
});

// --- Byte budget observation (step 104 / data-model.md §14) ------------------
// 🚫 The single most important test here is that an OVER-budget projection still
// reaches `metafieldsSet`. 104 measures and warns; refusing a write is step 105's
// decision, and this guard is what stops a future session quietly making that
// decision inside a logging change.

describe("rebuildShopRouting — routing payload budget", () => {
  function mockAdmin(
    graphqlImpl: (op: string, opts?: unknown) => Promise<unknown>,
  ): AdminApiContext {
    return { graphql: vi.fn(graphqlImpl) } as unknown as AdminApiContext;
  }

  function okAdmin() {
    return mockAdmin(async (op: string) => {
      if (op.includes("ShopId")) {
        return {
          ok: true,
          json: async () => ({
            data: { shop: { id: "gid://shopify/Shop/7" } },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            metafieldsSet: {
              metafields: [{ id: "gid://shopify/Metafield/1" }],
              userErrors: [],
            },
          },
        }),
      };
    });
  }

  /** N EXCLUDE carve-outs — the cheapest way to a large map (§14: 18 bytes each in
   *  the compact delivery wire the budget measures). */
  function excludeTemplate(count: number): ActiveTemplateForRouting {
    return {
      shopifyMetaobjectHandle: "template-cl9ebqhxk00003b600tymydho",
      assignments: Array.from({ length: count }, (_, i) => ({
        scope: "PRODUCT" as const,
        scopeValue: `gid://shopify/Product/${7000000000000 + i}`,
        mode: "EXCLUDE" as const,
      })),
    };
  }

  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prismaMock.template.findMany.mockReset();
    prismaMock.shop.findUnique.mockReset();
    prismaMock.shop.update.mockReset();
    prismaMock.shop.findUnique.mockResolvedValue({ shopGid: null });
    prismaMock.shop.update.mockResolvedValue({});
    prismaMock.shopStorefrontRouting.upsert.mockReset();
    prismaMock.shopStorefrontRouting.update.mockReset();
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({});
    prismaMock.shopStorefrontRouting.update.mockResolvedValue({});
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("🔴 STILL WRITES an over-budget payload — 104 observes, 105 decides", async () => {
    // 7,277 carve-outs is one past the compact ceiling (§14). The write must go through.
    prismaMock.template.findMany.mockResolvedValue([excludeTemplate(7277)]);
    const admin = okAdmin();

    const result = await rebuildShopRouting(admin, "shop_1");

    expect(result).toEqual({
      ok: true,
      metafieldGid: "gid://shopify/Metafield/1",
    });
    // The mutation was actually issued, not skipped.
    const ops = (admin.graphql as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(ops.some((op) => op.includes("metafieldsSet"))).toBe(true);
    // And sync state was stamped, exactly as at any other size.
    expect(prismaMock.shopStorefrontRouting.update).toHaveBeenCalledTimes(1);
  });

  it("warns at `over`, naming the map that is carrying the payload", async () => {
    prismaMock.template.findMany.mockResolvedValue([excludeTemplate(7277)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("over budget");
    expect(message).toContain("excluded 7277");
    expect(message).toContain("§14");
  });

  it("warns at `warn` — before the ceiling, while there is still runway", async () => {
    prismaMock.template.findMany.mockResolvedValue([excludeTemplate(5820)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("warn budget");
  });

  it("stays SILENT at ok — a warning on every routine write is a warning nobody reads", async () => {
    prismaMock.template.findMany.mockResolvedValue([excludeTemplate(10)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).not.toHaveBeenCalled();
  });
});
