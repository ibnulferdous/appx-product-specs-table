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
// alter its structure (data safety). The definition itself is now declared
// declaratively in `shopify.app.toml` ([metaobjects.app.appx_spec_table]) and
// distributed on deploy/install, so this module only writes/reads/deletes
// ENTRIES — it no longer creates the definition at runtime (data-model.md §10).

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { EditorRow } from "../utils/rows";
import { parseRows } from "../utils/rowsSerialize";
import {
  serializeStylingOverrides,
  type StylingValues,
} from "../utils/tableStyling";
import {
  formatCssVarDeclarations,
  stylingToCssVars,
  stylingToModifierClasses,
} from "../utils/tableStylingCss";

// The app-reserved metaobject type (data-model.md §10). `$app:` resolves to
// `app--<app-id>--appx_spec_table` server-side within this app's context, so the
// same literal is used for the definition, the upsert handle, and the read-back.
export const SPEC_TABLE_METAOBJECT_TYPE = "$app:appx_spec_table";

/** The storefront-lookup handle for a template's metaobject (data-model.md §10). */
export function specTableHandle(templateId: string): string {
  return `template-${templateId}`;
}

// --- GraphQL (all validated at 2025-10) ------------------------------------

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

/**
 * The precomputed PRESENTATION half of a template's styling (feature 57 Step 7) —
 * the `styling_css` metaobject field. The server derives it here, at sync time,
 * because Liquid cannot import the Step 2 mapping: re-deriving classes/vars in a
 * template language would be a fourth copy of a 20-knob mapping with no
 * exhaustiveness checking, so a knob added in a later step would silently fail on
 * the storefront ONLY. Precomputing keeps `tableStylingCss.ts` the single source of
 * truth across every consumer and leaves the Liquid block with zero styling logic
 * (data-model.md §10).
 *
 * `vars` is the SAME `formatCssVarDeclarations` join the Step 6 preview emits into
 * its `<style>` block, so the preview and the storefront cannot drift — only the
 * carrier differs (a rule there, an inline `style` attribute here). An all-inherit
 * value yields `""`, which renders an empty `style` attribute — i.e. the theme's
 * own look, exactly as before this step.
 */
export function stylingCssPayload(styling: StylingValues): {
  classes: string;
  vars: string;
} {
  return {
    classes: stylingToModifierClasses(styling).join(" "),
    vars: formatCssVarDeclarations(stylingToCssVars(styling)),
  };
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
 * Upsert (create-or-update by handle) the template's metaobject entry, returning
 * its GID + handle to store back on the Template. The `rows` field is the
 * finalized editor rows serialized to a JSON string (data-model.md §10 — the same
 * row shape, no storefront-only reshape).
 *
 * Styling rides along in TWO fields (feature 57 Step 7): `styling` is the DATA —
 * the overrides-only wire shape, the same `serializeStylingOverrides` output the
 * Save payload carries — and `styling_css` is the PRECOMPUTED presentation Liquid
 * prints verbatim. `styling` takes a resolved `StylingValues`, never `unknown`:
 * resolution (and the whitelist validation that makes these values safe to inline
 * into a storefront `style` attribute) belongs at `parseStylingValues`, upstream of
 * here. Sync runs for every status; the storefront decides visibility
 * (data-model.md §8). Throws on user errors so the caller can warn.
 */
export async function upsertSpecTableMetaobject(
  admin: AdminApiContext,
  {
    templateId,
    status,
    rows,
    styling,
    updatedAt,
  }: {
    templateId: string;
    status: string;
    rows: EditorRow[];
    styling: StylingValues;
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
          {
            key: "styling",
            value: JSON.stringify(serializeStylingOverrides(styling)),
          },
          {
            key: "styling_css",
            value: JSON.stringify(stylingCssPayload(styling)),
          },
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
