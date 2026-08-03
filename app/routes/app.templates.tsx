import { Suspense, useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  Await,
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { upsertShop } from "../models/shop.server";
import {
  deleteTemplateForShop,
  duplicateTemplateForShop,
  getTemplateByIdForShop,
  listTemplateSummariesForDomain,
  renameTemplateForShop,
  setTemplateStatusForShop,
  type TemplateListSummary,
} from "../models/template.server";
import { deleteSpecTableMetaobject } from "../shopify/metaobjects.server";
import { resolveAssignedProductCounts } from "../shopify/assignedProductCounts.server";
import { syncTemplateToMetaobject } from "../shopify/templateSync.server";
import {
  activationBlockedMessage,
  evaluateActivationConflicts,
  shouldRebuildRouting,
} from "../shopify/assignmentActivation.server";
import { rebuildShopRouting } from "../shopify/routing.server";
import {
  BADGE_TONES,
  VISIBLE_TEMPLATE_STATUS_OPTIONS,
} from "../utils/templateStatus";
import { NAME_MAX_LENGTH, validateTemplateName } from "../utils/templateName";
import {
  filterTemplatesByStatus,
  normalizeStatusFilter,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
} from "../utils/templateFilter";

// One shared confirm modal for delete (not one <s-modal> per row): lighter DOM,
// a single focus trap. The id is constant — `pendingDelete` carries which row.
const DELETE_MODAL_ID = "templates-list-delete-modal";

// One shared rename modal (mirrors the delete modal): `pendingRename` carries which
// row, the field value is seeded from the current name on open.
const RENAME_MODAL_ID = "templates-list-rename-modal";

// One shared status modal (feature 36): `pendingStatus` carries which row, the
// <s-select> value is seeded from that row's current status on open.
const STATUS_MODAL_ID = "templates-list-status-modal";

// The list row is the lightweight summary (name / status / rowCount / updatedAt)
// from `listTemplateSummariesForDomain`. The "Assigned Products" count is no
// longer carried on the row — it streams in separately as a templateId → count
// map (feature 48, now deferred; see the loader), which each row reads under
// <Suspense>.
type TemplateListItem = TemplateListSummary;

// The streamed "Assigned Products" map: templateId → resolved count, or `null`
// when the live Admin lookup couldn't determine it (rendered "—").
type AssignedCounts = Record<string, number | null>;

// The "Assigned Products" cell: a plain integer (thousands-separated for large
// "All products" catalogs), or "—" when the live count is unavailable.
function formatAssignedCount(count: number | null): string {
  return count === null ? "—" : count.toLocaleString();
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const EmptyTemplatesState = () => (
  <s-section accessibilityLabel="Empty templates section">
    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
      <s-box maxInlineSize="200px" maxBlockSize="200px">
        <s-image
          aspectRatio="1/0.5"
          src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          alt="A stylized graphic of a document"
        />
      </s-box>
      <s-grid justifyItems="center" maxBlockSize="450px" maxInlineSize="450px">
        <s-heading>Create your first spec table template</s-heading>
        <s-paragraph>
          Create reusable spec tables for your products.
        </s-paragraph>
        <s-stack
          gap="small-200"
          justifyContent="center"
          padding="base"
          paddingBlockEnd="none"
          direction="inline"
        >
          {/* Feature 88 step 92: Create leads to the style gallery, not
              straight to the editor. The gallery is UNSKIPPABLE — a merchant who
              likes none of the five patterns picks "Blank", which lands on the
              same scaffold this button used to open. Label unchanged: the
              gallery is a step inside creating a template, not a different
              destination. */}
          <s-button href="/app/templates/choose-style" variant="primary">
            Create template
          </s-button>
        </s-stack>
      </s-grid>
    </s-grid>
  </s-section>
);

// Presentational: the page owns the fetcher, modal, App Bridge, and confirm
// state; the row only renders and calls the handlers it gets as props.
const TemplateTableRow = ({
  template,
  assignedCounts,
  busy,
  onRequestRename,
  onRequestStatus,
  onDuplicate,
  onRequestDelete,
}: {
  template: TemplateListItem;
  // The streamed assigned-count map (deferred). Shared across every row; each
  // reads its own count under <Suspense> once it resolves.
  assignedCounts: Promise<AssignedCounts>;
  // Disables this row's actions trigger while any mutation is in flight, so a
  // second row action can't be opened on the shared fetcher mid-mutation.
  busy: boolean;
  onRequestRename: (id: string, name: string) => void;
  onRequestStatus: (id: string, name: string, status: string) => void;
  onDuplicate: (id: string) => void;
  onRequestDelete: (id: string, name: string) => void;
}) => {
  // The trigger + menu are per row, so each needs an id derived from the
  // template id (a cuid — DOM-id safe).
  const menuId = `template-actions-${template.id}`;
  return (
    <s-table-row id={template.id}>
      <s-table-cell>
        <s-link href={`/app/templates/${template.id}`}>
          <span
            title={template.name}
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {template.name}
          </span>
        </s-link>
      </s-table-cell>
      <s-table-cell>
        <s-badge tone={BADGE_TONES[template.status]}>{template.status}</s-badge>
      </s-table-cell>
      <s-table-cell>{template.rowCount}</s-table-cell>
      <s-table-cell>
        {/* Streamed column (Fix #4): the table paints immediately; each cell
            shows a subdued placeholder until the deferred count map resolves,
            then swaps in the number. A streamed failure degrades to "—" via the
            errorElement — never a broken row. */}
        <Suspense fallback={<s-text color="subdued">…</s-text>}>
          <Await resolve={assignedCounts} errorElement={<>—</>}>
            {(counts: AssignedCounts) => (
              <>{formatAssignedCount(counts[template.id] ?? null)}</>
            )}
          </Await>
        </Suspense>
      </s-table-cell>
      <s-table-cell>{formatDate(template.updatedAt)}</s-table-cell>
      <s-table-cell>
        <s-button
          icon="menu-horizontal"
          accessibilityLabel={`Actions for ${template.name}`}
          commandFor={menuId}
          {...(busy ? { disabled: true } : {})}
        />
        <s-menu id={menuId} accessibilityLabel={`Actions for ${template.name}`}>
          <s-button
            icon="edit"
            onClick={() => onRequestRename(template.id, template.name)}
          >
            Rename
          </s-button>
          <s-button
            icon="status"
            onClick={() =>
              onRequestStatus(template.id, template.name, template.status)
            }
          >
            Change status
          </s-button>
          <s-button icon="duplicate" onClick={() => onDuplicate(template.id)}>
            Duplicate
          </s-button>
          <s-button
            icon="delete"
            tone="critical"
            onClick={() => onRequestDelete(template.id, template.name)}
          >
            Delete
          </s-button>
        </s-menu>
      </s-table-cell>
    </s-table-row>
  );
};

const TemplateTable = ({
  templates,
  assignedCounts,
  busy,
  selectedStatus,
  onSelectStatus,
  onRequestRename,
  onRequestStatus,
  onDuplicate,
  onRequestDelete,
}: {
  templates: TemplateListItem[];
  assignedCounts: Promise<AssignedCounts>;
  busy: boolean;
  selectedStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
  onRequestRename: (id: string, name: string) => void;
  onRequestStatus: (id: string, name: string, status: string) => void;
  onDuplicate: (id: string) => void;
  onRequestDelete: (id: string, name: string) => void;
}) => (
  <s-section accessibilityLabel="Templates table">
    <s-stack direction="block" gap="base">
      {/* Filter tabs are now buttons, not links: selecting a status filters the
          already-loaded list in the browser (feature 28) — no server round trip,
          so it's instant. The selected tab keeps the info badge look. */}
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-text type="strong">Status</s-text>
        {STATUS_FILTER_OPTIONS.map((filter) =>
          filter.value === selectedStatus ? (
            <s-badge key={filter.value} tone="info">
              {filter.label}
            </s-badge>
          ) : (
            <s-button
              key={filter.value}
              variant="tertiary"
              onClick={() => onSelectStatus(filter.value)}
            >
              {filter.label}
            </s-button>
          ),
        )}
      </s-stack>

      {templates.length === 0 ? (
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-paragraph>No templates match this status.</s-paragraph>
        </s-box>
      ) : (
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Template Name</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Rows</s-table-header>
            <s-table-header>Assigned Products</s-table-header>
            <s-table-header>Last Updated</s-table-header>
            {/* Actions column — visually unlabeled, like native index tables;
                each row's trigger carries its own accessibilityLabel. */}
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {templates.map((template) => (
              <TemplateTableRow
                key={template.id}
                template={template}
                assignedCounts={assignedCounts}
                busy={busy}
                onRequestRename={onRequestRename}
                onRequestStatus={onRequestStatus}
                onDuplicate={onDuplicate}
                onRequestDelete={onRequestDelete}
              />
            ))}
          </s-table-body>
        </s-table>
      )}
    </s-stack>
  </s-section>
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // The shop-row upsert marks install/reinstall (a side effect) and yields
  // shop.id for the assigned-count lookup — but it does NOT gate the list read.
  // Kick it off and let it settle in the background so the shop.id round trip is
  // off the critical path; only the deferred count enrichment below awaits it.
  const shopPromise = upsertShop(session);

  // The ONLY query on the critical path: ALL of the shop's templates, keyed by
  // the session domain (so it doesn't wait on `shopPromise`) and WITHOUT the
  // `rows` blob — the row count is computed in Postgres (step 103 finding F3).
  // Status filtering happens on the client (feature 28), so the loader ignores
  // ?status= entirely and `hasTemplates` derives from the returned list.
  const templates = await listTemplateSummariesForDomain(session.shop);

  // "Assigned Products" (feature 48) needs a live Admin API round trip and is
  // fail-soft / cosmetic ("—" on failure), so it must NOT block first paint.
  // Return the promise UNAWAITED — React Router streams it and each cell fills in
  // under <Suspense>. It resolves to a templateId → count map: a template with no
  // assignment rows is 0 (a NONE match), a live-lookup failure is null ("—"). The
  // chain is wrapped so any failure (including the shop upsert throwing) degrades
  // every cell to "—" rather than tripping the streamed error boundary.
  const assignedCounts: Promise<AssignedCounts> = shopPromise
    .then((shop) => resolveAssignedProductCounts(admin, shop.id))
    .then((counts) =>
      Object.fromEntries(
        templates.map((template) => [
          template.id,
          counts.has(template.id) ? counts.get(template.id)! : 0,
        ]),
      ),
    )
    .catch(() =>
      Object.fromEntries(templates.map((template) => [template.id, null])),
    );

  return {
    templates,
    hasTemplates: templates.length > 0,
    assignedCounts,
  };
};

// Skip the loader (and its server round trip) when only the ?status= filter
// changed — that's a client-side concern now, so re-running the loader would be
// pure latency. A status-tab click is a GET navigation (no formMethod) on the
// same path that only flips ?status=. Everything else still revalidates: the
// initial load (not subject to this), a row-action fetcher submission (carries
// formMethod: "POST", so Duplicate/Delete still refresh the table in place), and
// any path change.
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) {
    const current = new URLSearchParams(currentUrl.search);
    const next = new URLSearchParams(nextUrl.search);
    current.delete("status");
    next.delete("status");
    if (current.toString() === next.toString()) {
      return false;
    }
  }
  return defaultShouldRevalidate;
}

