// Sync the storefront delivery copy of a template to a Shopify metaobject
// (Editor Step 9.5). Postgres is the source of truth; this metaobject is written
// AFTER the Postgres save (code-standards.md "Data and Storage") and is the only
// thing Liquid can read on the storefront.
//
// Same conventions as metafieldDefinitions.server.ts: every `#graphql` operation
// was validated with `validate_graphql_codeblocks` against API version 2025-10;
// the response narrowing is pure and unit-tested; the live `admin.graphql` calls
// are mocked at the boundary, not unit-tested. Shop isolation is STRUCTURAL —
// `authenticate.admin(request)` binds the client to this shop's Admin token, so
// every mutation/query here can only touch this shop's data (priority #1).
//
// The definition is app-owned: the type is prefixed with `$app:`, which reserves
// it for this app's exclusive use so neither the merchant nor another app can
// alter its structure (data safety). `storefront: PUBLIC_READ` keeps the payload
// readable by the Theme App Extension; `admin: MERCHANT_READ_WRITE` matches
// Shopify's app-owned-metaobject example.

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { EditorRow } from "../utils/rows";
import { parseRows } from "../utils/rowsSerialize";

// The app-reserved metaobject type (data-model.md §10). `$app:` resolves to
// `app--<app-id>--appx_spec_table` server-side within this app's context, so the
// same literal is used for the definition, the upsert handle, and the read-back.
export const SPEC_TABLE_METAOBJECT_TYPE = "$app:appx_spec_table";

/** The storefront-lookup handle for a template's metaobject (data-model.md §10). */
export function specTableHandle(templateId: string): string {
  return `template-${templateId}`;
}

// --- GraphQL (all validated at 2025-10) ------------------------------------

const DEFINITION_BY_TYPE_QUERY = `#graphql
  query SpecTableDefinitionByType($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      type
    }
  }`;

const DEFINITION_CREATE_MUTATION = `#graphql
  mutation CreateSpecTableDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const METAOBJECT_UPSERT_MUTATION = `#graphql
  mutation UpsertSpecTable($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const METAOBJECT_BY_HANDLE_QUERY = `#graphql
  query SpecTableByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
      handle
      rows: field(key: "rows") {
        value
      }
    }
  }`;

const METAOBJECT_ID_BY_HANDLE_QUERY = `#graphql
  query SpecTableIdByHandle($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      id
    }
  }`;

const METAOBJECT_DELETE_MUTATION = `#graphql
  mutation DeleteSpecTable($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
        code
      }
    }
  }`;

// The field definitions for the appx_spec_table metaobject (data-model.md §10).
const SPEC_TABLE_FIELD_DEFINITIONS = [
  { name: "Template ID", key: "template_id", type: "single_line_text_field" },
  { name: "Status", key: "status", type: "single_line_text_field" },
  { name: "Rows", key: "rows", type: "json" },
  { name: "Styling", key: "styling", type: "json" },
  { name: "Updated At", key: "updated_at", type: "single_line_text_field" },
];

// --- Pure narrowing helpers (unit-tested) ----------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Pull a non-empty user-error message list out of a mutation payload, or []. */
export function readUserErrors(payload: unknown): string[] {
  if (!isRecord(payload)) return [];
  const errors = payload.userErrors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((error) => (isRecord(error) ? asString(error.message) : ""))
    .filter((message) => message !== "");
}

/** Read the definition GID from a metaobjectDefinitionByType query response. */
export function readDefinitionByTypeId(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const definition = data.metaobjectDefinitionByType;
  if (!isRecord(definition)) return null;
  const id = asString(definition.id);
  return id || null;
}

/** Read the created definition GID (or surface user errors) from a create payload. */
export function readDefinitionCreateId(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const payload = data.metaobjectDefinitionCreate;
  if (!isRecord(payload)) return null;
  const definition = payload.metaobjectDefinition;
  if (!isRecord(definition)) return null;
  const id = asString(definition.id);
  return id || null;
}

/** Read the upserted metaobject's GID + handle from the mutation payload. */
export function readUpsertResult(
  json: unknown,
): { gid: string; handle: string } | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const payload = data.metaobjectUpsert;
  if (!isRecord(payload)) return null;
  const metaobject = payload.metaobject;
  if (!isRecord(metaobject)) return null;
  const gid = asString(metaobject.id);
  const handle = asString(metaobject.handle);
  return gid && handle ? { gid, handle } : null;
}

