// Pure byte-budget arithmetic for the `json` metafields that carry the storefront
// delivery copy (step 104, `context/features/104-metafield-byte-budgets.md`).
//
// Shopify limits a `json` metafield WRITE to 128KB from API version 2026-04
// onward. Apps that used json fields before 2026-04-01 are grandfathered at the
// old 2MB limit; **this app is not** — its first `type = "json"` declaration
// landed 2026-07-02, after the cutoff (`data-model.md` §13 F1). The ceiling is
// dormant only because the runtime Admin client is still `ApiVersion.October25`;
// `app/shopify.server.test.ts` is the tripwire that fires when that moves.
//
// This module MEASURES and CLASSIFIES. It decides nothing: no caller may refuse a
// write on the strength of a `level` returned here. Overflow policy — refusing,
// truncating, surfacing a merchant-facing error — is step 105, deliberately kept
// out so the numbers stay separately reviewable (104 §D1).
//
// Pure + isomorphic, like `routingProjection.ts` under `routing.server.ts`: no
// imports beyond a type, no `Buffer`, no DB, no Admin API, safe on the client.

import type { RoutingProjection } from "./routingProjection";

/**
 * The `json` metafield write ceiling, in bytes.
 *
 * 🔴 `128 * 1024`, NOT `128_000`. Shopify's metafield-limits page pins the sibling
 * limit as "64KB (65,536 bytes)", so KB means 1024 here. The 72-byte difference is
 * one whole `byProduct` entry, and "correcting" this to 128,000 would silently
 * shrink every budget below by 2.3% (104 §D4).
 */
export const JSON_METAFIELD_MAX_BYTES = 128 * 1024;

/**
 * Fraction of the ceiling at which a payload is reported as `warn`.
 *
 * 0.8 → 104,857 bytes. Chosen for LEAD TIME MEASURED IN MERCHANT ACTIONS, not for
 * roundness: an exclude-dominated routing map at that size holds ~2,756 carve-outs
 * and still accepts ~689 more before the ceiling. That is enough runway for the
 * warning to be actionable and not a false alarm at the moment it fires
 * (104 §D6). Named so 105 can retune it in one place.
 */
export const BUDGET_WARN_RATIO = 0.8;

/** How a measured payload sits against the ceiling. Always derived, never passed in. */
export type BudgetLevel = "ok" | "warn" | "over";

export type PayloadBudget = {
  /** Size of the serialized value in BYTES (never UTF-16 code units). */
  bytes: number;
  /** The ceiling measured against — carried so a log line is self-describing. */
  limit: number;
  /** `bytes / limit`. Exceeds 1 when over. */
  ratio: number;
  /** Bytes still available. Floored at 0 — an over-budget payload has no headroom. */
  remaining: number;
  level: BudgetLevel;
};

/**
 * Byte length of a string as UTF-8.
 *
 * 🔴 NOT `value.length`. Shopify's limit is bytes; `String.length` counts UTF-16
 * code units, and the two agree only for ASCII. The routing map's two most likely
 * sources of non-ASCII are exactly the maps keyed by merchant free text — `byType`
 * (product type) and `byVendor`. A vendor named `Ünïcödé Çø` is 10 code units but
 * 15 bytes; an emoji in a product type is 2 code units and 4 bytes. Measuring code
 * units would under-report a real payload by up to 3× and quietly hand back
 * headroom that does not exist (104 §D3).
 *
 * `TextEncoder` rather than `Buffer.byteLength` keeps this module client-safe.
 */
export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Classify an ALREADY-SERIALIZED payload against the json ceiling.
 *
 * ⚠️ Takes the **string that will actually be sent**, not the object it came from.
 * Re-serializing here would be a second chance to diverge from the writer — a
 * different key order, a `replacer`, a future `space` argument — and a budget that
 * measures a different string than the one written is worse than no budget,
 * because it reads as authoritative (104 §D2).
 *
 * A payload exactly AT the limit is `ok`: Shopify accepts it. `over` is strictly
 * greater.
 */
export function measurePayload(
  serialized: string,
  limit: number = JSON_METAFIELD_MAX_BYTES,
): PayloadBudget {
  const bytes = byteLength(serialized);
  const ratio = bytes / limit;
  return {
    bytes,
    limit,
    ratio,
    remaining: Math.max(0, limit - bytes),
    level: bytes > limit ? "over" : ratio >= BUDGET_WARN_RATIO ? "warn" : "ok",
  };
}

/** Entry count per routing map. Every key of `RoutingProjection` that can grow. */
export type RoutingEntryCounts = {
  byType: number;
  byVendor: number;
  byCollection: number;
  byTag: number;
  byProduct: number;
  excludedProductGids: number;
  /** Sum of the above — the single number that tracks the payload's growth. */
  total: number;
};

/**
 * Count the entries in each routing map.
 *
 * Exists for the WARNING LINE, not for the measurement: a log that says a payload
 * is over budget without saying which map is carrying it costs a debugging session
 * to answer "was it 3,000 carve-outs or 40 vendors with very long names?" —
 * a question with completely different answers in step 105.
 *
 * `defaultTemplateHandle` is excluded: it is a single scalar, not a map, and
 * cannot contribute growth.
 */
export function countRoutingEntries(
  projection: RoutingProjection,
): RoutingEntryCounts {
  const counts = {
    byType: Object.keys(projection.byType).length,
    byVendor: Object.keys(projection.byVendor).length,
    byCollection: Object.keys(projection.byCollection).length,
    byTag: Object.keys(projection.byTag).length,
    byProduct: Object.keys(projection.byProduct).length,
    excludedProductGids: projection.excludedProductGids.length,
  };
  return {
    ...counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}
