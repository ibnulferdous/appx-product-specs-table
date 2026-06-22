import { Prisma, TemplateStatus } from "@prisma/client";
import prisma from "../db.server";
import { MAX_TEMPLATE_ROWS, type EditorRow } from "../utils/rows";
import { parseRows, reconcileRowKeys } from "../utils/rowsSerialize";

export const TEMPLATE_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"];

const TEMPLATE_STATUS_SET = new Set(TEMPLATE_STATUSES);
const NAME_MAX_LENGTH = 100;

function getRowCount(rows: unknown): number {
  return Array.isArray(rows) ? rows.length : 0;
}

// Shared name validation, used by both create and save so the two paths can never
// drift apart. Returns the trimmed name, or an error string for the caller to
// surface in the standard `{ ok: false, error }` shape.
function validateName(
  name: unknown,
): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length === 0) {
    return { ok: false, error: "Name is required" };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, name: trimmed };
}

// Coerce an untrusted status into a known TemplateStatus, defaulting to DRAFT.
function resolveStatus(status: unknown): TemplateStatus {
  return typeof status === "string" && TEMPLATE_STATUS_SET.has(status)
    ? (status as TemplateStatus)
    : TemplateStatus.DRAFT;
}

export async function listTemplatesForShop(
  shopId: string,
  { status }: { status?: string | null } = {},
) {
  const where: Prisma.TemplateWhereInput = { shopId };
  if (status && TEMPLATE_STATUS_SET.has(status)) {
    where.status = status as TemplateStatus;
  }

  const templates = await prisma.template.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return templates.map((template) => ({
    ...template,
    rowCount: getRowCount(template.rows),
    assignedProductCount: 0,
  }));
}

export async function countTemplatesForShop(shopId: string) {
  return prisma.template.count({
    where: { shopId },
  });
}

export async function createTemplateForShop(
  shopId: string,
  { name, status }: { name?: unknown; status?: unknown },
) {
  const nameResult = validateName(name);
  if (!nameResult.ok) {
    return { ok: false as const, error: nameResult.error };
  }

  try {
    const template = await prisma.template.create({
      data: {
        shopId,
        name: nameResult.name,
        status: resolveStatus(status),
        rows: [],
      },
    });

    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not create template" };
  }
}

export async function getTemplateByIdForShop(shopId: string, id?: string) {
  if (!id) {
    return null;
  }

  return prisma.template.findFirst({
    where: { id, shopId },
  });
}

/**
 * Persist an existing template's editor state (Editor Step 9.5). Shop isolation
 * (priority #1) is enforced twice over: the row is read through
 * `where: { id, shopId }` first (an unowned/unknown id returns `{ ok: false }`
 * and writes nothing), AND the write itself is shop-scoped via the same
 * `{ id, shopId }` filter — so one shop can never save into another's template
 * even if the prior read were ever bypassed.
 *
 * Server-side re-validation, never trusting the client:
 *  - the untrusted `rows` payload is narrowed with `parseRows`;
 *  - the row count is re-checked against the shared `MAX_TEMPLATE_ROWS` (the
 *    editor's UI cap is UX; this is the real gate, like the reducer);
 *  - provisional row keys are finalized server-authoritatively against the
 *    persisted rows (`reconcileRowKeys`): a row already in the saved template
 *    keeps its finalized key; a brand-new row's key is slugged from its label.
 *
 * `name` / `status` are optional — updated only when provided (and valid), so the
 * editor can save rows alone without disturbing them.
 */
export async function saveTemplateForShop(
  shopId: string,
  id: string,
  { rows, name, status }: { rows?: unknown; name?: unknown; status?: unknown },
) {
  const incoming = parseRows(rows);
  if (incoming.length > MAX_TEMPLATE_ROWS) {
    return {
      ok: false as const,
      error: `A template can have at most ${MAX_TEMPLATE_ROWS} rows`,
    };
  }

  // Read the owned row first — both the ownership gate and the source of the
  // persisted keys the finalization reconciles against.
  const existing = await prisma.template.findFirst({ where: { id, shopId } });
  if (!existing) {
    return { ok: false as const, error: "Template not found" };
  }

  const finalizedRows: EditorRow[] = reconcileRowKeys(
    incoming,
    parseRows(existing.rows),
  );

  const data: Prisma.TemplateUpdateInput = {
    rows: finalizedRows as unknown as Prisma.InputJsonValue,
  };

  if (name !== undefined) {
    const nameResult = validateName(name);
    if (!nameResult.ok) {
      return { ok: false as const, error: nameResult.error };
    }
    data.name = nameResult.name;
  }
  if (status !== undefined) {
    data.status = resolveStatus(status);
  }

  try {
    // Defense in depth (priority #1): the write is shop-scoped itself, not only
    // via the ownership read above. `id` is the unique key and `shopId` is an
    // extended where-unique filter (Prisma 5+, GA), so even a future regression
    // that weakened the read can never cross-write into another shop's template.
    // Mirrors setTemplateMetaobjectRef's shop-scoped write. A shopId mismatch
    // makes the record "not found" → P2025, caught below.
    const template = await prisma.template.update({
      where: { id, shopId },
      data,
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not save template" };
  }
}

/**
 * Store the Shopify metaobject GID + handle on a template after a successful
 * sync (Editor Step 9.5). Shop-scoped via `updateMany` so the write itself
 * carries `shopId` (priority #1) — a no-op if the template is not this shop's.
 */
export async function setTemplateMetaobjectRef(
  shopId: string,
  id: string,
  gid: string,
  handle: string,
) {
  return prisma.template.updateMany({
    where: { id, shopId },
    data: { shopifyMetaobjectGid: gid, shopifyMetaobjectHandle: handle },
  });
}
