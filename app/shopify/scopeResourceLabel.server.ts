// Resolve a PRODUCT/COLLECTION scope value SET (a set of raw `gid://shopify/...`)
// to display DETAILS — the human-readable resource title plus a thumbnail image URL
// (features 44/47) — so the editor's Settings-tab scope picker can show a rich chip
// (thumbnail + title + remove, Kaching-style) instead of an opaque GID when a saved
// scope is loaded from the DB. The App Bridge resource picker returns the title +
// image alongside the GID at pick time, so this loader-side resolution is only
// needed for a scope that was persisted in an earlier session and reloaded.
//
// `.server.ts` because it calls the Admin API. Shop isolation is STRUCTURAL — the
// session-bound `admin` client can only read THIS shop's resources (priority #1),
// like `assignmentConflict.server.ts` / `metaobjects.server.ts`.
//
// FAIL SOFT (this is display, not a correctness gate): any miss — a non-GID scope,
// a deleted resource, a network/GraphQL error — degrades to the raw scopeValue (as
// label) with a null image so the picker always shows SOMETHING (never blank), and
// never blocks the loader. The `#graphql` operation was validated with
// `validate_graphql_codeblocks` against API version 2025-10 (required scope:
// read_products, already granted).

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// The display details for one PRODUCT/COLLECTION chip: the resolved title (falls
// back to the raw GID on any miss — never blank) and a small thumbnail image URL
// (null when the resource has no image, or on any miss). Only presentation — the
// GID itself remains the durable value that rides the Save payload.
export interface ScopeResourceDetail {
  label: string;
  image: string | null;
}

// Resolve a whole PRODUCT/COLLECTION scope SET (feature 47's multi-value picker) in
// ONE round-trip instead of N. `featuredImage`/`image` give the chip thumbnail; a
// resource with no image yields a null url (fail-soft to no thumbnail).
const RESOURCE_DETAILS_QUERY = `#graphql
  query ScopeResourceDetails($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredImage {
          url
        }
      }
      ... on Collection {
        id
        title
        image {
          url
        }
      }
    }
  }`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Pull a nested image `url` (Product.featuredImage.url / Collection.image.url) off a
// node, tolerating a null image or a malformed shape — returns null on anything but
// a non-empty string url.
function readImageUrl(node: Record<string, unknown>): string | null {
  const image = node.featuredImage ?? node.image;
  if (!isRecord(image)) return null;
  const url = image.url;
  return typeof url === "string" && url !== "" ? url : null;
}

/**
 * Resolve a whole PRODUCT/COLLECTION scope SET to a `GID → { label, image }` map in
 * one batched `nodes(ids:)` query (feature 47). Returns a Map seeded with an
 * IDENTITY entry for every input GID (`gid → { label: gid, image: null }`),
 * overwritten by any resolved title/image — so a miss (deleted resource, unknown id,
 * network/GraphQL error, non-resource kind) degrades to the raw GID with no
 * thumbnail and the map is ALWAYS total over `gids` (never a blank or missing chip).
 * Never throws (fail-soft: display must not break the loader). For a
 * non-PRODUCT/COLLECTION scope the caller shouldn't need this (the value IS the
 * label) — it short-circuits to the identity map. The `#graphql` operation was
 * validated with `validate_graphql_codeblocks` against API version 2025-10.
 */
export async function resolveScopeResourceDetails(
  admin: AdminApiContext,
  scope: string,
  gids: string[],
): Promise<Map<string, ScopeResourceDetail>> {
  const details = new Map<string, ScopeResourceDetail>(
    gids.map((gid) => [gid, { label: gid, image: null }]),
  );
  if (scope !== "PRODUCT" && scope !== "COLLECTION") return details;
  if (gids.length === 0) return details;

  try {
    const response = await admin.graphql(RESOURCE_DETAILS_QUERY, {
      variables: { ids: gids },
    });
    if (!response.ok) return details;

    const json: unknown = await response.json();
    if (!isRecord(json)) return details;
    const data = json.data;
    if (!isRecord(data)) return details;
    const nodes = data.nodes;
    if (!Array.isArray(nodes)) return details;

    for (const node of nodes) {
      // A deleted / mismatched id comes back as `null`; skip it (its identity
      // fallback already stands).
      if (!isRecord(node)) continue;
      const id = node.id;
      const title = node.title;
      if (typeof id !== "string") continue;
      details.set(id, {
        label: typeof title === "string" && title !== "" ? title : id,
        image: readImageUrl(node),
      });
    }
    return details;
  } catch {
    // Display-only: a lookup failure must not break the editor load.
    return details;
  }
}
