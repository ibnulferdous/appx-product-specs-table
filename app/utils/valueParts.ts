// Pure, DOM-free caret math for the spec-table value cell.
//
// Step 4 consolidates the value cell into one `contenteditable` surface whose
// caret moves across editable TEXT and *over* atomic parts (tokens, line breaks)
// as one continuous flow. To keep the reducer pure (it takes plain numbers, not
// DOM nodes), the editor maps the live DOM caret to a coordinate this module
// defines, does the math here, and dispatches the result.
//
// ## The linear caret model
//
// The cell is treated as a flat sequence of "slots": every character of a TEXT
// part is one slot, and every atomic part (SHOPIFY_FIELD / METAFIELD /
// LINE_BREAK) is exactly one slot — the same way a browser caret already treats
// a `contenteditable="false"` node. A caret position is therefore a single
// integer in `[0, linearLength(parts)]`. This avoids threading `(partIndex,
// offset)` pairs (which shift whenever `normalizeValueParts` merges TEXT) through
// the DOM glue: the DOM layer speaks only linear integers, and the conversions
// to/from the reducer's `(partIndex, offset)` live here, fully testable.

import type { ValuePart } from "./rows";

/** Total number of caret slots in the cell (TEXT chars + 1 per atomic part). */
export function linearLength(parts: ValuePart[]): number {
  let total = 0;
  for (const part of parts) {
    total += part.type === "TEXT" ? part.text.length : 1;
  }
  return total;
}

/** Linear caret index of the boundary `(partIndex, offset)`. Inverse of below. */
export function partOffsetToLinear(
  parts: ValuePart[],
  partIndex: number,
  offset: number,
): number {
  let linear = 0;
  for (let i = 0; i < partIndex && i < parts.length; i += 1) {
    const part = parts[i];
    linear += part.type === "TEXT" ? part.text.length : 1;
  }
  return linear + offset;
}

/**
 * Map a linear caret index to the reducer's `(partIndex, offset)` coordinate for
 * INSERT_VALUE_PART_AT. When the caret falls inside (or at either edge of) a TEXT
 * run it returns that run's index and the character offset, so the reducer splits
 * the TEXT there. When it falls on an atomic boundary it returns the index of the
 * part starting at that boundary (offset 0), so the reducer splices the new part
 * in without splitting. `partIndex === parts.length` means "append at the end".
 */
export function linearToPartOffset(
  parts: ValuePart[],
  linear: number,
): { partIndex: number; offset: number } {
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.type === "TEXT") {
      const len = part.text.length;
      // `<=` so the end of a TEXT run resolves into that run (offset === len),
      // splitting it rather than spilling into the next part.
      if (linear <= pos + len) {
        return { partIndex: i, offset: linear - pos };
      }
      pos += len;
    } else {
      if (linear <= pos) {
        return { partIndex: i, offset: 0 };
      }
      pos += 1;
    }
  }
  return { partIndex: parts.length, offset: 0 };
}

export type DeleteDirection = "backward" | "forward";

/**
 * Plan a single-keystroke delete when the caret is collapsed. Returns the part to
 * remove and where the caret lands afterward only when an *atomic* part sits
 * immediately in the delete direction (Backspace → the part ending at the caret;
 * Delete → the part starting at the caret). Returns `null` when the neighbour is
 * a plain text character (let the browser delete it and re-derive via input) or
 * when there is nothing to delete (caret at the very start/end).
 */
export function planAtomicDelete(
  parts: ValuePart[],
  linear: number,
  direction: DeleteDirection,
): { removeIndex: number; caretLinear: number } | null {
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const len = part.type === "TEXT" ? part.text.length : 1;
    const start = pos;
    const end = pos + len;
    if (part.type !== "TEXT") {
      if (direction === "backward" && end === linear) {
        return { removeIndex: i, caretLinear: linear - 1 };
      }
      if (direction === "forward" && start === linear) {
        return { removeIndex: i, caretLinear: linear };
      }
    }
    pos = end;
  }
  return null;
}

/**
 * Plan a delete over a non-collapsed selection `[from, to)`. Expressed only in
 * terms of the existing reducer actions (no new "replace all" action): TEXT runs
 * that overlap the range are trimmed via SET_VALUE_TEXT, and atomic parts fully
 * inside the range are dropped via REMOVE_VALUE_PART. The caller dispatches the
 * text edits first, then the removals in descending index order, so indices stay
 * valid as `normalizeValueParts` collapses the array. The caret lands at `from`.
 */
export function planSelectionDelete(
  parts: ValuePart[],
  from: number,
  to: number,
): {
  textEdits: { partIndex: number; text: string }[];
  removeIndices: number[];
  caretLinear: number;
} {
  const textEdits: { partIndex: number; text: string }[] = [];
  const removeIndices: number[] = [];
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.type === "TEXT") {
      const len = part.text.length;
      const start = pos;
      const end = pos + len;
      const delStart = Math.max(from, start);
      const delEnd = Math.min(to, end);
      if (delEnd > delStart) {
        const kept =
          part.text.slice(0, delStart - start) + part.text.slice(delEnd - start);
        textEdits.push({ partIndex: i, text: kept });
      }
      pos = end;
    } else {
      const start = pos;
      const end = pos + 1;
      if (start >= from && end <= to) {
        removeIndices.push(i);
      }
      pos = end;
    }
  }
  return { textEdits, removeIndices, caretLinear: from };
}
