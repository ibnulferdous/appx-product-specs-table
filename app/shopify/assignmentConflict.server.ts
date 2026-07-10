// Cross-dimension conflict check (feature 39) — the second half of the
// DRAFT→ACTIVE dry-run (data-model.md §9). Feature 38's pure resolver
// (`assignmentOverlap.ts`) settles most scope pairs by string set-algebra and
// hands the genuinely cross-dimension / multi-valued ones back as `NEEDS_CHECK`.
// This module resolves those: it renders each undecidable pair into a
// `products(first: 1, query: A AND B)` existence probe, runs it against the
// Admin API, and reports a concrete conflict when a product matches both scopes.
// A non-empty result means ≥1 product is covered by both rules → they overlap →
// activation must be blocked. Cost is O(needsCheck) tiny queries, never a
// catalog scan (data-model.md §9).
//
// Same conventions as metafieldDefinitions.server.ts / metaobjects.server.ts:
// the `#graphql` operation was validated with `validate_graphql_codeblocks`
// against API version 2025-10; the query BUILDER and response NARROWER are pure
// and unit-tested; the live `admin.graphql` runner is mocked at the boundary,
// not unit-tested. Shop isolation is STRUCTURAL — `authenticate.admin(request)`
// binds the client to this shop's Admin token, so a probe can only ever see THIS
// shop's catalog (priority #1); no `shopId` is threaded because the token IS the
// isolation.
//
// SAFETY BIAS (priority #2, the live storefront): a network / GraphQL failure is
// NEVER narrowed to "no conflict" — that would let a conflicting template go
// ACTIVE and break the disjoint invariant. The runner THROWS on any error;
// feature 42 turns a thrown probe into "couldn't verify — activation blocked",
// not a silent all-clear.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { ScopeSelector, NeedsCheck } from "../utils/assignmentOverlap";

/** A NEEDS_CHECK pair the Shopify probe CONFIRMED shares ≥1 product. Carries the
 *  other template (for feature 42/44 messaging) and a truthful, diagnosable
 *  reason — the rendered probe query. Final merchant-facing copy is feature 44. */
export type ConfirmedConflict<T> = {
  other: T;
  reason: string;
};

// --- Pure query builder -----------------------------------------------------
// Renders one INCLUDE selector into a Shopify product-search query fragment
// (data-model.md §9). ALL_PRODUCTS never reaches here (feature 38 short-circuits
// it to OVERLAP), so it is a defensive throw, not a real branch.

/**
 * Escape a free-form merchant string (product_type / vendor) for use inside a
 * single-quoted Shopify search term. Backslash first (so we don't double-escape
 * the quotes we add), then the single quote — so a value like `O'Neil` or one
 * containing a stray quote / `AND` cannot break out and widen the query
 * (injection safety, a correctness invariant).
 */
function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Pull the numeric id out of a `gid://shopify/<Type>/<id>` selector value and
 * assert it is digits-only — defence-in-depth over feature 37's `gid://` shape
 * check, and so a non-numeric tail can never reach the query unquoted. Throws if
 * the value is not a well-formed GID for `expectedType`.
 */
function numericIdFromGid(value: string, expectedType: string): string {
  const prefix = `gid://shopify/${expectedType}/`;
  if (!value.startsWith(prefix)) {
    throw new Error(
      `[assignmentConflict] Expected a ${expectedType} GID, got: ${value}`,
    );
  }
  const id = value.slice(prefix.length);
  if (id === "" || !/^\d+$/.test(id)) {
    throw new Error(
      `[assignmentConflict] Malformed ${expectedType} GID (non-numeric id): ${value}`,
    );
  }
  return id;
}

/**
 * Render one INCLUDE scope selector to its Shopify product-search fragment:
 *   PRODUCT_TYPE → product_type:'X'   VENDOR → vendor:'Y'
 *   COLLECTION   → collection_id:<id> PRODUCT → id:<id>
 * Throws on ALL_PRODUCTS (unreachable — see module header) or a missing value.
 */
