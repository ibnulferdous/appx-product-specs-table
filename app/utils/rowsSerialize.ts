// Save-boundary transforms for the spec-table editor (Editor Step 9.5).
//
// Two pure jobs, both run at the load/save seam — never inside the reducer:
//
//   1. parseRows(unknown): EditorRow[]
//      Narrow a persisted / submitted `rows` value into the typed EditorRow[]
//      contract. Replaces the old `normalizeRows` cast (Step 3 review finding #4):
//      malformed persisted JSON or an untrusted client payload must not render
//      garbage or crash. Runs at BOTH the loader (trust the DB shape no more than
//      a form post) and the action (the server never trusts the client —
//      code-standards.md "validate and sanitize all external input").
//
//   2. reconcileRowKeys(incoming, persisted) / finalizeRowKeys(rows, provisionalIds)
//      Finalize the human-readable row `key` at Save (Step 3 review finding #1
//      follow-through). UI rows are created blank with a provisional key
//      (`row` / `row_2`, `section` / `section_2`); SET_LABEL never rewrites it.
//      The slug from the label is derived HERE, the first time a row is saved,
//      then never re-derived — so a later label change cannot move a finalized key
//      (the cross-product alignment invariant, data-model.md §12).
//
// The module is framework-free and side-effect-free, like rows.ts. It imports the
// row contract + the key helpers from rows.ts (one direction — no cycle).

import {
  normalizeValueParts,
  slugifyKey,
  uniqueKey,
  type EditorRow,
  type ValuePart,
} from "./rows";

// --- Pure narrowing -------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrow one untyped value part into the `ValuePart` union, or `null` when it is
 * unusable. A `SHOPIFY_FIELD` needs a non-empty `field`; a `METAFIELD` needs both
 * `namespace` and `key` (the locked pill contract — a partial one resolves to
 * nothing on the storefront, so it is dropped, mirroring the Step 8 mapper rule).
 * `TEXT` coerces a missing `text` to "" and `LINE_BREAK` carries nothing.
 */
function parseValuePart(value: unknown): ValuePart | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "TEXT":
      return { type: "TEXT", text: asString(value.text) };
    case "SHOPIFY_FIELD": {
      const field = asString(value.field);
      return field ? { type: "SHOPIFY_FIELD", field } : null;
    }
    case "METAFIELD": {
      const namespace = asString(value.namespace);
      const key = asString(value.key);
      return namespace && key ? { type: "METAFIELD", namespace, key } : null;
    }
    case "LINE_BREAK":
      return { type: "LINE_BREAK" };
    default:
      return null;
  }
}

/**
 * Narrow one untyped row into `EditorRow`, or `null` when it cannot be aligned.
 * `id` is the stable identity used by relational tables and `@dnd-kit`, so a row
 * with no `id` is dropped rather than minted one (a fresh id here would not match
 * any persisted reference). An empty `key` is repaired from the label so the row
 * still aligns; key *finalization* of provisional keys is a separate, explicit
 * step (see finalizeRowKeys). Unknown `rowType` → dropped.
 */
function parseRow(value: unknown): EditorRow | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  if (!id) return null;

  const label = asString(value.label);
  const key = asString(value.key) || slugifyKey(label);

  if (value.rowType === "SECTION_HEADER") {
    const hideWhenEmpty = value.hideWhenEmpty === true;
    return { id, key, rowType: "SECTION_HEADER", label, hideWhenEmpty };
  }

  if (value.rowType === "DATA") {
    // Default hideWhenEmpty to true for data rows (data-model.md §7) unless the
    // persisted value explicitly says otherwise.
    const hideWhenEmpty =
      typeof value.hideWhenEmpty === "boolean" ? value.hideWhenEmpty : true;
    const rawParts = Array.isArray(value.valueParts) ? value.valueParts : [];
    const parts = rawParts
      .map(parseValuePart)
      .filter((part): part is ValuePart => part !== null);
    // normalizeValueParts guarantees ≥1 TEXT and merges adjacent TEXT, so a row
    // whose parts all dropped out still has an editable cell.
    return {
      id,
      key,
      rowType: "DATA",
      label,
      valueParts: normalizeValueParts(parts),
      hideWhenEmpty,
    };
  }

  return null;
}

