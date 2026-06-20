// Single source of truth for the spec-table editor's row array.
//
// The editor is a reducer over `rows`; array index is display order. Every later
// feature (segmented value cell, drag reorder, clipboard paste, undo/redo) is
// just more actions on this same array, so the shape here matches the authoring
// row contract in `context/data-model.md` exactly — do not introduce a simpler
// interim shape and migrate later.
//
// This module is framework-free on purpose: the editor UI uses it now, and the
// server-side save validation (Step 6) will read the same constant and types.

// MVP row cap. It is an MVP value that may increase post-MVP, so the UI and the
// server must both read this constant — never hardcode the literal.
export const MAX_TEMPLATE_ROWS = 200;

export type ValuePart =
  | { type: "TEXT"; text: string }
  | { type: "SHOPIFY_FIELD"; field: string }
  | { type: "METAFIELD"; namespace: string; key: string }
  // Author-intended hard line break (data-model.md §7). Carries no text and no
  // dynamic reference; renders as a `<br>` in the editor and the storefront. It
  // is an atomic, non-TEXT part, so deletion reuses REMOVE_VALUE_PART and
  // normalizeValueParts treats it as a TEXT-merge boundary like any token.
  | { type: "LINE_BREAK" };

/**
 * True for any value part that is rendered as a single, non-editable unit in the
 * editor surface — a dynamic-field token (SHOPIFY_FIELD / METAFIELD) or a
 * LINE_BREAK. These are the parts deleted whole by Backspace/Delete and inserted
 * at the caret by INSERT_VALUE_PART_AT; only TEXT is free-typed.
 */
export function isAtomicPart(part: ValuePart): boolean {
  return part.type !== "TEXT";
}

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

// Base used when a row has no label yet — empty-label rows still need a stable,
// non-colliding key at creation. The uniqueness suffixing below turns repeated
// blank rows into `row`, `row_2`, `row_3`, …
const FALLBACK_KEY_BASE = "row";

// Section headers get their own base so blank sections become `section`,
// `section_2`, … and never collide with blank data rows.
const SECTION_KEY_BASE = "section";

/**
 * Slugify a label into a stable, human-readable key (`Screen Size` ->
 * `screen_size`). Falls back to a generic base when the label has no usable
 * characters.
 *
 * Label -> key policy (owned decision, Step 3 review): UI-created rows are blank
 * at creation, so they cannot derive a key from a label that does not exist yet.
 * `ADD_ROW` / `ADD_SECTION` therefore seed a *provisional* key via
 * `uniqueKey(FALLBACK_KEY_BASE / SECTION_KEY_BASE, …)` (`row`, `row_2`, …), and
 * `SET_LABEL` never rewrites it. Save (Step 6) is where this helper runs: it
 * derives the slug from the row's label for rows still carrying a provisional
 * key, then never rewrites it again. That satisfies `data-model.md` §7 ("key
 * generated from the label initially … changing a label does not change the key
 * after the row is created") and the comparison-readiness invariant (key is the
 * cross-product / cross-template alignment mechanism, so it must end up
 * human-readable, not an opaque `row_N`). This is the Step 6 serialization tool,
 * kept on purpose — not dead code.
 */
export function slugifyKey(label: string): string {
  const slug = label
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug.length > 0 ? slug : FALLBACK_KEY_BASE;
}

