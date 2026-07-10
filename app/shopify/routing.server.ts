// Shop routing metafield writer (feature 41) — makes the routing projection real
// on Shopify. Reads a shop's ACTIVE assignment rules, folds them through feature
// 40's pure `buildRoutingProjection`, persists the `ShopStorefrontRouting` cache
// row (Postgres = source of truth), then `metafieldsSet`s the shop-level
// `$app:routing` json metafield (the delivery copy Liquid reads, feature 43).
//
// Conventions mirror metaobjects.server.ts / templateSync.server.ts: every
// `#graphql` operation was validated with `validate_graphql_codeblocks` against
// API version 2025-10; the pure glue (flatten / metafield-input / response
// narrowing) is exported + unit-tested; the live `admin.graphql` + Prisma calls
// are mocked at the boundary. Shop isolation is enforced two ways (priority #1):
// every Prisma read/write is `where { shopId }`, and the `admin` client is
// session-bound so the metafield owner can only ever be THIS shop.
//
// ORDERING (data-model.md §8, code-standards "Data and Storage"): Postgres FIRST.
// The cache row is upserted before the metafield write, and sync state is stamped
// only after a confirmed write — a failed delivery write leaves a correct row with
// stale/blank sync state, surfaced honestly, never a silent success.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import type { AssignmentScopeValue } from "../utils/assignmentScope";
import {
  buildRoutingProjection,
  type RoutingMode,
  type RoutingRule,
  type RoutingProjection,
} from "../utils/routingProjection";

// The reserved app namespace + key the `[shop.metafields.app.routing]` TOML
// definition resolves to. Liquid reads `shop.metafields["$app"].routing.value`.
export const ROUTING_METAFIELD_NAMESPACE = "$app";
export const ROUTING_METAFIELD_KEY = "routing";
export const ROUTING_METAFIELD_TYPE = "json";

// --- Pure glue (unit-tested) ------------------------------------------------

/**
 * The minimal shape `flattenActiveRulesToRoutingRules` needs from an ACTIVE
 * template row: its metaobject handle plus its assignment rules. Structurally
 * matched by the Prisma select in `rebuildShopRouting` (Prisma's `AssignmentScope`
 * / `AssignmentMode` enum types ARE the string unions used here).
 */
export type ActiveTemplateForRouting = {
  shopifyMetaobjectHandle: string | null;
  assignments: Array<{
    scope: AssignmentScopeValue;
    scopeValue: string | null;
    mode: RoutingMode;
  }>;
};

/**
 * Flatten ACTIVE templates + their assignments into the flat `RoutingRule[]`
 * feature 40's builder consumes: each of a template's rules carries that
 * template's handle. A null handle becomes `""` — feature 40 skips blank-handle
 * rules (an unsynced template must not land a null pointer in the map), so we pass
 * them through rather than dropping here. Pure: never mutates the input.
 */
export function flattenActiveRulesToRoutingRules(
  templates: ActiveTemplateForRouting[],
): RoutingRule[] {
  const rules: RoutingRule[] = [];
  for (const template of templates) {
    const templateHandle = template.shopifyMetaobjectHandle ?? "";
    for (const assignment of template.assignments) {
      rules.push({
        scope: assignment.scope,
        scopeValue: assignment.scopeValue,
        mode: assignment.mode,
        templateHandle,
      });
    }
  }
  return rules;
}

/**
 * The `metafieldsSet` variables for the shop routing metafield: one metafield on
 * the shop (`ownerId`), reserved `$app` / `routing`, `json` type, value = the
 * projection stringified verbatim (keys already mirror the columns + the Liquid
 * contract; no reshape). Pure.
 */
