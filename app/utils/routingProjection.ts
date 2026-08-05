import type { AssignmentScopeValue } from "./assignmentScope";

// Pure routing-projection builder (feature 40) — folds a shop's ACTIVE, disjoint
// assignment rules into the delivery map that mirrors the `ShopStorefrontRouting`
// row and the `[shop.metafields.app.routing]` json metafield Liquid reads
// (data-model.md §9, "Delivery (Shopify) — rebuild the routing projection").
// This is pure string bucketing: which rule lands in which map, keyed by its
// selector. It sits under the routing writer (feature 41) exactly like
// `assignmentOverlap.ts` sits under the activation gate — no imports beyond a
// type, deterministic, side-effect-free, no DB, no Admin API.
//
// The builder is SHOP-AGNOSTIC: the caller (feature 41/42) passes one shop's
// already-scoped, already-filtered rules (ACTIVE only, disjoint, with resolved
// template handles). Shop isolation + the ACTIVE/disjoint filtering are the
// caller's job; this transform has no `shopId`.
//
// Disjointness is ASSUMED, not enforced: the activation gate (feature 42) keeps
// the ACTIVE set disjoint, so no two rules share a map key. The builder does not
// police this — on an (unsupported) duplicate key it is deterministic (last rule
// wins), but that state should never be fed in.
//
// Key format is GID-FAITHFUL (lossless): PRODUCT / COLLECTION keys and the
// excluded array carry the raw `scopeValue` GID verbatim; PRODUCT_TYPE / VENDOR
// keys are the raw selector strings (they match `product.type` / `product.vendor`
// directly). Feature 43 constructs the matching GID token in Liquid
// (`'gid://shopify/Product/' | append: product.id`). No GID parsing here — the
// builder has no failure mode.

/** Assignment mode. Mirrors the Prisma `AssignmentMode` enum (data-model §5)
 *  without a runtime `@prisma/client` import, keeping this module client-safe. */
export type RoutingMode = "INCLUDE" | "EXCLUDE";

/**
 * One flattened assignment rule the caller hands in: an ACTIVE template's scope
 * selector plus that template's resolved metaobject handle. The caller flattens
 * these across all ACTIVE templates (so the builder is generic over N rules,
 * robust to the future multi-row "selected products / collections" case).
 */
export type RoutingRule = {
  scope: AssignmentScopeValue;
  scopeValue: string | null;
  mode: RoutingMode;
  /** The ACTIVE template's `shopifyMetaobjectHandle`. Blank rules are skipped. */
  templateHandle: string;
};

/**
 * The delivery map. Keys mirror the `ShopStorefrontRouting` Json columns EXACTLY
 * so feature 41 persists it and serializes the metafield with no reshaping. Each
 * `by*` map is `{ scopeValue -> template handle }`.
 */
export type RoutingProjection = {
  defaultTemplateHandle: string | null; // ALL_PRODUCTS INCLUDE winner
  byType: Record<string, string>; // productType   -> handle
  byVendor: Record<string, string>; // vendor        -> handle
  byCollection: Record<string, string>; // collectionGid -> handle
  byTag: Record<string, string>; // tag -> handle (post-MVP, always empty)
  byProduct: Record<string, string>; // productGid    -> handle
  excludedProductGids: string[]; // EXCLUDE carve-outs -> render nothing
};

/**
 * Build the routing projection from a flat rule list. Buckets each INCLUDE rule
 * by scope and each EXCLUDE PRODUCT rule into `excludedProductGids`. Skips rules
 * with a blank handle (an unsynced template must not land a null pointer in the
 * map) or a missing `scopeValue` where the scope requires one. `byTag` stays
 * empty (TAG is post-MVP). Pure: never mutates `rules`; same input → same output.
 */
export function buildRoutingProjection(
  rules: RoutingRule[],
): RoutingProjection {
  const projection: RoutingProjection = {
    defaultTemplateHandle: null,
    byType: {},
    byVendor: {},
    byCollection: {},
    byTag: {},
    byProduct: {},
    excludedProductGids: [],
  };

  for (const rule of rules) {
    const handle = rule.templateHandle.trim();
    // No null pointers: a blank/unsynced handle contributes nothing.
    if (handle === "") continue;

    const value = rule.scopeValue;

    if (rule.mode === "EXCLUDE") {
      // EXCLUDE carve-outs are PRODUCT-scoped in MVP → render nothing for that
      // product. Non-PRODUCT EXCLUDE modes are undefined in MVP and ignored.
      // (No EXCLUDE rows exist until feature 45; the projection path is built +
      // tested now.)
      if (rule.scope === "PRODUCT" && value !== null && value !== "") {
        projection.excludedProductGids.push(value);
      }
      continue;
    }

    // INCLUDE bucketing.
    switch (rule.scope) {
      case "ALL_PRODUCTS":
        // ALL_PRODUCTS carries no value; it is the shop-wide default.
        projection.defaultTemplateHandle = handle;
        break;
      case "PRODUCT_TYPE":
        if (value) projection.byType[value] = handle;
        break;
      case "VENDOR":
        if (value) projection.byVendor[value] = handle;
        break;
      case "COLLECTION":
        if (value) projection.byCollection[value] = handle;
        break;
      case "PRODUCT":
        if (value) projection.byProduct[value] = handle;
        break;
      default: {
        // Exhaustiveness guard — a new scope must add a bucket here.
        const _never: never = rule.scope;
        void _never;
        break;
      }
    }
  }

  return projection;
}

