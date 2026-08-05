// Shop routing metafield writer (feature 41) — makes the routing projection real
// on Shopify. Reads a shop's ACTIVE assignment rules, folds them through feature
// 40's pure `buildRoutingProjection`, persists the `ShopStorefrontRouting` cache
// row (Postgres = source of truth), then `metafieldsSet`s the shop-level
// `$app:routing` json metafield (the delivery copy Liquid reads, feature 43).
//
// ROUTING SHARDS (Option 2, feature 108). The two UNBOUNDED per-product maps
// (byProduct/excluded) are ALSO written out to per-bucket `$app:appx_routing_shard`
// metaobjects, reconciled by content hash against the `shardState` ledger so a
// rebuild rewrites only the buckets that changed (D5). ⚠️ Until the Unit D wire
// flip, the shop metafield above STILL carries byProduct/excluded (v2), so the
// storefront reads that and the shards are written-but-unread — a harmless
// transitional double-write (pure shard logic: `app/utils/routingShards.ts`).
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
  compactRoutingForDelivery,
  type RoutingMode,
  type RoutingRule,
  type RoutingProjection,
} from "../utils/routingProjection";
import {
  buildShardPayloads,
  diffShards,
  shardFieldValues,
  ROUTING_SHARD_TYPE,
  type ShardPayload,
} from "../utils/routingShards";
import { readUpsertResult, readUserErrors } from "./metaobjects.server";
import {
  measurePayload,
  countRoutingEntries,
  type PayloadBudget,
} from "../utils/routingBudget";

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
 * projection COMPACTED to the delivery wire (`compactRoutingForDelivery`, Option 1).
 * The compaction is the ~4× byte down-payment against the 128KB `json` ceiling
 * (data-model.md §14); the storefront reader `spec-table-resolve.liquid` decodes the
 * same shape. Postgres still stores the un-compacted projection — this reshape is
 * delivery-only. Pure.
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
        value: JSON.stringify(compactRoutingForDelivery(projection)),
      },
    ],
  };
}

/**
 * Measure the routing payload against the `json` metafield ceiling and log when it
 * is at or over budget (step 104, `data-model.md` §14).
 *
 * 🚫 OBSERVES ONLY — it must never gate the write, and the caller must never
 * branch on its result. Refusing, truncating, or surfacing a merchant-facing
 * error at the ceiling is **step 105's** decision; 104 exists to produce the
 * number that decision needs. `routing.test.ts` pins this with a test that an
 * over-budget projection still reaches `metafieldsSet` (104 §D1).
 *
 * ⚠️ Takes the SERIALIZED string, not the projection, so it measures the exact
 * bytes the mutation sends rather than a re-serialization that could drift from
 * it (104 §D2). The caller passes the value it already built.
 *
 * The ceiling is currently DORMANT: the runtime Admin client is
 * `ApiVersion.October25`, i.e. pre-2026-04, so writes still sit at the legacy 2MB
 * limit. `app/shopify.server.test.ts` is the tripwire that fires when that moves.
 */
