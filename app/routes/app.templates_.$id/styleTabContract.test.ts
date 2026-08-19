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
import {
  COLOR_KNOBS,
  STYLE_GROUP_HEADINGS,
  type StyleGroupId,
} from "./stylingControls";

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

// Feature 86 Step 4 — the move. `STYLE_GROUP_HEADINGS` became the rail's
// vocabulary in Step 2, but until Step 4 nothing rendered from it, so it could
// drift from the rail without any test noticing. These pin the two directions of
// that binding, plus the one hole the move itself opened.
describe("feature 86 — the Style rail renders all eight groups", () => {
  const GROUP_IDS = Object.keys(STYLE_GROUP_HEADINGS) as StyleGroupId[];

  it("renders a group for every id in STYLE_GROUP_HEADINGS", () => {
    // Catches the half-done move: an id declared in the vocabulary, referenced
    // by a `COLOR_KNOBS` entry, and never given a wrapper in the rail.
    const missing = GROUP_IDS.filter(
      (id) => !body.includes(`headingId("${id}")`),
    );

    expect(missing).toEqual([]);
    expect(GROUP_IDS.length).toBe(8);
  });

  it("takes every heading FROM the vocabulary rather than retyping it", () => {
    // The direction that keeps the two in sync. A hardcoded `<s-heading>Labels`
    // would render correctly today and then silently disagree with
    // `STYLE_GROUP_HEADINGS` the first time a heading is reworded — and the
    // vocabulary is what `ColorKnob.group` is documented against.
    for (const id of GROUP_IDS) {
      expect(body).toContain(`STYLE_GROUP_HEADINGS.${id}`);
    }
  });

  it("renders the swatches of every group that has any", () => {
    // ⚠️ THE HOLE STEP 4 OPENED, and the reason this file needed a fourth
    // assertion at all. The drop guard above proves a color is reachable via
    // `COLOR_KNOBS`, which was airtight while ONE `.map` rendered the whole
    // list. Step 4 renders five FILTERED grids instead, so dropping a single
    // `{colorGrid("values")}` line would strip two swatches from the rail while
    // `COLOR_KNOBS` still appeared five times and every existing test still
    // passed.
    //
    // Derived from the data, not hand-listed: a knob refiled into a sixth group
    // makes this fail until that group's grid is rendered.
    const groupsWithSwatches = [...new Set(COLOR_KNOBS.map((k) => k.group))];
    const unrendered = groupsWithSwatches.filter(
      (group) => !body.includes(`colorGrid("${group}")`),
    );

    expect(unrendered).toEqual([]);
    expect(groupsWithSwatches.length).toBeGreaterThan(1); // guards the guard
  });

  it("leaves no group able to collapse to a bare heading", () => {
    // Feature 86 Step 5. Seven of the 34 controls are behind a hide rule, and
    // the move redistributed them — `showsCustomFontSizeInput` landed in a group
    // of four, both `sectionsCollapsible` rules landed in a group of THREE. If
    // every control in some group were guarded, that group could render as a
    // heading and a divider fencing nothing: a merchant would see an empty
    // section and read it as a broken screen, and a screen-reader user would
    // enter a `role="group"` with no members.
    //
    // Counted rather than parsed. Each guard in this file wraps exactly one
    // control — pinned globally by the next assertion — so a group with more
    // controls than guards must have at least one that always renders.
    //
    // ⚠️ A `colorGrid(…)` CALL IS NO LONGER ALWAYS A CONTROL (2026-07-29). It
    // returns null when every swatch in its group is filtered out, which
    // `tableFrame` can now do — it holds one swatch and that swatch is gated. So
    // a grid counts here only for a group with an unconditional swatch;
    // otherwise it is dropped from the tally, exactly as if it were guarded.
    // Left un-adjusted, this test would have kept passing on a premise that had
    // become false — the failure mode it is least able to notice about itself.
    const emptiableGroups = new Set(
      [...new Set(COLOR_KNOBS.map((knob) => knob.group))].filter((group) =>
        COLOR_KNOBS.filter((knob) => knob.group === group).every(
          (knob) => knob.visibleWhen,
        ),
      ),
    );
    const alwaysRenders = (call: string) => {
      const group = call.slice('colorGrid("'.length, -'")'.length);
      return !emptiableGroups.has(group as StyleGroupId);
    };

    const blocks = body.split(/<div\s+role="group"/).slice(1);
    expect(blocks.length).toBe(8);

    const thin = blocks
      .map((block, index) => {
        const controls = (
          block.match(/<s-select\b|<s-number-field\b|<s-switch\b/g) ?? []
        ).length;
        const grids = (block.match(/colorGrid\("[a-zA-Z]+"\)/g) ?? []).filter(
          alwaysRenders,
        ).length;
        const guards = (block.match(/\{shows[A-Za-z]+\(/g) ?? []).length;
        return { index, controls: controls + grids, guards };
      })
      .filter((group) => group.controls <= group.guards);

    expect(thin).toEqual([]);
  });

  it("keeps the swatch-less group alive on unguarded number fields", () => {
    // The other half of `stylingControls.test.ts`'s "empties exactly one group",
    // and the half only this file can see. `tableFrame` is the group whose
    // colors can all vanish, so what stops it collapsing to a heading and a
    // divider is that its OTHER controls are unconditional. The count above
    // proves some control survives; this names them, because "which ones" is
    // the thing a later edit would change without noticing.
    //
    // Three, and the third is the point: Corner radius is NOT gated on the
    // outline. `.appx-spec-table--outer-radius` sets `overflow: hidden`, so a
    // radius clips the section band and the stripe fills with no frame drawn at
    // all — and BANDED is the default header style, so that is the untouched
    // template. Gating it would delete the only control for a live effect.
    const owner = body
      .split(/<div\s+role="group"/)
      .slice(1)
      .find((block) => block.includes('headingId("tableFrame")'));

    expect(owner, "no group renders the table frame controls").toBeDefined();
    for (const label of [
      "Maximum width",
      "Outline thickness",
      "Corner radius",
    ]) {
      expect(owner).toContain(`label="${label}"`);
    }
    // Exactly one guard in the group, and it is the alignment select — so none
    // of the three above is behind a predicate.
    expect(owner?.match(/\{shows[A-Za-z]+\(/g)).toEqual([
      "{showsTableAlignControl(",
    ]);
  });

  it("wraps exactly one control per JSX hide rule", () => {
    // What makes the count above sound: if a guard ever wrapped two controls,
    // `controls > guards` would stop implying that an unguarded control exists,
    // and the assertion above would silently weaken from a real check to an
    // arithmetic accident.
    //
    // SEVEN, not eleven. `stylingControls.test.ts` pins the predicate registry
    // at 11, and the difference is the point: the other four guard COLORS,
    // which this rail does not write as JSX at all — the nine swatches
    // are one `.filter(…).map(…)` over `COLOR_KNOBS`, so their predicates are
    // carried on the knobs and applied inside `colorGrid`. That is why the
    // counting test above is still sound at 11 predicates: a `visibleWhen` knob
    // cannot empty a group (pinned in `stylingControls.test.ts`), so
    // `colorGrid(…)` still always renders a control.
    const guards = body.match(/\{shows[A-Za-z]+\(/g) ?? [];
    expect(guards.length).toBe(7);
  });

  it("applies each swatch's own visibility rule inside colorGrid", () => {
    // The other half of feature 95, and the failure it exists to catch: the
    // predicate stays exported, registered and unit-tested while the rail drops
    // the filter clause and renders all nine swatches unconditionally. Every
    // test in `stylingControls.ts` still passes — the knob is correct, the
    // renderer is not — and the drop guard above is blind here, since
    // `COLOR_KNOBS` is still mapped and the field is still reachable.
    expect(body).toContain("knob.visibleWhen");
  });

  it("renders no grid at all for a group whose swatches all hid", () => {
    // ⚠️ THE ONE CLAIM WITH NO OTHER DETECTOR (2026-07-29). `colorGrid` must
    // return null when its filter empties, or `tableFrame` at Outline thickness
    // 0 paints a bare `<s-grid>`: a blank strip carrying the stack's gap, which
    // reads as a half-loaded rail. Every other test here would stay green —
    // the swatch is still gated, still wired, still preserved on hide, and the
    // grid still renders for the eight groups that cannot empty.
    //
    // Asserted as source text, like the visibility rule above, because jsdom
    // cannot render Polaris web components and `colorGrid` is a closure over
    // `styling` that no test can call. Anchored on the LENGTH CHECK rather than
    // on `return null`, so the guard names the condition it is protecting.
    expect(body).toMatch(/visible\.length === 0/);
    expect(body).toMatch(/if\s*\(visible\.length === 0\)\s*return null;/);
  });

  it("files the section gap under Section headers, not Collapsible sections", () => {
    // ⚠️ The one thing the header of this file says it CANNOT see — "a control
    // landed in the wrong group" — asserted for exactly one control, because
    // feature 94 MOVES one and a move is otherwise invisible to every guard
    // here. The reachability check passes either way: `sectionGapPx` stays
    // reachable from exactly one control no matter which group renders it.
    //
    // Why it belongs here and not with the collapsible switch: feature 86's
    // axis is the OBJECT being styled, and once the gap no longer requires
    // disclosures (it works in the STACKED and GRID flat layouts too) it is a
    // property of the section headers it separates, not of collapsing.
    const blocks = body.split(/<div\s+role="group"/).slice(1);
    const owner = blocks.find((block) =>
      block.includes("showsSectionGapControl"),
    );

    expect(owner, "no group renders the section-gap control").toBeDefined();
    expect(owner).toContain('headingId("sectionHeaders")');
    expect(owner).not.toContain('headingId("collapsibleSections")');
  });

  it("has retired the Colors group's note", () => {
    // The note ("Leave a swatch empty to inherit that color from your theme")
    // described a group that no longer exists, and was WRONG for four of the
    // nine swatches — `outerBorderColor` inherits from `borderColor`, not from
    // the theme. Per-swatch `emptyHelpText` replaced it. Left behind, it would
    // be an `aria-describedby` pointing at a stale, inaccurate sentence.
    expect(body).not.toContain("inherit that color from your theme");
    expect(body).not.toContain("colors-note");
  });
});

// The typing bug, 2026-07-31 — and the half of it only a text scan can see.
//
// `stylingControls.test.ts` proves `liveCommitValue` decides correctly WHEN a
// keystroke should commit. Nothing there can prove a box ever asks it: the
// original defect was not a wrong decision, it was a missing handler, and every
// test in the repo passed while all nine boxes were commit-on-blur only. So the
// guard has to walk the JSX, the same way the reachability guard above does.
//
// ⚠️ REACHABILITY, NOT BEHAVIOUR, as everywhere in this file. It cannot see that
// a box passed the WRONG formatter to `liveCommitValue` (the derived table in
// `stylingControls.test.ts` covers that) or that it read the result with a
// truthiness test. It catches exactly one failure — a number box that went back
// to firing only on blur.
describe("2026-07-31 — every number box in the rail reacts while typing", () => {
  // Each `<s-number-field …/>` as its own slice of source. Split on the tag and
  // cut at the self-close, so one box's handlers can never satisfy the
  // assertion for the box below it — the failure this shape exists to prevent,
  // since the boxes sit adjacent inside the same groups.
  const boxes = body
    .split(/<s-number-field\b/)
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf("/>")));

  it("finds every number field", () => {
    // Guards the guard, twice over: a zero-length split would make the loops
    // below vacuous, and a missing `/>` would silently truncate a box to the
    // empty string. Nine is the rail's current count — a tenth box is meant to
    // fail here and be added deliberately, with both handlers.
    expect(boxes.length).toBe(9);
    for (const box of boxes) expect(box.length).toBeGreaterThan(0);
  });

  it("gives each one an onInput as well as an onChange", () => {
    // The regression itself. `onChange` alone is commit-on-blur: the merchant
    // types a value, `isDirty` stays false, the SaveBar never appears, and
    // navigating away discards the number with no warning — the unsaved-changes
    // guard reads the same flag.
    const missing = boxes
      .map((box, index) => ({
        index,
        label: box.match(/label="([^"]+)"/)?.[1] ?? "(unlabelled)",
        onInput: box.includes("onInput="),
        onChange: box.includes("onChange="),
      }))
      .filter((box) => !box.onInput || !box.onChange);

    // Named rather than counted, so a failure says WHICH box lost a handler.
    expect(missing).toEqual([]);
  });

  it("routes every onInput through liveCommitValue", () => {
    // The other direction, and the one that keeps the fix from becoming the
    // worse bug it replaced. These boxes are CONTROLLED and every `from…`
    // clamps, so an `onInput` that commits unconditionally rewrites a half-typed
    // number under the caret and makes the box untypeable. Passing through
    // `liveCommitValue` is what makes the commit conditional.
    const unguarded = boxes.filter(
      (box) => box.includes("onInput=") && !box.includes("liveCommitValue("),
    );

    expect(unguarded).toEqual([]);
  });

  it("reads the result with !== undefined, never a truthiness test", () => {
    // ⚠️ THE SUBTLE WAY TO GET THIS WRONG. `liveCommitValue` returns THREE
    // things — `undefined` for "still typing", `null` for a real empty/off
    // value, and a number. A call site written `if (value)` would drop every
    // cleared box AND the `0` of a zero-means-off box; `if (value != null)`
    // would drop the same clears while looking correct.
    //
    // Asserted over the whole rail rather than per box, since the two bad
    // spellings are what is being banned, not a required phrasing.
    const onInputBodies = boxes.filter((box) => box.includes("onInput="));
    expect(onInputBodies.length).toBe(9); // guards the guard

    for (const box of onInputBodies) {
      expect(box).toMatch(/!==\s*undefined/);
      expect(box).not.toMatch(/!=\s*null/);
    }
  });
});
