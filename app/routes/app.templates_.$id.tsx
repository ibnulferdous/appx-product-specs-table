import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { TemplateStatus } from "@prisma/client";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { upsertShop } from "../models/shop.server";
import {
  createTemplateForShop,
  getTemplateByIdForShop,
} from "../models/template.server";

const STATUS_OPTIONS = [
  { label: "Draft", value: "DRAFT" },
  { label: "Active", value: "ACTIVE" },
];

const BADGE_TONES = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
} as const;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // "new" is a safe sentinel: Template ids are server-generated cuids, so a
  // real template id can never equal the literal string "new".
  if (params.id === "new") {
    return { template: null };
  }

  const template = await getTemplateByIdForShop(shop.id, params.id);

  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  return { template };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // Only template creation is wired up for now. The edit/update + rows-save
  // path (with server-side 200-row validation and metaobject sync) lands with
  // the rows editor in the next phase.
  if (params.id !== "new") {
    return { ok: false as const, error: "Editing is not available yet" };
  }

  const formData = await request.formData();
  const name = formData.get("name");
  const status = formData.get("status");

  const result = await createTemplateForShop(shop.id, { name, status });

  if (!result.ok) {
    return {
      ok: false as const,
      error: result.error,
      values: {
        name: typeof name === "string" ? name : "",
        status: typeof status === "string" ? status : "DRAFT",
      },
    };
  }

  return redirect(`/app/templates/${result.data.id}`);
};

function NewTemplateForm() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting =
    navigation.state === "submitting" && navigation.formMethod === "POST";

  // The "Editing is not available yet" branch has no `values`, so narrow first.
  const values =
    actionData && "values" in actionData ? actionData.values : undefined;
  const defaultName = values?.name ?? "";
  const defaultStatus = values?.status ?? "DRAFT";

  return (
    <s-page heading="Create template">
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <s-link slot="secondary-actions" href="/app/templates">
        Cancel
      </s-link>

      <s-section heading="Template details">
        <Form method="post">
          <s-stack direction="block" gap="base">
            {actionData?.error ? (
              <s-banner tone="critical">{actionData.error}</s-banner>
            ) : null}

            <s-text-field
              label="Name"
              name="name"
              required
              maxLength={100}
              defaultValue={defaultName}
              autocomplete="off"
            />

            <s-choice-list name="status" label="Status">
              {STATUS_OPTIONS.map((option) => (
                <s-choice
                  key={option.value}
                  value={option.value}
                  defaultSelected={option.value === defaultStatus}
                >
                  {option.label}
                </s-choice>
              ))}
            </s-choice-list>

            <s-stack direction="inline" gap="base">
              <s-button
                type="submit"
                variant="primary"
                {...(isSubmitting ? { loading: true } : {})}
              >
                Create template
              </s-button>
              <s-link href="/app/templates">Cancel</s-link>
            </s-stack>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

function TemplateOverview({
  template,
}: {
  template: { name: string; status: TemplateStatus };
}) {
  return (
    <s-page heading={template.name}>
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <s-section heading="Overview">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-text type="strong">Status</s-text>
            <s-badge tone={BADGE_TONES[template.status]}>
              {template.status}
            </s-badge>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Rows">
        <s-paragraph>Rows editor coming in the next phase.</s-paragraph>
      </s-section>
    </s-page>
  );
}

export default function TemplateEditorPage() {
  const { template } = useLoaderData<typeof loader>();

  // A null template means params.id === "new" — render the create form.
  return template ? (
    <TemplateOverview template={template} />
  ) : (
    <NewTemplateForm />
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
