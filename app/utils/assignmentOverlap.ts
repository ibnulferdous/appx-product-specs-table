import type { AssignmentScopeValue } from "./assignmentScope";

// Pure scope-overlap resolver (feature 38) — the decision core of the DRAFT→ACTIVE
// dry-run (data-model.md §9). Given two INCLUDE scopes, decide whether they
// overlap WITHOUT touching the DB or the Admin API. Most pairs are settled by
// string set-algebra here (O(1)); only genuinely cross-dimension / multi-valued
// pairs defer to a single Shopify existence probe (feature 39). This sits under
// the activation gate (feature 42) exactly like `gridNav.ts` sits under
// `useGridKeyboardNav.ts`: no imports beyond a type, deterministic, side-effect-free.
//
// Two facts drive the whole matrix:
//   - ALL_PRODUCTS is universal → it overlaps every other scope (incl. a second
//     ALL_PRODUCTS — "a shop default already exists").
//   - PRODUCT / PRODUCT_TYPE / VENDOR are single-valued per product (one id, one
//     product_type, one vendor), so same-scope + different value is PROVABLY
//     disjoint. COLLECTION is multi-valued (a product can be in many), so two
//     different collection rules might share a product → ask Shopify.
//
// Safety bias (priority #2, the live storefront): NEVER return DISJOINT for a pair
// that could share a product. When unsure, return NEEDS_CHECK — only the three
// provable single-valued cases return DISJOINT.

/** One INCLUDE scope: the scope kind + its selector value (null for ALL_PRODUCTS). */
export type ScopeSelector = {
  scope: AssignmentScopeValue;
  scopeValue: string | null;
};

export type PairVerdict =
  // Definitely share products — block activation.
  | { kind: "OVERLAP" }
  // Provably cannot share a product — safe.
  | { kind: "DISJOINT" }
  // Undecidable here: run `products(first:1, query: A AND B)` (feature 39). The
  // two selectors are ANDed, so order is irrelevant. Never contains ALL_PRODUCTS
  // (that always short-circuits to OVERLAP), so feature 39 only ever renders
  // PRODUCT / PRODUCT_TYPE / VENDOR / COLLECTION query fragments.
  | { kind: "NEEDS_CHECK"; selectors: [ScopeSelector, ScopeSelector] };

// Scopes with exactly one value per product: same scope + different value can
// never match the same product, so it is provably DISJOINT. COLLECTION is
// deliberately excluded (multi-valued).
const SINGLE_VALUED: ReadonlySet<AssignmentScopeValue> = new Set([
  "PRODUCT",
  "PRODUCT_TYPE",
  "VENDOR",
]);

/**
 * Classify a candidate scope against another scope. Symmetric in *kind*
 * (`classifyScopePair(a, b).kind === classifyScopePair(b, a).kind`); only the
 * NEEDS_CHECK selector order follows the argument order, which does not matter
 * (feature 39 ANDs them). See the module header for the driving facts.
 */
export function classifyScopePair(
  candidate: ScopeSelector,
  other: ScopeSelector,
): PairVerdict {
  // Rule 1 — ALL_PRODUCTS is universal.
  if (candidate.scope === "ALL_PRODUCTS" || other.scope === "ALL_PRODUCTS") {
    return { kind: "OVERLAP" };
  }

  // Rules 2 & 3 — same scope.
  if (candidate.scope === other.scope) {
    if (candidate.scopeValue === other.scopeValue) {
      return { kind: "OVERLAP" };
    }
    // Different value: single-valued scopes are provably disjoint; a multi-valued
    // COLLECTION needs a Shopify probe (a product can be in both collections).
    return SINGLE_VALUED.has(candidate.scope)
      ? { kind: "DISJOINT" }
      : { kind: "NEEDS_CHECK", selectors: [candidate, other] };
  }

  // Rule 4 — different scopes, neither ALL_PRODUCTS (cross-dimension).
  return { kind: "NEEDS_CHECK", selectors: [candidate, other] };
}

/** A NEEDS_CHECK pairing that still carries the other template for messaging. */
export type NeedsCheck<T> = {
  other: T;
  selectors: [ScopeSelector, ScopeSelector];
};

/**
 * Classify a candidate scope against a list of other scopes and bucket the
 * results for the dry-run: `blocking` (definite OVERLAPs) and `needsCheck` (the
 * Shopify probes feature 39 runs, each still carrying its `other` template so
 * feature 42 can name the collision). DISJOINT pairs are dropped.
 *
 * The CALLER (feature 42) must pass only OTHER ACTIVE templates — never the
 * candidate itself — and is responsible for the "candidate has no INCLUDE scope →
 * no conflicts" short-circuit; this module assumes a real candidate scope.
 */
export function partitionOverlaps<T extends ScopeSelector>(
  candidate: ScopeSelector,
  others: T[],
): { blocking: T[]; needsCheck: NeedsCheck<T>[] } {
  const blocking: T[] = [];
  const needsCheck: NeedsCheck<T>[] = [];

  for (const other of others) {
    const verdict = classifyScopePair(candidate, other);
    if (verdict.kind === "OVERLAP") {
      blocking.push(other);
    } else if (verdict.kind === "NEEDS_CHECK") {
      needsCheck.push({ other, selectors: verdict.selectors });
    }
    // DISJOINT → dropped (no conflict).
  }

  return { blocking, needsCheck };
}
