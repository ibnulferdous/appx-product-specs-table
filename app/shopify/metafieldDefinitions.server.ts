// Fetch the shop's product metafield definitions from the Admin GraphQL API (Editor Step 8) — the
// editor's first call out to Shopify.
//
// Native product fields are a platform-defined schema (static in `app/utils/shopifyFields.ts`).
// Metafields are the opposite — merchant-defined namespace/key pairs that vary per shop — so they
// must be fetched, shop-scoped. Shop isolation here is STRUCTURAL: `authenticate.admin(request)`
// binds the client to the current shop's Admin token, so this query can only return THIS shop's
// definitions (priority #1).
//
// File split (code-standards.md): the live admin.graphql call lives here in `app/shopify/`; the
// pure `mapDefinitionsResponse` edge→summary transform is exported alongside and is the unit-tested
// part (the live call is mocked at the boundary).

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/**
 * The flat summary the editor's field picker needs for one product metafield definition.
 * Deliberately lean, mirroring `NativeShopifyField`'s persisted-vs-display split so Step 9's search
 * can filter it with the same rule.
 */
export interface MetafieldDefinitionSummary {
  /** The definition's gid — stable, handy for React keys and debugging. Never persisted. */
  id: string;
  /** Persisted in the METAFIELD value part (the locked pill contract, data-model.md §7). */
  namespace: string;
  /** Persisted in the METAFIELD value part (the locked pill contract, data-model.md §7). */
  key: string;
  /** Human-readable label shown in the picker (Step 9). Never persisted. */
  name: string;
  /** The definition's value type, e.g. "single_line_text_field" — drives an icon / future hints. */
  type: string;
}

// `first: 250` is the Admin API's max page size; almost every shop fits in one page. MAX_PAGES is a
// safety backstop far above any realistic ceiling — if hit, we log what was dropped rather than
// silently truncating ("no silent caps").
const PAGE_SIZE = 250;
const MAX_PAGES = 10;

const PRODUCT_METAFIELD_DEFINITIONS_QUERY = `#graphql
  query ProductMetafieldDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(ownerType: PRODUCT, first: $first, after: $after) {
      edges {
        node {
          id
          namespace
          key
          name
          type {
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;

// --- Pure narrowing helpers -------------------------------------------------
// External JSON is `unknown`; narrow it at the entry point before it reaches app logic.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * One page's worth of edges, narrowed to summaries.
 *
 * Malformed-node rule (locked): `namespace` and `key` are the METAFIELD pill's value-part contract
 * — a definition missing either is unusable as a pill, so it is DROPPED rather than defaulted
 * (defaulting would mint a pill that resolves to nothing on the storefront). `name` falls back to
 * `namespace.key` and `type` to "" when absent, since those are display-only and never persisted.
 *
 * Pure: reads `json`, returns a fresh array.
 */
export function mapDefinitionsResponse(
  json: unknown,
): MetafieldDefinitionSummary[] {
  if (!isRecord(json)) return [];
  const data = json.data;
  if (!isRecord(data)) return [];
  const definitions = data.metafieldDefinitions;
  if (!isRecord(definitions)) return [];
  const edges = definitions.edges;
  if (!Array.isArray(edges)) return [];

  const summaries: MetafieldDefinitionSummary[] = [];
  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    const node = edge.node;
    if (!isRecord(node)) continue;

    const namespace = asString(node.namespace);
    const key = asString(node.key);
    // The value-part contract fields: drop the node if either is missing.
    if (namespace === "" || key === "") continue;

    const nameValue = asString(node.name);
    const typeName = isRecord(node.type) ? asString(node.type.name) : "";

    summaries.push({
      id: asString(node.id),
      namespace,
      key,
      name: nameValue !== "" ? nameValue : `${namespace}.${key}`,
      type: typeName,
    });
  }
  return summaries;
}

/** Narrow a single response's `pageInfo` for the pagination loop. */
function readPageInfo(json: unknown): {
  hasNextPage: boolean;
  endCursor: string | null;
} {
  if (!isRecord(json)) return { hasNextPage: false, endCursor: null };
  const data = json.data;
  if (!isRecord(data)) return { hasNextPage: false, endCursor: null };
  const definitions = data.metafieldDefinitions;
  if (!isRecord(definitions)) return { hasNextPage: false, endCursor: null };
  const pageInfo = definitions.pageInfo;
  if (!isRecord(pageInfo)) return { hasNextPage: false, endCursor: null };
  return {
    hasNextPage: pageInfo.hasNextPage === true,
    endCursor:
      typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null,
  };
}

/**
 * Fetch ALL of the current shop's product metafield definitions, paging through
 * `pageInfo.hasNextPage` / `endCursor` up to MAX_PAGES. Shop-scoped via the admin client's session
 * token. Throws on a network / GraphQL failure so the loader can surface `{ ok: false }`.
 */
export async function fetchProductMetafieldDefinitions(
  admin: AdminApiContext,
): Promise<MetafieldDefinitionSummary[]> {
  const summaries: MetafieldDefinitionSummary[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await admin.graphql(PRODUCT_METAFIELD_DEFINITIONS_QUERY, {
      variables: { first: PAGE_SIZE, after },
    });
    const json: unknown = await response.json();

    summaries.push(...mapDefinitionsResponse(json));

    const { hasNextPage, endCursor } = readPageInfo(json);
    if (!hasNextPage || !endCursor) {
      return summaries;
    }
    after = endCursor;
  }

  // Cap hit with more pages available: do not silently truncate — record that definitions beyond
  // the cap were dropped so it is diagnosable.
  console.warn(
    `[metafieldDefinitions] Reached the ${MAX_PAGES}-page safety cap ` +
      `(${summaries.length} definitions fetched); additional product metafield ` +
      `definitions were not loaded.`,
  );
  return summaries;
}
