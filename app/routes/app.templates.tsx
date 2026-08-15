import { Suspense, useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import type { TemplateStatus } from "@prisma/client";
import {
  Await,
  useFetcher,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { AdminAppLink } from "../components/AdminAppLink";
import { buildAdminAppBase } from "../utils/adminAppLink";
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
  normalizeStatusFilter,
  STATUS_FILTER_OPTIONS,
  type StatusFilter,
} from "../utils/templateFilter";

// One shared confirm modal for delete (not one <s-modal> per row): lighter DOM, one focus trap. The
// id is constant — `pendingDelete` carries which row.
const DELETE_MODAL_ID = "templates-list-delete-modal";

// One shared rename modal: `pendingRename` carries which row; the field is seeded from the current
// name on open.
const RENAME_MODAL_ID = "templates-list-rename-modal";

// One shared status modal (feature 36): `pendingStatus` carries which row; the <s-select> is seeded
// from that row's current status on open.
const STATUS_MODAL_ID = "templates-list-status-modal";

// The list row is the lightweight summary from `listTemplateSummariesForDomain`. The "Assigned
// Products" count isn't on the row — it streams in separately as a templateId → count map (feature
// 48, deferred), which each row reads under <Suspense>.
type TemplateListItem = TemplateListSummary;

// The streamed "Assigned Products" map: templateId → resolved count, or null when the live Admin
// lookup couldn't determine it (rendered "—").
type AssignedCounts = Record<string, number | null>;

// The "Assigned Products" cell: a plain integer (thousands-separated), or "—" when unavailable.
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
          {/* Feature 88 step 92: Create leads to the (unskippable) style gallery, not straight to
              the editor. A merchant who likes none of the five patterns picks "Blank". Label
              unchanged — the gallery is a step inside creating, not a different destination. */}
          <s-button href="/app/templates/choose-style" variant="primary">
            Create template
          </s-button>
        </s-stack>
      </s-grid>
    </s-grid>
  </s-section>
);

