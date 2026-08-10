// Assigned-product counts for the templates list (feature 48). The "Assigned Products" column
// shows, per template, the REAL number of products its assignment scope resolves to.
//
// Two scope kinds resolve to a fixed number in Postgres — NONE -> 0; PRODUCT -> the count of
// distinct INCLUDE PRODUCT rows. The broad kinds have no stored count, so their total is read live
// from Shopify's Admin API: ALL_PRODUCTS -> shop total minus EXCLUDE carve-outs (feature 45);
// COLLECTION -> summed `productsCount` (overlapping collections may over-count, see below);
// PRODUCT_TYPE / VENDOR -> `productsCount(query:)`. PRODUCT_TYPE / VENDOR / COLLECTION are hidden
// from the MVP picker but still exist in legacy data, so every kind is handled.
//
// COST: O(1) Admin requests regardless of template count — every lookup is collapsed into ONE
// batched, aliased query (priority #3). Templates needing no live lookup (PRODUCT / NONE) skip it.
//
// Conventions mirror assignmentConflict/routing.server.ts: the `#graphql` op was validated against
// API 2025-10 (scope: read_products); the query builder, response narrower, grouping, and
// arithmetic are pure + unit-tested; the live admin.graphql runner is mocked. Shop isolation
// (priority #1): the Prisma read is `where { shopId }` and the admin client is session-bound.
//
// FAIL-SOFT (an admin-list nicety, not the storefront): a network / GraphQL failure is NEVER fatal
// to the list — it leaves the live-derived counts UNKNOWN (rendered "—") while the Postgres-derived
// PRODUCT / NONE counts still resolve. The opposite bias from the activation gate (fails CLOSED),
// deliberately: a wrong count here is cosmetic.

import { AssignmentMode } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { AssignmentScopeValue } from "../utils/assignmentScope";

// --- Types ------------------------------------------------------------------

/** The minimal per-template assignment shape the counter folds a shop's rows into. `scope` is null
 *  when a template has no INCLUDE rule (it matches nothing → 0). */
export type TemplateAssignment = {
  templateId: string;
  scope: AssignmentScopeValue | null;
  // Distinct INCLUDE scopeValues: PRODUCT/COLLECTION GIDs (1..N), the single string for
  // PRODUCT_TYPE/VENDOR, or [] for ALL_PRODUCTS/NONE.
  includeValues: string[];
  // Count of distinct EXCLUDE PRODUCT carve-out rows (only meaningful under ALL_PRODUCTS).
  excludeCount: number;
};

/** The distinct set of live Shopify lookups needed across every template. */
export type CountLookups = {
  needShopTotal: boolean;
  collectionGids: string[];
  productTypes: string[];
  vendors: string[];
};

/** Alias bookkeeping tying each lookup to its GraphQL alias, so the narrower can read the right
 *  field out of the aliased response. */
export type CountQueryAliases = {
  shopTotal: boolean;
  collection: Map<string, string>;
  type: Map<string, string>;
  vendor: Map<string, string>;
};

export type BuiltCountQuery = {
  query: string;
  variables: Record<string, string>;
  aliases: CountQueryAliases;
};

/** Counts resolved from Shopify. A key ABSENT from a map means "unknown" (request failed /
 *  malformed) → null count. A deleted collection resolves to 0, not unknown. */
export type ResolvedCounts = {
  shopTotal: number | null;
  byCollection: Map<string, number>;
  byType: Map<string, number>;
  byVendor: Map<string, number>;
};

// --- Pure: grouping ---------------------------------------------------------

type RawAssignmentRow = {
  templateId: string;
  scope: AssignmentScopeValue;
  scopeValue: string | null;
  mode: AssignmentMode;
};

/**
 * Fold a shop's flat ProductAssignment rows into one `TemplateAssignment` per template. A
 * template's INCLUDE rows share one scope KIND (homogeneity invariant, feature 46), so the first
 * INCLUDE row's scope defines the template's scope and every INCLUDE row contributes a distinct
 * value. EXCLUDE PRODUCT rows only bump `excludeCount`. Pure.
 */
export function groupAssignments(
  rows: RawAssignmentRow[],
): TemplateAssignment[] {
  const byTemplate = new Map<string, TemplateAssignment>();
  const includeSeen = new Map<string, Set<string>>();

  const ensure = (templateId: string): TemplateAssignment => {
    let entry = byTemplate.get(templateId);
    if (!entry) {
      entry = { templateId, scope: null, includeValues: [], excludeCount: 0 };
      byTemplate.set(templateId, entry);
      includeSeen.set(templateId, new Set());
    }
    return entry;
  };

  for (const row of rows) {
    const entry = ensure(row.templateId);
    if (row.mode === AssignmentMode.EXCLUDE) {
      entry.excludeCount += 1;
      continue;
    }
    // INCLUDE row: set the scope kind (homogeneous) and collect distinct values.
    entry.scope = row.scope;
    if (row.scopeValue !== null) {
      const seen = includeSeen.get(row.templateId)!;
      if (!seen.has(row.scopeValue)) {
        seen.add(row.scopeValue);
        entry.includeValues.push(row.scopeValue);
      }
    }
  }

  return [...byTemplate.values()];
}

