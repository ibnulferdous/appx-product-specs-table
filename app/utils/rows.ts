// Single source of truth for the spec-table editor's row array.
//
// The editor is a reducer over `rows`; array index is display order. The shape
// here matches the authoring row contract in `context/data-model.md` exactly.
//
// Framework-free: the editor UI and the server-side save validation both read
// these constants and types.

// MVP row cap — the UI and the server must both read this constant, never the
// literal.
export const MAX_TEMPLATE_ROWS = 200;

// How many blank DATA rows open below the seed section header in a brand-new
// template (see `createInitialRows`).
export const INITIAL_DATA_ROW_COUNT = 5;

export type ValuePart =
  | { type: "TEXT"; text: string }
  | { type: "SHOPIFY_FIELD"; field: string }
  | { type: "METAFIELD"; namespace: string; key: string }
  // Author-intended hard line break. Carries no text and no dynamic reference;
  // a non-TEXT part, so `normalizeValueParts` treats it as a TEXT-merge boundary
  // like any token.
  | { type: "LINE_BREAK" };

export type RowType = "DATA" | "SECTION_HEADER";

export interface DataRow {
  id: string;
  key: string;
  rowType: "DATA";
  label: string;
  valueParts: ValuePart[];
  hideWhenEmpty: boolean;
}

export interface SectionHeaderRow {
  id: string;
  key: string;
  rowType: "SECTION_HEADER";
  label: string;
  hideWhenEmpty: boolean;
}

export type EditorRow = DataRow | SectionHeaderRow;

// Base for a row with no label yet; the uniqueness suffixing turns repeated
// blank rows into `row`, `row_2`, `row_3`, …
const FALLBACK_KEY_BASE = "row";

// Section headers get their own base so they never collide with blank data rows.
const SECTION_KEY_BASE = "section";

/**
 * Slugify a label into a stable, human-readable key (`Screen Size` →
 * `screen_size`), falling back to a generic base when the label has no usable
 * characters.
 *
 * **Not called by the editor reducer.** UI-created rows are blank at creation,
 * so they cannot derive a key from a label that does not exist yet: `ADD_ROW` /
 * `ADD_SECTION` seed a *provisional* key and `SET_LABEL` never rewrites it. This
 * runs at Save, deriving the slug for rows still on a provisional key, and never
 * rewrites it again — `data-model.md` §7 ("changing a label does not change the
 * key after the row is created") plus the comparison-readiness invariant, which
 * needs keys human-readable rather than an opaque `row_N`.
 *
 * Callers both live in `rowsSerialize.ts`: `finalizeRowKeys` for Save-time
 * finalization, and `parseRow` to repair a row whose `key` is missing.
 */
export function slugifyKey(label: string): string {
  const slug = label
    .normalize("NFKD")
    // Drop the combining marks NFKD produced; otherwise an accent inside a word
    // becomes a `_` separator (`Ångström` → `a_ngstrom`).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug.length > 0 ? slug : FALLBACK_KEY_BASE;
}

/**
 * Make `base` unique within the template by suffixing `_2`, `_3`, … so
 * cross-product / cross-template row alignment never collides.
 */
