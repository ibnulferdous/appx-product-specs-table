import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useLoaderData, useSearchParams } from "react-router";
import { TemplateStatus } from "@prisma/client";
import {
  boundary,
  type AdminApiContext,
} from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../../shopify.server";
import {
  setShopMetaobjectDefinitionGid,
  upsertShop,
} from "../../models/shop.server";
import {
  createTemplateForShop,
  DEFAULT_TEMPLATE_NAME,
  deleteTemplateForShop,
  duplicateTemplateForShop,
  getTemplateByIdForShop,
  saveTemplateForShop,
  setTemplateMetaobjectRef,
} from "../../models/template.server";
import {
  deleteSpecTableMetaobject,
  ensureSpecTableDefinition,
  readSpecTableMetaobjectRows,
  upsertSpecTableMetaobject,
} from "../../shopify/metaobjects.server";
import { createInitialRows } from "../../utils/rows";
import { parseRows } from "../../utils/rowsSerialize";
import { SpecTableEditor } from "./SpecTableEditor";
import { TemplateHeaderActions } from "./TemplateHeaderActions";
import { useRowEngine } from "./useRowEngine";

/**
 * Sync a template's storefront delivery copy to its app-owned Shopify metaobject
 * (Editor Step 9.5), returning the outcome for the caller to surface. Runs AFTER
 * the durable Postgres write — Postgres is the source of truth, so a failure here
 * warns but never loses the saved rows. Shared by the create and the save action
 * branches so both persist → sync → round-trip-check identically; extracting it
 * is behavior-preserving for the existing save path.
 */
async function syncTemplateToMetaobject(
  admin: AdminApiContext,
  shop: { id: string; metaobjectDefinitionGid: string | null },
  template: { id: string; status: TemplateStatus; rows: unknown },
): Promise<{ syncError: string | null; roundTripOk: boolean | null }> {
  let syncError: string | null = null;
  let roundTripOk: boolean | null = null;
  try {
    const definitionGid = await ensureSpecTableDefinition(
      admin,
      shop.metaobjectDefinitionGid,
    );
    if (definitionGid !== shop.metaobjectDefinitionGid) {
      await setShopMetaobjectDefinitionGid(shop.id, definitionGid);
    }

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
    console.error("[template save] metaobject sync failed", error);
    syncError =
      "Saved to the database, but storefront sync failed. Try saving again.";
  }
  return { syncError, roundTripOk };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // "new" is a safe sentinel: Template ids are server-generated cuids, so a real
  // template id can never equal the literal string "new". No DB hit — the editor
  // opens on a synthetic, in-memory starter scaffold (1 section + 5 blank rows);
  // the Postgres row is created on the first Save (create-on-first-save). See
  // `context/features/19-template-create-on-first-save.md`.
  if (params.id === "new") {
    return {
      template: {
        id: "new",
        name: DEFAULT_TEMPLATE_NAME,
        status: TemplateStatus.DRAFT,
        rows: createInitialRows(),
      },
    };
  }

  const template = await getTemplateByIdForShop(shop.id, params.id);

  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  return { template };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  const payload = (await request.json()) as {
    rows?: unknown;
    name?: unknown;
    status?: unknown;
    intent?: unknown;
  };

  // Create-on-first-save: the editor submits the seed + edits as JSON (the same
  // shape as an edit save), so the create branch reads JSON too — not FormData.
  // Lifecycle actions (duplicate/delete) are disabled on /new, so this branch
  // always creates regardless of intent.
  if (params.id === "new") {
    const result = await createTemplateForShop(shop.id, {
      name: payload.name,
      status: payload.status,
      rows: payload.rows,
    });

    if (!result.ok) {
      // Stay on /new; the editor toasts this error from the fetcher data.
      return { ok: false as const, error: result.error };
    }

    // Best-effort storefront sync; the template is already durable in Postgres
    // (and defaults to DRAFT, which the storefront does not render), so a sync
    // failure here does not block the redirect — the next Save resyncs.
    await syncTemplateToMetaobject(admin, shop, result.data);

    // The editor's saveFetcher follows this redirect and remounts at the real id
    // in normal (edit) mode; ?created=1 drives the one-time landing toast.
    return redirect(`/app/templates/${result.data.id}?created=1`);
  }

  const templateId = params.id as string;

  // Duplicate (feature 20): clone the SAVED template (DRAFT, fresh row ids) and
  // navigate to the copy's editor. The duplicateFetcher follows this redirect, the
  // same mechanism the create flow uses. No metaobject sync — the copy is DRAFT.
  if (payload.intent === "duplicate") {
    const result = await duplicateTemplateForShop(shop.id, templateId);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return redirect(`/app/templates/${result.data.id}?duplicated=1`);
  }

  // Delete (feature 20): remove the storefront metaobject FIRST (best-effort) so
  // it can't outlive its template (priority #2), THEN delete the durable Postgres
  // row, then navigate to the list. Reads the owned template shop-scoped first for
  // the metaobject GID; a cross-shop/unknown id reads nothing and is a clean
  // redirect (deleteMany is a no-op for it anyway — priority #1).
  if (payload.intent === "delete") {
    const existing = await getTemplateByIdForShop(shop.id, templateId);
    if (existing) {
      await deleteSpecTableMetaobject(admin, {
        gid: existing.shopifyMetaobjectGid,
        templateId: existing.id,
      });
      await deleteTemplateForShop(shop.id, templateId);
    }
    return redirect("/app/templates");
  }

  // Editing an existing template: persist to Postgres (the source of truth).
  // Shop isolation, the 200-row cap, per-row validation, and key finalization are
  // all enforced server-side inside saveTemplateForShop.
  const result = await saveTemplateForShop(shop.id, templateId, payload);
  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  // Sync the storefront delivery copy to the app-owned metaobject. This runs
  // AFTER the durable Postgres write; a failure warns but never loses the rows.
  const { syncError, roundTripOk } = await syncTemplateToMetaobject(
    admin,
    shop,
    result.data,
  );

  return {
    ok: true as const,
    status: result.data.status,
    syncError,
    roundTripOk,
  };
};