export function buildScopeFragment(selector: ScopeSelector): string {
  const { scope, scopeValue } = selector;

  if (scope === "ALL_PRODUCTS") {
    // Guard: ALL_PRODUCTS is universal and is always resolved to OVERLAP by
    // feature 38 before a probe is ever built. Reaching here is a caller bug.
    throw new Error(
      "[assignmentConflict] ALL_PRODUCTS cannot be a probe selector",
    );
  }

  if (scopeValue === null || scopeValue === "") {
    throw new Error(`[assignmentConflict] ${scope} scope requires a value`);
  }

  switch (scope) {
    case "PRODUCT_TYPE":
      return `product_type:'${escapeSearchValue(scopeValue)}'`;
    case "VENDOR":
      return `vendor:'${escapeSearchValue(scopeValue)}'`;
    case "COLLECTION":
      return `collection_id:${numericIdFromGid(scopeValue, "Collection")}`;
    case "PRODUCT":
      return `id:${numericIdFromGid(scopeValue, "Product")}`;
    default: {
      // Exhaustiveness guard — a new scope must add a fragment here.
      const _never: never = scope;
      throw new Error(
        `[assignmentConflict] Unhandled scope: ${String(_never)}`,
      );
    }
  }
}

/**
 * AND two scope fragments into a single `products(query:…)` existence probe.
 * Order-free (feature 38 guarantees both sides are non-ALL_PRODUCTS), so the two
 * selectors may be passed in either order.
 */
export function buildExistenceQuery(
  a: ScopeSelector,
  b: ScopeSelector,
): string {
  return `${buildScopeFragment(a)} AND ${buildScopeFragment(b)}`;
}

// --- Pure response narrower -------------------------------------------------
// External JSON is `unknown`; narrow it before it reaches app logic. This reads
// only WHETHER an edge exists (existence, not enumeration). A malformed / absent
// shape → false; a *successful* empty response → false. GraphQL `errors` are NOT
// handled here — the runner rejects them first (fail closed).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True iff the probe response carries at least one product edge. */
export function hasMatchingProduct(json: unknown): boolean {
  if (!isRecord(json)) return false;
  const data = json.data;
  if (!isRecord(data)) return false;
  const products = data.products;
  if (!isRecord(products)) return false;
  const edges = products.edges;
  return Array.isArray(edges) && edges.length > 0;
}

// --- Live runner ------------------------------------------------------------

const CONFLICT_PROBE_QUERY = `#graphql
  query AssignmentConflictProbe($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
  }`;

/**
 * Run one `products(first: 1, query: …)` existence probe per NEEDS_CHECK pair and
 * return only the CONFIRMED collisions (≥1 shared product) — the shape feature 42
 * merges into its `blocking` bucket. Probes run sequentially; the count is O(active
 * rules), tiny.
 *
 * FAIL CLOSED: a non-ok HTTP response or a GraphQL `errors` array throws (the
 * whole check fails), never yields a conflict-free verdict — an unverifiable
 * probe must block activation, not silently pass (priority #2).
 */
export async function checkCrossDimensionConflicts<T extends ScopeSelector>(
  admin: AdminApiContext,
  needsCheck: NeedsCheck<T>[],
): Promise<ConfirmedConflict<T>[]> {
  const confirmed: ConfirmedConflict<T>[] = [];

  for (const { other, selectors } of needsCheck) {
    const query = buildExistenceQuery(selectors[0], selectors[1]);
    const response = await admin.graphql(CONFLICT_PROBE_QUERY, {
      variables: { query },
    });

    if (!response.ok) {
      throw new Error(
        `[assignmentConflict] Existence probe failed (HTTP ${response.status}) ` +
          `for query: ${query}`,
      );
    }

    const json: unknown = await response.json();
    if (
      isRecord(json) &&
      Array.isArray(json.errors) &&
      json.errors.length > 0
    ) {
      throw new Error(
        `[assignmentConflict] Existence probe returned GraphQL errors for ` +
          `query: ${query}`,
      );
    }

    if (hasMatchingProduct(json)) {
      confirmed.push({ other, reason: query });
    }
    // No match → the two scopes are disjoint for this shop's catalog → dropped.
  }

  return confirmed;
}
