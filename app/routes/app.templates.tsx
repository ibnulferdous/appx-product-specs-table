import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { upsertShop } from "../models/shop.server";
import {
  deleteTemplateForShop,
  duplicateTemplateForShop,
  getTemplateByIdForShop,
  listTemplatesForShop,
} from "../models/template.server";
import { deleteSpecTableMetaobject } from "../shopify/metaobjects.server";
import { BADGE_TONES } from "../utils/templateStatus";
import {
  filterTemplatesByStatus,
  normalizeStatusFilter,
  type StatusFilter,
} from "../utils/templateFilter";

// One shared confirm modal for delete (not one <s-modal> per row): lighter DOM,
// a single focus trap. The id is constant — `pendingDelete` carries which row.
const DELETE_MODAL_ID = "templates-list-delete-modal";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Draft", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" },
];

type TemplateListItem = Awaited<
  ReturnType<typeof listTemplatesForShop>
>[number];

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
          <s-button href="/app/templates/new" variant="primary">
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
  onDuplicate,
  onRequestDelete,
}: {
  template: TemplateListItem;
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
      <s-table-cell>{template.assignedProductCount}</s-table-cell>
      <s-table-cell>{formatDate(template.updatedAt)}</s-table-cell>
      <s-table-cell>
        <s-button
          icon="menu-horizontal"
          accessibilityLabel={`Actions for ${template.name}`}
          commandFor={menuId}
        />
        <s-menu id={menuId} accessibilityLabel={`Actions for ${template.name}`}>
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
  selectedStatus,
  onSelectStatus,
  onDuplicate,
  onRequestDelete,
}: {
  templates: TemplateListItem[];
  selectedStatus: StatusFilter;
  onSelectStatus: (status: StatusFilter) => void;
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
        {STATUS_FILTERS.map((filter) =>
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
  const { session } = await authenticate.admin(request);
  const shop = await upsertShop(session);
  // One query: ALL of the shop's templates. Status filtering happens on the
  // client now (feature 28), so the loader ignores ?status= entirely and
  // `hasTemplates` derives from the returned list (no separate count query).
  const templates = await listTemplatesForShop(shop.id);

  return {
    templates,
    hasTemplates: templates.length > 0,
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
  };
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) {
    return { ok: false as const, error: "Missing template id" };
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
  const { templates, hasTemplates } = useLoaderData<typeof loader>();
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

  // One shared fetcher: duplicate and delete are mutually exclusive in time, so
  // they never collide. After it settles, React Router revalidates the list
  // loader, so the table is already correct by the time the toast fires.
  const fetcher = useFetcher<typeof action>();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // A JSON submission's payload lives on `fetcher.json` (not `fetcher.formData`);
  // read it to scope the loading state to a delete specifically.
  const inFlightIntent =
    fetcher.state !== "idle" && fetcher.json
      ? (fetcher.json as { intent?: string }).intent
      : undefined;
  const deleting = inFlightIntent === "delete";

  // Duplicate is non-destructive on a list, so it fires immediately — no confirm.
  const handleDuplicate = (id: string) => {
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
    if (!pendingDelete || deleting) return;
    fetcher.submit(
      { intent: "delete", id: pendingDelete.id },
      { method: "post", encType: "application/json" },
    );
  };
  const handleDeleteCancel = () => {
    shopify.modal.hide(DELETE_MODAL_ID);
    setPendingDelete(null);
  };

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
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <s-page heading="Templates" inlineSize={hasTemplates ? "large" : "base"}>
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/templates/new"
      >
        Create template
      </s-button>

      {!hasTemplates ? (
        <EmptyTemplatesState />
      ) : (
        <TemplateTable
          templates={visibleTemplates}
          selectedStatus={selectedStatus}
          onSelectStatus={handleSelectStatus}
          onDuplicate={handleDuplicate}
          onRequestDelete={handleRequestDelete}
        />
      )}

      {/* Single shared delete-confirm modal — never deletes on first click;
          Cancel / Esc / outside-click hide + clear and delete nothing. */}
      <s-modal id={DELETE_MODAL_ID} heading="Delete template">
        <s-stack direction="block" gap="base">
          <s-banner tone="warning">This action cannot be undone.</s-banner>
          <s-paragraph>
            Delete “{pendingDelete?.name ?? ""}”? This permanently removes the
            template and its storefront data.
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
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
