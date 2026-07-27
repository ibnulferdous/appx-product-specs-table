import {
  serializeStylingOverrides,
  type StylingValues,
} from "../../utils/tableStyling";

// The editor's dirty-snapshot serialization, extracted pure (feature 57 Step 5).
//
// The engine compares a snapshot of every editable surface against the
// last-saved baseline to drive `isDirty`, and captures the SAME shape again at
// Save-click time (`submittedMetaJsonRef`) so an edit made during an in-flight
// save stays dirty instead of being silently marked saved. Those two call sites
// must serialize identically — a drift between them is the edit-during-save bug,
// which is invisible until it bites. Before Step 5 they were two hand-built
// object literals kept in sync by eye; they are now one function called twice,
// so agreement is structural rather than a convention.
//
// `JSON.stringify` is key-order sensitive, so the key order here is fixed and
// load-bearing. Two fields are order-INDEPENDENT sets and are sorted before
// stringifying, so a mere reorder never registers as a change:
//   - `scopeValues` — the assignment value set (features 46/47)
//   - `excludes`    — the EXCLUDE carve-out GIDs (feature 45)
// Styling rides as the overrides-only wire shape (`serializeStylingOverrides`),
// which is byte-for-byte the value the Save payload sends and is itself built by
// iterating `STYLING_FIELD_NAMES` in a fixed order — so it is stable without
// extra sorting, and the snapshot can never disagree with what was persisted.

export interface EditorMetaSnapshotInput {
  // The row array is stringified as-is; the reducer never mutates in place, so a
  // captured reference stays a valid point-in-time snapshot.
  rows: unknown;
  name: string;
  status: string;
  scope: string;
  // Raw scope values only — the resolved labels/thumbnails are presentation and
  // deliberately excluded, so a re-resolved label never looks like an edit.
  scopeValues: string[];
  excludes: string[];
  styling: StylingValues;
  /**
   * The style-preset provenance stamp (feature 88 step 89).
   *
   * 🔴 It is in the snapshot because it CANNOT be derived from `styling`.
   * Banded's bundle is `{}` — the app's zero-config default already IS that
   * pattern — so picking Banded on an untouched template moves none of the 34
   * values and `serializeStylingOverrides` returns `{}` before and after. Watch
   * only the styling and that pick is invisible: the SaveBar never opens and the
   * stamp can never be persisted. This key is the whole reason it can.
   */
  basedOnPreset: string | null;
}

export function editorMetaSnapshot(input: EditorMetaSnapshotInput): string {
  return JSON.stringify({
    rows: input.rows,
    name: input.name,
    status: input.status,
    scope: input.scope,
    scopeValues: [...input.scopeValues].sort(),
    excludes: [...input.excludes].sort(),
    styling: serializeStylingOverrides(input.styling),
    // Appended, not interleaved: the key order above is load-bearing for
    // `JSON.stringify`, and adding to the end is the one edit that cannot
    // change what an existing snapshot means.
    basedOnPreset: input.basedOnPreset,
  });
}
