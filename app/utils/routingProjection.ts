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

// --- Delivery wire compaction (Option 1 — the byte-budget down-payment) -------
//
// The `RoutingProjection` above is the INTERNAL shape: GID-faithful, human-readable,
// and stored verbatim in the `ShopStorefrontRouting` Postgres row (jsonb, effectively
// unbounded). The DELIVERY copy — the `$app:routing` json metafield Liquid reads — is
// a different, COMPACT encoding of the same information, because that copy alone hits
// Shopify's 128KB `json` ceiling (data-model.md §14). Three lossless transforms cut
// the two unbounded maps (`byProduct`, `excludedProductGids`) to ~1/4 the bytes:
//
//   1. Keys are the BARE numeric id, not the full GID. Liquid only exposes
//      `product.id` / `collection.id` anyway, so the storefront reconstructs nothing
//      — it drops the `gid://shopify/Product/` construction entirely.
//   2. Template handles are INTERNED into `handles[]`; every map value is an integer
//      index. A 34-byte `template-{cuid}` shared by 2,000 products is written once.
//   3. `excluded` is an OBJECT (membership hash), not an array — O(1) `x[id]` lookup
//      on the storefront instead of a linear `contains` scan on every product view.
//
// `byTag` is omitted (always empty; the storefront never reads it). `byType` /
// `byVendor` keys stay raw — they are merchant product-type / vendor strings that
// match `product.type` / `product.vendor` directly, not GIDs.
//
// 🔴 This is DELIVERY-ONLY. Postgres and `buildRoutingProjection` are untouched, so
// the source of truth stays debuggable and the budget instrumentation
// (`reportRoutingBudget`) measures the exact compact string it sends. The storefront
// reader is `snippets/spec-table-resolve.liquid`; the two must move together (the
// wire is a private contract between this function and that snippet).

/** Wire-format version. Bumped on any incompatible change to `CompactRouting`. */
export const ROUTING_WIRE_VERSION = 2;

/**
 * The compact delivery shape written to the `$app:routing` metafield. Every `by*`
 * value and `def` is an index into `handles`; `excluded` is a membership set
 * (`{ "<id>": 1 }`). Keys are bare numeric ids for product/collection maps, raw
 * strings for type/vendor.
 */
export type CompactRouting = {
  v: number;
  handles: string[];
  def: number | null;
  byType: Record<string, number>;
  byVendor: Record<string, number>;
  byCollection: Record<string, number>;
  byProduct: Record<string, number>;
  excluded: Record<string, 1>;
};

/** Bare numeric id from a GID tail: `gid://shopify/Product/123` -> `"123"`. A value
 *  with no slash (already bare, or malformed) passes through unchanged — lossless. */
function idTail(gid: string): string {
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

  const excluded: Record<string, 1> = {};
  for (const gid of projection.excludedProductGids) {
    excluded[idTail(gid)] = 1;
  }

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
    byProduct: compactMap(projection.byProduct, idTail),
    excluded,
    // byTag intentionally omitted — always empty, never read on the storefront.
  };
}
