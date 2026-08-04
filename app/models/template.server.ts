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

// Default name for a template created via the editor's create-on-first-save flow
// (the merchant lands in the editor, not a name form). Renaming is a later slice;
// until then a new template carries this name. See
// `context/features/19-template-create-on-first-save.md`.
export const DEFAULT_TEMPLATE_NAME = "Untitled template";

// Shared row-payload handling for create and save: narrow the untrusted `rows`
// into the typed EditorRow[] contract (`parseRows`) and enforce the shared
// MAX_TEMPLATE_ROWS cap server-side (the editor's UI cap is UX; this is the real
// gate). Both paths run this so the cap message can never drift apart — mirrors
// why `validateName` is shared. Key finalization differs by path (create
// reconciles against `[]`, save against the persisted rows), so it stays at the
// call site.
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

// The TableStyling column shape (feature 57 Step 4): every styling knob, typed
// per column. Kept explicit (not a mapped Record) so each field's Prisma input
// type is checked — the `satisfies` on the return literal below still guarantees
// completeness against the Step 1 vocabulary.
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
 * Domain `StylingValues` -> the full TableStyling column shape (feature 57
 * Step 4). Columns store OVERRIDES: a layout knob at its flagged default ->
 * NULL (data-model.md §5: "null = the flagged default"); a nullable field at
 * inherit is already null; `sectionsCollapsible` is written verbatim (its
 * `false` default IS the column default); a numeric fontSize becomes the
 * all-digit px string ("18"). EVERY column is emitted, explicit nulls included,
 * so a knob reset to default is actually cleared in the DB — the write is a
 * full replace, never a partial patch (the Step 1 serializer's doc-comment law
 * made code). Read-side inverse: `parseStylingValues(row)` — the Step 1
 * tolerant parse doubles as the one DB decoder (NULL -> default/inherit,
 * "18" -> 18, corrupt legacy values degrade per-field), so the round-trip law
 * `parseStylingValues(stylingToDbColumns(v))` deep-equals `v` holds for every
 * valid value (tested).
 *
 * `basedOnPreset` / `extraStyles` are deliberately NOT emitted, and feature 88
 * did not change that. The stamp is not a member of `STYLING_FIELD_NAMES` and
 * `parseStylingValues` neither reads nor emits it, so folding it in here would
 * break the round-trip law above. `saveTemplateForShop` merges it BESIDE this
 * function's output instead; `extraStyles` stays unwritten (post-MVP).
 */
export function stylingToDbColumns(values: StylingValues): TableStylingColumns {
  const d = DEFAULT_STYLING_VALUES;
  const knob = (value: string, defaultValue: string): string | null =>
    value === defaultValue ? null : value;
  return {
    rowLayout: knob(values.rowLayout, d.rowLayout),
    // Already "null = default" (the stylesheet's 240px), so no `knob` treatment.
    gridMinColumnWidthPx: values.gridMinColumnWidthPx,
    mobileLayout: knob(values.mobileLayout, d.mobileLayout),
    sectionHeaderStyle: knob(values.sectionHeaderStyle, d.sectionHeaderStyle),
    // Section-header typography (feature 81). All four are already
    // "null = default" nullables, so none of them needs the `knob` treatment —
    // including `headerPaddingBlockPx`, whose 0 is a real stored value and must
    // pass through rather than being folded into null.
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
    // Container knobs. The three integers are already "null = default", so they
    // pass straight through; only `tableAlign` needs the keyword treatment.
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
    // String("SMALL") is a no-op for keywords; String(18) -> "18" for the px
    // escape hatch — the one column whose domain type is wider than its column.
    fontSize: values.fontSize === null ? null : String(values.fontSize),
    fontWeight: values.fontWeight,
    fontStyle: values.fontStyle,
    lineHeight: values.lineHeight,
    labelCase: values.labelCase,
    labelWidthPct: values.labelWidthPct,
  } satisfies Record<keyof StylingValues, string | number | boolean | null>;
}