/**
 * Read the `rows` field value (a JSON string) back out of a metaobjectByHandle
 * response, parsed into the editor row array. Returns `null` when the metaobject
 * or field is absent, the JSON does not parse, or the payload is not a clean
 * EditorRow[] — the round-trip check treats any of those as "did not survive".
 *
 * Every element is narrowed through the shared `parseRows` rather than cast, so a
 * malformed payload (`[42]`, `[{ rowType: "NOPE" }]`) can never masquerade as
 * `EditorRow[]`. `parseRows` DROPS anything that does not narrow, so a length
 * mismatch means the stored payload was not our row shape: return `null` (did not
 * survive) rather than a silently cleaned array, which could mask corruption and
 * falsely pass the round-trip equality check in route.tsx.
 */
export function readMetaobjectRows(json: unknown): EditorRow[] | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const metaobject = data.metaobjectByHandle;
  if (!isRecord(metaobject)) return null;
  const rowsField = metaobject.rows;
  if (!isRecord(rowsField)) return null;
  const value = asString(rowsField.value);
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const rows = parseRows(parsed);
    return rows.length === parsed.length ? rows : null;
  } catch {
    return null;
  }
}

/** Read the metaobject GID from a metaobjectByHandle response (id-only query). */
export function readMetaobjectIdByHandle(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const metaobject = data.metaobjectByHandle;
  if (!isRecord(metaobject)) return null;
  const id = asString(metaobject.id);
  return id || null;
}

/** Read the deleted metaobject GID from a metaobjectDelete payload, or null. */
export function readMetaobjectDeleteId(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const data = json.data;
  if (!isRecord(data)) return null;
  const payload = data.metaobjectDelete;
  if (!isRecord(payload)) return null;
  const id = asString(payload.deletedId);
  return id || null;
}

// --- Live Admin API calls (mocked at the boundary in tests) -----------------

/**
 * Ensure the app-owned `appx_spec_table` metaobject definition exists, returning
 * its GID. Created at most once per shop:
 *  - a known GID (passed from `Shop.metaobjectDefinitionGid`) short-circuits;
 *  - otherwise look it up by type (idempotency: it may exist in Shopify even if
 *    the Shop row has no GID — e.g. a prior partial run);
 *  - otherwise create it. A "type already taken" race is recovered by a final
 *    lookup rather than failing (mirrors the upsertShop P2002 pattern).
 */
export async function ensureSpecTableDefinition(
  admin: AdminApiContext,
  existingGid: string | null,
): Promise<string> {
  if (existingGid) return existingGid;

  const found = await admin.graphql(DEFINITION_BY_TYPE_QUERY, {
    variables: { type: SPEC_TABLE_METAOBJECT_TYPE },
  });
  const foundId = readDefinitionByTypeId(await found.json());
  if (foundId) return foundId;

  const created = await admin.graphql(DEFINITION_CREATE_MUTATION, {
    variables: {
      definition: {
        name: "Appx Spec Table",
        type: SPEC_TABLE_METAOBJECT_TYPE,
        access: { admin: "MERCHANT_READ_WRITE", storefront: "PUBLIC_READ" },
        fieldDefinitions: SPEC_TABLE_FIELD_DEFINITIONS,
      },
    },
  });
  const createdJson: unknown = await created.json();
  const createdId = readDefinitionCreateId(createdJson);
  if (createdId) return createdId;

  // Create reported errors (most likely the definition already exists from a
  // concurrent first save): re-query by type before giving up.
  const recheck = await admin.graphql(DEFINITION_BY_TYPE_QUERY, {
    variables: { type: SPEC_TABLE_METAOBJECT_TYPE },
  });
  const recheckId = readDefinitionByTypeId(await recheck.json());
  if (recheckId) return recheckId;

  const errors = isRecord(createdJson)
    ? readUserErrors(
        isRecord(createdJson.data)
          ? createdJson.data.metaobjectDefinitionCreate
          : null,
      )
    : [];
  throw new Error(
    `Could not create the appx_spec_table metaobject definition${
      errors.length ? `: ${errors.join("; ")}` : ""
    }`,
  );
}

