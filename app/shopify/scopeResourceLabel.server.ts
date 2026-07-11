// Resolve a PRODUCT/COLLECTION scope value (a raw `gid://shopify/...`) to its
// human-readable resource title (feature 44), so the editor's Settings-tab scope
// picker can show a readable chip instead of an opaque GID when a saved scope is
// loaded from the DB. The App Bridge resource picker returns the title alongside
// the GID at pick time, so this loader-side resolution is only needed for a scope
// that was persisted in an earlier session and reloaded.
//
// `.server.ts` because it calls the Admin API. Shop isolation is STRUCTURAL — the
// session-bound `admin` client can only read THIS shop's resources (priority #1),
// like `assignmentConflict.server.ts` / `metaobjects.server.ts`.
//
// FAIL SOFT (this is display, not a correctness gate): any miss — a non-GID scope,
// a deleted resource, a network/GraphQL error — degrades to the raw scopeValue so
// the picker always shows SOMETHING (never blank), and never blocks the loader.
// The `#graphql` operation was validated with `validate_graphql_codeblocks`
// against API version 2025-10 (required scope: read_products, already granted).

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const RESOURCE_LABEL_QUERY = `#graphql
  query ScopeResourceLabel($id: ID!) {
    node(id: $id) {
      ... on Product {
        title
      }
      ... on Collection {
        title
      }
    }
  }`;

// Batched sibling of RESOURCE_LABEL_QUERY: resolve a whole PRODUCT/COLLECTION scope
// SET (feature 47's multi-value picker) in ONE round-trip instead of N, so loading a
// template with several selected products doesn't fan out into N `node` queries.
const RESOURCE_LABELS_QUERY = `#graphql
  query ScopeResourceLabels($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
      }
      ... on Collection {
        id
        title
      }
    }
  }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Resolve a scope's display label. For PRODUCT/COLLECTION, look up the resource
 * title by GID; on any miss, fall back to the raw `scopeValue` (never blank). For
 * every other scope the value IS the label (PRODUCT_TYPE/VENDOR are free text) or
 * there is no value (ALL_PRODUCTS/none → null). Never throws — a failure returns
 * the fallback so the loader is not blocked by a display concern.
 */
export async function resolveScopeValueLabel(
  admin: AdminApiContext,
  scope: string,
  scopeValue: string | null,
): Promise<string | null> {
  if (scopeValue === null) return null;
  if (scope !== "PRODUCT" && scope !== "COLLECTION") return scopeValue;

  try {
    const response = await admin.graphql(RESOURCE_LABEL_QUERY, {
      variables: { id: scopeValue },
    });
    if (!response.ok) return scopeValue;

    const json: unknown = await response.json();
    if (!isRecord(json)) return scopeValue;
    const data = json.data;
    if (!isRecord(data)) return scopeValue;
    const node = data.node;
    if (!isRecord(node)) return scopeValue;
    const title = node.title;
    return typeof title === "string" && title !== "" ? title : scopeValue;
  } catch {
    // Display-only: a lookup failure must not break the editor load.
    return scopeValue;
  }
}

/**
 * Resolve a whole PRODUCT/COLLECTION scope SET to a `GID → title` map in one
 * batched `nodes(ids:)` query (feature 47). Returns a Map seeded with an IDENTITY
 * entry for every input GID (`gid → gid`), overwritten by any resolved title — so a
 * miss (deleted resource, unknown id, network/GraphQL error, non-resource kind)
 * degrades to the raw GID and the map is ALWAYS total over `gids` (never a blank or
 * missing chip). Never throws (same fail-soft posture as the single resolver). For
 * a non-PRODUCT/COLLECTION scope the caller shouldn't need this (the value IS the
 * label) — it short-circuits to the identity map. The `#graphql` operation was
 * validated with `validate_graphql_codeblocks` against API version 2025-10.
 */
export async function resolveScopeValueLabels(
  admin: AdminApiContext,
  scope: string,
  gids: string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>(gids.map((gid) => [gid, gid]));
  if (scope !== "PRODUCT" && scope !== "COLLECTION") return labels;
  if (gids.length === 0) return labels;

  try {
    const response = await admin.graphql(RESOURCE_LABELS_QUERY, {
      variables: { ids: gids },
    });
    if (!response.ok) return labels;

    const json: unknown = await response.json();
    if (!isRecord(json)) return labels;
    const data = json.data;
    if (!isRecord(data)) return labels;
    const nodes = data.nodes;
    if (!Array.isArray(nodes)) return labels;

    for (const node of nodes) {
      // A deleted / mismatched id comes back as `null`; skip it (its identity
      // fallback already stands).
      if (!isRecord(node)) continue;
      const id = node.id;
      const title = node.title;
      if (typeof id === "string" && typeof title === "string" && title !== "") {
        labels.set(id, title);
      }
    }
    return labels;
  } catch {
    // Display-only: a lookup failure must not break the editor load.
    return labels;
  }
}