/**
 * Make `base` unique within the template by suffixing `_2`, `_3`, … against the
 * keys already in use. Keeps `key` unique inside a template so cross-product /
 * cross-template row alignment never collides.
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
 * crypto.randomUUID() is the only non-deterministic input to row creation, so
 * callers mint the id and pass it into the reducer. This keeps the reducer pure
 * and deterministic (and therefore testable). The id is stable, never changes,
 * and is never reused. Available natively in modern browsers and Node 18+.
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
    // Step 1 seeds exactly one TEXT part; Step 2 extends this array in place.
    valueParts: [{ type: "TEXT", text: "" }],
    hideWhenEmpty: true,
  };
}

/**
 * Create a section-header row (`data-model.md` §7). A section has no
 * `valueParts` — it renders as a single full-width header, not a two-cell data
 * row. `hideWhenEmpty` defaults to false to match the data-model example.
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
 * merge adjacent TEXT parts into one (so removing a pill from
 * `[TEXT, PILL, TEXT]` yields a single TEXT rather than two fragments) and
 * guarantee at least one TEXT part remains so the cell always stays editable.
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
 * Insert `row` directly below the row with id `afterId` (the active row). Falls
 * back to appending when there is no active row, or the active row is gone. Used
 * by every toolbar row-creating action so new rows land next to the merchant's
 * current focus; the bottom "Add row" passes no `afterId` and so appends.
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
 * Move the element at `from` to index `to`, returning a fresh array (the source
 * is never mutated). Pure and framework-free on purpose: the reducer module owns
 * the array-move so `rows.ts` stays free of any UI dependency (`@dnd-kit` lives in
 * the editor component, not here). Matches `@dnd-kit/sortable`'s `arrayMove`
 * semantics — `to` is the target index in the original array — so the editor can
 * hand the reducer the dragged row's destination index directly.
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
  | { type: "SET_LABEL"; id: string; label: string }
  // partIndex targets one TEXT segment of valueParts (Step 1 only had index 0).
  | { type: "SET_VALUE_TEXT"; id: string; partIndex: number; text: string }
  | { type: "REMOVE_VALUE_PART"; id: string; partIndex: number }
  // Replace the value part at `partIndex` in place (Step 6). Edit-an-existing-pill:
  // the merchant reopens the picker on a pill and swaps its field, so the atomic
  // slot is replaced one-for-one — array length, surrounding parts, and the caret
  // all stay put. No split, no merge needed (a pill→pill swap keeps types adjacent
  // the same), so unlike REMOVE + INSERT_VALUE_PART_AT this never moves the caret.
  | { type: "SET_VALUE_PART"; id: string; partIndex: number; part: ValuePart }
  // Caret-aware insert/split (Step 4.4). Splits the TEXT at `partIndex` at
  // character `offset` and drops `part` between the halves; when `partIndex`
  // points at an atomic part (or past the end) the part is spliced in at that
  // position instead. The editor computes (partIndex, offset) from the DOM caret
  // and passes plain numbers, so the reducer stays pure and DOM-free. Used by
  // 4.4's LINE_BREAK and reused by Step 5 to drop a picked pill at the caret.
  | {
      type: "INSERT_VALUE_PART_AT";
      id: string;
      partIndex: number;
      offset: number;
      part: ValuePart;
    }
  // Reorder (Step 10): move the row with id `activeId` to the array position of
  // the row with id `overId`. Display order IS the array index (data-model §6/§11),
  // so reordering is a pure array-move and nothing else: row `key`/`id` are left
  // untouched (data-model §12 — a finalized key is never re-derived, and order is
  // not identity). Keyed by id, not index, because @dnd-kit reports the dragged and
  // target row ids; the reducer resolves the indices at apply time so a stale index
  // can never slip in. No cap check — a reorder can never grow the array.
  | { type: "MOVE_ROW"; activeId: string; overId: string };

export function rowsReducer(
  rows: EditorRow[],
  action: RowsAction,
): EditorRow[] {
  switch (action.type) {
    case "ADD_ROW": {
      // The cap is enforced here, not just on the disabled button, so no action
      // path can exceed it. The disabled buttons are UX; the reducer is the gate.
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
      // Copy the content but mint a fresh id and a fresh unique key. Never reuse
      // the source row's id or key.
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

    case "SET_LABEL":
      // Label only — the key is fixed at creation and must not change here.
      return rows.map((row) =>
        row.id === action.id ? { ...row, label: action.label } : row,
      );

    case "SET_VALUE_TEXT":
      return rows.map((row) => {
        if (row.id !== action.id || row.rowType !== "DATA") {
          return row;
        }
        // Edit only the targeted TEXT segment; pills and other text are untouched.
        const valueParts = row.valueParts.map((part, partIndex) =>
          partIndex === action.partIndex && part.type === "TEXT"
            ? { type: "TEXT" as const, text: action.text }
            : part,
        );
        return { ...row, valueParts };
      });

    case "REMOVE_VALUE_PART":
      return rows.map((row) => {
        if (row.id !== action.id || row.rowType !== "DATA") {
          return row;
        }
        // Drop the part, then merge adjacent TEXT so the cell re-joins cleanly
        // and never accumulates empty fragments (≥1 TEXT is guaranteed).
        const remaining = row.valueParts.filter(
          (_, partIndex) => partIndex !== action.partIndex,
        );
        return { ...row, valueParts: normalizeValueParts(remaining) };
      });

    case "SET_VALUE_PART":
      return rows.map((row) => {
        if (row.id !== action.id || row.rowType !== "DATA") {
          return row;
        }
        // In-place swap of one atomic slot (edit-an-existing-pill): replace the
        // part at partIndex one-for-one. A pill→pill swap keeps the part types
        // adjacent the same, so array length, surrounding parts, and the caret
        // are all unchanged — no split, no merge, no normalize needed. No-op on
        // an out-of-range index.
        if (action.partIndex < 0 || action.partIndex >= row.valueParts.length) {
          return row;
        }
        const valueParts = row.valueParts.map((part, partIndex) =>
          partIndex === action.partIndex ? action.part : part,
        );
        return { ...row, valueParts };
      });

    case "INSERT_VALUE_PART_AT":
      return rows.map((row) => {
        if (row.id !== action.id || row.rowType !== "DATA") {
          return row;
        }
        const { partIndex, offset, part } = action;
        const parts = row.valueParts;
        const target = parts[partIndex];
        // Split the targeted TEXT run at the caret offset and drop the new part
        // between the halves; if the caret sits at an atomic boundary (or past
        // the last part) there is no TEXT to split, so splice the part in place.
        const next =
          target?.type === "TEXT"
            ? [
                ...parts.slice(0, partIndex),
                { type: "TEXT" as const, text: target.text.slice(0, offset) },
                part,
                { type: "TEXT" as const, text: target.text.slice(offset) },
                ...parts.slice(partIndex + 1),
              ]
            : [...parts.slice(0, partIndex), part, ...parts.slice(partIndex)];
        // normalizeValueParts merges any adjacent TEXT the split produced and
        // keeps the ≥1-TEXT guarantee; it never strips the new atomic part.
        return { ...row, valueParts: normalizeValueParts(next) };
      });

    case "MOVE_ROW": {
      const from = rows.findIndex((row) => row.id === action.activeId);
      const to = rows.findIndex((row) => row.id === action.overId);
      // No-op on an unknown id or a drop back onto the origin: return the SAME
      // array reference so a same-spot drag never flips the editor's dirty flag.
      // The moved element keeps its identity (id) and meaning (key); only its
      // array position — i.e. its display order — changes.
      if (from === -1 || to === -1 || from === to) {
        return rows;
      }
      return arrayMove(rows, from, to);
    }

    default:
      return rows;
  }
}
