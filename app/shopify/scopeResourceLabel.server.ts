// Resolve a PRODUCT/COLLECTION scope value SET (raw `gid://shopify/...`) to display DETAILS — the
// human-readable title plus a thumbnail image URL (features 44/47) — so the Settings-tab scope
// picker can show a rich chip instead of an opaque GID when a saved scope is reloaded. The App
// Bridge picker returns the title + image at pick time, so this loader-side resolution is only
// needed for a scope persisted in an earlier session.
//
// `.server.ts` because it calls the Admin API. Shop isolation is STRUCTURAL — the session-bound
// admin client can only read THIS shop's resources (priority #1).
//
// FAIL SOFT (display, not a correctness gate): any miss — a non-GID scope, a deleted resource, a
// network/GraphQL error — degrades to the raw scopeValue (as label) with a null image, so the
// picker always shows SOMETHING and never blocks the loader. The `#graphql` op was validated
// against API 2025-10 (scope: read_products).
//
// BATCHED IN CHUNKS OF 250 (fix 2026-08-01, OQ-103-B / data-model.md §13 F4). See `NODES_MAX_IDS`
// for why, and `resolveChunkInto` for why a failing chunk is isolated.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// The display details for one PRODUCT/COLLECTION chip: the resolved title (falls back to the raw
// GID on any miss) and a thumbnail image URL (null when the resource has no image, or on any miss).
// Presentation only — the GID remains the durable value that rides the Save payload.
export interface ScopeResourceDetail {
  label: string;
  image: string | null;
}

/**
 * The hard ceiling on ONE `nodes(ids:)` request.
 *
 * 🔴 Shopify rejects any GraphQL input array longer than 250 (Admin AND Storefront, since API
 * 2020-01): "The input must not contain more than 250 values." Over the limit the WHOLE request
 * errors — it does not resolve the first 250 and drop the rest.
 *
 * Both call sites are bounded by nothing app-side: a template's INCLUDE PRODUCT/COLLECTION set is
 * uncapped (feature 46), and its EXCLUDE carve-out set has no cap at any layer. Combined with the
 * fail-soft posture, an over-limit set used to degrade EVERY chip to a raw GID with no message
 * anywhere — the page looked broken rather than erroring. data-model.md §13 R3c/R3e, finding F4.
 */
export const NODES_MAX_IDS = 250;

/**
 * Split `ids` into `size`-length chunks, order-preserving. Pure + exported so the batching
 * arithmetic is unit-testable without a mocked Admin client. An empty input yields NO chunks (so
 * the caller issues no request); `size < 1` throws (a caller-bug guard, unreachable from the default).
 */
export function chunkIds(
  ids: string[],
  size: number = NODES_MAX_IDS,
): string[][] {
  if (size < 1) {
    throw new Error("[scopeResourceLabel] chunk size must be at least 1");
  }
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

// Resolve up to NODES_MAX_IDS PRODUCT/COLLECTION GIDs per round-trip. `featuredImage`/`image` give
// the chip thumbnail; a resource with no image yields a null url (fail-soft to no thumbnail).
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

// Pull a nested image `url` (Product.featuredImage.url / Collection.image.url) off a node,
// tolerating a null image or malformed shape — null on anything but a non-empty string url.
function readImageUrl(node: Record<string, unknown>): string | null {
  const image = node.featuredImage ?? node.image;
  if (!isRecord(image)) return null;
  const url = image.url;
  return typeof url === "string" && url !== "" ? url : null;
}

/**
 * Resolve ONE chunk (≤ NODES_MAX_IDS ids) into the shared `details` map, overwriting the identity
 * entries the caller seeded for the ids it resolves.
 *
 * 🔴 FAILURE IS SCOPED TO THIS CHUNK, deliberately. Every early return and the catch leave this
 * chunk's identity entries standing and never touch another chunk's resolved titles — so a
 * 400-product set whose second request fails shows 250 real chips and 150 GIDs, strictly better
 * than the old all-or-nothing blanking. This is why the map is passed in and mutated rather than
 * returned and merged: the identity seed is the fallback, so "did nothing" and "failed" are the
 * same state and there is no partial-result merge to get wrong.
 *
 * Never throws (fail-soft: display must not break the loader).
 */
async function resolveChunkInto(
  admin: AdminApiContext,
  ids: string[],
  details: Map<string, ScopeResourceDetail>,
): Promise<void> {
  try {
    const response = await admin.graphql(RESOURCE_DETAILS_QUERY, {
      variables: { ids },
    });
    if (!response.ok) return;

    const json: unknown = await response.json();
    if (!isRecord(json)) return;
    const data = json.data;
    if (!isRecord(data)) return;
    const nodes = data.nodes;
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      // A deleted / mismatched id comes back as null; skip it (its identity fallback stands).
      if (!isRecord(node)) continue;
      const id = node.id;
      const title = node.title;
      if (typeof id !== "string") continue;
      details.set(id, {
        label: typeof title === "string" && title !== "" ? title : id,
        image: readImageUrl(node),
      });
    }
  } catch (error) {
    // Display-only: a lookup failure must not break the editor load. This chunk's identity entries
    // stand; other chunks are unaffected. Warn (never throw) so the silent degradation to raw GIDs
    // stays diagnosable, matching the truncation warning in metafieldDefinitions.server.ts.
    console.warn(
      `[scopeResourceLabel] chunk of ${ids.length} ids failed to resolve; those chips degrade to raw GIDs.`,
      error,
    );
  }
}

/**
 * Resolve a whole PRODUCT/COLLECTION scope SET to a `GID → { label, image }` map (feature 47),
 * batched at `NODES_MAX_IDS` per request. Returns a Map seeded with an IDENTITY entry for every
 * input GID, overwritten by any resolved title/image — so a miss degrades to the raw GID with no
 * thumbnail and the map is ALWAYS total over `gids`. Never throws (fail-soft). For a
 * non-PRODUCT/COLLECTION scope the value IS the label, so it short-circuits to the identity map.
 *
 * ⚠️ Chunks run SEQUENTIALLY, not via `Promise.all`: it matches the in-repo Admin-loop precedent
 * (`checkCrossDimensionConflicts`), and a set big enough to need several chunks is the one most
 * likely to bump the rate limit if fired at once (priority #3). A set at or under the cap is ONE
 * request, byte-identical to the pre-fix behaviour.
 *
 * 🚫 No cap on the number of chunks. Unlike `fetchProductMetafieldDefinitions`' MAX_PAGES backstop,
 * the input here is the merchant's OWN saved selection, not an unbounded remote collection —
 * truncating it would silently drop chips the merchant can see in their own template.
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

  for (const chunk of chunkIds(gids)) {
    await resolveChunkInto(admin, chunk, details);
  }
  return details;
}
