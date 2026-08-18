// Save-boundary transforms for the spec-table editor. Two pure jobs, both run at
// the load/save seam — never inside the reducer:
//
//   1. `parseRows` narrows a persisted / submitted `rows` value into the typed
//      `EditorRow[]`. Runs at BOTH the loader and the action — trust the DB shape
//      no more than a form post, and never trust the client.
//
//   2. `reconcileRowKeys` / `finalizeRowKeys` finalize the human-readable row
//      `key` at Save. UI rows are created blank with a provisional key and
//      `SET_LABEL` never rewrites it; the slug is derived HERE the first time a
//      row is saved, then never re-derived, so a later label change cannot move a
//      finalized key (data-model.md §12).

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
 * Narrow one untyped value part into the `ValuePart` union, or `null` when
 * unusable. A `SHOPIFY_FIELD` needs a non-empty `field`; a `METAFIELD` needs both
 * halves, since a partial one resolves to nothing on the storefront.
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
 *
 * ⚠️ A row with no `id` is DROPPED rather than minted one — a fresh id here would
 * not match any persisted reference. An empty `key` is repaired from the label so
 * the row still aligns; finalizing provisional keys is a separate, explicit step.
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
 * Clone a row array for a duplicated template, minting a FRESH `id` for every
 * row. Row ids are the technical identity reserved for relational references
 * (data-model.md §7, §12: "id must never be reused"), so a copy must not share
 * its source's. Every other field carries over verbatim; the caller re-finalizes
 * keys against `[]` afterwards. `mkId` is injected so this stays deterministic
 * under test.
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
 * Reconcile incoming editor rows against what is persisted, deciding key
 * finalization SERVER-SIDE.
 *
 * 🔴 The authoritative "was this key ever finalized?" signal is "does this row id
 * already exist in the saved template?" — not a client-tracked flag a payload
 * could lie about, and not a key-string pattern:
 *
 *   - An already-persisted id keeps its PERSISTED key, even if the client sent a
 *     stale provisional key or the label changed. That covers the edge case of a
 *     label that legitimately slugs to `row`/`section`.
 *   - A new id is provisional, and its key is finalized from the label.
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
