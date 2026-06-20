import { useState } from "react";
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
import { authenticate } from "../../shopify.server";
import {
  setShopMetaobjectDefinitionGid,
  upsertShop,
} from "../../models/shop.server";
import {
  createTemplateForShop,
  getTemplateByIdForShop,
  saveTemplateForShop,
  setTemplateMetaobjectRef,
} from "../../models/template.server";
import {
  ensureSpecTableDefinition,
  readSpecTableMetaobjectRows,
  upsertSpecTableMetaobject,
} from "../../shopify/metaobjects.server";
import { parseRows } from "../../utils/rowsSerialize";
import { SpecTableEditor } from "./SpecTableEditor";

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
  const { session, admin } = await authenticate.admin(request);
  const shop = await upsertShop(session);

  // Creating a new template still comes from the FormData create form.
  if (params.id === "new") {
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
  }

  // Editing an existing template: the editor submits the row array (plus name +
  // status) as JSON so the structured valueParts are not flattened by FormData.
  const payload = (await request.json()) as {
    rows?: unknown;
    name?: unknown;
    status?: unknown;
  };

  // Step 1 — save to Postgres (the source of truth). Shop isolation, the 200-row
  // cap, per-row validation, and key finalization are all enforced server-side
  // inside saveTemplateForShop.
  const result = await saveTemplateForShop(
    shop.id,
    params.id as string,
    payload,
  );
  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }

  // Step 2 — sync the storefront delivery copy to the app-owned metaobject. This
  // runs AFTER the durable Postgres write; a failure here warns but never loses
  // the saved rows. Step 3 reads it back to confirm the row JSON round-tripped.
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

    const savedRows = parseRows(result.data.rows);
    const { gid, handle } = await upsertSpecTableMetaobject(admin, {
      templateId: result.data.id,
      status: result.data.status,
      rows: savedRows,
      updatedAt: new Date().toISOString(),
    });
    await setTemplateMetaobjectRef(shop.id, result.data.id, gid, handle);

    const readback = await readSpecTableMetaobjectRows(admin, result.data.id);
    roundTripOk =
      readback !== null &&
      JSON.stringify(readback) === JSON.stringify(savedRows);
  } catch (error) {
    console.error("[template save] metaobject sync failed", error);
    syncError =
      "Saved to the database, but storefront sync failed. Try saving again.";
  }

  return {
    ok: true as const,
    status: result.data.status,
    syncError,
    roundTripOk,
  };
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
  template: { id: string; name: string; status: TemplateStatus; rows: unknown };
}) {
  // Bumped to remount the editor (resetting its reducer to the persisted rows)
  // when the merchant discards unsaved changes — no reducer reset action needed.
  const [editorNonce, setEditorNonce] = useState(0);

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
        <SpecTableEditor
          key={editorNonce}
          initialName={template.name}
          initialStatus={template.status}
          initialRows={parseRows(template.rows)}
          onDiscard={() => setEditorNonce((nonce) => nonce + 1)}
        />
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