export function uniqueKey(base: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(base)) {
    return base;
  }

  let suffix = 2;
  while (existingKeys.has(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function collectKeys(rows: EditorRow[]): Set<string> {
  return new Set(rows.map((row) => row.key));
}

/**
 * The only non-deterministic input to row creation, so callers mint the id and
 * pass it into the reducer — that is what keeps the reducer pure and testable.
 * The id is stable, never changes, and is never reused.
 */
export function newRowId(): string {
  return crypto.randomUUID();
}

function createDataRow(id: string, key: string): DataRow {
  return {
    id,
    key,
    rowType: "DATA",
    label: "",
    valueParts: [{ type: "TEXT", text: "" }],
    hideWhenEmpty: true,
  };
}

/**
 * A section has no `valueParts` — it renders as a single full-width header, not
 * a two-cell data row.
 */
function createSectionRow(id: string, key: string): SectionHeaderRow {
  return {
    id,
    key,
    rowType: "SECTION_HEADER",
    label: "",
    hideWhenEmpty: false,
  };
}

/**
 * Collapse a value-part array back to canonical form after a structural edit:
 * merge adjacent TEXT parts into one, and guarantee at least one TEXT part
 * remains so the cell always stays editable.
 */
export function normalizeValueParts(parts: ValuePart[]): ValuePart[] {
  const merged: ValuePart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (part.type === "TEXT" && last?.type === "TEXT") {
      merged[merged.length - 1] = { type: "TEXT", text: last.text + part.text };
    } else {
      merged.push(part);
    }
  }
  if (!merged.some((part) => part.type === "TEXT")) {
    merged.push({ type: "TEXT", text: "" });
  }
  return merged;
}

/**
 * Insert `row` directly below the row with id `afterId`, falling back to
 * appending when there is no active row. Used by every toolbar row-creating
 * action so new rows land next to the merchant's current focus.
 */
function insertRowAfter(
  rows: EditorRow[],
  row: EditorRow,
  afterId?: string | null,
): EditorRow[] {
  const index = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  if (index === -1) {
    return [...rows, row];
  }
  const next = rows.slice();
  next.splice(index + 1, 0, row);
  return next;
}

/**
 * Move the element at `from` to index `to`, returning a fresh array. Matches
 * `@dnd-kit/sortable`'s `arrayMove` semantics — `to` is the target index in the
 * original array — so the editor can hand the reducer a destination index
 * directly, while `@dnd-kit` itself stays out of this module.
 */
function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type RowsAction =
  // `afterId` inserts the new row below the active row; omit/null to append.
  | { type: "ADD_ROW"; id: string; afterId?: string | null }
  | { type: "ADD_SECTION"; id: string; afterId?: string | null }
  | { type: "DUPLICATE_ROW"; id: string; newId: string }
  | { type: "DELETE_ROW"; id: string }
  // Bulk delete, designed as exactly ONE undoable step. No cap check — a delete
  // can never grow the array.
  | { type: "DELETE_ROWS"; ids: string[] }
  // Replace the array wholesale with a previously-captured, already-valid
  // snapshot. Powers the bulk-delete "Undo" toast: restores the EXACT pre-delete
  // rows (same id / key / valueParts / order), which PASTE_ROWS cannot since it
  // mints fresh ids. No cap check: a prior valid state already satisfied it.
  | { type: "RESTORE_ROWS"; rows: EditorRow[] }
  | { type: "SET_LABEL"; id: string; label: string }
  // Replace a DATA row's whole value with a caller-parsed array. Parsing stays
  // OUT of the reducer so it remains pure and DOM-free, and to avoid a
  // `rows` → `valueText` import cycle (`valueText` imports from `rows`).
  | { type: "SET_VALUE_PARTS"; id: string; valueParts: ValuePart[] }
  // Move the row with id `activeId` to the position of `overId`. Display order
  // IS the array index, so this is a pure array-move: `key`/`id` are untouched
  // (order is not identity). Keyed by id, not index, so a stale index cannot
  // slip in. No cap check — a reorder can never grow the array.
  | { type: "MOVE_ROW"; activeId: string; overId: string }
  // Bulk-insert rows from a clipboard paste. The component parses the clipboard
  // to a grid and mints a fresh `id` per row; the reducer inserts them as DATA
  // rows with provisional keys and CAP-TRUNCATES defensively.
  //
  // `afterId` splices the whole batch below the active row; an unknown/absent id
  // appends. `replace` rebuilds on `[]` instead of the existing rows, so the
  // pasted rows become the WHOLE array — used to drop a brand-new template's
  // untouched starter scaffold on the first bulk paste. An empty paste with
  // `replace` is a same-reference no-op, so the scaffold is never wiped to
  // nothing.
  | {
      type: "PASTE_ROWS";
      rows: Array<{ id: string; label: string; valueParts: ValuePart[] }>;
      afterId?: string | null;
      replace?: boolean;
    };

export function rowsReducer(
  rows: EditorRow[],
  action: RowsAction,
): EditorRow[] {
  switch (action.type) {
    case "ADD_ROW": {
      // The cap is enforced here, not just on the disabled button: the disabled
      // buttons are UX, the reducer is the gate.
      if (rows.length >= MAX_TEMPLATE_ROWS) {
        return rows;
      }
      const key = uniqueKey(FALLBACK_KEY_BASE, collectKeys(rows));
      return insertRowAfter(
        rows,
        createDataRow(action.id, key),
        action.afterId,
      );
    }

    case "ADD_SECTION": {
      if (rows.length >= MAX_TEMPLATE_ROWS) {
        return rows;
      }
      const key = uniqueKey(SECTION_KEY_BASE, collectKeys(rows));
      return insertRowAfter(
        rows,
        createSectionRow(action.id, key),
        action.afterId,
      );
    }

    case "DUPLICATE_ROW": {
      if (rows.length >= MAX_TEMPLATE_ROWS) {
        return rows;
      }
      const index = rows.findIndex((row) => row.id === action.id);
      if (index === -1) {
        return rows;
      }

      const source = rows[index];
      // Copy the content but mint a fresh id and unique key — never reuse the
      // source row's.
      const key = uniqueKey(source.key, collectKeys(rows));
      const copy: EditorRow =
        source.rowType === "DATA"
          ? {
              ...source,
              id: action.newId,
              key,
              valueParts: source.valueParts.map((part) => ({ ...part })),
            }
          : { ...source, id: action.newId, key };

      const next = rows.slice();
      next.splice(index + 1, 0, copy);
      return next;
    }

    case "DELETE_ROW":
      return rows.filter((row) => row.id !== action.id);

    case "DELETE_ROWS": {
      if (action.ids.length === 0) return rows;
      const remove = new Set(action.ids);
      const next = rows.filter((row) => !remove.has(row.id));
      // Same array reference when nothing matched, so a stale/foreign id set
      // never flips the editor's dirty flag.
      return next.length === rows.length ? rows : next;
    }

    case "RESTORE_ROWS":
      return action.rows;

    case "SET_LABEL":
      // Label only — the key is fixed at creation and must not change here.
      return rows.map((row) =>
        row.id === action.id ? { ...row, label: action.label } : row,
      );

    case "SET_VALUE_PARTS":
      return rows.map((row) => {
        // No-op on a SECTION_HEADER or unknown id, returning the same reference
        // so a stray dispatch never flips the dirty flag.
        if (row.id !== action.id || row.rowType !== "DATA") {
          return row;
        }
        return { ...row, valueParts: normalizeValueParts(action.valueParts) };
      });

    case "MOVE_ROW": {
      const from = rows.findIndex((row) => row.id === action.activeId);
      const to = rows.findIndex((row) => row.id === action.overId);
      // Same array reference on an unknown id or a drop back onto the origin, so
      // a same-spot drag never flips the dirty flag.
      if (from === -1 || to === -1 || from === to) {
        return rows;
      }
      return arrayMove(rows, from, to);
    }

    case "PASTE_ROWS": {
      // Only the BASE array differs between the replace and insert paths; the
      // keying loop and cap below are shared, so there is no second path.
      const base = action.replace ? [] : rows;
      // Truncate, don't refuse. When nothing fits or there is nothing to paste,
      // return the SAME original reference so the paste never flips the dirty
      // flag — and, on the replace path, so an empty paste never wipes the
      // scaffold.
      const room = MAX_TEMPLATE_ROWS - base.length;
      if (room <= 0 || action.rows.length === 0) {
        return rows;
      }
      // Provisional keys accumulated as we go, so the batch's keys are mutually
      // unique AND unique against the base rows. Seeded from ALL base rows
      // (position is irrelevant to uniqueness), so a mid-table insert cannot
      // collide. No `slugifyKey` — finalization happens at Save. All pasted rows
      // are DATA rows; a grid cannot express a SECTION_HEADER.
      const taken = collectKeys(base);
      const pastedRows: DataRow[] = action.rows.slice(0, room).map((pasted) => {
        const key = uniqueKey(FALLBACK_KEY_BASE, taken);
        taken.add(key);
        return {
          id: pasted.id,
          key,
          rowType: "DATA",
          label: pasted.label,
          valueParts: normalizeValueParts(pasted.valueParts),
          hideWhenEmpty: true,
        };
      });
      // A SECTION_HEADER `afterId` is valid — the DATA rows land under it. On
      // the replace path the base is `[]`, so the lookup misses and the rows
      // become the whole array.
      const index = action.afterId
        ? base.findIndex((row) => row.id === action.afterId)
        : -1;
      const next = base.slice();
      if (index === -1) {
        next.push(...pastedRows);
      } else {
        next.splice(index + 1, 0, ...pastedRows);
      }
      return next;
    }

    default:
      return rows;
  }
}

/**
 * Build the starter scaffold: one SECTION_HEADER followed by
 * `INITIAL_DATA_ROW_COUNT` blank DATA rows.
 *
 * Folds the canonical `rowsReducer` from `[]` so the seed reuses the exact same
 * provisional-key logic, cap behavior and row shape as interactive creation —
 * there is no second construction path to drift. `mkId` is injectable so the
 * factory is deterministic under test.
 */
export function createInitialRows(mkId: () => string = newRowId): EditorRow[] {
  let rows = rowsReducer([], { type: "ADD_SECTION", id: mkId() });
  for (let i = 0; i < INITIAL_DATA_ROW_COUNT; i += 1) {
    rows = rowsReducer(rows, { type: "ADD_ROW", id: mkId() });
  }
  return rows;
}

/**
 * True iff `rows` is the untouched starter scaffold — the shape
 * `createInitialRows()` seeds, with nothing typed into it.
 *
 * A structural, merchant-visible blank check: it does NOT inspect keys
 * (provisional keys are an implementation detail), and deliberately does NOT use
 * the editor's dirty flag — that baseline also covers name/status, so a
 * rename-then-paste would read "dirty" while the rows are still blank.
 *
 * Used by the paste handler gated on `isNew`, so the first bulk paste on a
 * never-saved template REPLACES the scaffold. The `isNew` gate is what keeps a
 * coincidentally-all-blank SAVED template from being treated as pristine.
 */
export function isPristineScaffold(rows: EditorRow[]): boolean {
  if (rows.length !== INITIAL_DATA_ROW_COUNT + 1) {
    return false;
  }
  const [header, ...dataRows] = rows;
  if (header.rowType !== "SECTION_HEADER" || header.label !== "") {
    return false;
  }
  return dataRows.every(
    (row) =>
      row.rowType === "DATA" &&
      row.label === "" &&
      row.valueParts.length === 1 &&
      row.valueParts[0].type === "TEXT" &&
      row.valueParts[0].text === "",
  );
}
