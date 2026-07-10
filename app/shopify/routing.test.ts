import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma is mocked at the boundary (same pattern as template.server.test.ts): the
// pure glue is asserted directly; the orchestrator is exercised with mocked Prisma
// + `admin.graphql`.
vi.mock("../db.server", () => ({
  default: {
    template: { findMany: vi.fn() },
    shopStorefrontRouting: { upsert: vi.fn(), update: vi.fn() },
  },
}));

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { RoutingProjection } from "../utils/routingProjection";
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
          value: JSON.stringify(projection),
        },
      ],
    });
    // Value round-trips to the exact projection (no reshape).
    expect(JSON.parse(input.metafields[0].value)).toEqual(projection);
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
    prismaMock.shopStorefrontRouting.upsert.mockReset();
    prismaMock.shopStorefrontRouting.update.mockReset();
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
});
