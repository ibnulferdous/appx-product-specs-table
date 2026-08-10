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
import { resolveScopeResourceDetails } from "../../shopify/scopeResourceLabel.server";
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
import {
  normalizeStylePresetStamp,
  resolveGalleryParams,
} from "../../utils/stylePresets";
import {
  parseStylingValues,
  type StylingValues,
} from "../../utils/tableStyling";
import { buildAdminAppBase } from "../../utils/adminAppLink";
import { SpecTableEditor } from "./SpecTableEditor";
import { TemplateHeaderActions } from "./TemplateHeaderActions";
import { useRowEngine } from "./useRowEngine";

// The editor's assignment seed: the homogeneous INCLUDE scope kind + its value set with resolved
// display details (feature 47). Shared shape between the loader return, the engine seed, and the
// SettingsTab picker. `image` is null for free-text scopes (TYPE/VENDOR) and on any resolution miss.
type AssignmentSeed = {
  scope: string;
  values: { value: string; label: string; image: string | null }[];
};

// Build the assignment seed from a template's persisted INCLUDE selector SET (feature 47). The set
// is homogeneous in `scope` (guaranteed at the write boundary, feature 46): PRODUCT/COLLECTION gets
// its chip labels resolved in ONE batched query; TYPE/VENDOR carries its free-text value as its own
// label; ALL_PRODUCTS has no value; an empty set is "no assignment" (null → picker opens on "None").
// Never throws — label resolution is fail-soft.
async function buildAssignmentSeed(
  admin: AdminApiContext,
  selectors: ScopeSelector[],
): Promise<AssignmentSeed | null> {
  if (selectors.length === 0) return null;
  const scope = selectors[0].scope;

  if (scope === "ALL_PRODUCTS") return { scope, values: [] };

  if (scope === "PRODUCT" || scope === "COLLECTION") {
    const gids = selectors.map((selector) => selector.scopeValue as string);
    const details = await resolveScopeResourceDetails(admin, scope, gids);
    return {
      scope,
      values: gids.map((value) => {
        const detail = details.get(value);
        return {
          value,
          label: detail?.label ?? value,
          image: detail?.image ?? null,
        };
      }),
    };
  }

  // PRODUCT_TYPE / VENDOR: free-text, single-valued, value IS its own label, no image.
  return {
    scope,
    values: selectors.map((selector) => ({
      value: selector.scopeValue as string,
      label: selector.scopeValue as string,
      image: null,
    })),
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // Admin deep-link base for the Settings tab's conflict banner (links the colliding template).
  // Returned on BOTH branches — a never-saved template can be blocked by the gate too. See
  // `adminAppLink.ts` for why an in-app link must be built this way.
  const adminAppBase = buildAdminAppBase(
    session.shop,
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_API_KEY || "",
  );

  // "new" is a safe sentinel: template ids are server-generated cuids, so a real id can never equal
  // "new". No DB hit — the editor opens on a synthetic in-memory starter scaffold; the Postgres row
  // is created on the first Save (create-on-first-save, feature 19). A new template has no assignment.
  if (params.id === "new") {
    // Feature 88 step 92 — the gallery's choice, applied SERVER-SIDE before the engine mounts. Each
    // card links at `?style=<id>`; this resolves that param to the styling the scaffold opens with AND
    // the provenance stamp, from one lookup so the two can't disagree.
    //
    // 🔴 The read is INSIDE this branch and the branch returns. `/app/templates/<real-id>?style=classic`
    // must be inert: seeding a SAVED template from a URL would hand the editor values not in Postgres,
    // and the next Save would write them plus an unearned stamp. Structurally impossible here; pinned
    // by `createFlowContract.test.ts`. Anything unrecognized degrades to theme defaults with a null
    // stamp (the "Blank" card's landing). Nothing is written — the scaffold is in-memory until Save.
    const { styling, basedOnPreset } = resolveGalleryParams(
      new URL(request.url).searchParams,
    );

    return {
      template: {
        id: "new",
        name: DEFAULT_TEMPLATE_NAME,
        status: TemplateStatus.DRAFT,
        rows: createInitialRows(),
      },
      assignment: null,
      excludes: [],
      // A never-saved template has no styling row; defaults unless the gallery seeded a pattern.
      styling,
      // `null` on a bare /new — and with the gallery unskippable, that null means "chose Blank".
      basedOnPreset,
      adminAppBase,
    };
  }

  const template = await getTemplateByIdForShop(shop.id, params.id);

  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  // The template's INCLUDE scope SET (features 44/46/47), shop-scoped and homogeneous in `scope`. For
  // PRODUCT/COLLECTION we BATCH-resolve resource TITLEs (one query, not N) so each chip is readable
  // (falls back to the GID on a miss). null when the set is empty → the picker opens on "None".
  const selectors = await getTemplateIncludeSelectors(shop.id, template.id);
  const assignment = await buildAssignmentSeed(admin, selectors);

  // The template's EXCLUDE carve-outs (feature 45), each resolved to its product TITLE + thumbnail for
  // a rich chip (feature 47; fails soft to the GID, never blocks the load). One batched query for the
  // whole set. Loaded even when the scope isn't ALL_PRODUCTS (the UI hides the control, but the state
  // must seed cleanly so Discard/dirty round-trips work).
  const excludeGids = await getExcludesForTemplate(shop.id, template.id);
  const excludeDetails = await resolveScopeResourceDetails(
    admin,
    "PRODUCT",
    excludeGids,
  );
  const excludes = excludeGids.map((gid) => {
    const detail = excludeDetails.get(gid);
    return {
      gid,
      label: detail?.label ?? gid,
      image: detail?.image ?? null,
    };
  });

  // Feature 57 Step 4: the DB columns are decoded to the client's one styling vocabulary server-side,
  // here. No styling row (styling: null) = fully-default styling (the no-backfill rule).
  const styling = parseStylingValues(template.styling ?? {});

  // Feature 88 step 89. Normalized on the way OUT as well as in: a stamp left by a preset removed in a
  // later release degrades to "no pattern" here rather than reaching the rail as an id matching no card.
  const basedOnPreset = normalizeStylePresetStamp(
    template.styling?.basedOnPreset,
  );

  return {
    template,
    assignment,
    excludes,
    styling,
    basedOnPreset,
    adminAppBase,
  };
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
    styling?: unknown;
    basedOnPreset?: unknown;
    intent?: unknown;
  };

  // Create-on-first-save: the editor submits the seed + edits as JSON (same shape as an edit save),
  // so the create branch reads JSON, not FormData. Lifecycle actions are disabled on /new, so this
  // branch always creates regardless of intent.
  if (params.id === "new") {
    // Parse the pending scope SET (feature 44/46). A create-as-ACTIVE-with-scope must be gated BEFORE
    // anything is written (atomic block).
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
      // The template doesn't exist yet, so it can't be in the comparison set. The pending selector
      // SET + carve-outs are passed explicitly so the gate reads them, not a (nonexistent) rule.
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

    // Persist the scope rule SET on the freshly created template. The gate already cleared it; a
    // write failure is best-effort (the next Save resyncs), like the metaobject sync below.
    if (pending.selectors.length > 0) {
      await setTemplateScope(shop.id, result.data.id, pending.selectors);
    }

    // Persist the EXCLUDE carve-outs (feature 45), same best-effort posture.
    if (reconciledExcludes.length > 0) {
      await setTemplateExcludes(shop.id, result.data.id, reconciledExcludes);
    }

    // Persist styling arriving with the first save (Step 4). Rides the same shop-scoped save path as
    // an edit save; `rows` are the just-persisted finalized rows, so this write is styling-only in
    // effect. Best-effort, like the scope write above.
    let created = result.data;
    if (payload.styling !== undefined) {
      const styled = await saveTemplateForShop(shop.id, result.data.id, {
        rows: result.data.rows,
        styling: payload.styling,
        // The stamp rides this call, not the create above — omitting it would lose a preset picked on
        // /app/templates/new at its very first Save, the most common path into the feature.
        basedOnPreset: payload.basedOnPreset,
      });
      // Sync from the STYLED row (Step 7). `result.data` predates the write and carries no styling
      // relation, so syncing it would publish default styling for a just-styled template. On failure
      // we fall through to the unstyled row — the rows still reach the storefront; the next Save resyncs.
      if (styled.ok) created = styled.data;
    }

    // Best-effort storefront sync; the template is durable in Postgres, so a failure doesn't block
    // the redirect — the next Save resyncs.
    await syncTemplateToMetaobject(admin, shop, created);

    // A new ACTIVE template changes the shop's ACTIVE set → publish the routing map so its scope
    // lights up on the storefront (best-effort; Postgres is durable).
    if (willBeActive) {
      await rebuildShopRouting(admin, shop.id);
    }

    // The saveFetcher follows this redirect and remounts at the real id in edit mode; ?created=1
    // drives the one-time landing toast.
    return redirect(`/app/templates/${result.data.id}?created=1`);
  }

  const templateId = params.id as string;

  // Duplicate (feature 20): clone the SAVED template (DRAFT, fresh row ids) and navigate to the
  // copy's editor. No metaobject sync — the copy is DRAFT.
  if (payload.intent === "duplicate") {
    const result = await duplicateTemplateForShop(shop.id, templateId);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return redirect(`/app/templates/${result.data.id}?duplicated=1`);
  }

  // Delete (feature 20): remove the storefront metaobject FIRST (best-effort) so it can't outlive its
  // template (priority #2), THEN delete the durable Postgres row, then navigate to the list. Reads
  // the owned template shop-scoped first for the metaobject GID; a cross-shop/unknown id reads nothing
  // and is a clean redirect (deleteMany is a no-op for it anyway — priority #1).
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

  // Parse the pending scope SET + EXCLUDE carve-outs (feature 44/45/46). Both are PURE (no DB), so
  // run them BEFORE any read: a malformed payload fails fast without paying for the reads below.
  // `provided:false` means a caller that doesn't touch that facet (leave it).
  const pending = parsePendingScope(payload);
  if (!pending.ok) {
    return { ok: false as const, error: pending.error };
  }
  const pendingExcludes = parsePendingExcludes(payload);
  if (!pendingExcludes.ok) {
    return { ok: false as const, error: pendingExcludes.error };
  }

  // Read the current status + persisted scope + persisted excludes shop-scoped (priority #1) so the
  // gate and rebuild decisions run against durable state, not the payload. The three reads are
  // independent, so fetch them concurrently — three serial round-trips dominated a save's DB time on
  // a cold Neon connection.
  const [existing, persistedSelectors, persistedExcludes] = await Promise.all([
    getTemplateByIdForShop(shop.id, templateId),
    getTemplateIncludeSelectors(shop.id, templateId),
    getExcludesForTemplate(shop.id, templateId),
  ]);
  if (!existing) {
    return { ok: false as const, error: "Template not found" };
  }
  const currentStatus = existing.status;
  const wasActive = currentStatus === "ACTIVE";
  const willBeActive = payload.status === "ACTIVE";

  // Diff the pending scope set against the persisted set.
  const pendingSelectors: ScopeSelector[] = pending.provided
    ? pending.selectors
    : persistedSelectors;
  const scopeChanged =
    pending.provided &&
    selectorSetKey(pendingSelectors) !== selectorSetKey(persistedSelectors);

  // Diff the pending EXCLUDE carve-outs against the persisted set, then reconcile against the pending
  // INCLUDE PRODUCT set (Decision C): a product the template now INCLUDEs can't also be EXCLUDE'd
  // (byProduct beats the exclude gate; a lingering exclude would fool the gate's exclude-subtraction).
  const pendingExcludeGids = reconcileExcludes(
    pendingExcludes.provided ? pendingExcludes.gids : persistedExcludes,
    pendingSelectors,
  );
  const excludesChanged = !sameGidSet(pendingExcludeGids, persistedExcludes);

  // DRAFT→ACTIVE / ACTIVE-scope-edit dry-run gate (feature 42/44/45/46): run against the PENDING
  // selector SET + carve-outs BEFORE any write when the post-save template will be ACTIVE and either
  // it wasn't before, its scope changed, OR its carve-out set changed (removing a carve-out can
  // re-create a conflict). On overlap, BLOCK atomically — write nothing; unsaved edits stay in client
  // state. Fails closed. An already-ACTIVE template with an unchanged scope + carve-out set was
  // validated when it went ACTIVE, so it isn't re-gated.
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

  // Gate passed → persist. Write the SCOPE set FIRST (before status/rows), so an ACTIVE template's
  // persisted scope is always the gate-checked one: if the status write below failed, the template
  // would stay as it was, never ACTIVE-with-an-ungated-scope (the disjoint-set invariant, priority
  // #2). A DRAFT scope edit persists here too (no gate — DRAFT may hold a conflict). An empty set
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

  // Persist the EXCLUDE carve-outs (feature 45) before the status/rows write, same atomic-block
  // rationale — the gate has cleared this pending set. Create-or-replace touching only EXCLUDE rows
  // (the INCLUDE scope written above survives). A DRAFT carve-out edit persists here too.
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

  // Editing an existing template: persist to Postgres. Shop isolation, the 200-row cap, per-row
  // validation, and key finalization are all enforced inside saveTemplateForShop.
  const result = await saveTemplateForShop(shop.id, templateId, payload);
  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  // Sync the storefront delivery copy to the metaobject. Runs AFTER the durable Postgres write; a
  // failure warns but never loses the rows.
  const { syncError } = await syncTemplateToMetaobject(
    admin,
    shop,
    result.data,
  );

  // Rebuild + publish the shop routing map when ACTIVE-set membership changed OR an ACTIVE template's
  // scope/carve-out CONTENT changed (features 44/45) — any of these alters the scope→handle map or
  // its `excludedProductGids`. A rows-only save skips this. Best-effort: the durable writes landed; a
  // routing failure is surfaced, never rolled back.
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
    routingError,
  };
};

