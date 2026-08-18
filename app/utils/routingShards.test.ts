import { describe, it, expect } from "vitest";
import {
  ROUTING_SHARD_COUNT,
  ROUTING_SHARD_TYPE,
  shardHandle,
  bucketOf,
  buildShardPayloads,
  shardFieldValues,
  serializeShard,
  hashShard,
  diffShards,
  type ShardPayload,
} from "./routingShards";
import {
  ROUTING_WIRE_VERSION,
  type RoutingProjection,
} from "./routingProjection";

// Pure shard transform — no DB, no Admin API. Mirrors routingProjection.test.ts:
// feed a projection (or a payload) and assert the reshaped output.

const EMPTY_PROJECTION: RoutingProjection = {
  defaultTemplateHandle: null,
  byType: {},
  byVendor: {},
  byCollection: {},
  byTag: {},
  byProduct: {},
  excludedProductGids: [],
};

const pgid = (id: string | number) => `gid://shopify/Product/${id}`;

describe("constants + handle scheme", () => {
  it("ROUTING_SHARD_COUNT is a fixed positive integer (the storage-format modulus)", () => {
    expect(Number.isInteger(ROUTING_SHARD_COUNT)).toBe(true);
    expect(ROUTING_SHARD_COUNT).toBeGreaterThan(0);
    // Pinned literally: changing it re-buckets every product (D4). A silent bump
    // would be a live-storefront break, so it is asserted, not just referenced.
    expect(ROUTING_SHARD_COUNT).toBe(1024);
  });

  it("ROUTING_SHARD_TYPE is the app-reserved metaobject type", () => {
    expect(ROUTING_SHARD_TYPE).toBe("$app:appx_routing_shard");
  });

  it("shardHandle formats routing-shard-<k>", () => {
    expect(shardHandle(0)).toBe("routing-shard-0");
    expect(shardHandle(1023)).toBe("routing-shard-1023");
  });
});

describe("bucketOf", () => {
  it("buckets on the bare id modulo N", () => {
    expect(bucketOf(pgid(0))).toBe(0);
    expect(bucketOf(pgid(1))).toBe(1);
    expect(bucketOf(pgid(1024))).toBe(0);
    expect(bucketOf(pgid(1025))).toBe(1);
    expect(bucketOf(pgid(2049))).toBe(1);
  });

  it("accepts an already-bare id (idTail passthrough)", () => {
    expect(bucketOf("1025")).toBe(1);
  });

  it("🔴 uses BigInt modulo — correct for ids above 2^53 where Number would be wrong", () => {
    // 2^53 = 9007199254740992 is divisible by 1024 (= 2^10), so (2^53 + 1) mod 1024 = 1.
    // Number(9007199254740993) rounds to 9007199254740992 -> mod 1024 = 0 (WRONG).
    // BigInt is exact and matches Liquid's Ruby arbitrary-precision modulo.
    const id = "9007199254740993"; // 2^53 + 1
    expect(bucketOf(pgid(id))).toBe(1);
    // Prove the Number path really would disagree — this is why BigInt is mandatory.
    expect(Number(id) % ROUTING_SHARD_COUNT).toBe(0);
  });
});

describe("buildShardPayloads", () => {
  it("returns an empty map for an empty projection", () => {
    expect(buildShardPayloads(EMPTY_PROJECTION).size).toBe(0);
  });

  it("buckets byProduct entries, keyed by bare id, value = handle string", () => {
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      byProduct: {
        [pgid(1)]: "template-a", // bucket 1
        [pgid(1025)]: "template-b", // bucket 1
        [pgid(2)]: "template-c", // bucket 2
      },
    });
    expect(shards.get(1)).toEqual({
      byProduct: { "1": "template-a", "1025": "template-b" },
      excluded: {},
    });
    expect(shards.get(2)).toEqual({
      byProduct: { "2": "template-c" },
      excluded: {},
    });
  });

  it("buckets excluded entries into the same shard shape", () => {
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      excludedProductGids: [pgid(5), pgid(1029)], // both bucket 5
    });
    expect(shards.get(5)).toEqual({
      byProduct: {},
      excluded: { "5": 1, "1029": 1 },
    });
  });

  it("co-locates byProduct + excluded for the SAME product in one shard (feature 45 Decision B)", () => {
    // "All products EXCEPT X, and X gets its own table": X is both an explicit pick
    // and a carve-out. Both land in one shard; the storefront resolves byProduct first.
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      byProduct: { [pgid(7)]: "template-x" },
      excludedProductGids: [pgid(7)],
    });
    expect(shards.size).toBe(1);
    expect(shards.get(7)).toEqual({
      byProduct: { "7": "template-x" },
      excluded: { "7": 1 },
    });
  });

  it("skips blank handles (no null pointer in a shard)", () => {
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      byProduct: { [pgid(1)]: "   ", [pgid(2)]: "template-a" },
    });
    expect(shards.has(1)).toBe(false);
    expect(shards.get(2)).toEqual({
      byProduct: { "2": "template-a" },
      excluded: {},
    });
  });

  it("is sparse — only occupied buckets are materialized", () => {
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      byProduct: { [pgid(3)]: "template-a" },
    });
    expect([...shards.keys()]).toEqual([3]);
  });

  it("returns buckets in ascending order (deterministic iteration)", () => {
    const shards = buildShardPayloads({
      ...EMPTY_PROJECTION,
      byProduct: { [pgid(9)]: "t9", [pgid(4)]: "t4", [pgid(1)]: "t1" },
    });
    expect([...shards.keys()]).toEqual([1, 4, 9]);
  });
});