// Does a freshly-computed styling column set (stylingToDbColumns output plus the
// basedOnPreset stamp) already match the persisted TableStyling row, over ONLY
// the columns this app writes? Lets `saveTemplateForShop` skip the nested styling
// upsert — and the interactive transaction it forces — when the incoming styling
// is byte-for-byte what's stored (the common case: the editor resends the current
// styling on every save, changed or not). Every written column is a primitive, so
// `===` per key is a complete equality; `extraStyles` / `id` / `templateId` are
// never written by the mapping, so they are never compared.
function stylingColumnsMatch(
  columns: TableStylingColumns & { basedOnPreset: string | null },
  row: TableStyling,
): boolean {
  const persisted = row as unknown as Record<string, unknown>;
  return Object.entries(columns).every(
    ([key, value]) => value === persisted[key],
  );
}

// Coerce an untrusted status into a known TemplateStatus for the TOLERANT paths
// (create / save), defaulting anything unknown to DRAFT. The explicit
// status-change paths use `validateTemplateStatus` instead, which REJECTS unknown
// values rather than silently defaulting.
function resolveStatus(status: unknown): TemplateStatus {
  const result = validateTemplateStatus(status);
  return result.ok ? result.status : TemplateStatus.DRAFT;
}

// The lightweight per-row shape the templates LIST page renders: name, status,
// row count, last-updated. Deliberately NOT the full Template — the list never
// touches `rows`, styling, metaobject handles, etc.
export type TemplateListSummary = {
  id: string;
  name: string;
  status: TemplateStatus;
  updatedAt: Date;
  rowCount: number;
};

// The templates list is paginated server-side (Phase 2). 25 matches Shopify's own
// admin index tables and keeps first paint light. Exported so the loader and its
// tests share one source of truth for the page size.
export const TEMPLATES_PAGE_SIZE = 25;

