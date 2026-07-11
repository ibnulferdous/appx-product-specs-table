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
import { upsertShop } from "../../models/shop.server";
import {
  createTemplateForShop,
  DEFAULT_TEMPLATE_NAME,
  deleteTemplateForShop,
  duplicateTemplateForShop,
  getTemplateByIdForShop,
  saveTemplateForShop,
} from "../../models/template.server";
import { deleteSpecTableMetaobject } from "../../shopify/metaobjects.server";
import { syncTemplateToMetaobject } from "../../shopify/templateSync.server";
import {
  activationBlockedMessage,
  evaluateActivationConflicts,
  shouldRebuildRoutingForScopeSave,
} from "../../shopify/assignmentActivation.server";
import { rebuildShopRouting } from "../../shopify/routing.server";
import {
  resolveScopeValueLabel,
  resolveScopeValueLabels,
} from "../../shopify/scopeResourceLabel.server";
import {
  clearTemplateScope,
  getExcludesForTemplate,
  getTemplateIncludeSelectors,
  setTemplateExcludes,
  setTemplateScope,
} from "../../models/assignment.server";
import { SCOPE_NONE } from "../../utils/assignmentScope";
import type { ScopeSelector } from "../../utils/assignmentOverlap";
import {
  parsePendingExcludes,
  parsePendingScope,
  reconcileExcludes,
  sameGidSet,
  selectorSetKey,
} from "./pendingAssignment";
import { createInitialRows } from "../../utils/rows";
import { parseRows } from "../../utils/rowsSerialize";
import { SpecTableEditor } from "./SpecTableEditor";
import { TemplateHeaderActions } from "./TemplateHeaderActions";
import { useRowEngine } from "./useRowEngine";

// The editor's assignment seed: the homogeneous INCLUDE scope kind + its value set
// with resolved display labels (feature 47). Shared shape between the loader return,
// the engine seed, and the SettingsTab picker.
type AssignmentSeed = {
  scope: string;
  values: { value: string; label: string }[];
};

