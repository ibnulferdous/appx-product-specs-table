import { Prisma, TemplateStatus, type TableStyling } from "@prisma/client";
import prisma from "../db.server";
import { MAX_TEMPLATE_ROWS, newRowId, type EditorRow } from "../utils/rows";
import {
  cloneRowsWithNewIds,
  parseRows,
  reconcileRowKeys,
} from "../utils/rowsSerialize";
import {
  DEFAULT_STYLING_VALUES,
  parseStylingValues,
  type StylingValues,
} from "../utils/tableStyling";
import { normalizeStylePresetStamp } from "../utils/stylePresets";
import { copyName, validateTemplateName } from "../utils/templateName";
import { validateTemplateStatus } from "../utils/templateStatus";

// Name for a template created via create-on-first-save (feature 19); renamable later.
export const DEFAULT_TEMPLATE_NAME = "Untitled template";

// Narrow untrusted `rows` to EditorRow[] and enforce MAX_TEMPLATE_ROWS server-side (the
// editor's cap is UX; this is the real gate). Shared by create + save so the cap message
// can't drift; key finalization differs by path and stays at the call site.
function parseRowsWithinCap(
  rows: unknown,
): { ok: true; rows: EditorRow[] } | { ok: false; error: string } {
  const incoming = parseRows(rows);
  if (incoming.length > MAX_TEMPLATE_ROWS) {
    return {
      ok: false,
      error: `A template can have at most ${MAX_TEMPLATE_ROWS} rows`,
    };
  }
  return { ok: true, rows: incoming };
}

// Every styling knob typed per column (feature 57 Step 4). Explicit, not a mapped Record,
// so each field's Prisma input type is checked.
type TableStylingColumns = {
  rowLayout: string | null;
  gridMinColumnWidthPx: number | null;
  mobileLayout: string | null;
  sectionHeaderStyle: string | null;
  headerFontSizePx: number | null;
  headerFontWeight: string | null;
  headerCase: string | null;
  headerPaddingBlockPx: number | null;
  sectionsCollapsible: boolean;
  sectionsInitialState: string | null;
  sectionGapPx: number | null;
  rowDividerStyle: string | null;
  columnDividerStyle: string | null;
  density: string | null;
  tableMaxWidthPx: number | null;
  tableAlign: string | null;
  outerBorderWidthPx: number | null;
  outerBorderRadiusPx: number | null;
  headerBgColor: string | null;
  headerUnderlineColor: string | null;
  headerTextColor: string | null;
  labelBgColor: string | null;
  valueBgColor: string | null;
  stripeBgColor: string | null;
  borderColor: string | null;
  outerBorderColor: string | null;
  labelTextColor: string | null;
  valueTextColor: string | null;
  fontSize: string | null;
  fontWeight: string | null;
  fontStyle: string | null;
  lineHeight: string | null;
  labelCase: string | null;
  labelWidthPct: number | null;
};

/**
 * Domain `StylingValues` -> full TableStyling column shape. Columns store OVERRIDES: a
 * knob at its default -> NULL; already-nullable fields pass through; numeric fontSize ->
 * px string ("18"). EVERY column is emitted (explicit nulls included) so a reset-to-default
 * is actually cleared — a full replace, never a partial patch. Inverse is
 * `parseStylingValues`, so the round-trip `parse(stylingToDbColumns(v))` deep-equals `v`.
 *
 * `basedOnPreset` / `extraStyles` are deliberately NOT emitted (not in STYLING_FIELD_NAMES;
 * folding them in would break the round-trip law). `saveTemplateForShop` merges the stamp
 * beside this output instead; `extraStyles` stays unwritten (post-MVP).
 */