// One page of the templates list plus the counts the UI needs. `totalAll` is the
// shop's UNFILTERED template count — it (not `totalFiltered`) decides the
// first-run empty state, so a shop with drafts but zero Active still shows the
// table chrome + a "no match" row under the Active filter, never the big
// "create your first template" splash. `totalFiltered` drives `pageCount`.
export type TemplateListPage = {
  templates: TemplateListSummary[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalFiltered: number;
  totalAll: number;
};

// The list read for `app/routes/app.templates.tsx` (step 103 read-pattern R2),
// now paginated + status-filtered SERVER-SIDE (Phase 2). Returns ONE page of the
// shop's templates, most-recently-updated first, plus the counts the UI needs.
//
// ⚠️ This reverses feature 28's "filter on the client" model. Once the read is
// paginated, a client-side status filter is wrong by construction — it would
// filter only the rows on the current page, so an "Active" tab could show a
// different count on every page. So the status filter moved back onto the WHERE
// (and the COUNT), and the loader no longer ships the whole list.
//
// Deliberate shapes:
//
//  1. It NEVER selects the `rows` JSON blob. The list shows only a row COUNT, so
//     this asks Postgres to compute `jsonb_array_length(rows)` and returns just
//     that integer per template (step 103 finding F3). `jsonb_typeof` guards the
//     count so a non-array `rows` yields 0.
//
//  2. It keys off the shop's `myshopifyDomain` (a server-authoritative session
//     value) via a JOIN, NOT a pre-resolved `shop.id`, so the loader can issue
//     this WITHOUT first awaiting the shop-row upsert (one Neon round trip off
//     the critical path).
//
//  3. Order is `updatedAt DESC, id DESC` — the `id` tiebreaker makes paging
//     STABLE across the non-unique `updatedAt` (without it, two templates saved
//     in the same second could swap places between pages and a row could be
//     skipped or shown twice).
//
//  4. `page` and `pageSize` come from us (URL-derived then clamped by the caller,
//     re-clamped here to `[1, pageCount]`), so LIMIT/OFFSET are safe integers;
//     they're bound parameters regardless.
//
// Shop isolation (priority #1) is total: every query pins the shop by its UNIQUE
// domain, bound (never concatenated) — no injection surface. Stays pure Postgres:
// the "Assigned Products" count needs live Shopify data and is resolved
// separately by the loader (`resolveAssignedProductCounts`, feature 48).
export async function listTemplateSummariesForDomain(
  myshopifyDomain: string,
  options: {
    // The status to filter to, or null/undefined for "all statuses" (the ALL tab).
    status?: TemplateStatus | null;
    // 1-based requested page; clamped to a real page below.
    page?: number;
    pageSize?: number;
  } = {},
): Promise<TemplateListPage> {
  const pageSize = options.pageSize ?? TEMPLATES_PAGE_SIZE;
  const status = options.status ?? null;

  // Counts in one round trip: `totalAll` is the shop's whole template count (drives
  // the first-run empty state), `totalFiltered` respects the status filter (drives
  // pageCount). When `status` is null the FILTER predicate is all-true, so
  // totalFiltered === totalAll. `status` is bound twice (both NULL in the ALL case)
  // and cast to the "TemplateStatus" enum to compare against the enum column.
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
  // Clamp the requested page into range: a stale `?page=99` lands on the last real
  // page rather than an empty one, and a bogus/negative value floors to 1.
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);
  const offset = (page - 1) * pageSize;

  // Reuse the same status predicate on the data read (as a WHERE, not a FILTER).
  const statusClause = status
    ? Prisma.sql`AND t."status" = ${status}::"TemplateStatus"`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      status: TemplateStatus;
      updatedAt: Date;
      // int4 from `jsonb_array_length`; the pg driver hands int4 back as a JS
      // number, but the union keeps a bigint driver from silently leaking one
      // into the client payload (coerced with `Number` below).
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

  // Mirror saveTemplateForShop's row handling: narrow + cap the untrusted rows,
  // then finalize keys. A brand-new template has nothing persisted, so every
  // row's key is finalized from its label (reconcile against []).
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
      // Styling rides along so the returned row can feed `syncTemplateToMetaobject`
      // (feature 57 Step 7). Always `null` here — a brand-new template has no
      // TableStyling row yet — but including it keeps every sync-feeding write
      // returning the same shape.
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

  // Styling rides along (feature 57 Step 4): one query serves the editor loader
  // (which resolves it via `parseStylingValues`) and the action's ownership reads
  // (which ignore it). No styling row = fully-default styling (no backfill).
  return prisma.template.findFirst({
    where: { id, shopId },
    include: { styling: true },
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
 *
 * `styling` (feature 57 Step 4) follows the same optionality: `undefined` leaves
 * the TableStyling row UNTOUCHED (a rows-only or rename save can never clobber a
 * template's look); present -> `parseStylingValues` (never trust the client;
 * tolerant, cannot fail — a malformed payload degrades to defaults rather than
 * blocking a save that also carries rows) -> full-column nested upsert THROUGH
 * this shop-scoped template update, so the styling write itself carries shopId.
 * That nesting is the isolation answer for a model with no shopId column — there
 * is deliberately no free-standing styling write function anywhere (a
 * bare-templateId path would be a cross-shop hole waiting for a caller). The
 * upsert is also the lazy row creation: no row until the first styling save.
 *
 * `basedOnPreset` (feature 88 step 89) is the style-preset provenance stamp, and
 * it **rides inside the `styling` branch** — a save that omits `styling` leaves
 * the stamp alone along with everything else in the row. Two consequences a
 * second caller has to know, because neither is guessable:
 *
 *  - **Sending `styling` without `basedOnPreset` CLEARS the stamp.** Absent means
 *    null, not "leave it"; the styling write is a full replace and the stamp
 *    follows the same law rather than inventing a second one beside it.
 *  - There is deliberately no stamp-only write. The nested upsert's `create` arm
 *    needs a complete column set, so a stamp-only path would have to invent one
 *    out of defaults and would silently clobber a styled template's look.
 *
 * The value is untrusted client JSON, so it goes through
 * `normalizeStylePresetStamp`: an unknown id, a hand-edited string or a
 * non-string all store NULL rather than junk.
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

  // Read the owned row first — the ownership gate, the source of the persisted
  // keys the finalization reconciles against (`rows`), AND the currently-stored
  // styling (`styling`). Fetching styling HERE is what lets the common save skip
  // the nested upsert below: the editor resends the current styling on every
  // save, so most saves carry styling that is unchanged from the stored row.
  // `select` keeps this to the two columns actually used; ownership still holds
  // because an unowned/unknown id matches nothing → null.
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

  // The styling columns the payload WOULD write — or `undefined` when it carries
  // no styling. The stamp is spread in BESIDE the mapping's output, never through
  // it (`stylingToDbColumns` owes a round-trip law that `basedOnPreset` is not
  // part of; see its doc comment). Same object feeds both upsert arms below.
  const stylingColumns =
    styling !== undefined
      ? {
          ...stylingToDbColumns(parseStylingValues(styling)),
          basedOnPreset: normalizeStylePresetStamp(basedOnPreset),
        }
      : undefined;

  // The styling to actually upsert this save — or `undefined` when there is
  // nothing to write: either the payload omitted styling, or the incoming columns
  // are byte-for-byte the stored row. In that no-op case we skip the nested upsert
  // AND the interactive transaction it forces. A missing stored row (a template's
  // first styling save) always counts as a change, so the row still gets created.
  const stylingUpsertColumns =
    stylingColumns !== undefined &&
    (existing.styling == null ||
      !stylingColumnsMatch(stylingColumns, existing.styling))
      ? stylingColumns
      : undefined;

  try {
    // Defense in depth (priority #1): the write is shop-scoped itself, not only
    // via the ownership read above. `id` is the unique key and `shopId` is an
    // extended where-unique filter (Prisma 5+, GA), so even a future regression
    // that weakened the read can never cross-write into another shop's template.
    // Mirrors setTemplateMetaobjectRef's shop-scoped write. A shopId mismatch
    // makes the record "not found" → P2025, caught below. Both write paths carry
    // it.
    if (stylingUpsertColumns) {
      // Styling changed → nest the full-column upsert INSIDE the shop-scoped
      // update (the isolation answer for a model with no shopId column) and
      // `include` the written row so the caller's storefront sync (feature 57
      // Step 7) writes the merchant's real look.
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

    // Fast path: nothing to write for styling. A plain update with no nested
    // write and no `include` is a single `UPDATE … RETURNING` — one round-trip,
    // no interactive transaction (the include path is several). Reattach the
    // styling we already read so the returned shape still carries the relation
    // the sync consumes; it is UNCHANGED this save, so it is exactly what an
    // `include` would have returned.
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
 * Store the Shopify metaobject GID + handle on a template after a successful
 * sync (Editor Step 9.5). Shop-scoped via the `{ id, shopId }` where-unique
 * (Prisma 5+ extended where-unique) so the write itself carries `shopId`
 * (priority #1). Uses `update`, not `updateMany`: a missing row or a `shopId`
 * mismatch is a real bug at this point (the caller just persisted the template
 * for this shop), so it must surface as P2025 — never silently no-op. Mirrors
 * `updateTemplate`'s shop-scoped write; the caller (`syncTemplateToMetaobject`)
 * catches the throw and reports it as a storefront-sync warning.
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
 * Rename an owned template (feature 27). A focused, **rows-untouching** sibling of
 * `saveTemplateForShop`: the list page has no in-memory rows to resend, so reusing
 * `saveTemplateForShop` (which always narrows + caps `rows`, and treats
 * `parseRows(undefined)` as `[]`) would clobber the template's rows. This writes
 * `name` only and leaves `rows` + `status` alone.
 *
 * Shop isolation (priority #1): the `{ id, shopId }` where-unique scopes the write
 * itself — a cross-shop/unknown id is "not found" (P2025), never a rename of another
 * shop's template. Mirrors `setTemplateMetaobjectRef`'s shop-scoped write.
 *
 * No metaobject sync — a name is not part of the storefront delivery copy (the
 * metaobject carries rows + status, not name), so renaming needs no Admin API call.
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
 * Set an owned template's status (feature 36). A focused, **rows-untouching**
 * sibling of `renameTemplateForShop`: the list "Change status" modal holds no
 * in-memory rows, so reusing `saveTemplateForShop` (which narrows + caps `rows`,
 * treating `parseRows(undefined)` as `[]`) would clobber them. This writes
 * `status` only and leaves `rows` + `name` alone.
 *
 * The untrusted status is REJECTED if unknown (`validateTemplateStatus`) — an
 * explicit status change is deliberate, never silently defaulted to DRAFT.
 *
 * Shop isolation (priority #1): the `{ id, shopId }` where-unique scopes the write
 * itself — a cross-shop/unknown id is "not found" (P2025), never a status change
 * to another shop's template. Mirrors `renameTemplateForShop`.
 *
 * No metaobject sync here — the CALLER owns the storefront re-sync (via the shared
 * `syncTemplateToMetaobject`) so this stays a pure, Admin-free, unit-testable DB
 * write. Returns the updated template so the caller can feed it to the sync.
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
      // Feature 57 Step 7 — load the persisted styling so the caller's re-sync
      // REWRITES the metaobject with the merchant's real look. Without this the
      // relation would be absent, resolve to defaults, and an ACTIVE→DRAFT→ACTIVE
      // flip would silently reset a live storefront table. This write still
      // touches `status` only; the include is read-side.
      include: { styling: true },
    });
    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not update status" };
  }
}

/**
 * Duplicate an owned template (feature 20). Shop isolation (priority #1): the
 * source is read shop-scoped (`findFirst({ where: { id, shopId } })`), so a
 * foreign id reads nothing and the copy is never created — a cross-shop duplicate
 * is blocked, not a leak.
 *
 * The copy:
 *  - is named `"{source} (copy)"` (length-safe via `copyName`),
 *  - starts as **DRAFT** — a fresh copy must never be live on the storefront,
 *  - gets a fresh row `id` per row (`cloneRowsWithNewIds`; ids must never be
 *    reused, data-model.md §7) and finalizes keys against `[]` like
 *    `createTemplateForShop` (a brand-new row set).
 *
 * No metaobject sync here — the copy defaults to DRAFT (not storefront-rendered),
 * so the next Save syncs it; this avoids an extra Admin API call on duplicate.
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

  // `source.name` is already a valid persisted name, so `copyName` always yields
  // a valid one; the validate call keeps every name on the one validator path.
  const nameResult = validateTemplateName(copyName(source.name));
  if (!nameResult.ok) {
    return { ok: false as const, error: nameResult.error };
  }

  const clonedRows = cloneRowsWithNewIds(parseRows(source.rows), newRowId);
  const finalizedRows: EditorRow[] = reconcileRowKeys(clonedRows, []);

  // Copy semantics (data-model.md §5, feature 57 Step 4): a styled template's
  // duplicate must not silently be an unstyled twin, so the styling row is
  // copied in full — every override column, `basedOnPreset` provenance, and
  // `extraStyles` verbatim (only `id`/`templateId` are the fresh row's own).
  // No source row -> no styling in the create (absence = all defaults).
  let stylingCreate: Prisma.TemplateCreateInput["styling"];
  if (source.styling) {
    // Rest-destructure drops the source row's own identity; the copy mints its own.
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
 * Delete an owned template (feature 20). Shop-scoped via `deleteMany({ where: {
 * id, shopId } })`: a cross-shop id matches nothing and is a no-op (`count === 0`)
 * — never a leak (priority #1). Postgres is the source of truth; the route
 * performs the best-effort metaobject cleanup BEFORE this call so a
 * storefront-readable metaobject can't outlive its template. Returns the affected
 * `count` so the caller can tell a real delete from a no-op.
 */
export async function deleteTemplateForShop(
  shopId: string,
  templateId: string,
) {
  const result = await prisma.template.deleteMany({
    where: { id: templateId, shopId },
  });
  return { ok: true as const, count: result.count };
}