// Row actions (feature 26). Same auth surface as the loader. Every branch is
// shop-scoped through `shop.id` (priority #1 — the reused functions all filter on
// `shopId`, so the client's `id` can never reach another shop's data) and returns
// `{ ok }` DATA, not a redirect: React Router auto-revalidates the list loader
// after the fetcher settles, so the table refreshes in place with no navigation.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  const payload = (await request.json()) as {
    intent?: unknown;
    id?: unknown;
    name?: unknown;
    status?: unknown;
  };
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    return { ok: false as const, error: "Missing template id" };
  }

  // Rename: touch the name only — `renameTemplateForShop` never resends rows, so a
  // list rename (which holds no in-memory rows) can't clobber them. The server
  // re-validates the name (never trusts the client); pass the raw payload value
  // through. Returns `{ ok }` DATA so the list revalidates the row in place.
  if (payload.intent === "rename") {
    const result = await renameTemplateForShop(shop.id, id, payload.name);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, intent: "rename" as const };
  }

  // Change status (feature 36): rows-untouching, shop-scoped status write, THEN a
  // storefront metaobject re-sync — the storefront gates visibility on the
  // metaobject's `status` field (data-model.md §8/§10), so a to/from-ACTIVE change
  // must re-sync or an ex-ACTIVE template would keep rendering (priority #2). The
  // sync also upserts the metaobject for a never-synced draft first going Active.
  // `setTemplateStatusForShop` validates the status and is shop-scoped (priority
  // #1); the sync client is bound to this shop's Admin token. Returns `{ ok }` DATA
  // so the list revalidates the badge in place; `syncError` (best-effort — Postgres
  // is the source of truth) is surfaced so the merchant knows to retry the sync.
  if (payload.intent === "status") {
    // Read the current status first — the gate decision (is this a DRAFT→ACTIVE
    // transition?) and the rebuild decision (did the ACTIVE set change?) both need
    // it. Shop-scoped, so a foreign/unknown id reads nothing (priority #1).
    const existing = await getTemplateByIdForShop(shop.id, id);
    if (!existing) {
      return { ok: false as const, error: "Template not found" };
    }
    const current = existing.status;

    // DRAFT→ACTIVE dry-run gate (feature 42): if the template's scope overlaps
    // another ACTIVE template's scope, BLOCK — write nothing (atomic). Fails
    // closed (an unverifiable Shopify probe blocks, never silently passes).
    if (payload.status === "ACTIVE" && current !== "ACTIVE") {
      const gate = await evaluateActivationConflicts(admin, shop.id, id);
      if (!gate.ok) {
        return {
          ok: false as const,
          blocked: true as const,
          conflicts: gate.conflicts,
          error: activationBlockedMessage(gate.conflicts),
        };
      }
    }

    const result = await setTemplateStatusForShop(shop.id, id, payload.status);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    const { syncError } = await syncTemplateToMetaobject(
      admin,
      shop,
      result.data,
    );

    // Rebuild + publish the shop routing map only when the ACTIVE set actually
    // changed (to/from ACTIVE). Best-effort like syncError — Postgres already
    // holds the durable status write; a routing failure is surfaced, not rolled
    // back (data-model.md §9).
    let routingError: string | undefined;
    if (shouldRebuildRouting(current, result.data.status)) {
      const routing = await rebuildShopRouting(admin, shop.id);
      if (!routing.ok) {
        routingError = routing.error;
      }
    }

    return {
      ok: true as const,
      intent: "status" as const,
      syncError,
      routingError,
    };
  }

  // Duplicate: clone the SAVED template (DRAFT, fresh row ids) shop-scoped. The
  // "(copy)" row surfaces at the top after revalidation (orderBy updatedAt desc).
  if (payload.intent === "duplicate") {
    const result = await duplicateTemplateForShop(shop.id, id);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, intent: "duplicate" as const };
  }

  // Delete: mirror the detail route's ordering exactly — remove the storefront
  // metaobject FIRST (best-effort) so it can't outlive its template (priority #2),
  // THEN the durable Postgres row. Read the owned template shop-scoped first for
  // the metaobject GID; a cross-shop/unknown id reads nothing and `deleteMany` is
  // a no-op for it anyway (priority #1). The only divergence from the detail
  // route is the return: `{ ok }` data so the list revalidates in place.
  if (payload.intent === "delete") {
    const existing = await getTemplateByIdForShop(shop.id, id);
    if (existing) {
      await deleteSpecTableMetaobject(admin, {
        gid: existing.shopifyMetaobjectGid,
        templateId: existing.id,
      });
      await deleteTemplateForShop(shop.id, id);
    }
    return { ok: true as const, intent: "delete" as const };
  }

  return { ok: false as const, error: "Unknown action" };
};