// The page-level engine owner (feature 20). It calls `useRowEngine` so the
// `<s-page>` header — the status badge, the More-actions menu, and the lifecycle
// modals (all rendered ABOVE the editor's inert freeze) — reads the SAME
// saving/dirty/name state the editor body does, and the heading binds to the live
// `engine.name` so a rename updates the H1 immediately (and Discard reverts it).
// Remounted by its parent's key on a discard (nonce bump) and on the
// create-on-first-save id change, which reseeds the engine from the persisted
// rows/name/status — preserving the reshell's "no reducer reset action" decision.
function TemplateOverview({
  template,
  onDiscard,
}: {
  template: { id: string; name: string; status: TemplateStatus; rows: unknown };
  onDiscard: () => void;
}) {
  const engine = useRowEngine({
    initialRows: parseRows(template.rows),
    initialName: template.name,
    initialStatus: template.status,
    // The "new" sentinel id (loader) marks a never-saved template; the engine uses
    // it to gate the file-23 first-paste scaffold replace. A real cuid is never
    // "new", and the create-on-first-save remount reseeds this to false.
    isNew: template.id === "new",
    onDiscard,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();

  // After create-on-first-save (?created=1) or duplicate (?duplicated=1) redirects
  // here, toast once and strip the param so a refresh or back/forward navigation
  // does not re-toast. Idempotent across the discard remount: the param is already
  // gone by then.
  useEffect(() => {
    const created = searchParams.get("created") === "1";
    const duplicated = searchParams.get("duplicated") === "1";
    if (!created && !duplicated) return;
    shopify.toast.show(created ? "Template created" : "Template duplicated");
    const next = new URLSearchParams(searchParams);
    next.delete("created");
    next.delete("duplicated");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, shopify]);

  return (
    <s-page heading={engine.name}>
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      {/* Status badge + More-actions menu + lifecycle modals. Direct children of
          <s-page> (via slot=…) so they portal into the page header, above the
          editor's freeze wrapper. */}
      <TemplateHeaderActions engine={engine} template={template} />
      {/* The editor is a full-bleed mockup card (its own EditorShell), not wrapped
          in <s-section heading="Rows"> — the reshell A2 locked decision. It now
          takes the shared engine as a prop (the engine lift moved the remount key
          up to TemplateEditorPage, onto this component). */}
      <SpecTableEditor engine={engine} />
    </s-page>
  );
}

export default function TemplateEditorPage() {
  const { template } = useLoaderData<typeof loader>();

  // Bumped to remount the engine owner (TemplateOverview) — resetting its reducer
  // to the persisted rows and reseeding name/status — when the merchant discards
  // unsaved changes; no reducer reset action needed.
  const [editorNonce, setEditorNonce] = useState(0);

  // The key carries BOTH the template id and the editorNonce:
  //   - the id forces a remount when create-on-first-save redirects from the "new"
  //     sentinel to the real cuid (same route, only the param changes, so React
  //     would otherwise reuse the instance and keep the seed rows + stale dirty
  //     baseline — leaving "Unsaved changes" up after the create save); remounting
  //     reseeds the engine from the persisted rows so the SaveBar correctly closes;
  //   - the nonce remounts it (resetting to the persisted state) on Discard.
  // Both "new" (a synthetic seeded scaffold) and an existing template render the
  // same page; the create-vs-update split lives entirely in the action.
  return (
    <TemplateOverview
      key={`${template.id}:${editorNonce}`}
      template={template}
      onDiscard={() => setEditorNonce((nonce) => nonce + 1)}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