function reportRoutingBudget(
  serialized: string,
  projection: RoutingProjection,
): PayloadBudget {
  const budget = measurePayload(serialized);
  if (budget.level !== "ok") {
    const counts = countRoutingEntries(projection);
    // Wire v3 (feature 108): the shop metafield carries only the BROAD tiers, so this
    // shop-budget line names only those. `byProduct` / `excluded` moved to per-bucket
    // shards, each with its own 128KB budget (data-model.md §14) — they no longer
    // contribute a byte to `serialized`, so listing them here would misattribute the
    // payload. `countRoutingEntries` still returns those counts for the shard budget.
    const broad = counts.byType + counts.byVendor + counts.byCollection;
    console.warn(
      `[routing] storefront routing payload is ${budget.level} budget: ` +
        `${budget.bytes} / ${budget.limit} bytes ` +
        `(${Math.round(budget.ratio * 100)}%, ${budget.remaining} remaining). ` +
        `Broad entries: ${broad} total — ` +
        `byType ${counts.byType}, byVendor ${counts.byVendor}, ` +
        `byCollection ${counts.byCollection}. ` +
        `See data-model.md §14.`,
    );
  }
  return budget;
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

// Routing SHARD upsert (Option 2, feature 108). The SAME validated `metaobjectUpsert`
// shape as `upsertSpecTableMetaobject` (metaobjects.server.ts, validated @ 2025-10) —
// only the target type + fields differ, so it is already covered by that validation.
// Upsert-by-handle so a rebuild is idempotent and needs no stored per-shard GID (D5).
const ROUTING_SHARD_UPSERT_MUTATION = `#graphql
  mutation UpsertRoutingShard($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
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

/**
 * Resolve this shop's GID, preferring the value cached on the `Shop` row so a
 * routing rebuild costs zero Admin round-trips for the GID after the first time.
 * The GID is stable for the life of a shop, so a `{ shop { id } }` query on every
 * rebuild was pure waste. On a cache MISS (a shop that has never rebuilt routing)
 * we fetch it once via the Admin API and write it back — best-effort, so a failed
 * cache write never turns a good routing publish into an error; the next rebuild
 * simply re-fetches. Reading the miss path costs one cheap Postgres round-trip in
 * exchange for removing a Shopify round-trip from every subsequent rebuild.
 */
async function resolveShopGid(
  admin: AdminApiContext,
  shopId: string,
): Promise<string> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { shopGid: true },
  });
  if (shop?.shopGid) return shop.shopGid;

  const gid = await fetchShopGid(admin);
  try {
    await prisma.shop.update({ where: { id: shopId }, data: { shopGid: gid } });
  } catch (error) {
    // A cache-write failure is not a publish failure — log and carry the fetched
    // GID through so this rebuild still completes.
    console.error("[routing] failed to cache shop GID", error);
  }
  return gid;
}

// --- Routing shard delivery (Option 2, feature 108) -------------------------

/** Coerce the persisted `shardState` json (bucketKey -> content hash) into a clean
 *  string->string map, dropping any non-string value defensively. */
function coerceShardHashes(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, hash] of Object.entries(value)) {
    if (typeof hash === "string") out[key] = hash;
  }
  return out;
}

/** The three metaobject field entries for a shard payload (snake_case field keys the
 *  storefront reads: `by_product` / `excluded` / `wire_version`). */
function shardFieldEntries(
  payload: ShardPayload,
): Array<{ key: string; value: string }> {
  const fields = shardFieldValues(payload);
  return [
    { key: "by_product", value: fields.by_product },
    { key: "excluded", value: fields.excluded },
    { key: "wire_version", value: fields.wire_version },
  ];
}

// The field entries that empty a shard (both maps `{}`) — a cleared bucket reads as a
// miss and falls through to the broad tiers (D5). Computed once; the value is constant.
const EMPTY_SHARD_FIELDS = shardFieldEntries({ byProduct: {}, excluded: {} });

/**
 * Upsert one routing shard metaobject by handle. Returns true on a confirmed write,
 * false on ANY failure (HTTP, userErrors, malformed) — never throws, so one shard's
 * failure cannot abort the reconciliation of the rest. Logs on failure.
 */
async function upsertRoutingShard(
  admin: AdminApiContext,
  handle: string,
  fields: Array<{ key: string; value: string }>,
): Promise<boolean> {
  try {
    const response = await admin.graphql(ROUTING_SHARD_UPSERT_MUTATION, {
      variables: {
        handle: { type: ROUTING_SHARD_TYPE, handle },
        metaobject: { fields },
      },
    });
    if (!response.ok) {
      console.error(
        `[routing] shard ${handle} write failed (HTTP ${response.status})`,
      );
      return false;
    }
    const json: unknown = await response.json();
    if (readUpsertResult(json)) return true;
    const errors = isRecord(json)
      ? readUserErrors(isRecord(json.data) ? json.data.metaobjectUpsert : null)
      : [];
    console.error(
      `[routing] shard ${handle} write reported errors${
        errors.length ? `: ${errors.join("; ")}` : ""
      }`,
    );
    return false;
  } catch (error) {
    console.error(`[routing] shard ${handle} write threw`, error);
    return false;
  }
}

/**
 * Reconcile the shop's routing shards against the projection (D5). Splits the
 * per-product maps into per-bucket payloads, diffs them against the stored hash
 * ledger, and upserts ONLY the buckets that changed (a status toggle that leaves
 * per-product assignments untouched writes zero shards); buckets that emptied are
 * upserted to `{}` rather than deleted. Returns the NEW ledger (built from the write
 * outcomes — a failed shard keeps its old hash so the next rebuild retries it),
 * whether every write succeeded, and whether anything changed at all (so the caller
 * skips a no-op Postgres stamp). Never throws.
 */
async function reconcileRoutingShards(
  admin: AdminApiContext,
  projection: RoutingProjection,
  storedHashes: Record<string, string>,
): Promise<{
  shardState: Record<string, string>;
  allOk: boolean;
  changed: boolean;
}> {
  const desired = buildShardPayloads(projection);
  const { upsert, empty } = diffShards(desired, storedHashes);

  const shardState: Record<string, string> = { ...storedHashes };
  let allOk = true;
  let changed = false;

  for (const shard of upsert) {
    const ok = await upsertRoutingShard(
      admin,
      shard.handle,
      shardFieldEntries(shard.payload),
    );
    if (ok) {
      shardState[String(shard.bucketKey)] = shard.hash;
      changed = true;
    } else {
      allOk = false;
    }
  }

  for (const shard of empty) {
    const ok = await upsertRoutingShard(
      admin,
      shard.handle,
      EMPTY_SHARD_FIELDS,
    );
    if (ok) {
      delete shardState[String(shard.bucketKey)];
      changed = true;
    } else {
      allOk = false;
    }
  }

  return { shardState, allOk, changed };
}

/**
 * Write the shop routing metafield (broad tiers). Resolves the shop GID (cached),
 * measures the payload (observe-only), issues `metafieldsSet`, and narrows the result.
 * Returns the metafield GID or an honest, merchant-facing error — never throws.
 */
async function writeRoutingMetafield(
  admin: AdminApiContext,
  shopId: string,
  projection: RoutingProjection,
): Promise<{ ok: true; metafieldGid: string } | { ok: false; error: string }> {
  try {
    const shopGid = await resolveShopGid(admin, shopId);
    const variables = buildRoutingMetafieldInput(shopGid, projection);
    // Measure the exact value we are about to send (104 §D2). Observation only —
    // the write proceeds at any size; see `reportRoutingBudget`.
    reportRoutingBudget(variables.metafields[0].value, projection);
    const response = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `[routing] metafieldsSet failed (HTTP ${response.status})`,
      };
    }
    const json: unknown = await response.json();
    return readMetafieldsSetResult(json);
  } catch (error) {
    console.error("[routing] shop routing metafield write failed", error);
    return {
      ok: false,
      error: "Saved routing, but couldn't publish it to your storefront.",
    };
  }
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

  // 2. Persist the cache row FIRST (Postgres is the source of truth). Capture the
  //    row: the upsert leaves `shardState` untouched, so the returned value is the
  //    PRE-rebuild shard ledger we diff against below.
  const routingData = {
    defaultTemplateHandle: projection.defaultTemplateHandle,
    byType: projection.byType,
    byVendor: projection.byVendor,
    byCollection: projection.byCollection,
    byTag: projection.byTag,
    byProduct: projection.byProduct,
    excludedProductGids: projection.excludedProductGids,
  };
  const routingRow = await prisma.shopStorefrontRouting.upsert({
    where: { shopId },
    create: { shopId, ...routingData },
    update: routingData,
  });
  const storedHashes = coerceShardHashes(
    (routingRow as { shardState?: unknown }).shardState,
  );

  // 3. Reconcile the per-product SHARDS (feature 108). Delivery-only, independent of
  //    the shop GID. ⚠️ TRANSITIONAL (Unit C): the shop metafield in step 4 still
  //    carries byProduct/excluded (v2 wire), so the storefront reads THAT and these
  //    shards are written-but-unread until the Unit D wire flip. Writing them now
  //    keeps Unit D a pure reader change and lets the writer be verified on its own.
  const shards = await reconcileRoutingShards(admin, projection, storedHashes);

  // 4. Write the delivery copy (shop metafield, broad tiers; still v2 until Unit D).
  const metafield = await writeRoutingMetafield(admin, shopId, projection);

  // 5. Stamp outcomes in ONE update — but only when something actually changed. An
  //    unchanged rebuild whose metafield write failed writes nothing (the pre-shard
  //    contract). `shardState` is stamped from the write OUTCOMES, so a failed shard
  //    keeps its old hash and is retried next rebuild; `syncedToShopifyAt` is stamped
  //    only on FULL success (metafield + every shard), so a partial failure is honest.
  if (metafield.ok || shards.changed) {
    const data: Record<string, unknown> = {};
    if (shards.changed) data.shardState = shards.shardState;
    if (metafield.ok) data.shopMetafieldGid = metafield.metafieldGid;
    if (metafield.ok && shards.allOk) data.syncedToShopifyAt = new Date();
    try {
      await prisma.shopStorefrontRouting.update({ where: { shopId }, data });
    } catch (error) {
      console.error("[routing] failed to stamp routing sync state", error);
      return {
        ok: false,
        error: "Saved routing, but couldn't publish it to your storefront.",
      };
    }
  }

  if (metafield.ok && shards.allOk) {
    return { ok: true, metafieldGid: metafield.metafieldGid };
  }
  return {
    ok: false,
    error: metafield.ok
      ? "Saved routing, but couldn't publish it to your storefront."
      : metafield.error,
  };
}