export default function TemplatesPage() {
  const { templates, hasTemplates, assignedCounts } =
    useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  // The selected filter lives in the URL (?status=) so it stays bookmarkable and
  // survives reload, but switching it filters the already-loaded list in the
  // browser — `shouldRevalidate` skips the loader for a status-only change, so
  // there's no server round trip.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedStatus = normalizeStatusFilter(searchParams.get("status"));
  const visibleTemplates = useMemo(
    () => filterTemplatesByStatus(templates, selectedStatus),
    [templates, selectedStatus],
  );

  const handleSelectStatus = (status: StatusFilter) => {
    setSearchParams(status === "ALL" ? {} : { status }, {
      replace: true,
      preventScrollReset: true,
    });
  };

  // One shared fetcher for every row mutation (rename / change-status / duplicate
  // / delete). They MUST stay mutually exclusive in time — a second submit would
  // interrupt the first mid-flight (e.g. a Delete cancelling an in-progress
  // Duplicate) — which the `busy` gate below enforces. After it settles, React
  // Router revalidates the list loader, so the table is already correct by the
  // time the toast fires.
  const fetcher = useFetcher<typeof action>();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Rename modal: `pendingRename` carries the target row; `renameValue` is the
  // controlled field, seeded from the current name on open. A client mirror of
  // `validateTemplateName` drives the field error + disables the primary button
  // (the server re-validation in the action is the real gate; this is UX).
  const [pendingRename, setPendingRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameResult = validateTemplateName(renameValue);

  // Status modal (feature 36): `pendingStatus` carries the target row (and its
  // current status, so Save can be disabled when unchanged); `statusValue` is the
  // controlled <s-select>, seeded from the current status on open.
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [statusValue, setStatusValue] = useState("");

  // A JSON submission's payload lives on `fetcher.json` (not `fetcher.formData`);
  // read it to scope the loading state to a delete specifically.
  const inFlightIntent =
    fetcher.state !== "idle" && fetcher.json
      ? (fetcher.json as { intent?: string }).intent
      : undefined;
  const deleting = inFlightIntent === "delete";
  const renaming = inFlightIntent === "rename";
  const duplicating = inFlightIntent === "duplicate";
  const updatingStatus = inFlightIntent === "status";
  // True while any row mutation is submitting OR its post-submit revalidation is
  // still loading. Gates every submit handler and disables the row-action triggers
  // so a merchant can't start a second mutation (e.g. Delete a template while a
  // copy is still generating) on the shared fetcher.
  const busy = fetcher.state !== "idle";

  // Duplicate is non-destructive on a list, so it fires immediately — no confirm.
  // The `busy` guard blocks it while any other row mutation is in flight, and also
  // stops a double-submit: the ⋯ menu closes on click, so a merchant could reopen
  // it and click Duplicate again before the clone settles, creating two copies.
  const handleDuplicate = (id: string) => {
    if (busy) return;
    fetcher.submit(
      { intent: "duplicate", id },
      { method: "post", encType: "application/json" },
    );
  };

  // Delete never deletes on first click: open the shared confirm modal naming
  // the target; the actual submit happens on Confirm.
  const handleRequestDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
    shopify.modal.show(DELETE_MODAL_ID);
  };
  const handleDeleteConfirm = () => {
    if (!pendingDelete || busy) return;
    fetcher.submit(
      { intent: "delete", id: pendingDelete.id },
      { method: "post", encType: "application/json" },
    );
  };
  const handleDeleteCancel = () => {
    shopify.modal.hide(DELETE_MODAL_ID);
    setPendingDelete(null);
  };

  // Rename persists immediately (the list has no SaveBar to ride): open the shared
  // modal seeded with the current name; Confirm submits the trimmed name and the
  // list revalidates the row in place. Cancel/Esc/outside-click rename nothing.
  const handleRequestRename = (id: string, name: string) => {
    setPendingRename({ id, name });
    setRenameValue(name);
    shopify.modal.show(RENAME_MODAL_ID);
  };
  const handleRenameConfirm = () => {
    if (!pendingRename || busy || !renameResult.ok) return;
    fetcher.submit(
      { intent: "rename", id: pendingRename.id, name: renameResult.name },
      { method: "post", encType: "application/json" },
    );
  };
  const handleRenameCancel = () => {
    shopify.modal.hide(RENAME_MODAL_ID);
    setPendingRename(null);
  };

  // Change status persists immediately (the list has no SaveBar): open the shared
  // modal seeded with the row's current status; Confirm submits the picked status
  // and the list revalidates the badge in place. Cancel/Esc/outside-click change
  // nothing.
  const handleRequestStatus = (id: string, name: string, status: string) => {
    setPendingStatus({ id, name, status });
    setStatusValue(status);
    shopify.modal.show(STATUS_MODAL_ID);
  };
  const statusUnchanged =
    pendingStatus !== null && statusValue === pendingStatus.status;
  const handleStatusConfirm = () => {
    // No-op guards: nothing pending, a mutation in flight, or the status wasn't
    // actually changed (skip a needless write + metaobject re-sync).
    if (!pendingStatus || busy || statusUnchanged) return;
    fetcher.submit(
      { intent: "status", id: pendingStatus.id, status: statusValue },
      { method: "post", encType: "application/json" },
    );
  };
  const handleStatusCancel = () => {
    shopify.modal.hide(STATUS_MODAL_ID);
    setPendingStatus(null);
  };

  // Duplicate has no modal to host a spinner (delete/rename do) and the ⋯ menu
  // closes on click, so there's nowhere to show inline progress. Toggle App
  // Bridge's global loading indicator (the admin top progress bar) while the clone
  // is in flight, so the merchant sees their request is being processed; the
  // settle effect below then fires the "Template duplicated" toast.
  useEffect(() => {
    shopify.loading(duplicating);
  }, [duplicating, shopify]);

  // Surface the success/error toast once the submission settles. On a successful
  // delete, also close the modal + clear the pending target.
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (data.ok === false) {
      shopify.toast.show(data.error ?? "Something went wrong", {
        isError: true,
      });
      return;
    }
    if (data.intent === "duplicate") {
      shopify.toast.show("Template duplicated");
    } else if (data.intent === "delete") {
      shopify.modal.hide(DELETE_MODAL_ID);
      setPendingDelete(null);
      shopify.toast.show("Template deleted");
    } else if (data.intent === "rename") {
      shopify.modal.hide(RENAME_MODAL_ID);
      setPendingRename(null);
      shopify.toast.show("Template renamed");
    } else if (data.intent === "status") {
      // The status IS persisted (Postgres is the source of truth); the metaobject
      // re-sync is best-effort, so surface a sync failure honestly rather than a
      // bare success — otherwise a merchant could think an ex-ACTIVE table stopped
      // rendering when its metaobject is still stale.
      shopify.modal.hide(STATUS_MODAL_ID);
      setPendingStatus(null);
      // Both storefront-delivery writes are best-effort (Postgres is the source
      // of truth); surface whichever failed so the merchant knows to retry rather
      // than a bare success. The routing rebuild only ran on an ACTIVE-set change.
      const deliveryWarning = data.syncError ?? data.routingError;
      if (deliveryWarning) {
        shopify.toast.show(deliveryWarning, { isError: true });
      } else {
        shopify.toast.show("Status updated");
      }
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <s-page heading="Templates" inlineSize={hasTemplates ? "large" : "base"}>
      {/* Feature 88 step 92 — the list's Create entry point, repointed at the
          style gallery alongside the empty state's. These two are the ONLY
          links into the create flow, which is what makes the gallery
          unskippable and what makes `basedOnPreset: null` mean "chose Blank"
          on every template created from here on. */}
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/templates/choose-style"
      >
        Create template
      </s-button>

      {!hasTemplates ? (
        <EmptyTemplatesState />
      ) : (
        <TemplateTable
          templates={visibleTemplates}
          assignedCounts={assignedCounts}
          busy={busy}
          selectedStatus={selectedStatus}
          onSelectStatus={handleSelectStatus}
          onRequestRename={handleRequestRename}
          onRequestStatus={handleRequestStatus}
          onDuplicate={handleDuplicate}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {/* Single shared delete-confirm modal — never deletes on first click;
          Cancel / Esc / outside-click hide + clear and delete nothing. */}
      <s-modal id={DELETE_MODAL_ID} heading="Delete template">
        <s-stack direction="block" gap="base">
          {/* The banner carries the "permanent" warning; the paragraph must not
              repeat it ("permanently removes"). Kept in step with the editor's
              copy of this modal in `TemplateHeaderActions`. */}
          <s-banner tone="warning">This action cannot be undone.</s-banner>
          <s-paragraph>
            Delete “{pendingDelete?.name ?? ""}”? This removes the template and
            its storefront data.
          </s-paragraph>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={handleDeleteConfirm}
          loading={deleting}
        >
          Delete
        </s-button>
        <s-button
          slot="secondary-actions"
          onClick={handleDeleteCancel}
          {...(deleting ? { disabled: true } : {})}
        >
          Cancel
        </s-button>
      </s-modal>

      {/* Single shared rename modal — immediate-persist (no SaveBar on the list).
          Seeded with the current name; the client mirror of validateTemplateName
          disables Rename while the name is invalid. Cancel/Esc/outside-click clear
          and rename nothing. */}
      <s-modal id={RENAME_MODAL_ID} heading="Rename template">
        <s-text-field
          label="Template name"
          value={renameValue}
          maxLength={NAME_MAX_LENGTH}
          details="For your reference only — shoppers never see this name."
          onInput={(event: Event) =>
            setRenameValue((event.target as HTMLInputElement).value)
          }
          error={renameResult.ok ? undefined : renameResult.error}
        />
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleRenameConfirm}
          loading={renaming}
          {...(renameResult.ok ? {} : { disabled: true })}
        >
          Rename
        </s-button>
        <s-button
          slot="secondary-actions"
          onClick={handleRenameCancel}
          {...(renaming ? { disabled: true } : {})}
        >
          Cancel
        </s-button>
      </s-modal>

      {/* Single shared status modal (feature 36) — immediate-persist (no SaveBar on
          the list). Seeded with the row's current status; Save is disabled while a
          mutation is in flight OR the status is unchanged (skips a needless write +
          storefront re-sync). Cancel/Esc/outside-click change nothing. */}
      <s-modal id={STATUS_MODAL_ID} heading="Change status">
        <s-stack direction="block" gap="base">
          <s-select
            label="Status"
            value={statusValue}
            onChange={(event: Event) =>
              setStatusValue((event.currentTarget as HTMLSelectElement).value)
            }
          >
            {VISIBLE_TEMPLATE_STATUS_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>
          <s-text color="subdued">
            Active shows this table on the storefront for its assigned products.
            Draft is hidden.
          </s-text>
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleStatusConfirm}
          loading={updatingStatus}
          {...(statusUnchanged ? { disabled: true } : {})}
        >
          Save
        </s-button>
        <s-button
          slot="secondary-actions"
          onClick={handleStatusCancel}
          {...(updatingStatus ? { disabled: true } : {})}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