export function stylingToDbColumns(values: StylingValues): TableStylingColumns {
  const d = DEFAULT_STYLING_VALUES;
  const knob = (value: string, defaultValue: string): string | null =>
    value === defaultValue ? null : value;
  return {
    rowLayout: knob(values.rowLayout, d.rowLayout),
    // Already "null = default" (240px); no knob treatment.
    gridMinColumnWidthPx: values.gridMinColumnWidthPx,
    mobileLayout: knob(values.mobileLayout, d.mobileLayout),
    sectionHeaderStyle: knob(values.sectionHeaderStyle, d.sectionHeaderStyle),
    // Section-header typography (feature 81): all four are already "null = default"
    // nullables — including headerPaddingBlockPx, whose 0 is a real stored value.
    headerFontSizePx: values.headerFontSizePx,
    headerFontWeight: values.headerFontWeight,
    headerCase: values.headerCase,
    headerPaddingBlockPx: values.headerPaddingBlockPx,
    sectionsCollapsible: values.sectionsCollapsible,
    sectionsInitialState: knob(
      values.sectionsInitialState,
      d.sectionsInitialState,
    ),
    // Already "null = default" like the container integers below.
    sectionGapPx: values.sectionGapPx,
    rowDividerStyle: knob(values.rowDividerStyle, d.rowDividerStyle),
    columnDividerStyle: knob(values.columnDividerStyle, d.columnDividerStyle),
    density: knob(values.density, d.density),
    // Container knobs: integers are already "null = default"; only tableAlign needs it.
    tableMaxWidthPx: values.tableMaxWidthPx,
    tableAlign: knob(values.tableAlign, d.tableAlign),
    outerBorderWidthPx: values.outerBorderWidthPx,
    outerBorderRadiusPx: values.outerBorderRadiusPx,
    headerBgColor: values.headerBgColor,
    headerUnderlineColor: values.headerUnderlineColor,
    headerTextColor: values.headerTextColor,
    labelBgColor: values.labelBgColor,
    valueBgColor: values.valueBgColor,
    stripeBgColor: values.stripeBgColor,
    borderColor: values.borderColor,
    outerBorderColor: values.outerBorderColor,
    labelTextColor: values.labelTextColor,
    valueTextColor: values.valueTextColor,
    // String("SMALL") is a no-op; String(18) -> "18" for the px escape hatch.
    fontSize: values.fontSize === null ? null : String(values.fontSize),
    fontWeight: values.fontWeight,
    fontStyle: values.fontStyle,
    lineHeight: values.lineHeight,
    labelCase: values.labelCase,
    labelWidthPct: values.labelWidthPct,
  } satisfies Record<keyof StylingValues, string | number | boolean | null>;
}

// Does the freshly-computed styling column set (plus the basedOnPreset stamp) already match
// the persisted row, over only the columns this app writes? Lets `saveTemplateForShop` skip
// the nested upsert — and its interactive transaction — when styling is unchanged (the
// common case: the editor resends current styling every save). Every column is primitive,
// so `===` per key is complete; extraStyles / id / templateId are never written or compared.
function stylingColumnsMatch(
  columns: TableStylingColumns & { basedOnPreset: string | null },
  row: TableStyling,
): boolean {
  const persisted = row as unknown as Record<string, unknown>;
  return Object.entries(columns).every(
    ([key, value]) => value === persisted[key],
  );
}

// Coerce untrusted status to a known TemplateStatus for the tolerant create/save paths
// (unknown -> DRAFT). Explicit status-change paths use `validateTemplateStatus`, which
// rejects unknown values instead of defaulting.
function resolveStatus(status: unknown): TemplateStatus {
  const result = validateTemplateStatus(status);
  return result.ok ? result.status : TemplateStatus.DRAFT;
}

// Lightweight per-row shape for the templates LIST page. Deliberately not the full Template
// — the list never touches `rows`, styling, metaobject handles.
export type TemplateListSummary = {
  id: string;
  name: string;
  status: TemplateStatus;
  updatedAt: Date;
  rowCount: number;
};

// Server-side page size (Phase 2); 25 matches Shopify's admin index tables. Exported so the
// loader and its tests share one source of truth.
export const TEMPLATES_PAGE_SIZE = 25;