/**
 * Narrow a persisted/submitted `rows` value into the typed editor array. A
 * non-array (a fresh template's default, or junk) → `[]`. Malformed individual
 * rows are dropped, not coerced into broken rows. Pure: returns a fresh array,
 * never mutates the input.
 */
export function parseRows(value: unknown): EditorRow[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseRow).filter((row): row is EditorRow => row !== null);
}

// --- Duplication ----------------------------------------------------------

/**
 * Clone a row array for a duplicated template, minting a FRESH `id` for every row
 * via `mkId`. Row `id`s are the technical identity reserved for relational
 * references / translations (data-model.md §7, §12: "id must never be reused"), so
 * a copy must not share its source's ids. Every other field (key, label,
 * valueParts, …) is carried over verbatim; the caller re-finalizes keys against
 * `[]` afterwards (a copy is a brand-new row set). Pure: returns a fresh array,
 * mutates neither the input nor its rows. `mkId` is injected (not called inside)
 * so the helper stays deterministic under test, matching `createInitialRows`.
 */
export function cloneRowsWithNewIds(
  rows: EditorRow[],
  mkId: () => string,
): EditorRow[] {
  return rows.map((row) => ({ ...row, id: mkId() }));
}

// --- Key finalization -----------------------------------------------------

/**
 * Finalize the `key` of every row in `provisionalIds`: derive `slugifyKey(label)`
 * and make it unique within the template. Rows NOT in `provisionalIds` keep their
 * key untouched — a finalized key is never re-derived, so a later label change can
 * never move it (data-model.md §7 + §12). Pure: returns a fresh array.
 *
 * Uniqueness is seeded with the keys of the already-finalized (non-provisional)
 * rows, then each newly finalized key is reserved as it is assigned, so a freshly
 * slugged key can collide with neither an existing key nor a sibling new row.
 */
export function finalizeRowKeys(
  rows: EditorRow[],
  provisionalIds: Set<string>,
): EditorRow[] {
  const taken = new Set(
    rows.filter((row) => !provisionalIds.has(row.id)).map((row) => row.key),
  );
  return rows.map((row) => {
    if (!provisionalIds.has(row.id)) return row;
    const key = uniqueKey(slugifyKey(row.label), taken);
    taken.add(key);
    return { ...row, key };
  });
}

/**
 * Reconcile the incoming editor rows against what is already persisted, deciding
 * key finalization SERVER-SIDE (the authoritative "was this key ever finalized?"
 * signal is "does this row id already exist in the saved template?", not a
 * client-tracked flag a payload could lie about, and not a brittle key-string
 * pattern):
 *
 *   - A row whose id is already persisted keeps its PERSISTED key, even if the
 *     client sent a stale provisional key or the label has since changed. This is
 *     what makes "never re-derive a finalized key" robust — including the edge
 *     case of a row whose label legitimately slugs to `row`/`section`.
 *   - A row whose id is new (not persisted) is provisional: its key is finalized
 *     from the label via finalizeRowKeys.
 *
 * Pure: returns a fresh array, mutates neither argument.
 */
export function reconcileRowKeys(
  incoming: EditorRow[],
  persisted: EditorRow[],
): EditorRow[] {
  const persistedKeyById = new Map(
    persisted.map((row) => [row.id, row.key] as const),
  );
  const restored = incoming.map((row) => {
    const persistedKey = persistedKeyById.get(row.id);
    return persistedKey !== undefined && persistedKey !== row.key
      ? { ...row, key: persistedKey }
      : row;
  });
  const provisionalIds = new Set(
    incoming
      .filter((row) => !persistedKeyById.has(row.id))
      .map((row) => row.id),
  );
  return finalizeRowKeys(restored, provisionalIds);
}