// Presentational: the page owns the fetcher, modal, App Bridge, and confirm state; the row only
// renders and calls the handlers it gets as props.
const TemplateTableRow = ({
  template,
  assignedCounts,
  busy,
  pendingStatusSubmit,
  onToggleStatus,
  onRequestRename,
  onRequestStatus,
  onDuplicate,
  onRequestDelete,
  adminAppBase,
}: {
  template: TemplateListItem;
  // The streamed assigned-count map (deferred). Shared across rows; each reads its own count under
  // <Suspense> once it resolves.
  assignedCounts: Promise<AssignedCounts>;
  // Disables this row's actions trigger while any mutation is in flight, so a second row action
  // can't be opened on the shared fetcher mid-mutation.
  busy: boolean;
  // The in-flight status submit (id + target status), read off the shared fetcher, or null. Drives
  // the inline toggle + badge OPTIMISTICALLY for the row it targets: they show the pending status
  // while the write settles and snap back to server state if it's blocked (no manual revert).
  pendingStatusSubmit: { id: string; status: string } | null;
  // The inline Draft⇄Active toggle's handler. Fires the same shop-scoped status write as the modal
  // (conflict gate, metaobject re-sync, routing rebuild all included) — see the page action.
  onToggleStatus: (id: string, currentStatus: string) => void;
  onRequestRename: (id: string, name: string) => void;
  onRequestStatus: (id: string, name: string, status: string) => void;
  onDuplicate: (id: string) => void;
  onRequestDelete: (id: string, name: string) => void;
  // Admin deep-link base, built in the loader. The row name links THROUGH the admin so "open in new
  // tab" lands in the admin (which re-embeds the app) instead of the app's own origin standalone; a
  // left-click routes in place. All of that lives in `AdminAppLink` — read its comment before
  // touching link behavior.
  adminAppBase: string;
}) => {
  // The trigger + menu are per row, so each needs an id derived from the template id (a cuid).
  const menuId = `template-actions-${template.id}`;

  // Optimistic status for THIS row — but ONLY for the flip that can't be refused. A →DRAFT flip is
  // always allowed, so paint it immediately. A →ACTIVE flip goes through the conflict gate and can
  // be BLOCKED, so don't flip yet: keep the server status and show a spinner until the write
  // confirms ("confirm before flipping" — avoids a flash-then-revert on a blocked activation). Once
  // the write settles, `pendingStatusSubmit` clears and the row reflects the revalidated status.
  const pendingForRow =
    pendingStatusSubmit?.id === template.id ? pendingStatusSubmit.status : null;
  const activating = pendingForRow === "ACTIVE";
  const effectiveStatus = (pendingForRow === "DRAFT"
    ? "DRAFT"
    : template.status) as TemplateStatus;
  const isActive = effectiveStatus === "ACTIVE";
  // The toggle is a two-state Draft⇄Active control, so it's meaningless for an ARCHIVED row (a
  // hidden status no longer offered). Those keep the badge + the ⋯ menu's "Change status" only.
  const isArchived = template.status === "ARCHIVED";

  return (
    <s-table-row id={template.id}>
      <s-table-cell>
        <AdminAppLink
          adminAppBase={adminAppBase}
          appPath={`/app/templates/${template.id}`}
        >
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
        </AdminAppLink>
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-badge tone={BADGE_TONES[effectiveStatus]}>
            {effectiveStatus}
          </s-badge>
          {/* Inline one-click status change (feature 36 follow-up): flips Draft⇄Active without the ⋯
              menu → modal → Save path, which stays as the fallback. Same server write. A →ACTIVE
              flip can be refused by the conflict gate, so while it's in flight we show a spinner in
              the toggle's place (not an optimistic flip) and settle to the toggle at whatever status
              the server confirmed. Disabled while any row mutation is in flight (shared fetcher).
              Hidden for ARCHIVED — a two-state toggle can't represent it. */}
          {!isArchived &&
            (activating ? (
              <s-spinner
                accessibilityLabel={`Activating ${template.name}`}
                size="base"
              />
            ) : (
              <s-switch
                accessibilityLabel={`${isActive ? "Set to draft" : "Activate"} ${template.name}`}
                checked={isActive}
                onChange={() => onToggleStatus(template.id, effectiveStatus)}
                {...(busy ? { disabled: true } : {})}
              />
            ))}
        </s-stack>
      </s-table-cell>
      <s-table-cell>{template.rowCount}</s-table-cell>
      <s-table-cell>
        {/* Streamed column (Fix #4): the table paints immediately; each cell shows a placeholder
            until the deferred count map resolves, then swaps in the number. A streamed failure
            degrades to "—" via the errorElement. */}
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
  pendingStatusSubmit,
  onToggleStatus,
  selectedStatus,
  onSelectStatus,
  paginate,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  listLoading,
  onRequestRename,
  onRequestStatus,
  onDuplicate,
  onRequestDelete,
  adminAppBase,
}: {
  templates: TemplateListItem[];
  assignedCounts: Promise<AssignedCounts>;
  busy: boolean;
  pendingStatusSubmit: { id: string; status: string } | null;
  onToggleStatus: (id: string, currentStatus: string) => void;
  selectedStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
  // Pagination (Phase 2): `paginate` shows the s-table's prev/next controls (only when >1 page); the
  // has*/on* props drive them. `listLoading` puts the table in its inert loading state while a
  // page/status navigation is fetching.
  paginate: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  listLoading: boolean;
  onRequestRename: (id: string, name: string) => void;
  onRequestStatus: (id: string, name: string, status: string) => void;
  onDuplicate: (id: string) => void;
  onRequestDelete: (id: string, name: string) => void;
  adminAppBase: string;
}) => (
  <s-section accessibilityLabel="Templates table">
    <s-stack direction="block" gap="base">
      {/* Filter tabs are buttons: selecting a status re-runs the loader for that server-side-filtered
          page (Phase 2). The selected tab keeps the info-badge look. */}
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
        <s-table
          variant="auto"
          paginate={paginate}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          // Inert while a page/status navigation loads OR any row mutation is in flight (`busy`):
          // the loading state dims the whole table and blocks interaction, so a merchant can't
          // click through a template-name link and navigate away mid-write.
          loading={listLoading || busy}
        >
          <s-table-header-row>
            <s-table-header listSlot="primary">Template Name</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Rows</s-table-header>
            <s-table-header>Assigned Products</s-table-header>
            <s-table-header>Last Updated</s-table-header>
            {/* Actions column — visually unlabeled, like native index tables; each row's trigger
                carries its own accessibilityLabel. */}
            <s-table-header></s-table-header>
          </s-table-header-row>
          <s-table-body>
            {templates.map((template) => (
              <TemplateTableRow
                key={template.id}
                template={template}
                assignedCounts={assignedCounts}
                busy={busy}
                pendingStatusSubmit={pendingStatusSubmit}
                onToggleStatus={onToggleStatus}
                onRequestRename={onRequestRename}
                onRequestStatus={onRequestStatus}
                onDuplicate={onDuplicate}
                onRequestDelete={onRequestDelete}
                adminAppBase={adminAppBase}
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

  // The shop-row upsert marks install/reinstall and yields shop.id for the assigned-count lookup, but
  // does NOT gate the list read. Kick it off in the background so the shop.id round trip is off the
  // critical path; only the deferred count enrichment below awaits it.
  const shopPromise = upsertShop(session);

  // Pagination + status filter are SERVER-SIDE (Phase 2, reversing feature 28 — a client filter over
  // a paginated read would only filter the current page). Both live in the URL so a page/filter is
  // bookmarkable. `normalizeStatusFilter` rejects anything not a real tab; `page` is sanitized to a
  // finite 1-based int and re-clamped inside the model.
  const url = new URL(request.url);
  const selectedStatus = normalizeStatusFilter(url.searchParams.get("status"));
  const modelStatus: TemplateStatus | null =
    selectedStatus === "ALL" ? null : selectedStatus;
  const requestedPage = Number.parseInt(
    url.searchParams.get("page") ?? "1",
    10,
  );
  const page = Number.isFinite(requestedPage) ? requestedPage : 1;

  // The critical-path read: ONE page of the shop's templates, keyed by the session domain (so it
  // doesn't wait on `shopPromise`) and WITHOUT the `rows` blob (row count computed in Postgres, F3).
  // Returns the page plus `totalAll` (drives the empty state) and `pageCount`.
  const pageResult = await listTemplateSummariesForDomain(session.shop, {
    status: modelStatus,
    page,
  });
  const templates = pageResult.templates;

  // "Assigned Products" (feature 48) needs a live Admin round trip and is fail-soft / cosmetic, so it
  // must NOT block first paint. Return the promise UNAWAITED — React Router streams it and each cell
  // fills in under <Suspense>. It resolves to a templateId → count map (no assignment rows = 0; a
  // live-lookup failure = null → "—"). Wrapped so any failure (incl. the shop upsert throwing)
  // degrades every cell to "—" rather than tripping the streamed error boundary.
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

  // Admin deep-link base for the template name links — see `adminAppLink.ts`.
  const adminAppBase = buildAdminAppBase(
    session.shop,
    // eslint-disable-next-line no-undef
    process.env.SHOPIFY_API_KEY || "",
  );

  return {
    templates,
    // `totalAll`, NOT the current page length: a shop with templates that don't match the active
    // filter must still see the table chrome + a "no match" row, never the first-run splash.
    hasTemplates: pageResult.totalAll > 0,
    selectedStatus,
    page: pageResult.page,
    pageCount: pageResult.pageCount,
    hasNextPage: pageResult.page < pageResult.pageCount,
    hasPreviousPage: pageResult.page > 1,
    assignedCounts,
    adminAppBase,
  };
};

// No custom `shouldRevalidate`: filtering + pagination are server-side (Phase 2), so a ?status= or
// ?page= change MUST re-run the loader. Default revalidation is exactly what's wanted — feature 28's
// skip-on-status-change optimization is gone with the client filter it served.

// Row actions (feature 26). Same auth surface as the loader. Every branch is shop-scoped through
// `shop.id` (priority #1 — the reused functions all filter on `shopId`) and returns `{ ok }` DATA,
// not a redirect: React Router auto-revalidates the list loader after the fetcher settles, so the
// table refreshes in place.
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

  // Rename: touch the name only — `renameTemplateForShop` never resends rows, so a list rename (which
  // holds no in-memory rows) can't clobber them. The server re-validates the name.
  if (payload.intent === "rename") {
    const result = await renameTemplateForShop(shop.id, id, payload.name);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, intent: "rename" as const };
  }

  // Change status (feature 36): rows-untouching shop-scoped status write, THEN a metaobject re-sync —
  // the storefront gates visibility on the metaobject's `status` field (§8/§10), so a to/from-ACTIVE
  // change must re-sync or an ex-ACTIVE template keeps rendering (priority #2). The sync also upserts
  // the metaobject for a never-synced draft first going Active. Returns `{ ok }` DATA so the list
  // revalidates the badge; `syncError` (best-effort — Postgres is the source of truth) is surfaced.
  if (payload.intent === "status") {
    // Read the current status first — the gate decision (DRAFT→ACTIVE?) and the rebuild decision (did
    // the ACTIVE set change?) both need it. Shop-scoped, so a foreign/unknown id reads nothing.
    const existing = await getTemplateByIdForShop(shop.id, id);
    if (!existing) {
      return { ok: false as const, error: "Template not found" };
    }
    const current = existing.status;

    // DRAFT→ACTIVE dry-run gate (feature 42): if the scope overlaps another ACTIVE template's, BLOCK —
    // write nothing (atomic). Fails closed (an unverifiable Shopify probe blocks, never passes).
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

    // Rebuild + publish the routing map only when the ACTIVE set actually changed (to/from ACTIVE).
    // Best-effort like syncError — Postgres holds the durable write; a routing failure is surfaced,
    // not rolled back (§9).
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

  // Duplicate: clone the SAVED template (DRAFT, fresh row ids) shop-scoped. The "(copy)" row surfaces
  // at the top after revalidation (orderBy updatedAt desc).
  if (payload.intent === "duplicate") {
    const result = await duplicateTemplateForShop(shop.id, id);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    return { ok: true as const, intent: "duplicate" as const };
  }

  // Delete: mirror the detail route's ordering — remove the storefront metaobject FIRST (best-effort)
  // so it can't outlive its template (priority #2), THEN the durable Postgres row. Read the owned
  // template shop-scoped first for the GID; a cross-shop/unknown id reads nothing and `deleteMany` is
  // a no-op (priority #1). Only divergence from the detail route: returns `{ ok }` data so the list
  // revalidates in place.
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
  const {
    templates,
    hasTemplates,
    selectedStatus,
    page,
    pageCount,
    hasNextPage,
    hasPreviousPage,
    assignedCounts,
    adminAppBase,
  } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  // Status filter + page both live in the URL so the view is bookmarkable. Both are server-driven:
  // changing either re-runs the loader. `selectedStatus`/`page` come from the loader (normalized +
  // clamped) so the UI always reflects the page actually rendered, even if the URL param was stale.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  // The table is briefly inert while a status/page navigation loads its data.
  const listLoading = navigation.state === "loading";

  const handleSelectStatus = (status: StatusFilter) => {
    // Changing the filter resets to page 1 — the old page number is meaningless against a different
    // result set.
    setSearchParams(status === "ALL" ? {} : { status }, {
      replace: true,
      preventScrollReset: true,
    });
  };

  // Page turns preserve the current status filter and push history. Page 1 drops the ?page= param.
  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    setSearchParams(params, { preventScrollReset: true });
  };
  const handleNextPage = () => goToPage(page + 1);
  const handlePreviousPage = () => goToPage(page - 1);

  // One shared fetcher for every row mutation. They MUST stay mutually exclusive in time — a second
  // submit would interrupt the first mid-flight (e.g. Delete cancelling an in-progress Duplicate) —
  // which the `busy` gate enforces. After it settles, React Router revalidates the list loader.
  const fetcher = useFetcher<typeof action>();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Rename modal: `pendingRename` carries the target; `renameValue` is the controlled field, seeded
  // from the current name. A client mirror of `validateTemplateName` drives the field error +
  // disables the primary button (the server re-validation is the real gate; this is UX).
  const [pendingRename, setPendingRename] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameResult = validateTemplateName(renameValue);

  // Status modal (feature 36): `pendingStatus` carries the target (and its current status, so Save
  // can be disabled when unchanged); `statusValue` is the controlled <s-select>, seeded on open.
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    name: string;
    status: string;
  } | null>(null);
  const [statusValue, setStatusValue] = useState("");

  // A JSON submission's payload lives on `fetcher.json` (not `fetcher.formData`); read it to scope
  // the loading state to a specific intent.
  const inFlightIntent =
    fetcher.state !== "idle" && fetcher.json
      ? (fetcher.json as { intent?: string }).intent
      : undefined;
  const deleting = inFlightIntent === "delete";
  const renaming = inFlightIntent === "rename";
  const duplicating = inFlightIntent === "duplicate";
  const updatingStatus = inFlightIntent === "status";
  // True while any row mutation is submitting OR its post-submit revalidation is loading. Gates every
  // submit handler and disables the row-action triggers so a merchant can't start a second mutation
  // on the shared fetcher.
  const busy = fetcher.state !== "idle";

  // Duplicate is non-destructive, so it fires immediately — no confirm. The `busy` guard blocks it
  // while any other mutation is in flight, and stops a double-submit: the ⋯ menu closes on click, so
  // a merchant could reopen and click Duplicate again before the clone settles, creating two copies.
  const handleDuplicate = (id: string) => {
    if (busy) return;
    fetcher.submit(
      { intent: "duplicate", id },
      { method: "post", encType: "application/json" },
    );
  };

  // Delete never deletes on first click: open the shared confirm modal naming the target; the submit
  // happens on Confirm.
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

  // Rename persists immediately (the list has no SaveBar): open the shared modal seeded with the
  // current name; Confirm submits the trimmed name and the row revalidates. Cancel/Esc renames nothing.
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

  // Inline status toggle: the one-click Draft⇄Active path, no modal. Submits the SAME status intent
  // as the modal (same conflict gate, metaobject re-sync, routing rebuild in the action) — so a
  // blocked DRAFT→ACTIVE flip returns ok:false and its toast fires via the settle effect, while the
  // row's optimistic badge/toggle revert on their own. The `busy` guard mirrors the other handlers,
  // keeping the shared fetcher single-flight.
  const handleToggleStatus = (id: string, currentStatus: string) => {
    if (busy) return;
    const nextStatus = currentStatus === "ACTIVE" ? "DRAFT" : "ACTIVE";
    fetcher.submit(
      { intent: "status", id, status: nextStatus },
      { method: "post", encType: "application/json" },
    );
  };

  // The in-flight status submit read off the shared fetcher (id + target). Passed to the rows so the
  // one whose id matches paints its badge/toggle at the pending status until the write settles; on a
  // block/error the server state is unchanged and this clears, so the row snaps back — no manual
  // revert. Only a status intent carries a `status`, so other intents leave this null.
  const pendingStatusSubmit =
    fetcher.state !== "idle" &&
    fetcher.json &&
    (fetcher.json as { intent?: string }).intent === "status"
      ? (fetcher.json as { id: string; status: string })
      : null;

  // Change status persists immediately: open the shared modal seeded with the row's current status;
  // Confirm submits the picked status and the badge revalidates. Cancel/Esc changes nothing.
  const handleRequestStatus = (id: string, name: string, status: string) => {
    setPendingStatus({ id, name, status });
    setStatusValue(status);
    shopify.modal.show(STATUS_MODAL_ID);
  };
  const statusUnchanged =
    pendingStatus !== null && statusValue === pendingStatus.status;
  const handleStatusConfirm = () => {
    // No-op guards: nothing pending, a mutation in flight, or the status wasn't changed (skip a
    // needless write + metaobject re-sync).
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

  // Duplicate has no modal to host a spinner and the ⋯ menu closes on click, so there's nowhere to
  // show inline progress. Toggle App Bridge's global loading indicator (the admin top progress bar)
  // while the clone is in flight; the settle effect below fires the "Template duplicated" toast.
  useEffect(() => {
    shopify.loading(duplicating);
  }, [duplicating, shopify]);

  // Surface the success/error toast once the submission settles. On a successful delete, also close
  // the modal + clear the pending target.
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
      shopify.modal.hide(STATUS_MODAL_ID);
      setPendingStatus(null);
      // Both storefront-delivery writes are best-effort (Postgres is the source of truth); surface
      // whichever failed so the merchant knows to retry rather than a bare success — otherwise they
      // could think an ex-ACTIVE table stopped rendering when its metaobject is still stale. The
      // routing rebuild only ran on an ACTIVE-set change.
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
      {/* Feature 88 step 92 — the list's Create entry, repointed at the style gallery alongside the
          empty state's. These two are the ONLY links into the create flow, which is what makes the
          gallery unskippable and `basedOnPreset: null` mean "chose Blank". */}
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
          templates={templates}
          assignedCounts={assignedCounts}
          busy={busy}
          pendingStatusSubmit={pendingStatusSubmit}
          onToggleStatus={handleToggleStatus}
          selectedStatus={selectedStatus}
          onSelectStatus={handleSelectStatus}
          paginate={pageCount > 1}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          onNextPage={handleNextPage}
          onPreviousPage={handlePreviousPage}
          listLoading={listLoading}
          onRequestRename={handleRequestRename}
          onRequestStatus={handleRequestStatus}
          onDuplicate={handleDuplicate}
          onRequestDelete={handleRequestDelete}
          adminAppBase={adminAppBase}
        />
      )}

      {/* Single shared delete-confirm modal — never deletes on first click; Cancel / Esc /
          outside-click hide + clear and delete nothing. */}
      <s-modal id={DELETE_MODAL_ID} heading="Delete template">
        <s-stack direction="block" gap="base">
          {/* The banner carries the "permanent" warning; the paragraph must not repeat it. Kept in
              step with the editor's copy of this modal in `TemplateHeaderActions`. */}
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

      {/* Single shared rename modal — immediate-persist. Seeded with the current name; the client
          mirror of validateTemplateName disables Rename while invalid. Cancel/Esc renames nothing. */}
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

      {/* Single shared status modal (feature 36) — immediate-persist. Seeded with the row's current
          status; Save is disabled while a mutation is in flight OR the status is unchanged (skips a
          needless write + re-sync). Cancel/Esc changes nothing. */}
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