// One page of the list plus the counts the UI needs. `totalAll` is the UNFILTERED count —
// it (not `totalFiltered`) drives the first-run empty state, so a shop with drafts but zero
// Active still shows the table chrome + a "no match" row. `totalFiltered` drives pageCount.
export type TemplateListPage = {
  templates: TemplateListSummary[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalFiltered: number;
  totalAll: number;
};

// One page of the shop's templates (R2 read), paginated + status-filtered SERVER-SIDE
// (Phase 2), most-recently-updated first. This reverses feature 28's client-side filter: a
// client filter over a paginated read only filters the current page. Deliberate shapes:
//  1. Never selects the `rows` blob — computes `jsonb_array_length(rows)` in Postgres
//     (finding F3), `jsonb_typeof`-guarded so a non-array yields 0.
//  2. Keys off `myshopifyDomain` via a JOIN, not a pre-resolved shop.id, so the loader can
//     issue this without first awaiting the shop-row upsert.
//  3. Order `updatedAt DESC, id DESC` — the id tiebreaker makes paging stable.
//  4. page/pageSize are ours (URL-derived, clamped), so LIMIT/OFFSET are safe integers.
// Shop isolation (priority #1): every query pins the shop by its UNIQUE domain, bound never
// concatenated. Pure Postgres — the "Assigned Products" count needs live Shopify data and
// is resolved separately by the loader.
export async function listTemplateSummariesForDomain(
  myshopifyDomain: string,
  options: {
    status?: TemplateStatus | null; // null/undefined = all statuses (the ALL tab)
    page?: number; // 1-based; clamped to a real page below
    pageSize?: number;
  } = {},
): Promise<TemplateListPage> {
  const pageSize = options.pageSize ?? TEMPLATES_PAGE_SIZE;
  const status = options.status ?? null;

  // Counts in one round trip: `totalAll` (whole shop) drives the empty state, `totalFiltered`
  // (respects the filter) drives pageCount. When status is null the FILTER is all-true, so
  // totalFiltered === totalAll. `status` is bound twice and cast to the enum column's type.
  const counts = await prisma.$queryRaw<
    Array<{ totalAll: number | bigint; totalFiltered: number | bigint }>
  >`
    SELECT
      COUNT(*) AS "totalAll",
      COUNT(*) FILTER (
        WHERE ${status}::text IS NULL
           OR t."status" = ${status}::"TemplateStatus"
      ) AS "totalFiltered"
    FROM "Template" t
    JOIN "Shop" s ON s."id" = t."shopId"
    WHERE s."myshopifyDomain" = ${myshopifyDomain}
  `;
  const totalAll = Number(counts[0]?.totalAll ?? 0);
  const totalFiltered = Number(counts[0]?.totalFiltered ?? 0);

  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  // Clamp the requested page: a stale `?page=99` lands on the last real page, a bogus value
  // floors to 1.
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);
  const offset = (page - 1) * pageSize;

  // Reuse the same status predicate on the data read (a WHERE, not a FILTER).
  const statusClause = status
    ? Prisma.sql`AND t."status" = ${status}::"TemplateStatus"`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      status: TemplateStatus;
      updatedAt: Date;
      // int4 from jsonb_array_length; the union keeps a bigint driver from leaking a
      // bigint into the client payload (coerced with Number below).
      rowCount: number | bigint;
    }>
  >`
    SELECT t."id", t."name", t."status", t."updatedAt",
           CASE
             WHEN jsonb_typeof(t."rows") = 'array'
             THEN jsonb_array_length(t."rows")
             ELSE 0
           END AS "rowCount"
    FROM "Template" t
    JOIN "Shop" s ON s."id" = t."shopId"
    WHERE s."myshopifyDomain" = ${myshopifyDomain}
    ${statusClause}
    ORDER BY t."updatedAt" DESC, t."id" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return {
    templates: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      updatedAt: row.updatedAt,
      rowCount: Number(row.rowCount),
    })),
    page,
    pageSize,
    pageCount,
    totalFiltered,
    totalAll,
  };
}

export async function createTemplateForShop(
  shopId: string,
  { name, status, rows }: { name?: unknown; status?: unknown; rows?: unknown },
) {
  const nameResult = validateTemplateName(name);
  if (!nameResult.ok) {
    return { ok: false as const, error: nameResult.error };
  }

  // Mirror saveTemplateForShop's row handling: narrow + cap, then finalize keys. A new
  // template has nothing persisted, so every key is slugged from its label (reconcile vs []).
  const rowsResult = parseRowsWithinCap(rows);
  if (!rowsResult.ok) {
    return { ok: false as const, error: rowsResult.error };
  }
  const finalizedRows: EditorRow[] = reconcileRowKeys(rowsResult.rows, []);

  try {
    const template = await prisma.template.create({
      data: {
        shopId,
        name: nameResult.name,
        status: resolveStatus(status),
        rows: finalizedRows as unknown as Prisma.InputJsonValue,
      },
      // Styling rides along so the returned row can feed `syncTemplateToMetaobject` (Step 7).
      // Always null here (new template), but keeps every sync-feeding write one shape.
      include: { styling: true },
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

  // Styling rides along (Step 4): one query serves the editor loader (which resolves it via
  // parseStylingValues) and the action's ownership reads. No styling row = default styling.
  return prisma.template.findFirst({
    where: { id, shopId },
    include: { styling: true },
  });
}

/**
 * Persist an existing template's editor state (Step 9.5). Shop isolation (priority #1) is
 * enforced twice: the ownership read `where: { id, shopId }` (an unowned/unknown id returns
 * `{ ok: false }` and writes nothing) AND the write's own `{ id, shopId }` filter — so one
 * shop can never save into another's template even if the read were bypassed.
 *
 * Server-side re-validation, never trusting the client: rows narrowed by `parseRows`,
 * re-capped at MAX_TEMPLATE_ROWS, keys finalized against the persisted rows
 * (`reconcileRowKeys`). `name` / `status` update only when provided.
 *
 * `styling` (Step 4): `undefined` leaves the TableStyling row UNTOUCHED (a rows-only or
 * rename save can't clobber a look); present -> `parseStylingValues` (tolerant, cannot fail)
 * -> full-column nested upsert THROUGH this shop-scoped update, so the styling write carries
 * shopId. That nesting is the isolation answer for a model with no shopId column — there is
 * deliberately no free-standing styling write. The upsert also lazily creates the row.
 *
 * `basedOnPreset` (feature 88) rides INSIDE the `styling` branch. Two non-obvious rules:
 * sending `styling` without `basedOnPreset` CLEARS the stamp (absent = null; the write is a
 * full replace); and there is no stamp-only write (the upsert's `create` arm needs a complete
 * column set). The stamp is untrusted, so `normalizeStylePresetStamp` maps junk -> NULL.
 */
export async function saveTemplateForShop(
  shopId: string,
  id: string,
  {
    rows,
    name,
    status,
    styling,
    basedOnPreset,
  }: {
    rows?: unknown;
    name?: unknown;
    status?: unknown;
    styling?: unknown;
    basedOnPreset?: unknown;
  },
) {
  const rowsResult = parseRowsWithinCap(rows);
  if (!rowsResult.ok) {
    return { ok: false as const, error: rowsResult.error };
  }

  // Read the owned row first: ownership gate + source of the persisted keys the finalization
  // reconciles against (`rows`) + the stored styling. Fetching styling here lets the common
  // save skip the nested upsert below (the editor resends unchanged styling every save).
  // `select` limits to the two columns used; ownership holds (unowned id matches nothing).
  const existing = await prisma.template.findFirst({
    where: { id, shopId },
    select: { rows: true, styling: true },
  });
  if (!existing) {
    return { ok: false as const, error: "Template not found" };
  }

  const finalizedRows: EditorRow[] = reconcileRowKeys(
    rowsResult.rows,
    parseRows(existing.rows),
  );

  const data: Prisma.TemplateUpdateInput = {
    rows: finalizedRows as unknown as Prisma.InputJsonValue,
  };

  if (name !== undefined) {
    const nameResult = validateTemplateName(name);
    if (!nameResult.ok) {
      return { ok: false as const, error: nameResult.error };
    }
    data.name = nameResult.name;
  }
  if (status !== undefined) {
    data.status = resolveStatus(status);
  }

  // The columns the payload WOULD write, or `undefined` when it carries no styling. The stamp
  // is spread in BESIDE the mapping's output, never through it (`stylingToDbColumns` owes a
  // round-trip law the stamp isn't part of). Same object feeds both upsert arms below.
  const stylingColumns =
    styling !== undefined
      ? {
          ...stylingToDbColumns(parseStylingValues(styling)),
          basedOnPreset: normalizeStylePresetStamp(basedOnPreset),
        }
      : undefined;

  // What to actually upsert — or `undefined` when there is nothing to write: the payload
  // omitted styling, or the incoming columns are byte-for-byte the stored row. In that no-op
  // case we skip the upsert AND its interactive transaction. A missing stored row (first
  // styling save) always counts as a change, so the row still gets created.
  const stylingUpsertColumns =
    stylingColumns !== undefined &&
    (existing.styling == null ||
      !stylingColumnsMatch(stylingColumns, existing.styling))
      ? stylingColumns
      : undefined;

  try {
    // Defense in depth (priority #1): the write is shop-scoped itself, not only via the read
    // above. `{ id, shopId }` is an extended where-unique (Prisma 5+); a mismatch is "not
    // found" -> P2025, caught below. Both write paths carry it.
    if (stylingUpsertColumns) {
      // Styling changed: nest the full-column upsert INSIDE the shop-scoped update and
      // `include` the written row so the caller's storefront sync (Step 7) writes the real look.
      const template = await prisma.template.update({
        where: { id, shopId },
        data: {
          ...data,
          styling: {
            upsert: {
              create: stylingUpsertColumns,
              update: stylingUpsertColumns,
            },
          },
        },
        include: { styling: true },
      });
      return { ok: true as const, data: template };
    }

    // Fast path: nothing to write for styling. A plain update with no nested write and no
    // `include` is a single `UPDATE … RETURNING` (the include path is an interactive
    // transaction). Reattach the styling we already read (UNCHANGED this save) so the returned
    // shape still carries the relation the sync consumes.
    const template = await prisma.template.update({
      where: { id, shopId },
      data,
    });
    return {
      ok: true as const,
      data: { ...template, styling: existing.styling ?? null },
    };
  } catch {
    return { ok: false as const, error: "Could not save template" };
  }
}

/**
 * Store the Shopify metaobject GID + handle after a successful sync (Step 9.5). Shop-scoped
 * via the `{ id, shopId }` where-unique so the write carries shopId (priority #1). Uses
 * `update`, not `updateMany`: a missing row or shopId mismatch is a real bug here (the caller
 * just persisted the template for this shop), so it must surface as P2025 rather than no-op.
 * The caller (`syncTemplateToMetaobject`) catches the throw as a storefront-sync warning.
 */
export async function setTemplateMetaobjectRef(
  shopId: string,
  id: string,
  gid: string,
  handle: string,
) {
  return prisma.template.update({
    where: { id, shopId },
    data: { shopifyMetaobjectGid: gid, shopifyMetaobjectHandle: handle },
  });
}

/**
 * Rename an owned template (feature 27). A rows-untouching sibling of `saveTemplateForShop`:
 * the list page has no in-memory rows to resend, so reusing save (which treats
 * `parseRows(undefined)` as `[]`) would clobber the rows. Writes `name` only.
 *
 * Shop isolation (priority #1): the `{ id, shopId }` where-unique scopes the write — a
 * cross-shop/unknown id is P2025. No metaobject sync (a name isn't part of storefront copy).
 */
export async function renameTemplateForShop(
  shopId: string,
  id: string,
  name: unknown,
) {
  const nameResult = validateTemplateName(name);
  if (!nameResult.ok) {
    return { ok: false as const, error: nameResult.error };
  }
  try {
    const template = await prisma.template.update({
      where: { id, shopId },
      data: { name: nameResult.name }, // ONLY name; rows + status untouched
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not rename template" };
  }
}

/**
 * Set an owned template's status (feature 36). A rows-untouching sibling of
 * `renameTemplateForShop` (reusing save would clobber rows). Unknown status is REJECTED
 * (`validateTemplateStatus`) — an explicit status change is deliberate, never defaulted.
 *
 * Shop isolation (priority #1): the `{ id, shopId }` where-unique scopes the write (P2025 on
 * mismatch). No sync here — the CALLER owns the storefront re-sync (shared
 * `syncTemplateToMetaobject`), keeping this a pure DB write. Returns the row so it can feed it.
 */
export async function setTemplateStatusForShop(
  shopId: string,
  id: string,
  status: unknown,
) {
  const statusResult = validateTemplateStatus(status);
  if (!statusResult.ok) {
    return { ok: false as const, error: statusResult.error };
  }
  try {
    const template = await prisma.template.update({
      where: { id, shopId },
      data: { status: statusResult.status }, // ONLY status; rows + name untouched
      // Step 7: load styling so the caller's re-sync REWRITES the metaobject with the real
      // look — else an ACTIVE→DRAFT→ACTIVE flip would silently reset a live table. Read-side.
      include: { styling: true },
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not update status" };
  }
}

/**
 * Duplicate an owned template (feature 20). Shop isolation (priority #1): the source is read
 * shop-scoped, so a foreign id reads nothing and no copy is created. The copy is named
 * "{source} (copy)" (length-safe), starts DRAFT (a copy must never be live on the storefront),
 * and gets a fresh row id per row (`cloneRowsWithNewIds`; ids must never be reused,
 * data-model.md §7). No sync — DRAFT isn't rendered, so the next Save syncs it.
 */
export async function duplicateTemplateForShop(
  shopId: string,
  templateId: string,
) {
  const source = await prisma.template.findFirst({
    where: { id: templateId, shopId },
    include: { styling: true },
  });
  if (!source) {
    return { ok: false as const, error: "Template not found" };
  }

  // source.name is already a valid persisted name, so copyName yields a valid one; the
  // validate call keeps every name on one validator path.
  const nameResult = validateTemplateName(copyName(source.name));
  if (!nameResult.ok) {
    return { ok: false as const, error: nameResult.error };
  }

  const clonedRows = cloneRowsWithNewIds(parseRows(source.rows), newRowId);
  const finalizedRows: EditorRow[] = reconcileRowKeys(clonedRows, []);

  // Copy a styled template's styling in full (data-model.md §5): every override column,
  // basedOnPreset provenance, and extraStyles verbatim (only id/templateId are the new row's
  // own). No source row -> no styling in the create (absence = all defaults).
  let stylingCreate: Prisma.TemplateCreateInput["styling"];
  if (source.styling) {
    // Drop the source row's own identity; the copy mints its own.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, templateId: _templateId, ...stylingCopy } = source.styling;
    stylingCreate = {
      create: {
        ...stylingCopy,
        extraStyles: stylingCopy.extraStyles as Prisma.InputJsonValue,
      },
    };
  }

  try {
    const template = await prisma.template.create({
      data: {
        shopId,
        name: nameResult.name,
        status: TemplateStatus.DRAFT,
        rows: finalizedRows as unknown as Prisma.InputJsonValue,
        ...(stylingCreate ? { styling: stylingCreate } : {}),
      },
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not duplicate template" };
  }
}

/**
 * Delete an owned template (feature 20). Shop-scoped via `deleteMany({ where: { id, shopId } })`:
 * a cross-shop id matches nothing and is a no-op (`count === 0`), never a leak (priority #1).
 * The route does the best-effort metaobject cleanup BEFORE this so a storefront-readable
 * metaobject can't outlive its template. Returns `count` so the caller can tell a real delete
 * from a no-op.
 */
export async function deleteTemplateForShop(
  shopId: string,
  templateId: string,
) {
  try {
    const result = await prisma.template.deleteMany({
      where: { id: templateId, shopId },
    });
    return { ok: true as const, count: result.count };
  } catch (error) {
    // Match the sibling write helpers' structured failure instead of letting a Prisma rejection
    // escape as an unhandled 500; keep the cause in the logs for the operator.
    console.error("deleteTemplateForShop failed", { shopId, templateId, error });
    return { ok: false as const, error: "Could not delete template" };
  }
}