/**
 * Upsert (create-or-update by handle) the template's metaobject entry, returning
 * its GID + handle to store back on the Template. The `rows` field is the
 * finalized editor rows serialized to a JSON string (data-model.md §10 — the same
 * row shape, no storefront-only reshape). `styling` is `{}` for now (TableStyling
 * is a later slice). Sync runs for every status; the storefront decides
 * visibility (data-model.md §8). Throws on user errors so the caller can warn.
 */
export async function upsertSpecTableMetaobject(
  admin: AdminApiContext,
  {
    templateId,
    status,
    rows,
    updatedAt,
  }: {
    templateId: string;
    status: string;
    rows: EditorRow[];
    updatedAt: string;
  },
): Promise<{ gid: string; handle: string }> {
  const handle = specTableHandle(templateId);
  const response = await admin.graphql(METAOBJECT_UPSERT_MUTATION, {
    variables: {
      handle: { type: SPEC_TABLE_METAOBJECT_TYPE, handle },
      metaobject: {
        fields: [
          { key: "template_id", value: templateId },
          { key: "status", value: status },
          { key: "rows", value: JSON.stringify(rows) },
          { key: "styling", value: "{}" },
          { key: "updated_at", value: updatedAt },
        ],
      },
    },
  });
  const json: unknown = await response.json();

  const result = readUpsertResult(json);
  if (result) return result;

  const errors = isRecord(json)
    ? readUserErrors(isRecord(json.data) ? json.data.metaobjectUpsert : null)
    : [];
  throw new Error(
    `Could not sync the spec table metaobject${
      errors.length ? `: ${errors.join("; ")}` : ""
    }`,
  );
}

/**
 * Read a template's metaobject back by handle and return its `rows` payload,
 * parsed (Editor Step 9.5 round-trip check). `null` when the metaobject is
 * missing or the JSON did not survive.
 */
export async function readSpecTableMetaobjectRows(
  admin: AdminApiContext,
  templateId: string,
): Promise<EditorRow[] | null> {
  const response = await admin.graphql(METAOBJECT_BY_HANDLE_QUERY, {
    variables: {
      handle: {
        type: SPEC_TABLE_METAOBJECT_TYPE,
        handle: specTableHandle(templateId),
      },
    },
  });
  return readMetaobjectRows(await response.json());
}

/**
 * Best-effort delete of a template's storefront metaobject (feature 20). Called
 * by the delete route action BEFORE the Postgres row is removed, so a
 * storefront-readable metaobject can never outlive its template (priority #2,
 * storefront correctness). Postgres is the source of truth, so this is best-effort
 * by design: any failure (a thrown request, GraphQL userErrors) is logged and
 * swallowed — it never throws, so it cannot block the durable Postgres delete.
 *
 * Resolves the metaobject GID from the template's stored `shopifyMetaobjectGid`
 * when present; otherwise looks it up by handle (`template-{id}`). A template that
 * was never synced has no metaobject, so a null GID is a clean no-op.
 */
export async function deleteSpecTableMetaobject(
  admin: AdminApiContext,
  { gid, templateId }: { gid: string | null; templateId: string },
): Promise<void> {
  try {
    let id = gid;
    if (!id) {
      const found = await admin.graphql(METAOBJECT_ID_BY_HANDLE_QUERY, {
        variables: {
          handle: {
            type: SPEC_TABLE_METAOBJECT_TYPE,
            handle: specTableHandle(templateId),
          },
        },
      });
      id = readMetaobjectIdByHandle(await found.json());
    }
    if (!id) return; // never synced — nothing to delete

    const response = await admin.graphql(METAOBJECT_DELETE_MUTATION, {
      variables: { id },
    });
    const json: unknown = await response.json();
    if (readMetaobjectDeleteId(json)) return; // deleted

    const errors = isRecord(json)
      ? readUserErrors(isRecord(json.data) ? json.data.metaobjectDelete : null)
      : [];
    console.error(
      `[template delete] metaobject delete reported errors${
        errors.length ? `: ${errors.join("; ")}` : ""
      }`,
    );
  } catch (error) {
    console.error("[template delete] metaobject delete failed", error);
  }
}