export function buildRoutingMetafieldInput(
  shopGid: string,
  projection: RoutingProjection,
) {
  return {
    metafields: [
      {
        ownerId: shopGid,
        namespace: ROUTING_METAFIELD_NAMESPACE,
        key: ROUTING_METAFIELD_KEY,
        type: ROUTING_METAFIELD_TYPE,
        value: JSON.stringify(projection),
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrow a `metafieldsSet` response into the written metafield's GID, or an
 * error. Any `userErrors` entry, a missing metafield, or a malformed payload is a
 * failure — never a silent success (priority #2; feature 42 surfaces it).
 */
export function readMetafieldsSetResult(
  json: unknown,
): { ok: true; metafieldGid: string } | { ok: false; error: string } {
  if (!isRecord(json)) return { ok: false, error: "Malformed response" };
  const data = json.data;
  if (!isRecord(data)) return { ok: false, error: "Malformed response" };
  const payload = data.metafieldsSet;
  if (!isRecord(payload)) return { ok: false, error: "Malformed response" };

  const userErrors = payload.userErrors;
  if (Array.isArray(userErrors) && userErrors.length > 0) {
    const message = userErrors
      .map((e) => (isRecord(e) ? asString(e.message) : ""))
      .filter((m) => m !== "")
      .join("; ");
    return { ok: false, error: message || "metafieldsSet returned errors" };
  }

  const metafields = payload.metafields;
  if (!Array.isArray(metafields) || metafields.length === 0) {
    return { ok: false, error: "metafieldsSet returned no metafield" };
  }
  const first = metafields[0];
  const gid = isRecord(first) ? asString(first.id) : "";
  return gid
    ? { ok: true, metafieldGid: gid }
    : { ok: false, error: "metafieldsSet returned no metafield id" };
}

// --- GraphQL (validated @ 2025-10) ------------------------------------------

const SHOP_ID_QUERY = `#graphql
  query ShopId {
    shop {
      id
    }
  }`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation SetShopRouting($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

/** Read this shop's GID from the session-bound admin client. */
async function fetchShopGid(admin: AdminApiContext): Promise<string> {
  const response = await admin.graphql(SHOP_ID_QUERY);
  const json: unknown = await response.json();
  const gid =
    isRecord(json) && isRecord(json.data) && isRecord(json.data.shop)
      ? asString(json.data.shop.id)
      : "";
  if (!gid) {
    throw new Error("[routing] Could not resolve the shop GID");
  }
  return gid;
}

// --- Live orchestrator ------------------------------------------------------

/**
 * Rebuild and publish a shop's storefront routing. Reads the shop's ACTIVE
 * templates + assignments, projects them (feature 40), upserts the
 * `ShopStorefrontRouting` cache row, then writes the `$app:routing` shop metafield
 * and stamps the row's sync state. Returns the written metafield GID or an honest
 * error (the row is already persisted regardless — Postgres is the source of
 * truth). An empty ACTIVE set writes an empty map, which CLEARS the storefront.
 *
 * Not yet wired into activation — feature 42 calls this on activate / deactivate /
 * scope-edit.
 */
export async function rebuildShopRouting(
  admin: AdminApiContext,
  shopId: string,
): Promise<{ ok: true; metafieldGid: string } | { ok: false; error: string }> {
  // 1. Read the ACTIVE rules (shop-scoped) and project them.
  const templates = await prisma.template.findMany({
    where: { shopId, status: "ACTIVE" },
    select: {
      shopifyMetaobjectHandle: true,
      assignments: {
        select: { scope: true, scopeValue: true, mode: true },
      },
    },
  });
  const rules = flattenActiveRulesToRoutingRules(templates);
  const projection = buildRoutingProjection(rules);

  // 2. Persist the cache row FIRST (Postgres is the source of truth).
  const routingData = {
    defaultTemplateHandle: projection.defaultTemplateHandle,
    byType: projection.byType,
    byVendor: projection.byVendor,
    byCollection: projection.byCollection,
    byTag: projection.byTag,
    byProduct: projection.byProduct,
    excludedProductGids: projection.excludedProductGids,
  };
  await prisma.shopStorefrontRouting.upsert({
    where: { shopId },
    create: { shopId, ...routingData },
    update: routingData,
  });

  // 3. Write the delivery copy (shop metafield), then stamp sync state.
  try {
    const shopGid = await fetchShopGid(admin);
    const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: buildRoutingMetafieldInput(shopGid, projection),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `[routing] metafieldsSet failed (HTTP ${response.status})`,
      };
    }
    const json: unknown = await response.json();
    const result = readMetafieldsSetResult(json);
    if (!result.ok) return result;

    await prisma.shopStorefrontRouting.update({
      where: { shopId },
      data: {
        shopMetafieldGid: result.metafieldGid,
        syncedToShopifyAt: new Date(),
      },
    });
    return { ok: true, metafieldGid: result.metafieldGid };
  } catch (error) {
    console.error("[routing] shop routing metafield write failed", error);
    return {
      ok: false,
      error: "Saved routing, but couldn't publish it to your storefront.",
    };
  }
}
