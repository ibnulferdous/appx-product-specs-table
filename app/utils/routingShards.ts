import {
  idTail,
  ROUTING_WIRE_VERSION,
  type RoutingProjection,
} from "./routingProjection";

// Pure routing-SHARD transform — the structural fix to the shared 128KB
// `$app:routing` budget. Deterministic, side-effect-free, no DB, no Admin API.
// Plan: `context/features/108-routing-metaobject-sharding.md`.
//
// The two UNBOUNDED per-product maps (`byProduct`, `excludedProductGids`) are
// split across N per-bucket metaobjects keyed by `product.id mod
// ROUTING_SHARD_COUNT`, so each bucket carries its OWN 128KB and a product page
// reads only its own shard. The broad tiers stay in the shop metafield — they are
// count-bounded and were never the problem.
//
// ⚠️ DELIVERY-ONLY: this reshapes at write time only. Postgres and
// `buildRoutingProjection` stay GID-faithful and un-sharded. The shard type,
// handle scheme and field keys are a private contract with
// `spec-table-resolve.liquid` — the two must move together, guarded by a
// source-text contract test.

/**
 * The shard count / modulus. 🔴 THIS IS THE STORAGE FORMAT: it can NEVER change
 * after launch, because a different modulus re-buckets every product and every
 * stored shard becomes garbage. The Liquid resolver's `modulo: 1024` literal must
 * match it, pinned by a cross-language contract test.
 *
 * 1024 caps a 1M-product catalog at ~977 entries/shard worst case — well under
 * the per-shard 128KB budget — and caps the metaobject count at 1024/shop.
 */
export const ROUTING_SHARD_COUNT = 1024;

/** App-owned metaobject type the shards live in (declared in `shopify.app.toml`).
 *  Resolved on the storefront as `metaobjects[ROUTING_SHARD_TYPE][handle]`. */
export const ROUTING_SHARD_TYPE = "$app:appx_routing_shard";

/** Handle for a bucket's shard metaobject: bucket 5 -> `routing-shard-5`. The
 *  storefront builds the same string with `'routing-shard-' | append: k`. */
export function shardHandle(bucketKey: number): string {
  return `routing-shard-${bucketKey}`;
}

/**
 * The bucket a product GID falls in. 🔴 BigInt modulo, deliberately — NOT
 * `Number(idTail) % N`. The bucket must agree with Liquid's `product.id | modulo: N`
 * (Ruby, arbitrary-precision integers) for EVERY product id, and `Number` silently
 * loses precision above 2^53 (a 16-digit id), which would bucket that product to a
 * different shard on the two sides and route it to the wrong table or none. `BigInt`
 * is exact for any 64-bit Shopify id and matches Ruby exactly. Buckets on the bare id
 * (`idTail`) so the modulus operand is identical to Liquid's `product.id`.
 */
export function bucketOf(gid: string): number {
  return Number(BigInt(idTail(gid)) % BigInt(ROUTING_SHARD_COUNT));
}

/**
 * The slice of the two per-product maps whose products land in this bucket.
 * Field names are TS-camelCase here; `shardFieldValues` maps them to the
 * snake_case metaobject field keys the storefront reads.
 *
 *   byProduct: bare product id -> template handle STRING. Shards store handles
 *              directly, not interned indices — a shard is small enough that
 *              interning buys nothing, and it stays self-contained.
 *   excluded:  bare product id -> 1 (the broad-tier carve-out gate).
 */
export type ShardPayload = {
  byProduct: Record<string, string>;
  excluded: Record<string, 1>;
};

/**
 * Split a `RoutingProjection` into per-bucket shard payloads. Only OCCUPIED
 * buckets are returned — an absent shard reads as a miss on the storefront and
 * falls through to the broad tiers.
 *
 * A product may appear in BOTH maps ("all products EXCEPT X, and X gets its own
 * table"); it lands in one shard with both entries, and the storefront resolves
 * `byProduct` first. Returned in ascending bucket order for determinism.
 */
export function buildShardPayloads(
  projection: RoutingProjection,
): Map<number, ShardPayload> {
  const shards = new Map<number, ShardPayload>();
  const ensure = (bucketKey: number): ShardPayload => {
    let shard = shards.get(bucketKey);
    if (!shard) {
      shard = { byProduct: {}, excluded: {} };
      shards.set(bucketKey, shard);
    }
    return shard;
  };

  for (const [gid, handle] of Object.entries(projection.byProduct)) {
    // Mirror the compactor's no-null-pointer rule: a blank handle contributes nothing
    // (buildRoutingProjection already skips these, so this is defense in depth).
    const trimmed = handle.trim();
    if (trimmed === "") continue;
    ensure(bucketOf(gid)).byProduct[idTail(gid)] = trimmed;
  }

  for (const gid of projection.excludedProductGids) {
    ensure(bucketOf(gid)).excluded[idTail(gid)] = 1;
  }

  return new Map([...shards.entries()].sort((a, b) => a[0] - b[0]));
}

