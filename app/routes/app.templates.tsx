import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { upsertShop } from "../models/shop.server";
import {
  countTemplatesForShop,
  listTemplatesForShop,
  TEMPLATE_STATUSES,
} from "../models/template.server";

const STATUS_FILTERS = [
  { label: "All", value: "ALL", href: "/app/templates" },
  { label: "Active", value: "ACTIVE", href: "/app/templates?status=ACTIVE" },
  { label: "Draft", value: "DRAFT", href: "/app/templates?status=DRAFT" },
  {
    label: "Archived",
    value: "ARCHIVED",
    href: "/app/templates?status=ARCHIVED",
  },
];

const BADGE_TONES = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
} as const;

type TemplateListItem = Awaited<
  ReturnType<typeof listTemplatesForShop>
>[number];

function getStatusFromRequest(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  return status && TEMPLATE_STATUSES.includes(status) ? status : null;
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
          <s-button href="/app/templates/new" variant="primary">
            Create template
          </s-button>
        </s-stack>
      </s-grid>
    </s-grid>
  </s-section>
);

const TemplateTableRow = ({ template }: { template: TemplateListItem }) => (
  <s-table-row id={template.id}>
    <s-table-cell>
      <s-link href={`/app/templates/${template.id}`}>{template.name}</s-link>
    </s-table-cell>
    <s-table-cell>
      <s-badge tone={BADGE_TONES[template.status]}>{template.status}</s-badge>
    </s-table-cell>
    <s-table-cell>{template.rowCount}</s-table-cell>
    <s-table-cell>{template.assignedProductCount}</s-table-cell>
    <s-table-cell>{formatDate(template.updatedAt)}</s-table-cell>
  </s-table-row>
);

const TemplateTable = ({
  templates,
  selectedStatus,
}: {
  templates: TemplateListItem[];
  selectedStatus: string;
}) => (
  <s-section accessibilityLabel="Templates table">
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-text type="strong">Status</s-text>
        {STATUS_FILTERS.map((filter) =>
          filter.value === selectedStatus ? (
            <s-badge key={filter.value} tone="info">
              {filter.label}
            </s-badge>
          ) : (
            <s-link key={filter.value} href={filter.href}>
              {filter.label}
            </s-link>
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
          </s-table-header-row>
          <s-table-body>
            {templates.map((template) => (
              <TemplateTableRow key={template.id} template={template} />
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
  const status = getStatusFromRequest(request);
  const [templates, templateCount] = await Promise.all([
    listTemplatesForShop(shop.id, { status }),
    countTemplatesForShop(shop.id),
  ]);

  return {
    templates,
    hasTemplates: templateCount > 0,
    selectedStatus: status ?? "ALL",
  };
};

export default function TemplatesPage() {
  const { templates, hasTemplates, selectedStatus } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Templates">
      <s-link slot="secondary-actions" href="/app/templates/new">
        Create template
      </s-link>

      {!hasTemplates ? (
        <EmptyTemplatesState />
      ) : (
        <TemplateTable templates={templates} selectedStatus={selectedStatus} />
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
