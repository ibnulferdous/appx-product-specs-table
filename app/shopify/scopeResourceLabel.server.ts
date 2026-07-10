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