// --- Delivery wire compaction (broad tiers only) ------------------------------
//
// The `RoutingProjection` above is the INTERNAL shape: GID-faithful, human-readable,
// and stored verbatim in the `ShopStorefrontRouting` Postgres row (jsonb, effectively
// unbounded). The DELIVERY copy — the `$app:routing` json metafield Liquid reads — is
// a different, COMPACT encoding of the same information, because that copy alone hits
// Shopify's 128KB `json` ceiling (data-model.md §14).
//
// 🔴 WIRE v3 — the two UNBOUNDED per-product maps have LEFT this metafield. As of
// Option 2 (metaobject sharding, feature 108) `byProduct` and `excluded` are no longer
// carried here: they are split across N per-bucket `$app:appx_routing_shard` metaobjects
// keyed by `product.id mod N`, each with its OWN 128KB budget (`app/utils/routingShards.ts`).
// A product page reads exactly one small shard, not the whole map. This metafield now
// carries ONLY the broad, count-bounded tiers (`byType` / `byVendor` / `byCollection` /
// `def`) — the tiers that were never the byte problem (data-model.md §14). Two lossless
// transforms still apply to what remains:
//
//   1. Keys are the BARE numeric id, not the full GID (the only per-id map left here is
//      `byCollection`). Liquid only exposes `collection.id` anyway, so the storefront
//      reconstructs nothing — it drops the `gid://shopify/Collection/` construction.
//   2. Template handles are INTERNED into `handles[]`; every map value is an integer
//      index. A 34-byte `template-{cuid}` shared across many collections is written once.
//
// `byTag` is omitted (always empty; the storefront never reads it). `byType` /
// `byVendor` keys stay raw — they are merchant product-type / vendor strings that
// match `product.type` / `product.vendor` directly, not GIDs.
//
// 🔴 This is DELIVERY-ONLY. Postgres and `buildRoutingProjection` are untouched, so
// the source of truth stays debuggable and the budget instrumentation
// (`reportRoutingBudget`) measures the exact compact string it sends. The storefront
// reader is `snippets/spec-table-resolve.liquid` (broad tiers) plus the shard it is
// handed by `blocks/spec_table.liquid` (per-product); the wire is a private contract
// between this function + `routingShards.ts` and those Liquid files — they move together,
// guarded by `routingWireContract.test.ts` and `routingShardWireContract.test.ts`.

/**
 * Wire-format version. Bumped on any incompatible change to the delivery wire.
 * 🔴 v3 (feature 108): `byProduct` / `excluded` moved OUT of `$app:routing` into the
 * shard metaobjects. A v2 reader against v3 data (or vice-versa) is a redeploy mismatch,
 * caught by the wire-contract tests. Shared by the shop wire AND the shards
 * (`routingShards.ts` ties each shard's `wire_version` field to this), so a bump moves
 * both ends of the wire together.
 */
export const ROUTING_WIRE_VERSION = 3;

/**
 * The compact delivery shape written to the `$app:routing` metafield (wire v3 —
 * BROAD TIERS ONLY). Every `by*` value and `def` is an index into `handles`. Keys are
 * bare numeric ids for `byCollection`, raw strings for type/vendor. The unbounded
 * per-product maps (`byProduct` / `excluded`) are NOT here — they live in the shard
 * metaobjects (`routingShards.ts`, `ShardPayload`).
 */
export type CompactRouting = {
  v: number;
  handles: string[];
  def: number | null;
  byType: Record<string, number>;
  byVendor: Record<string, number>;
  byCollection: Record<string, number>;
};

/** Bare numeric id from a GID tail: `gid://shopify/Product/123` -> `"123"`. A value
 *  with no slash (already bare, or malformed) passes through unchanged — lossless.
 *  Exported so `routingShards.ts` (Option 2) buckets on the EXACT same bare id this
 *  compactor keys by — the shard key and the shop-wire key must never diverge. */
export function idTail(gid: string): string {
  const slash = gid.lastIndexOf("/");
  return slash === -1 ? gid : gid.slice(slash + 1);
}

/**
 * Compact a `RoutingProjection` into the delivery wire (see the section note above).
 * Pure: never mutates the input; same input → same output (interning order is
 * deterministic — `def` first, then type/vendor/collection/product in map order).
 */
export function compactRoutingForDelivery(
  projection: RoutingProjection,
): CompactRouting {
  const handles: string[] = [];
  const indexOf = new Map<string, number>();
  const intern = (handle: string): number => {
    const existing = indexOf.get(handle);
    if (existing !== undefined) return existing;
    const next = handles.length;
    handles.push(handle);
    indexOf.set(handle, next);
    return next;
  };

  // Compact one `{ key -> handle }` map: transform each key, intern each handle.
  const compactMap = (
    map: Record<string, string>,
    keyFn: (key: string) => string,
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [key, handle] of Object.entries(map)) {
      out[keyFn(key)] = intern(handle);
    }
    return out;
  };

  return {
    v: ROUTING_WIRE_VERSION,
    handles,
    def:
      projection.defaultTemplateHandle === null
        ? null
        : intern(projection.defaultTemplateHandle),
    byType: compactMap(projection.byType, (key) => key),
    byVendor: compactMap(projection.byVendor, (key) => key),
    byCollection: compactMap(projection.byCollection, idTail),
    // byProduct / excluded intentionally omitted — sharded (feature 108). byTag
    // omitted too — always empty, never read on the storefront.
  };
}