/** Collect the distinct live lookups needed across all templates. ALL_PRODUCTS needs the shop
 *  total; COLLECTION/PRODUCT_TYPE/VENDOR need their per-value counts; PRODUCT and NONE need none. */
export function collectLookups(
  assignments: TemplateAssignment[],
): CountLookups {
  let needShopTotal = false;
  const collectionGids = new Set<string>();
  const productTypes = new Set<string>();
  const vendors = new Set<string>();

  for (const a of assignments) {
    switch (a.scope) {
      case "ALL_PRODUCTS":
        needShopTotal = true;
        break;
      case "COLLECTION":
        a.includeValues.forEach((v) => collectionGids.add(v));
        break;
      case "PRODUCT_TYPE":
        a.includeValues.forEach((v) => productTypes.add(v));
        break;
      case "VENDOR":
        a.includeValues.forEach((v) => vendors.add(v));
        break;
      default:
        break; // PRODUCT / NONE — no live lookup
    }
  }

  return {
    needShopTotal,
    collectionGids: [...collectionGids],
    productTypes: [...productTypes],
    vendors: [...vendors],
  };
}

// --- Pure: query builder ----------------------------------------------------

/**
 * Escape a free-form merchant string (product_type / vendor) for a single-quoted Shopify search
 * term: backslash first (so the quotes we add aren't double-escaped), then the single quote — so
 * `O'Neil` can't break out of the term and widen the query (injection safety). The value is passed
 * as a GraphQL variable, so no GraphQL-string escaping is needed on top.
 */
export function escapeProductSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Build ONE aliased `productsCount` / `collection` query covering every lookup, or null when
 * nothing needs a live count. Each value is passed as a GraphQL variable, never inlined, so nothing
 * merchant-supplied reaches the query document. Pure.
 */
export function buildAssignedCountQuery(
  lookups: CountLookups,
): BuiltCountQuery | null {
  const { needShopTotal, collectionGids, productTypes, vendors } = lookups;
  if (
    !needShopTotal &&
    collectionGids.length === 0 &&
    productTypes.length === 0 &&
    vendors.length === 0
  ) {
    return null;
  }

  const varDecls: string[] = [];
  const bodyLines: string[] = [];
  const variables: Record<string, string> = {};
  const aliases: CountQueryAliases = {
    shopTotal: needShopTotal,
    collection: new Map(),
    type: new Map(),
    vendor: new Map(),
  };

  if (needShopTotal) {
    bodyLines.push("shopTotal: productsCount { count }");
  }

  collectionGids.forEach((gid, i) => {
    const alias = `col${i}`;
    varDecls.push(`$${alias}: ID!`);
    bodyLines.push(
      `${alias}: collection(id: $${alias}) { productsCount { count } }`,
    );
    variables[alias] = gid;
    aliases.collection.set(gid, alias);
  });

  productTypes.forEach((type, i) => {
    const alias = `ptype${i}`;
    varDecls.push(`$${alias}: String!`);
    bodyLines.push(`${alias}: productsCount(query: $${alias}) { count }`);
    variables[alias] = `product_type:'${escapeProductSearchValue(type)}'`;
    aliases.type.set(type, alias);
  });

  vendors.forEach((vendor, i) => {
    const alias = `vendor${i}`;
    varDecls.push(`$${alias}: String!`);
    bodyLines.push(`${alias}: productsCount(query: $${alias}) { count }`);
    variables[alias] = `vendor:'${escapeProductSearchValue(vendor)}'`;
    aliases.vendor.set(vendor, alias);
  });

  const params = varDecls.length > 0 ? `(${varDecls.join(", ")})` : "";
  const query = `#graphql
  query AssignedProductCounts${params} {
    ${bodyLines.join("\n    ")}
  }`;

  return { query, variables, aliases };
}

// --- Pure: response narrower ------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Read a `Count` object's `.count` (a non-negative integer), or null if absent / malformed. */
function readCount(node: unknown): number | null {
  if (!isRecord(node)) return null;
  const count = node.count;
  return typeof count === "number" ? count : null;
}

/**
 * Narrow an aliased count response into `ResolvedCounts`. A missing / malformed field is left out
 * of its map (→ "unknown" → null downstream), EXCEPT a `collection(id:)` that resolved to null (a
 * deleted collection), recorded as 0 — it genuinely covers no products. Pure.
 */
