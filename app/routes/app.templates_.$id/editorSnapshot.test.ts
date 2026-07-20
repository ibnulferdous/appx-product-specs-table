import { describe, expect, it } from "vitest";
import {
  editorMetaSnapshot,
  type EditorMetaSnapshotInput,
} from "./editorSnapshot";
import {
  DEFAULT_STYLING_VALUES,
  serializeStylingOverrides,
  type StylingValues,
} from "../../utils/tableStyling";

// Feature 57 Step 5 — the dirty snapshot that decides whether the SaveBar opens,
// and (called a second time at Save-click) the baseline a completed save resets
// to. `useRowEngine` itself is a hook over Polaris web components, which jsdom
// cannot render (see [[testing-strategy]]), so the mechanism is tested here at
// the pure boundary the engine delegates to.

const BASE: EditorMetaSnapshotInput = {
  rows: [{ id: "r1", label: "Weight", value: "2kg" }],
  name: "Spec table",
  status: "DRAFT",
  scope: "ALL_PRODUCTS",
  scopeValues: [],
  excludes: [],
  styling: DEFAULT_STYLING_VALUES,
};

const styled = (overrides: Partial<StylingValues>): StylingValues => ({
  ...DEFAULT_STYLING_VALUES,
  ...overrides,
});

describe("editorMetaSnapshot (feature 57 Step 5 — the dirty snapshot)", () => {
  it("is stable for an unchanged input (no false dirty)", () => {
    expect(editorMetaSnapshot(BASE)).toBe(editorMetaSnapshot({ ...BASE }));
  });

  it("changes when a styling knob changes — a styling edit alone is dirty", () => {
    const changed = editorMetaSnapshot({
      ...BASE,
      styling: styled({ rowDividerStyle: "STRIPES" }),
    });
    expect(changed).not.toBe(editorMetaSnapshot(BASE));
  });

  it("returns to the baseline when a knob is set back to its default", () => {
    // The no-false-dirty case: toggling away and back must close the SaveBar, not
    // leave the editor permanently dirty.
    const there = editorMetaSnapshot({
      ...BASE,
      styling: styled({ rowDividerStyle: "STRIPES" }),
    });
    const andBack = editorMetaSnapshot({
      ...BASE,
      styling: styled({ rowDividerStyle: "LINES" }),
    });
    expect(andBack).toBe(editorMetaSnapshot(BASE));
    expect(andBack).not.toBe(there);
  });

  it("embeds styling as the overrides-only wire shape the payload sends", () => {
    // The snapshot and the Save payload must carry byte-identical styling — this
    // pins that they are the same serialization, not two similar ones.
    const styling = styled({ rowDividerStyle: "STRIPES" });
    const snapshot = JSON.parse(
      editorMetaSnapshot({ ...BASE, styling }),
    ) as Record<string, unknown>;
    expect(snapshot.styling).toEqual(serializeStylingOverrides(styling));
    expect(snapshot.styling).toEqual({ rowDividerStyle: "STRIPES" });
  });

  it("carries an empty styling object when everything is default", () => {
    const snapshot = JSON.parse(editorMetaSnapshot(BASE)) as Record<
      string,
      unknown
    >;
    expect(snapshot.styling).toEqual({});
  });

  it("sorts the order-independent sets so a reorder is not an edit", () => {
    // Pre-existing behavior (features 45/46/47), re-pinned here now that the
    // sorting lives in this module rather than inline in the engine.
    const a = editorMetaSnapshot({
      ...BASE,
      scopeValues: ["gid://b", "gid://a"],
      excludes: ["gid://y", "gid://x"],
    });
    const b = editorMetaSnapshot({
      ...BASE,
      scopeValues: ["gid://a", "gid://b"],
      excludes: ["gid://x", "gid://y"],
    });
    expect(a).toBe(b);
  });

  it("does not mutate the caller's arrays while sorting", () => {
    const scopeValues = ["gid://b", "gid://a"];
    const excludes = ["gid://y", "gid://x"];
    editorMetaSnapshot({ ...BASE, scopeValues, excludes });
    expect(scopeValues).toEqual(["gid://b", "gid://a"]);
    expect(excludes).toEqual(["gid://y", "gid://x"]);
  });

  it("still flips on the pre-styling surfaces (rows, name, status, scope)", () => {
    const baseline = editorMetaSnapshot(BASE);
    expect(editorMetaSnapshot({ ...BASE, rows: [] })).not.toBe(baseline);
    expect(editorMetaSnapshot({ ...BASE, name: "Renamed" })).not.toBe(baseline);
    expect(editorMetaSnapshot({ ...BASE, status: "ACTIVE" })).not.toBe(
      baseline,
    );
    expect(editorMetaSnapshot({ ...BASE, scope: "PRODUCT" })).not.toBe(
      baseline,
    );
  });
});

// Feature 57 Step 12 — "Reset to theme defaults". The engine's `resetStyling` is a
// one-line wholesale `setStyling(DEFAULT_STYLING_VALUES)`; everything that could
// actually go wrong with it is here, at the pure boundary: whether the SaveBar
// notices, whether it un-notices when the reset lands back on the baseline, and
// whether it leaves the other four editable surfaces alone. The dialog and the
// rail button are browser-verified ([[testing-strategy]]).
describe("reset to theme defaults (feature 57 Step 12)", () => {
  const RESET: StylingValues = DEFAULT_STYLING_VALUES;

  it("makes a styled template dirty when reset", () => {
    const saved = editorMetaSnapshot({
      ...BASE,
      styling: styled({
        rowDividerStyle: "STRIPES",
        labelTextColor: "#ff0000",
      }),
    });
    expect(editorMetaSnapshot({ ...BASE, styling: RESET })).not.toBe(saved);
  });

  it("UN-dirties when the reset lands back on the saved baseline", () => {
    // A merchant who styles, saves nothing, then resets is back where they
    // started — the SaveBar must close again. The dirty check is a compare, not
    // a counter, so this falls out for free; assert it so it stays that way.
    const saved = editorMetaSnapshot({ ...BASE, styling: RESET });
    const afterEdit = editorMetaSnapshot({
      ...BASE,
      styling: styled({ density: "COMPACT" }),
    });
    expect(afterEdit).not.toBe(saved);
    expect(editorMetaSnapshot({ ...BASE, styling: RESET })).toBe(saved);
  });

  it("touches ONLY styling — rows, name, status, scope and excludes survive", () => {
    const before = {
      ...BASE,
      name: "Kept",
      status: "ACTIVE",
      scope: "PRODUCT",
      scopeValues: ["gid://p1"],
      excludes: ["gid://x"],
      styling: styled({ density: "COMPACT" }),
    };
    const after = JSON.parse(
      editorMetaSnapshot({ ...before, styling: RESET }),
    ) as Record<string, unknown>;
    const untouched = JSON.parse(editorMetaSnapshot(before)) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(untouched)) {
      if (key === "styling") continue;
      expect(after[key]).toEqual(untouched[key]);
    }
  });

  it("clears overrides rather than persisting defaults as data", () => {
    // The whole reason Reset needs no server work: an all-default value
    // serializes to `{}`, which the existing Save path writes as an all-NULL
    // row. Reset state and never-styled state are identical in the database.
    expect(serializeStylingOverrides(RESET)).toEqual({});
  });
});
