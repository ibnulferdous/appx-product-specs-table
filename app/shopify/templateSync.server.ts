// Sync a template's storefront delivery copy to its app-owned Shopify metaobject (Editor Step 9.5).
// Extracted from `app.templates_.$id/route.tsx` (feature 36) so BOTH the editor Save action AND the
// list "Change status" action run the identical persist→sync→round-trip-check path, keeping the two
// surfaces from drifting (data-model.md §8/§10: the storefront gates visibility on the metaobject's
// `status` field, so any status change that can leave/enter ACTIVE MUST re-sync).
//
// `.server.ts` because it depends on the Admin API client and the Prisma write.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { TemplateStatus } from "@prisma/client";
import { setTemplateMetaobjectRef } from "../models/template.server";
import { parseRows } from "../utils/rowsSerialize";
import { parseStylingValues } from "../utils/tableStyling";
import { upsertSpecTableMetaobject } from "./metaobjects.server";

/**
 * Sync a template's storefront delivery copy to its metaobject, returning the outcome for the
 * caller to surface. Runs AFTER the durable Postgres write — Postgres is the source of truth, so a
 * failure here warns but never loses saved data. `syncError` is a merchant-facing warning (or null).
 *
 * The upsert's `userErrors` (surfaced as a throw by `upsertSpecTableMetaobject`) is the failure
 * signal. We deliberately do NOT read the metaobject back to verify — Postgres is the source of
 * truth, the read-back was never surfaced to the merchant, and the extra round-trip doubled every
 * save's sync latency (and could turn a good save into a false warning). A dropped write self-heals
 * on the next Save.
 *
 * `template.styling` (feature 57 Step 7) is the PERSISTED `TableStyling` row — `unknown` because it
 * arrives straight from Prisma (or null when the template never touched the Style tab), resolved
 * here by the same tolerant `parseStylingValues` the loader uses. REQUIRED on purpose: every sync
 * REPLACES the metaobject's styling fields, so a caller that forgot to load the relation would
 * silently reset a merchant's live table on the next status flip — making it required turns that
 * hazard into a compile error.
 */
export async function syncTemplateToMetaobject(
  admin: AdminApiContext,
  shop: { id: string },
  template: {
    id: string;
    status: TemplateStatus;
    rows: unknown;
    styling: unknown;
  },
): Promise<{ syncError: string | null }> {
  let syncError: string | null = null;
  try {
    // The `$app:appx_spec_table` definition is declared in shopify.app.toml and distributed on
    // deploy/install, so we only upsert the ENTRY here — no runtime definition create (§10).
    const savedRows = parseRows(template.rows);
    const { gid, handle } = await upsertSpecTableMetaobject(admin, {
      templateId: template.id,
      status: template.status,
      rows: savedRows,
      // Tolerant by contract: a null relation (no Style-tab save) and a malformed stored row both
      // resolve to defaults rather than throwing, so a bad styling blob can't block the rows.
      styling: parseStylingValues(template.styling),
      updatedAt: new Date().toISOString(),
    });
    await setTemplateMetaobjectRef(shop.id, template.id, gid, handle);
  } catch (error) {
    console.error("[template sync] metaobject sync failed", error);
    syncError =
      "Saved, but we couldn't update your storefront. Please save again.";
  }
  return { syncError };
}
