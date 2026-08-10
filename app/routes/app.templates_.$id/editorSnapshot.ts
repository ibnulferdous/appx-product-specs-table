import {
  serializeStylingOverrides,
  type StylingValues,
} from "../../utils/tableStyling";

// The editor's dirty-snapshot serialization, extracted pure (feature 57 Step 5).
//
// The engine compares a snapshot of every editable surface against the last-saved baseline to drive
// `isDirty`, and captures the SAME shape at Save-click time (`submittedMetaJsonRef`) so an edit made
// during an in-flight save stays dirty. Those two call sites must serialize identically — a drift is
// the edit-during-save bug. Once two hand-built literals kept in sync by eye; now one function called
// twice, so agreement is structural.
//
// `JSON.stringify` is key-order sensitive, so the key order here is fixed and load-bearing. Two
// order-INDEPENDENT sets are sorted before stringifying so a mere reorder never registers as a change:
// `scopeValues` (features 46/47) and `excludes` (feature 45). Styling rides as the overrides-only wire
// shape (`serializeStylingOverrides`) — byte-for-byte what the Save payload sends, built by iterating
// `STYLING_FIELD_NAMES` in a fixed order, so it's stable without extra sorting.

export interface EditorMetaSnapshotInput {
  // Stringified as-is; the reducer never mutates in place, so a captured reference stays a valid
  // point-in-time snapshot.
  rows: unknown;
  name: string;
  status: string;
  scope: string;
  // Raw scope values only — resolved labels/thumbnails are presentation and excluded, so a
  // re-resolved label never looks like an edit.
  scopeValues: string[];
  excludes: string[];
  styling: StylingValues;
  /**
   * The style-preset provenance stamp (feature 88 step 89).
   *
   * 🔴 In the snapshot because it CANNOT be derived from `styling`. Banded's bundle is `{}` (the
   * zero-config default already IS that pattern), so picking Banded on an untouched template moves none
   * of the 34 values and `serializeStylingOverrides` returns `{}` before and after. Watching only
   * styling, that pick is invisible — the SaveBar never opens. This key is the whole reason it can.
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
    // Appended, not interleaved: the key order above is load-bearing for `JSON.stringify`, and adding
    // to the end is the one edit that can't change what an existing snapshot means.
    basedOnPreset: input.basedOnPreset,
  });
}