export function parseAssignedCountResponse(
  json: unknown,
  aliases: CountQueryAliases,
): ResolvedCounts {
  const data = isRecord(json) && isRecord(json.data) ? json.data : null;

  const shopTotal =
    aliases.shopTotal && data ? readCount(data.shopTotal) : null;

  const byCollection = new Map<string, number>();
  const byType = new Map<string, number>();
  const byVendor = new Map<string, number>();

  if (data) {
    for (const [gid, alias] of aliases.collection) {
      const node = data[alias];
      if (node === null) {
        byCollection.set(gid, 0); // collection deleted → covers no products
        continue;
      }
      const count = isRecord(node) ? readCount(node.productsCount) : null;
      if (count !== null) byCollection.set(gid, count);
    }
    for (const [type, alias] of aliases.type) {
      const count = readCount(data[alias]);
      if (count !== null) byType.set(type, count);
    }
    for (const [vendor, alias] of aliases.vendor) {
      const count = readCount(data[alias]);
      if (count !== null) byVendor.set(vendor, count);
    }
  }

  return { shopTotal, byCollection, byType, byVendor };
}

// --- Pure: per-template arithmetic ------------------------------------------

/**
 * The number of products a template's scope resolves to, or null when a needed live count is
 * unknown. PRODUCT and NONE never consult `resolved`, so they yield a number even on API failure.
 * ALL_PRODUCTS subtracts the EXCLUDE carve-outs (clamped ≥ 0); COLLECTION sums its collections
 * (overlapping collections may over-count — an accepted MVP approximation, since exact de-dup would
 * require enumerating every product GID). Pure.
 */
export function computeTemplateAssignedCount(
  assignment: TemplateAssignment,
  resolved: ResolvedCounts,
): number | null {
  const { scope, includeValues, excludeCount } = assignment;
  if (scope === null) return 0;

  switch (scope) {
    case "PRODUCT":
      return includeValues.length;
    case "ALL_PRODUCTS":
      return resolved.shopTotal === null
        ? null
        : Math.max(0, resolved.shopTotal - excludeCount);
    case "COLLECTION": {
      let sum = 0;
      for (const gid of includeValues) {
        const count = resolved.byCollection.get(gid);
        if (count === undefined) return null; // unknown → whole cell unknown
        sum += count;
      }
      return sum;
    }
    case "PRODUCT_TYPE": {
      const count = resolved.byType.get(includeValues[0]);
      return count === undefined ? null : count;
    }
    case "VENDOR": {
      const count = resolved.byVendor.get(includeValues[0]);
      return count === undefined ? null : count;
    }
    default: {
      const _never: never = scope;
      void _never;
      return null;
    }
  }
}

// --- Live orchestrator ------------------------------------------------------

/**
 * Resolve each of a shop's templates to its assigned-product count, keyed by templateId. Only
 * templates that HAVE assignment rows appear; a template with no rows is absent (the caller treats a
 * miss as 0). A `null` value means the count couldn't be determined live (render "—").
 *
 * One shop-scoped Prisma read folds the rows; one batched Admin query resolves every live lookup
 * (skipped when none is needed). The Admin call is fail-soft — a failure logs and leaves live counts
 * null while PRODUCT / NONE still resolve.
 */
export async function resolveAssignedProductCounts(
  admin: AdminApiContext,
  shopId: string,
): Promise<Map<string, number | null>> {
  const rows = await prisma.productAssignment.findMany({
    where: { shopId },
    select: { templateId: true, scope: true, scopeValue: true, mode: true },
  });

  const assignments = groupAssignments(rows as RawAssignmentRow[]);
  const lookups = collectLookups(assignments);
  const built = buildAssignedCountQuery(lookups);

  let resolved: ResolvedCounts = {
    shopTotal: null,
    byCollection: new Map(),
    byType: new Map(),
    byVendor: new Map(),
  };

  if (built) {
    try {
      const response = await admin.graphql(built.query, {
        variables: built.variables,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json: unknown = await response.json();
      if (
        isRecord(json) &&
        Array.isArray(json.errors) &&
        json.errors.length > 0
      ) {
        throw new Error("GraphQL errors");
      }
      resolved = parseAssignedCountResponse(json, built.aliases);
    } catch (error) {
      // Cosmetic count only — never break the list. Live-derived counts stay unknown (→ "—");
      // PRODUCT / NONE still resolve from Postgres.
      console.error("[assignedProductCounts] live count lookup failed", error);
    }
  }

  const counts = new Map<string, number | null>();
  for (const assignment of assignments) {
    counts.set(
      assignment.templateId,
      computeTemplateAssignedCount(assignment, resolved),
    );
  }
  return counts;
}
