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
  hashShard,
  shardHandle,
  bucketOf,
  type ShardPayload,
} from "../utils/routingShards";
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
    // Wire v3 (feature 108) — broad tiers only; byProduct/excluded shard elsewhere.
    expect(JSON.parse(input.metafields[0].value)).toEqual({
      v: 3,
      handles: ["template-phones"],
      def: null,
      byType: { Phones: 0 },
      byVendor: {},
      byCollection: {},
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
      if (op.includes("RoutingShard")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              metaobjectUpsert: {
                metaobject: {
                  id: "gid://shopify/Metaobject/1",
                  handle: "routing-shard",
                },
                userErrors: [],
              },
            },
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
      if (op.includes("RoutingShard")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              metaobjectUpsert: {
                metaobject: {
                  id: "gid://shopify/Metaobject/1",
                  handle: "routing-shard",
                },
                userErrors: [],
              },
            },
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

// --- Routing shard reconciliation (Option 2, feature 108) -------------------
// The writer splits the per-product maps into per-bucket `$app:appx_routing_shard`
// metaobjects, upserting only the buckets whose content changed (D5) and stamping the
// `shardState` hash ledger from the write OUTCOMES.

describe("rebuildShopRouting — routing shards (feature 108)", () => {
  function mockAdmin(
    graphqlImpl: (op: string, opts?: unknown) => Promise<unknown>,
  ): AdminApiContext {
    return { graphql: vi.fn(graphqlImpl) } as unknown as AdminApiContext;
  }

  // ShopId + metafieldsSet always succeed; each shard's outcome is decided per handle
  // so a single shard can be made to fail.
  function shardAdmin(shardOk: (handle: string) => boolean) {
    return mockAdmin(async (op: string, opts?: unknown) => {
      if (op.includes("ShopId")) {
        return {
          ok: true,
          json: async () => ({
            data: { shop: { id: "gid://shopify/Shop/7" } },
          }),
        };
      }
      if (op.includes("RoutingShard")) {
        const handle = (opts as { variables: { handle: { handle: string } } })
          .variables.handle.handle;
        const ok = shardOk(handle);
        return {
          ok: true,
          json: async () => ({
            data: {
              metaobjectUpsert: ok
                ? {
                    metaobject: { id: "gid://shopify/Metaobject/1", handle },
                    userErrors: [],
                  }
                : { metaobject: null, userErrors: [{ message: "boom" }] },
            },
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

  function productTemplate(
    handle: string,
    ...gids: string[]
  ): ActiveTemplateForRouting {
    return {
      shopifyMetaobjectHandle: handle,
      assignments: gids.map((scopeValue) => ({
        scope: "PRODUCT" as const,
        scopeValue,
        mode: "INCLUDE" as const,
      })),
    };
  }

  const shardCalls = (admin: AdminApiContext) =>
    (admin.graphql as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).includes("RoutingShard"),
    );

  const fieldValue = (call: unknown[], key: string) => {
    const fields = (
      call[1] as {
        variables: {
          metaobject: { fields: Array<{ key: string; value: string }> };
        };
      }
    ).variables.metaobject.fields;
    return fields.find((f) => f.key === key)?.value;
  };

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    prismaMock.template.findMany.mockReset();
    prismaMock.shop.findUnique.mockReset();
    prismaMock.shop.update.mockReset();
    prismaMock.shopStorefrontRouting.upsert.mockReset();
    prismaMock.shopStorefrontRouting.update.mockReset();
    // Warm GID cache so these focus on shards, not the ShopId round-trip.
    prismaMock.shop.findUnique.mockResolvedValue({
      shopGid: "gid://shopify/Shop/CACHED",
    });
    prismaMock.shop.update.mockResolvedValue({});
    prismaMock.shopStorefrontRouting.update.mockResolvedValue({});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("writes a shard for a byProduct assignment and stamps its content hash", async () => {
    prismaMock.template.findMany.mockResolvedValue([
      productTemplate("template-a", "gid://shopify/Product/123"),
    ]);
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({
      shardState: {},
    });
    const admin = shardAdmin(() => true);

    const result = await rebuildShopRouting(admin, "shop_1");
    expect(result.ok).toBe(true);

    const calls = shardCalls(admin);
    expect(calls).toHaveLength(1);
    // Addressed by the bucket handle, correct type.
    expect(
      (calls[0][1] as { variables: { handle: unknown } }).variables.handle,
    ).toEqual({
      type: "$app:appx_routing_shard",
      handle: shardHandle(bucketOf("gid://shopify/Product/123")),
    });
    // by_product carries the BARE id -> handle string (D3).
    expect(fieldValue(calls[0], "by_product")).toBe('{"123":"template-a"}');

    // shardState stamped with the bucket's content hash.
    const updateArg = prismaMock.shopStorefrontRouting.update.mock.calls[0][0];
    const bucket = String(bucketOf("gid://shopify/Product/123"));
    const payload: ShardPayload = {
      byProduct: { "123": "template-a" },
      excluded: {},
    };
    expect(updateArg.data.shardState[bucket]).toBe(hashShard(payload));
  });

  it("skips the shard write when its content is unchanged (D5 zero-write)", async () => {
    const gid = "gid://shopify/Product/123";
    const bucket = String(bucketOf(gid));
    const hash = hashShard({
      byProduct: { "123": "template-a" },
      excluded: {},
    });
    prismaMock.template.findMany.mockResolvedValue([
      productTemplate("template-a", gid),
    ]);
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({
      shardState: { [bucket]: hash },
    });
    const admin = shardAdmin(() => true);

    const result = await rebuildShopRouting(admin, "shop_1");
    expect(result.ok).toBe(true);
    // No shard mutation issued — the hash matched.
    expect(shardCalls(admin)).toHaveLength(0);
    // The final stamp does not rewrite shardState (nothing changed).
    const updateArg = prismaMock.shopStorefrontRouting.update.mock.calls[0][0];
    expect(updateArg.data.shardState).toBeUndefined();
    expect(updateArg.data.shopMetafieldGid).toBe("gid://shopify/Metafield/1");
  });

  it("empties a shard whose bucket is no longer occupied (upsert-to-empty, not delete)", async () => {
    prismaMock.template.findMany.mockResolvedValue([]); // no ACTIVE per-product rules
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({
      shardState: { "5": "oldhash" },
    });
    const admin = shardAdmin(() => true);

    const result = await rebuildShopRouting(admin, "shop_1");
    expect(result.ok).toBe(true);

    const calls = shardCalls(admin);
    expect(calls).toHaveLength(1);
    expect(
      (calls[0][1] as { variables: { handle: { handle: string } } }).variables
        .handle.handle,
    ).toBe("routing-shard-5");
    // Emptied, not deleted: both maps are `{}`.
    expect(fieldValue(calls[0], "by_product")).toBe("{}");
    expect(fieldValue(calls[0], "excluded")).toBe("{}");
    // Bucket dropped from the ledger.
    const updateArg = prismaMock.shopStorefrontRouting.update.mock.calls[0][0];
    expect(updateArg.data.shardState).toEqual({});
  });

  it("returns an error on a shard failure but stamps the shards that succeeded", async () => {
    const g1 = "gid://shopify/Product/1"; // bucket 1
    const g2 = "gid://shopify/Product/2"; // bucket 2
    prismaMock.template.findMany.mockResolvedValue([
      productTemplate("template-a", g1, g2),
    ]);
    prismaMock.shopStorefrontRouting.upsert.mockResolvedValue({
      shardState: {},
    });
    // Bucket 2's shard write fails; bucket 1 succeeds.
    const admin = shardAdmin((handle) => handle !== "routing-shard-2");

    const result = await rebuildShopRouting(admin, "shop_1");
    expect(result.ok).toBe(false);

    const updateArg = prismaMock.shopStorefrontRouting.update.mock.calls[0][0];
    // Only the succeeded bucket is stamped; the failed one keeps its (absent) hash so
    // the next rebuild retries it.
    expect(updateArg.data.shardState).toEqual({
      "1": hashShard({ byProduct: { "1": "template-a" }, excluded: {} }),
    });
    // Partial failure: metafield gid still stamped, but sync NOT marked complete.
    expect(updateArg.data.shopMetafieldGid).toBe("gid://shopify/Metafield/1");
    expect(updateArg.data.syncedToShopifyAt).toBeUndefined();
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
      if (op.includes("RoutingShard")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              metaobjectUpsert: {
                metaobject: {
                  id: "gid://shopify/Metaobject/1",
                  handle: "routing-shard",
                },
                userErrors: [],
              },
            },
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

  /** N COLLECTION assignments — the representative unbounded map on the BROAD-only
   *  shop wire (feature 108: byProduct/excluded shard elsewhere, so a large shop
   *  metafield is now driven by collections, 14 bytes each in the compact wire the
   *  budget measures — see routingBudget.test.ts). */
  function collectionTemplate(count: number): ActiveTemplateForRouting {
    return {
      shopifyMetaobjectHandle: "template-cl9ebqhxk00003b600tymydho",
      assignments: Array.from({ length: count }, (_, i) => ({
        scope: "COLLECTION" as const,
        scopeValue: `gid://shopify/Collection/${400000000 + i}`,
        mode: "INCLUDE" as const,
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
    // 9,355 collections is one past the broad-only compact ceiling (§14). Write proceeds.
    prismaMock.template.findMany.mockResolvedValue([collectionTemplate(9355)]);
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
    prismaMock.template.findMany.mockResolvedValue([collectionTemplate(9355)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("over budget");
    expect(message).toContain("byCollection 9355");
    expect(message).toContain("§14");
  });

  it("warns at `warn` — before the ceiling, while there is still runway", async () => {
    prismaMock.template.findMany.mockResolvedValue([collectionTemplate(7482)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("warn budget");
  });

  it("stays SILENT at ok — a warning on every routine write is a warning nobody reads", async () => {
    prismaMock.template.findMany.mockResolvedValue([collectionTemplate(10)]);

    await rebuildShopRouting(okAdmin(), "shop_1");

    expect(warn).not.toHaveBeenCalled();
  });
});