// The page-level engine owner (feature 20). Calls `useRowEngine` so the `<s-page>` header — status
// badge, More-actions menu, lifecycle modals (all rendered ABOVE the editor's inert freeze) — reads
// the SAME saving/dirty/name state the editor body does, and the heading binds to live `engine.name`
// so a rename updates the H1 immediately (Discard reverts it). Remounted by its parent's key on a
// discard (nonce bump) and on the create-on-first-save id change, which reseeds the engine from the
// persisted rows/name/status.
function TemplateOverview({
  template,
  assignment,
  excludes,
  styling,
  basedOnPreset,
  adminAppBase,
  onDiscard,
}: {
  template: { id: string; name: string; status: TemplateStatus; rows: unknown };
  assignment: AssignmentSeed | null;
  excludes: Array<{ gid: string; label: string; image: string | null }>;
  styling: StylingValues;
  basedOnPreset: string | null;
  // Admin deep-link base, from the loader. Used only by the Settings tab's conflict banner.
  adminAppBase: string;
  onDiscard: () => void;
}) {
  const engine = useRowEngine({
    initialRows: parseRows(template.rows),
    initialName: template.name,
    initialStatus: template.status,
    // Seed the scope picker from the persisted rule SET (features 44/46/47); no rule → "None".
    initialScope: assignment?.scope ?? SCOPE_NONE,
    initialScopeValues: assignment?.values ?? [],
    // Seed the EXCLUDE carve-outs (feature 45); empty for a new/unassigned template.
    initialExcludes: excludes,
    // Seed the Style tab from the loader's RESOLVED styling (Step 5); default when no styling row.
    initialStyling: styling,
    // Seed the style-preset provenance (feature 88 step 89); null for a template with no pattern.
    initialBasedOnPreset: basedOnPreset,
    // The "new" sentinel marks a never-saved template; the engine uses it to gate the file-23
    // first-paste scaffold replace. A real cuid is never "new"; the create remount reseeds it to false.
    isNew: template.id === "new",
    onDiscard,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const shopify = useAppBridge();

  // After a create (?created=1) or duplicate (?duplicated=1) redirect, toast once and strip the param
  // so a refresh or back/forward navigation doesn't re-toast. Idempotent across the discard remount.
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
    // `inlineSize="large"` matches the templates list's page width so the editor uses the same wide
    // layout. The editor is fully fluid, so widening only gives the value column + device previews
    // more room.
    <s-page heading={engine.name} inlineSize="large">
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      {/* Status badge + More-actions menu + lifecycle modals. Direct children of <s-page> (via
          slot=…) so they portal into the page header, above the editor's freeze wrapper. */}
      <TemplateHeaderActions engine={engine} template={template} />
      {/* The editor is a full-bleed mockup card (its own EditorShell), not wrapped in an
          <s-section> — the reshell A2 decision. Takes the shared engine as a prop; the scope picker
          rides the engine's Settings tab (feature 44). */}
      <SpecTableEditor engine={engine} adminAppBase={adminAppBase} />
    </s-page>
  );
}

export default function TemplateEditorPage() {
  const {
    template,
    assignment,
    excludes,
    styling,
    basedOnPreset,
    adminAppBase,
  } = useLoaderData<typeof loader>();

  // Bumped to remount the engine owner (resetting its reducer to the persisted rows and reseeding
  // name/status) when the merchant discards unsaved changes; no reducer reset action needed.
  const [editorNonce, setEditorNonce] = useState(0);

  // The key carries BOTH the template id and the editorNonce:
  //   - the id forces a remount when create-on-first-save redirects from "new" to the real cuid (same
  //     route, only the param changes, so React would otherwise reuse the instance and keep the seed
  //     rows + stale dirty baseline, leaving "Unsaved changes" up); remounting reseeds from persisted
  //     rows so the SaveBar closes;
  //   - the nonce remounts it (resetting to persisted state) on Discard.
  // Both "new" and an existing template render the same page; the create-vs-update split lives in the
  // action.
  return (
    <TemplateOverview
      key={`${template.id}:${editorNonce}`}
      template={template}
      assignment={assignment}
      excludes={excludes}
      styling={styling}
      basedOnPreset={basedOnPreset}
      adminAppBase={adminAppBase}
      onDiscard={() => setEditorNonce((nonce) => nonce + 1)}
    />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
