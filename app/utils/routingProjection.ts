import type { AssignmentScopeValue } from "./assignmentScope";

// Pure routing-projection builder — folds a shop's ACTIVE, disjoint assignment
// rules into the delivery map mirroring the `ShopStorefrontRouting` row
// (data-model.md §9). Pure string bucketing: which rule lands in which map.
//
// ⚠️ SHOP-AGNOSTIC. The caller passes one shop's already-scoped, already-filtered
// rules; shop isolation and the ACTIVE/disjoint filtering are its job, and this
// transform has no `shopId`.
//
// ⚠️ Disjointness is ASSUMED, not enforced — the activation gate keeps the ACTIVE
// set disjoint. On an unsupported duplicate key this is deterministic (last rule
// wins), but that state should never be fed in.
//
// Keys are GID-FAITHFUL: PRODUCT / COLLECTION keys carry the raw `scopeValue`
// verbatim; PRODUCT_TYPE / VENDOR keys are raw selector strings matching
// `product.type` / `product.vendor`. No GID parsing here, so the builder has no
// failure mode.

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
// `RoutingProjection` is the INTERNAL shape, stored verbatim in Postgres jsonb.
// The DELIVERY copy — the `$app:routing` metafield Liquid reads — is a compact
// encoding of the same information, because that copy alone hits Shopify's 128KB
// `json` ceiling (data-model.md §14).
//
// 🔴 WIRE v3: the two UNBOUNDED per-product maps have LEFT this metafield. They
// are sharded across `$app:appx_routing_shard` metaobjects (`routingShards.ts`),
// so a product page reads one small shard rather than the whole map. What remains
// is the broad, count-bounded tiers, under two lossless transforms:
//
//   1. Keys are the BARE numeric id (only `byCollection` is per-id here). Liquid
//      exposes `collection.id` anyway, so the storefront reconstructs nothing.
//   2. Template handles are INTERNED into `handles[]`; every map value is an
//      integer index, so a handle shared across many collections costs one copy.
//
// `byTag` is omitted (always empty). `byType` / `byVendor` keys stay raw.
//
// 🔴 DELIVERY-ONLY — Postgres and `buildRoutingProjection` are untouched. The wire
// is a private contract between this function + `routingShards.ts` and the Liquid
// snippets, guarded by `routingWireContract.test.ts` and
// `routingShardWireContract.test.ts`.

/**
 * Wire-format version, bumped on any incompatible change to the delivery wire.
 * Shared by the shop wire AND the shards, so a bump moves both ends together. A
 * reader/data version mismatch is a redeploy error, caught by the wire-contract
 * tests.
 */
export const ROUTING_WIRE_VERSION = 3;

/**
 * The compact delivery shape written to the `$app:routing` metafield — BROAD
 * TIERS ONLY. Every `by*` value and `def` is an index into `handles`. The
 * unbounded per-product maps live in the shard metaobjects instead.
 */
export type CompactRouting = {
  v: number;
  handles: string[];
  def: number | null;
  byType: Record<string, number>;
  byVendor: Record<string, number>;
  byCollection: Record<string, number>;
};

/** Bare numeric id from a GID tail: `gid://shopify/Product/123` → `"123"`. A
 *  value with no slash passes through unchanged. ⚠️ Exported so `routingShards.ts`
 *  buckets on the EXACT same bare id this compactor keys by — the shard key and
 *  the shop-wire key must never diverge. */
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
