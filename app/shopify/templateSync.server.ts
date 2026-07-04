// Sync a template's storefront delivery copy to its app-owned Shopify metaobject
// (Editor Step 9.5). Extracted from `app.templates_.$id/route.tsx` (feature 36) so
// BOTH the editor Save action AND the templates-list "Change status" action can run
// the identical persist→sync→round-trip-check path — a shared module keeps the two
// surfaces from drifting (data-model.md §8/§10: the storefront gates visibility on
// the metaobject's `status` field, so any status change that can leave/enter ACTIVE
// MUST re-sync the metaobject, or an ex-ACTIVE template keeps rendering).
//
// This is `.server.ts` because it depends on the Admin API client and the Prisma
// write (`setTemplateMetaobjectRef`) — never pulled into the client bundle.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { TemplateStatus } from "@prisma/client";
import { setTemplateMetaobjectRef } from "../models/template.server";
import { parseRows } from "../utils/rowsSerialize";
import {
  readSpecTableMetaobjectRows,
  upsertSpecTableMetaobject,
} from "./metaobjects.server";

/**
 * Sync a template's storefront delivery copy to its app-owned Shopify metaobject,
 * returning the outcome for the caller to surface. Runs AFTER the durable Postgres
 * write — Postgres is the source of truth, so a failure here warns but never loses
 * the saved data. Behavior is identical to the former inline `route.tsx` helper.
 *
 * `syncError` is a merchant-facing warning string (or null on success);
 * `roundTripOk` reports whether the metaobject read-back matched what we wrote (or
 * null when the sync threw before the read).
 */
export async function syncTemplateToMetaobject(
  admin: AdminApiContext,
  shop: { id: string },
  template: { id: string; status: TemplateStatus; rows: unknown },
): Promise<{ syncError: string | null; roundTripOk: boolean | null }> {
  let syncError: string | null = null;
  let roundTripOk: boolean | null = null;
  try {
    // The `$app:appx_spec_table` metaobject definition is declared in
    // shopify.app.toml and distributed on deploy/install, so we only upsert the
    // ENTRY here — no runtime definition create (data-model.md §10).
    const savedRows = parseRows(template.rows);
    const { gid, handle } = await upsertSpecTableMetaobject(admin, {
      templateId: template.id,
      status: template.status,
      rows: savedRows,
      updatedAt: new Date().toISOString(),
    });
    await setTemplateMetaobjectRef(shop.id, template.id, gid, handle);

    const readback = await readSpecTableMetaobjectRows(admin, template.id);
    roundTripOk =
      readback !== null &&
      JSON.stringify(readback) === JSON.stringify(savedRows);
  } catch (error) {
    console.error("[template sync] metaobject sync failed", error);
    syncError =
      "Saved, but we couldn't update your storefront. Please save again.";
  }
  return { syncError, roundTripOk };
}