// Build the assignment seed from a template's persisted INCLUDE selector SET
// (feature 47). The set is homogeneous in `scope` (guaranteed at the write
// boundary, feature 46): a PRODUCT/COLLECTION set gets its chip labels resolved in
// ONE batched query; a TYPE/VENDOR set carries its free-text value as its own label;
// ALL_PRODUCTS has no value; an empty set is "no assignment" (null → the picker
// opens on "None"). Never throws — label resolution is fail-soft.
async function buildAssignmentSeed(
  admin: AdminApiContext,
  selectors: ScopeSelector[],
): Promise<AssignmentSeed | null> {
  if (selectors.length === 0) return null;
  const scope = selectors[0].scope;

  if (scope === "ALL_PRODUCTS") return { scope, values: [] };

  if (scope === "PRODUCT" || scope === "COLLECTION") {
    const gids = selectors.map((selector) => selector.scopeValue as string);
    const labels = await resolveScopeValueLabels(admin, scope, gids);
    return {
      scope,
      values: gids.map((value) => ({
        value,
        label: labels.get(value) ?? value,
      })),
    };
  }

  // PRODUCT_TYPE / VENDOR: free-text, single-valued, value IS its own label.
  return {
    scope,
    values: selectors.map((selector) => ({
      value: selector.scopeValue as string,
      label: selector.scopeValue as string,
    })),
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // "new" is a safe sentinel: Template ids are server-generated cuids, so a real
  // template id can never equal the literal string "new". No DB hit — the editor
  // opens on a synthetic, in-memory starter scaffold (1 section + 5 blank rows);
  // the Postgres row is created on the first Save (create-on-first-save). See
  // `context/features/19-template-create-on-first-save.md`. A brand-new template
  // has no assignment yet.
  if (params.id === "new") {
    return {
      template: {
        id: "new",
        name: DEFAULT_TEMPLATE_NAME,
        status: TemplateStatus.DRAFT,
        rows: createInitialRows(),
      },
      assignment: null,
      excludes: [],
    };
  }

  const template = await getTemplateByIdForShop(shop.id, params.id);

  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  // The template's INCLUDE scope SET (features 44/46/47), shop-scoped. The set is
  // homogeneous in `scope` (the write boundary guarantees it): 0 rows (NONE), one
  // row for ALL_PRODUCTS/PRODUCT_TYPE/VENDOR, or 1..N rows for PRODUCT/COLLECTION.
  // For PRODUCT/COLLECTION we BATCH-resolve resource TITLEs (one query, not N) so
  // each chip is readable (falls back to the GID on a miss — never blank). null when
  // the set is empty → the picker opens on "None".
  const selectors = await getTemplateIncludeSelectors(shop.id, template.id);
  const assignment = await buildAssignmentSeed(admin, selectors);

  // The template's EXCLUDE carve-outs (feature 45), each resolved to its product
  // TITLE for a readable chip (fails soft to the GID — display only, never blocks
  // the load). Resolved concurrently; MVP exclude sets are small. Loaded even when
  // the scope isn't ALL_PRODUCTS (the UI hides the control, but the state must seed
  // cleanly so Discard/dirty round-trips work).
  const excludeGids = await getExcludesForTemplate(shop.id, template.id);
  const excludes = await Promise.all(
    excludeGids.map(async (gid) => ({
      gid,
      label: (await resolveScopeValueLabel(admin, "PRODUCT", gid)) ?? gid,
    })),
  );

  return { template, assignment, excludes };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  const payload = (await request.json()) as {
    rows?: unknown;
    name?: unknown;
    status?: unknown;
    scope?: unknown;
    scopeValue?: unknown;
    scopeValues?: unknown;
    excludes?: unknown;
    intent?: unknown;
  };

  // Create-on-first-save: the editor submits the seed + edits as JSON (the same
  // shape as an edit save), so the create branch reads JSON too — not FormData.
  // Lifecycle actions (duplicate/delete) are disabled on /new, so this branch
  // always creates regardless of intent.
  if (params.id === "new") {
    // Parse the pending scope SET (feature 44/46). A create-as-ACTIVE-with-scope
    // must be gated BEFORE anything is written (atomic block).
    const pending = parsePendingScope(payload);
    if (!pending.ok) {
      return { ok: false as const, error: pending.error };
    }
    const pendingExcludes = parsePendingExcludes(payload);
    if (!pendingExcludes.ok) {
      return { ok: false as const, error: pendingExcludes.error };
    }
    // Reconcile: a product this template INCLUDEs can't also be EXCLUDE'd (Decision C).
    const reconciledExcludes = reconcileExcludes(
      pendingExcludes.gids,
      pending.selectors,
    );
    const willBeActive = payload.status === "ACTIVE";
    if (willBeActive && pending.selectors.length > 0) {
      // The template doesn't exist yet, so it can't be in the comparison set. The
      // pending selector SET + carve-outs are passed explicitly so the gate reads
      // them, not a (nonexistent) rule.
      const gate = await evaluateActivationConflicts(
        admin,
        shop.id,
        "new",
        pending.selectors,
        reconciledExcludes,
      );
      if (!gate.ok) {
        return {
          ok: false as const,
          blocked: true as const,
          conflicts: gate.conflicts,
          error: activationBlockedMessage(gate.conflicts),
        };
      }
    }

    const result = await createTemplateForShop(shop.id, {
      name: payload.name,
      status: payload.status,
      rows: payload.rows,
    });

    if (!result.ok) {
      // Stay on /new; the editor toasts this error from the fetcher data.
      return { ok: false as const, error: result.error };
    }

    // Persist the scope rule SET on the freshly created template (feature 44/46).
    // The gate already cleared it; a write failure is best-effort (the next Save
    // resyncs), like the metaobject sync below.
    if (pending.selectors.length > 0) {
      await setTemplateScope(shop.id, result.data.id, pending.selectors);
    }

    // Persist the EXCLUDE carve-outs (feature 45), same best-effort posture.
    if (reconciledExcludes.length > 0) {
      await setTemplateExcludes(shop.id, result.data.id, reconciledExcludes);
    }

    // Best-effort storefront sync; the template is already durable in Postgres, so
    // a sync failure here does not block the redirect — the next Save resyncs.
    await syncTemplateToMetaobject(admin, shop, result.data);

    // A new ACTIVE template changes the shop's ACTIVE set → publish the routing map
    // so its scope lights up on the storefront (best-effort; Postgres is durable).
    if (willBeActive) {
      await rebuildShopRouting(admin, shop.id);
    }

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

  // Read the current status + persisted scope shop-scoped (priority #1) so the gate
  // and rebuild decisions are made against the durable state, not the payload.
  const existing = await getTemplateByIdForShop(shop.id, templateId);
  if (!existing) {
    return { ok: false as const, error: "Template not found" };
  }
  const currentStatus = existing.status;
  const wasActive = currentStatus === "ACTIVE";
  const willBeActive = payload.status === "ACTIVE";

  // Parse the pending scope SET (feature 44/46) and diff it against the persisted
  // set. `provided:false` means a caller that doesn't touch scope (leave it).
  const pending = parsePendingScope(payload);
  if (!pending.ok) {
    return { ok: false as const, error: pending.error };
  }
  const persistedSelectors = await getTemplateIncludeSelectors(
    shop.id,
    templateId,
  );
  const pendingSelectors: ScopeSelector[] = pending.provided
    ? pending.selectors
    : persistedSelectors;
  const scopeChanged =
    pending.provided &&
    selectorSetKey(pendingSelectors) !== selectorSetKey(persistedSelectors);

  // Parse + diff the pending EXCLUDE carve-outs against the persisted set (feature
  // 45). Then reconcile them against the pending INCLUDE PRODUCT set (Decision C):
  // a product the template now INCLUDEs can't also be EXCLUDE'd (byProduct beats the
  // exclude gate; a lingering exclude would fool the gate's exclude-subtraction).
  const pendingExcludes = parsePendingExcludes(payload);
  if (!pendingExcludes.ok) {
    return { ok: false as const, error: pendingExcludes.error };
  }
  const persistedExcludes = await getExcludesForTemplate(shop.id, templateId);
  const pendingExcludeGids = reconcileExcludes(
    pendingExcludes.provided ? pendingExcludes.gids : persistedExcludes,
    pendingSelectors,
  );
  const excludesChanged = !sameGidSet(pendingExcludeGids, persistedExcludes);

  // DRAFT→ACTIVE / ACTIVE-scope-edit dry-run gate (feature 42 generalized in 44,
  // extended for carve-outs in 45, multi-value in 46): run against the PENDING
  // selector SET + carve-outs BEFORE any write when the post-save template will be
  // ACTIVE and either it wasn't ACTIVE before, its scope set changed, OR its
  // carve-out set changed (removing a carve-out — or reconciling one away — can
  // re-create a conflict). On overlap, BLOCK atomically — write nothing; the
  // merchant's unsaved edits stay in client state (the SaveBar stays up). The gate
  // fails closed. An already-ACTIVE template with an unchanged scope set AND
  // carve-out set was validated when it went ACTIVE, so it is not re-gated.
  if (willBeActive && (!wasActive || scopeChanged || excludesChanged)) {
    const gate = await evaluateActivationConflicts(
      admin,
      shop.id,
      templateId,
      pendingSelectors,
      pendingExcludeGids,
    );
    if (!gate.ok) {
      return {
        ok: false as const,
        blocked: true as const,
        conflicts: gate.conflicts,
        error: activationBlockedMessage(gate.conflicts),
      };
    }
  }

  // Gate passed → persist. Write the SCOPE set FIRST (before the status/rows), so
  // an ACTIVE template's persisted scope is always the gate-checked one: if the
  // status write below then failed, the template would stay as it was, never
  // ACTIVE-with-an-ungated-scope (the disjoint-set invariant, priority #2). A DRAFT
  // scope edit persists here too (no gate — DRAFT may hold a conflict). An empty set
  // clears the rule; a non-empty set replaces it (and cleans contradictory EXCLUDEs).
  if (scopeChanged) {
    const scopeWrite =
      pendingSelectors.length === 0
        ? await clearTemplateScope(shop.id, templateId)
        : await setTemplateScope(shop.id, templateId, pendingSelectors);
    if (!scopeWrite.ok) {
      return {
        ok: false as const,
        error:
          "error" in scopeWrite
            ? scopeWrite.error
            : "Could not save assignment",
      };
    }
  }

  // Persist the EXCLUDE carve-outs (feature 45) alongside the scope, before the
  // status/rows write, same atomic-block rationale — the gate has already cleared
  // this pending set. A create-or-replace touching only EXCLUDE rows (the INCLUDE
  // scope written above survives). A DRAFT carve-out edit persists here too.
  if (excludesChanged) {
    const excludeWrite = await setTemplateExcludes(
      shop.id,
      templateId,
      pendingExcludeGids,
    );
    if (!excludeWrite.ok) {
      return { ok: false as const, error: excludeWrite.error };
    }
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

  // Rebuild + publish the shop routing map when the ACTIVE-set membership changed
  // (to/from ACTIVE) OR an ACTIVE template's scope/carve-out CONTENT changed
  // (features 44/45) — any of these alters the scope→handle map or its
  // `excludedProductGids`. A rows-only save (status + scope + excludes unchanged)
  // skips this fast path. Best-effort: the durable writes already landed; a routing
  // failure is surfaced, never rolled back.
  let routingError: string | undefined;
  if (
    shouldRebuildRoutingForScopeSave(
      wasActive,
      result.data.status === "ACTIVE",
      scopeChanged || excludesChanged,
    )
  ) {
    const routing = await rebuildShopRouting(admin, shop.id);
    if (!routing.ok) {
      routingError = routing.error;
    }
  }

  return {
    ok: true as const,
    status: result.data.status,
    syncError,
    roundTripOk,
    routingError,
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
  assignment,
  excludes,
  onDiscard,
}: {
  template: { id: string; name: string; status: TemplateStatus; rows: unknown };
  assignment: AssignmentSeed | null;
  excludes: Array<{ gid: string; label: string }>;
  onDiscard: () => void;
}) {
  const engine = useRowEngine({
    initialRows: parseRows(template.rows),
    initialName: template.name,
    initialStatus: template.status,
    // Seed the scope picker from the persisted rule SET (features 44/46/47); no rule
    // → "None" with an empty value set.
    initialScope: assignment?.scope ?? SCOPE_NONE,
    initialScopeValues: assignment?.values ?? [],
    // Seed the EXCLUDE carve-outs (feature 45); empty for a new/unassigned template.
    initialExcludes: excludes,
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
          up to TemplateEditorPage, onto this component). The scope picker rides the
          engine's Settings tab (feature 44). */}
      <SpecTableEditor engine={engine} />
    </s-page>
  );
}

export default function TemplateEditorPage() {
  const { template, assignment, excludes } = useLoaderData<typeof loader>();

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
      assignment={assignment}
      excludes={excludes}
      onDiscard={() => setEditorNonce((nonce) => nonce + 1)}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
