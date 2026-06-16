import { describe, it, expect } from "vitest";
import {
  linearLength,
  linearToPartOffset,
  partOffsetToLinear,
  planAtomicDelete,
  planSelectionDelete,
} from "./valueParts";
import type { ValuePart } from "./rows";

// "Up to [token] hours": the canonical multi-part value. The token occupies one
// linear slot, so the linear length is 6 + 1 + 6 = 13.
const token: ValuePart = { type: "METAFIELD", namespace: "custom", key: "battery_life" };
const upToHours: ValuePart[] = [
  { type: "TEXT", text: "Up to " },
  token,
  { type: "TEXT", text: " hours" },
];

describe("linearLength", () => {
  it("counts one slot per TEXT character and one per atomic part", () => {
    expect(linearLength([{ type: "TEXT", text: "" }])).toBe(0);
    expect(linearLength(upToHours)).toBe(13);
    expect(
      linearLength([
        { type: "TEXT", text: "a" },
        { type: "LINE_BREAK" },
        { type: "TEXT", text: "bc" },
      ]),
    ).toBe(4);
  });
});

describe("partOffsetToLinear / linearToPartOffset round-trip", () => {
  it("maps a TEXT caret to its linear index and back", () => {
    expect(partOffsetToLinear(upToHours, 0, 3)).toBe(3);
    expect(linearToPartOffset(upToHours, 3)).toEqual({ partIndex: 0, offset: 3 });
    // Start of the trailing TEXT (just after the token) is linear 7.
    expect(partOffsetToLinear(upToHours, 2, 0)).toBe(7);
    expect(linearToPartOffset(upToHours, 7)).toEqual({ partIndex: 2, offset: 0 });
  });
});

describe("linearToPartOffset", () => {
  it("resolves the end of a TEXT run into that run (so the TEXT is split, not skipped)", () => {
    // Linear 6 is both the end of "Up to " and the boundary before the token;
    // it must resolve into the TEXT (offset 6) so an insert splits there.
    expect(linearToPartOffset(upToHours, 6)).toEqual({ partIndex: 0, offset: 6 });
  });

  it("resolves a caret inside an empty TEXT run that sits after a token", () => {
    const parts: ValuePart[] = [
      { type: "TEXT", text: "" },
      token,
      { type: "TEXT", text: "" },
    ];
    expect(linearToPartOffset(parts, 0)).toEqual({ partIndex: 0, offset: 0 });
    expect(linearToPartOffset(parts, 1)).toEqual({ partIndex: 2, offset: 0 });
  });

  it("returns the end position (partIndex === length) past the last slot", () => {
    expect(linearToPartOffset(upToHours, 13)).toEqual({ partIndex: 2, offset: 6 });
  });
});

describe("planAtomicDelete", () => {
  it("Backspace just after a token removes it and lands the caret at its start", () => {
    expect(planAtomicDelete(upToHours, 7, "backward")).toEqual({
      removeIndex: 1,
      caretLinear: 6,
    });
  });

  it("Delete just before a token removes it and keeps the caret in place", () => {
    expect(planAtomicDelete(upToHours, 6, "forward")).toEqual({
      removeIndex: 1,
      caretLinear: 6,
    });
  });

  it("returns null when the neighbour is a plain character (browser deletes it)", () => {
    expect(planAtomicDelete(upToHours, 3, "backward")).toBeNull();
    expect(planAtomicDelete(upToHours, 3, "forward")).toBeNull();
  });

  it("returns null at the very start (Backspace) and very end (Delete)", () => {
    expect(planAtomicDelete(upToHours, 0, "backward")).toBeNull();
    expect(planAtomicDelete(upToHours, 13, "forward")).toBeNull();
  });

  it("removes a LINE_BREAK as one unit just like a token", () => {
    const parts: ValuePart[] = [
      { type: "TEXT", text: "a" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "b" },
    ];
    // Backspace at the start of the second line (linear 2) removes the break.
    expect(planAtomicDelete(parts, 2, "backward")).toEqual({
      removeIndex: 1,
      caretLinear: 1,
    });
  });
});

describe("planSelectionDelete", () => {
  it("trims overlapping TEXT runs and drops a fully-selected token, caret at from", () => {
    expect(planSelectionDelete(upToHours, 3, 9)).toEqual({
      textEdits: [
        { partIndex: 0, text: "Up " },
        { partIndex: 2, text: "ours" },
      ],
      removeIndices: [1],
      caretLinear: 3,
    });
  });

  it("keeps a token that is only partially covered by the selection", () => {
    // Selecting [0, 6] covers all of the first TEXT but not the token's slot.
    expect(planSelectionDelete(upToHours, 0, 6)).toEqual({
      textEdits: [{ partIndex: 0, text: "" }],
      removeIndices: [],
      caretLinear: 0,
    });
  });

  it("removes every atomic fully inside a wide selection", () => {
    const parts: ValuePart[] = [
      { type: "TEXT", text: "a" },
      token,
      { type: "TEXT", text: "b" },
      { type: "LINE_BREAK" },
      { type: "TEXT", text: "c" },
    ];
    // linear length = 1 + 1 + 1 + 1 + 1 = 5; select all.
    const plan = planSelectionDelete(parts, 0, 5);
    expect(plan.removeIndices).toEqual([1, 3]);
    expect(plan.caretLinear).toBe(0);
  });
});
