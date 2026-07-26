// Feature 86 Step 1 — the coverage contract between `StylingValues` and the
// Style rail.
//
// Nothing in the repo stopped a Style-tab edit from silently dropping a
// control. The knob would vanish from the rail while its column, its CSS var,
// its serialization and its storefront rule all stayed live — so the field
// would keep round-tripping, keep rendering whatever was last saved, and simply
// become unreachable. No test failed, no type broke, and the only detection was
// noticing an absence by eye.
//
// That is a tolerable risk for a feature adding one control. It is not one for
// feature 86, which relocates all 34, so this guard is built FIRST and against
// the PRE-MOVE rail — passing on the current file before anything moved is what
// makes it evidence rather than decoration.
//
// The invariant, in one line: every member of `STYLING_FIELD_NAMES` is
// reachable from a control in the rail, and no field is reachable from two.
//
// Reads the real file off disk, the same technique as
// `specTableCssContract.test.ts` and `specTableAriaContract.test.ts`. A rail is
// JSX and jsdom cannot render Polaris web components, so text is the only
// handle there is on it.
//
// ⚠️ REACHABILITY, NOT CORRECTNESS. This cannot see that a control landed in
// the wrong group, that a label is wrong, or that two controls overlap. It
// catches exactly one failure — a knob that stopped being rendered at all.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  STYLING_FIELD_NAMES,
  parseStylingValues,
  type StylingFieldName,
} from "../../utils/tableStyling";
import { COLOR_KNOBS } from "./stylingControls";

const source = readFileSync(
  fileURLToPath(new URL("./StyleTab.tsx", import.meta.url)),
  "utf8",
);

// Comments stripped before any matching, for the same reason the ARIA contract
// strips them: this file's subject matter IS `setStylingField` calls, and
// StyleTab's header block narrates the rail in prose. A guard that counts its
// own documentation passes vacuously.
//
// The line-comment pattern is anchored to the start of a line on purpose — a
// looser `//` would eat the tail of any string containing one.
const body = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

// The rail has exactly TWO routes from a field to a control, and the test has
// to know both:
//
//   1. a literal `setStylingField("field", …)` — the 24 non-colors;
//   2. a `COLOR_KNOBS` entry the rail maps over, whose call is
//      `setStylingField(knob.field, …)` — a VARIABLE, invisible to a text scan.
//
// Route 2 is why this is a two-branch test rather than a one-line grep.

/** Every field written by a literal `setStylingField("…")` call in the rail. */
function fieldsWrittenByLiteralCall(): ReadonlySet<string> {
  const found = new Set<string>();
  for (const match of body.matchAll(/setStylingField\(\s*"([A-Za-z0-9_]+)"/g)) {
    found.add(match[1]);
  }
  return found;
}

// Derived from `parseStylingValues` rather than hand-typed, the same way
// `stylingControls.test.ts` derives the expected `COLOR_KNOBS` order: a tenth
// color added to `StylingValues` lands in this set automatically and must then
// satisfy the assertions below.
const COLOR_FIELDS: readonly StylingFieldName[] = STYLING_FIELD_NAMES.filter(
  (field) => parseStylingValues({ [field]: "#123456" })[field] === "#123456",
);

describe("feature 86 — the Style rail renders a control for every knob", () => {
  it("the text scan finds calls at all", () => {
    // Guards the guard. If the regex ever stops matching — a formatter change,
    // a renamed mutator — every assertion below would pass vacuously against an
    // empty set, and the drop guard would be silently gone at the exact moment
    // it is being relied on.
    expect(fieldsWrittenByLiteralCall().size).toBeGreaterThan(10);
  });

  it("the color route is populated", () => {
    // The other half of guarding the guard: an empty `COLOR_FIELDS` would make
    // the partition assertion below trivially true. That `COLOR_KNOBS` covers
    // exactly these fields is pinned in `stylingControls.test.ts`; here we only
    // need to know the route is not empty.
    expect(COLOR_FIELDS.length).toBeGreaterThan(0);
    expect(COLOR_KNOBS.length).toBe(COLOR_FIELDS.length);
  });

  it("actually renders the color knob list", () => {
    // Without this, route 2 would be satisfied by a list nothing reads:
    // `COLOR_KNOBS` membership proves a swatch COULD render, not that it does.
    //
    // Counted rather than `toContain`, because the IMPORT alone would satisfy a
    // presence check — a rail that imported the list and rendered none of it
    // would pass. Two occurrences means the import plus at least one use. Not
    // pinned to `.map`: feature 86 renders the list per group through a
    // `.filter(…).map(…)`, and the guard must not dictate the shape.
    const occurrences = body.match(/\bCOLOR_KNOBS\b/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every field in STYLING_FIELD_NAMES a control", () => {
    const literal = fieldsWrittenByLiteralCall();
    const colors = new Set<string>(COLOR_FIELDS);

    const unreachable = STYLING_FIELD_NAMES.filter(
      (field) => !literal.has(field) && !colors.has(field),
    );

    // Named rather than counted, so a failure says WHICH knob lost its control.
    expect(unreachable).toEqual([]);
  });

  it("gives no field two controls", () => {
    // A field on both routes would render twice — a swatch in one group and a
    // bespoke control in another, each overwriting the other's value with no
    // indication that the other exists. Relaxable deliberately if a color ever
    // earns a special-cased control, but never by accident.
    const literal = fieldsWrittenByLiteralCall();
    const doubled = COLOR_FIELDS.filter((field) => literal.has(field));

    expect(doubled).toEqual([]);
  });
});

// Feature 86 Step 3 — the separation treatment. Two assertions, both scale-free:
// they say how the rail is separated, never how many groups it has, so Step 4
// can move all 34 controls and add two groups without touching either one.
describe("feature 86 — the Style rail separates its groups", () => {
  const groupCount = (body.match(/role="group"/g) ?? []).length;
  const dividerCount = (body.match(/<s-divider\b/g) ?? []).length;

  it("draws one divider per group", () => {
    // Not the coincidence it looks like. Dividers sit BETWEEN the groups, which
    // is N-1 of them, plus one closing rule above Reset — so N groups always
    // want exactly N dividers, at six today and at eight after the move.
    //
    // This is the one thing about the treatment worth pinning: a group added
    // later without its rule is invisible to every other test in the repo, and
    // reads as a rendering glitch rather than a missing line of JSX.
    expect(groupCount).toBeGreaterThan(0); // guards the guard
    expect(dividerCount).toBe(groupCount);
  });

  it("keeps the rail's outer gap wider than the gap inside a group", () => {
    // The proximity signal, and the half of the treatment that survives if a
    // merchant's OS is set to reduce visual noise. `large-200` outside, `base`
    // within: controls in one group sit closer to each other than to the next
    // group, so the rail is legible before a single rule is drawn.
    //
    // The outer stack is the first `<s-stack>` in the file — the element the
    // component returns.
    const firstStack = body.match(/<s-stack\b[^>]*>/);
    expect(firstStack).not.toBeNull();
    expect(firstStack?.[0]).toMatch(/gap="large-\d+"/);

    // And the per-group stacks stay tight. Anything but `base` here would
    // either flatten the contrast or double it.
    const innerGaps = (body.match(/<s-stack\b[^>]*>/g) ?? []).slice(1);
    expect(innerGaps.length).toBe(groupCount);
    for (const stack of innerGaps) {
      expect(stack).toContain('gap="base"');
    }
  });
});