describe("shardFieldValues / serializeShard", () => {
  it("emits snake_case field values with wire_version tied to ROUTING_WIRE_VERSION", () => {
    const payload: ShardPayload = {
      byProduct: { "1": "template-a" },
      excluded: { "2": 1 },
    };
    expect(shardFieldValues(payload)).toEqual({
      by_product: '{"1":"template-a"}',
      excluded: '{"2":1}',
      wire_version: String(ROUTING_WIRE_VERSION),
    });
  });

  it("canonicalizes key order — insertion order does not change the serialization", () => {
    const a: ShardPayload = {
      byProduct: { "20": "t20", "3": "t3", "100": "t100" },
      excluded: {},
    };
    const b: ShardPayload = {
      byProduct: { "100": "t100", "3": "t3", "20": "t20" },
      excluded: {},
    };
    expect(serializeShard(a)).toBe(serializeShard(b));
  });

  it("canonicalizes large (>2^32) numeric keys too — not left to engine reordering", () => {
    // Keys above 2^32-1 are NOT integer-indexed by the engine, so JSON.stringify would
    // preserve insertion order for them; the hand-built canonical form sorts anyway.
    const a: ShardPayload = {
      byProduct: { "8823456789012": "t1", "8823456789011": "t2" },
      excluded: {},
    };
    const b: ShardPayload = {
      byProduct: { "8823456789011": "t2", "8823456789012": "t1" },
      excluded: {},
    };
    expect(serializeShard(a)).toBe(serializeShard(b));
    // Assert against the raw (unescaped) field value — serializeShard nests it as a
    // JSON string, so the sorted order is clearest at the field-value layer.
    expect(shardFieldValues(a).by_product).toBe(
      '{"8823456789011":"t2","8823456789012":"t1"}',
    );
  });
});

describe("hashShard", () => {
  it("is stable for equal content regardless of insertion order", () => {
    const a: ShardPayload = { byProduct: { "1": "t", "2": "t" }, excluded: {} };
    const b: ShardPayload = { byProduct: { "2": "t", "1": "t" }, excluded: {} };
    expect(hashShard(a)).toBe(hashShard(b));
  });

  it("changes when a handle changes", () => {
    const a: ShardPayload = { byProduct: { "1": "template-a" }, excluded: {} };
    const b: ShardPayload = { byProduct: { "1": "template-b" }, excluded: {} };
    expect(hashShard(a)).not.toBe(hashShard(b));
  });

  it("changes when an excluded entry is added", () => {
    const a: ShardPayload = { byProduct: { "1": "t" }, excluded: {} };
    const b: ShardPayload = { byProduct: { "1": "t" }, excluded: { "2": 1 } };
    expect(hashShard(a)).not.toBe(hashShard(b));
  });
});

describe("diffShards", () => {
  const shard = (handle: string): ShardPayload => ({
    byProduct: { "1": handle },
    excluded: {},
  });

  it("upserts a bucket absent from stored state (new shard)", () => {
    const desired = new Map([[1, shard("template-a")]]);
    const diff = diffShards(desired, {});
    expect(diff.empty).toEqual([]);
    expect(diff.upsert).toHaveLength(1);
    expect(diff.upsert[0]).toMatchObject({
      bucketKey: 1,
      handle: "routing-shard-1",
      payload: shard("template-a"),
      hash: hashShard(shard("template-a")),
    });
  });

  it("upserts a bucket whose content changed (hash differs)", () => {
    const desired = new Map([[1, shard("template-b")]]);
    const stored = { "1": hashShard(shard("template-a")) };
    const diff = diffShards(desired, stored);
    expect(diff.upsert.map((u) => u.bucketKey)).toEqual([1]);
    expect(diff.empty).toEqual([]);
  });

  it("skips an UNCHANGED bucket — this is the zero-write status-toggle guarantee (D5)", () => {
    const desired = new Map([[1, shard("template-a")]]);
    const stored = { "1": hashShard(shard("template-a")) };
    const diff = diffShards(desired, stored);
    expect(diff.upsert).toEqual([]);
    expect(diff.empty).toEqual([]);
  });

  it("empties a bucket present in stored state but no longer desired", () => {
    const desired = new Map<number, ShardPayload>();
    const stored = { "5": hashShard(shard("template-a")) };
    const diff = diffShards(desired, stored);
    expect(diff.upsert).toEqual([]);
    expect(diff.empty).toEqual([{ bucketKey: 5, handle: "routing-shard-5" }]);
  });

  it("handles a mixed rebuild — upsert new, keep unchanged, empty removed — sorted", () => {
    const desired = new Map([
      [2, shard("template-new")], // new
      [1, shard("template-a")], // unchanged
    ]);
    const stored = {
      "1": hashShard(shard("template-a")), // unchanged -> skipped
      "3": hashShard(shard("template-old")), // gone -> emptied
    };
    const diff = diffShards(desired, stored);
    expect(diff.upsert.map((u) => u.bucketKey)).toEqual([2]);
    expect(diff.empty.map((e) => e.bucketKey)).toEqual([3]);
  });

  it("does not mutate the stored-hash ledger it is given", () => {
    const stored = { "3": "deadbeef" };
    const snapshot = { ...stored };
    diffShards(new Map([[1, shard("t")]]), stored);
    expect(stored).toEqual(snapshot);
  });
});