/**
 * Canonical JSON for a flat `{ key -> value }` map: keys sorted, built by hand so the
 * output order is exactly the sort order (not left to the engine's integer-key
 * reordering quirk). This is what makes the content hash stable regardless of the
 * order `buildShardPayloads` happened to insert entries.
 */
function canonicalStringify(map: Record<string, string | number>): string {
  const parts = Object.keys(map)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(map[key])}`);
  return `{${parts.join(",")}}`;
}

/**
 * The three metaobject field values for a shard, as the JSON strings the writer
 * sends.
 *
 * 🔴 `wire_version` is tied to `ROUTING_WIRE_VERSION`, the ONE version source for
 * the whole delivery wire, so a bump moves both together and — because the hash
 * includes it — forces every shard to be rewritten on the next rebuild. Named in
 * full because a metaobject field key must be ≥2 chars.
 */
export function shardFieldValues(payload: ShardPayload): {
  by_product: string;
  excluded: string;
  wire_version: string;
} {
  return {
    by_product: canonicalStringify(payload.byProduct),
    excluded: canonicalStringify(payload.excluded),
    wire_version: String(ROUTING_WIRE_VERSION),
  };
}

/** Canonical serialization of a whole shard (all three field values), for hashing. */
export function serializeShard(payload: ShardPayload): string {
  return JSON.stringify(shardFieldValues(payload));
}

/**
 * Stable, non-cryptographic content hash (cyrb53) used ONLY for change-detection
 * in `diffShards` — a collision at worst skips a write that was needed, which is
 * astronomically unlikely at 53 bits against that same bucket's prior hash.
 * base36 keeps the stored `shardState` map compact.
 */
export function hashShard(payload: ShardPayload): string {
  return cyrb53(serializeShard(payload));
}

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(36);
}

/** One shard to upsert: the bucket, its handle, the payload, and its content hash
 *  (so the caller can stamp `shardState` after a confirmed write). */
export type ShardUpsert = {
  bucketKey: number;
  handle: string;
  payload: ShardPayload;
  hash: string;
};

/** A bucket that had content and now has none. Overwritten with empty maps
 *  (which read as a miss) rather than deleted — an empty shard is harmless and
 *  bounded by N, while deleting adds a failure mode with no benefit. */
export type ShardEmpty = { bucketKey: number; handle: string };

export type ShardDiff = { upsert: ShardUpsert[]; empty: ShardEmpty[] };

/**
 * Reconcile the desired shard set against what was last written (the `shardState`
 * ledger: bucketKey string -> content hash). Returns only the buckets that must move:
 *
 *   - `upsert`: in `desired` with a NEW or CHANGED hash. An unchanged bucket is
 *     skipped entirely — this is what makes a status toggle that leaves
 *     per-product assignments untouched write ZERO shards.
 *   - `empty`:  in `storedHashes` but no longer in `desired`.
 *
 * ⚠️ The caller rebuilds `shardState` from the OUTCOMES: set each
 * successfully-upserted bucket's hash, drop each successfully-emptied bucket, and
 * leave a FAILED bucket's stored hash untouched so the next rebuild retries it.
 * Both lists sorted by bucket for determinism.
 */
export function diffShards(
  desired: Map<number, ShardPayload>,
  storedHashes: Record<string, string>,
): ShardDiff {
  const upsert: ShardUpsert[] = [];
  for (const [bucketKey, payload] of desired) {
    const hash = hashShard(payload);
    if (storedHashes[String(bucketKey)] !== hash) {
      upsert.push({ bucketKey, handle: shardHandle(bucketKey), payload, hash });
    }
  }

  const empty: ShardEmpty[] = [];
  for (const key of Object.keys(storedHashes)) {
    const bucketKey = Number(key);
    if (!desired.has(bucketKey)) {
      empty.push({ bucketKey, handle: shardHandle(bucketKey) });
    }
  }

  upsert.sort((a, b) => a.bucketKey - b.bucketKey);
  empty.sort((a, b) => a.bucketKey - b.bucketKey);
  return { upsert, empty };
}
