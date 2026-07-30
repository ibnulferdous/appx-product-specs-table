// Feature 93 · step 100 — the swatch row's structural contract.
//
// jsdom is not installed and `vitest.config.ts` runs in `node` on purpose ("a
// jsdom project gets added later only if/when component tests are introduced"), so
// the component's JSX is tested by reading the real file off disk — the established
// technique (`StylePresetCardContract.test.ts`, `styleTabContract.test.ts`).
// Comments are stripped first, for exactly the reason those files strip them: this
// file's subject matter IS `role="radio"`, `aria-checked` and `aria-label`, and the
// component narrates all three in prose. A guard that counts its own documentation
// passes vacuously.
//
// ⚠️ STRUCTURE, NOT BEHAVIOUR. It can see that a roving `tabIndex` EXPRESSION is
// present; it cannot see that arrow keys move focus. The arithmetic that decides
// where they move is covered for real in `rovingRadioKeys.test.ts`; the wiring
// between it, the refs and `.focus()` is owed to a keyboard-only pass in step 101,
// along with whether seven chips are distinguishable by eye and whether the focus
// ring shows on a tinted chip.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACCENT_PRESETS } from "../../utils/stylePresets";

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

const rawSource = read("./AccentSwatchRow.tsx");
const rawStyles = read("./AccentSwatchRow.module.css");

// 🔴 TWO rules, not three, and the missing one is deliberate.
//
// `createFlowContract.test.ts` strips JSX comments with a dedicated
// `/\{\s*\/\*[\s\S]*?\*\/\s*\}/` first. That pattern **over-matches
// catastrophically** on this component, and it took a debugging session to see it:
// the props are destructured with an inline type literal whose first member has a
// `/** … */` doc comment, so `}: {\n  /** …` matches the opening `{\s*\/\*`. Its
// `*/` is not followed by `}`, so the lazy quantifier BACKTRACKS FORWARD to the
// next `*/}` in the file — silently deleting **2928 characters** of real code,
// including the `nextRovingIndex(` call and the `ACCENT_PRESETS.map(` this file
// asserts on.
//
// ⚠️ The failure mode is what makes it dangerous: the assertions failed saying
// "the source does not contain `nextRovingIndex(`", which reads as a bug in the
// COMPONENT, not in the test's own preprocessing.
//
// ✅ Stripping block comments alone is sufficient AND safe — it turns `{/* … */}`
// into a harmless `{}`, and a non-greedy `/* … */` has no `}` to backtrack toward.
// This is exactly the two-rule form `StylePresetCardContract.test.ts` uses next
// door, which is the file this one was modelled on.
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const body = strip(rawSource);
const css = strip(rawStyles);

describe("the row is a real radiogroup", () => {
  it("declares a named radiogroup with radio children", () => {
    // An unnamed group of seven unlabelled colour dots is the worst case for a
    // screen reader: no role to explain the relationship, no name to say what is
    // being chosen.
    expect(body).toContain('role="radiogroup"');
    expect(body).toMatch(/aria-labelledby=/);
    expect(body).toContain('role="radio"');
    expect(body).toMatch(/aria-checked=\{/);
  });

  it("🔴 uses a ROVING tabindex — one tab stop, not seven", () => {
    // The classic wrong build of this control. Seven tab stops means a keyboard
    // merchant tabs through every colour to get past the row, and the arrow keys
    // the APG requires become decoration.
    expect(body).toMatch(/tabIndex=\{\s*\w+\s*\?\s*0\s*:\s*-1\s*\}/);
    expect(body).not.toMatch(/tabIndex=\{0\}/);
  });

  it("gives every chip an accessible name", () => {
    // The chips carry no text (a colour is the content, and seven labels do not
    // fit the header slot), so without this each radio's name is empty.
    expect(body).toMatch(/aria-label=\{/);
  });

  it("routes keys through nextRovingIndex and implements no second copy", () => {
    // The anti-duplication guard for doc 100's finding. `SegmentedControl` already
    // owns this arithmetic; the shared part was extracted precisely so this file
    // would not grow a divergent `switch`. A `case "ArrowRight"` appearing here
    // means the extraction was undone.
    expect(body).toContain("nextRovingIndex(");
    expect(body).not.toMatch(/case\s+"Arrow/);
    expect(body).not.toMatch(/case\s+"Home"/);
  });

  it("🔴 tests the key result against null, not for truthiness", () => {
    // Index 0 is falsy. An `if (!next) return` would swallow every Home press and
    // every wrap onto the first swatch — a bug that looks like "the first colour
    // is unreachable by keyboard" and would never be caught by eye on a mouse.
    expect(body).toMatch(/next === null/);
    expect(body).not.toMatch(/if\s*\(\s*!next\s*\)/);
  });
});

describe("Theme is the absence of an accent, in the UI too", () => {
  it("🔴 uses the string `theme` exactly ONCE, as a DOM key", () => {
    // Step 97 D1 refused a seventh ACCENT_PRESETS member with an empty bundle
    // because it would add a second way to express one state. A magic prop string
    // reintroduces exactly that, and needs translating back to `null` at some
    // boundary — which is where the two drift.
    //
    // The literal cannot be eliminated: `null` is not usable as a React key or an
    // element-id fragment, so the Theme option needs a DOM-level name. It CAN be
    // confined, and this counts rather than pattern-matches.
    //
    // 🔴 **Counting is why this guard works.** It was first written as three
    // negative patterns (`=== "theme"`, `value === "theme"`, `id: "theme"`), and a
    // mutation slipped past all but one: `(option.id ?? "theme") === (value ??
    // "theme")` has no `===` directly followed by the literal, so the sentinel
    // entered the comparison path unseen. Only the incidental `id: "theme"` half of
    // that same mutation failed. A pattern guard enumerates the spellings someone
    // has thought of; a count covers the ones they have not.
    const occurrences = body.match(/"theme"/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(body).toMatch(/domKey = \(id: string \| null\) => id \?\? "theme"/);
  });

  it("compares the selection against null", () => {
    expect(body).toMatch(/string \| null/);
  });

  it("hardcodes Theme FIRST, before the mapped accents", () => {
    // Merchant decision (doc 93 §D5): "Theme" is first and pre-selected. Its
    // position is the decision, so a later refactor that appended it would be a
    // silent behaviour change.
    const themeAt = body.indexOf('label: "Theme"');
    const mapAt = body.indexOf("ACCENT_PRESETS.map(");
    expect(themeAt).toBeGreaterThanOrEqual(0);
    expect(mapAt).toBeGreaterThanOrEqual(0);
    expect(themeAt).toBeLessThan(mapAt);
  });
});

describe("the palette stays in ACCENT_PRESETS", () => {
  it("🔴 no accent hex appears in the component or its stylesheet", () => {
    // Derived from the data, so a seventh accent is covered with no edit. Per-accent
    // CSS classes or inline literals would be a second copy of merchant-approved
    // values — the same objection step 97 D4 raised against deriving the palette
    // with `hsl()`, and the copy would be the one that goes stale.
    for (const accent of ACCENT_PRESETS) {
      for (const hex of Object.values(accent.bundle)) {
        if (typeof hex !== "string") continue;
        expect(
          body,
          `${accent.id}: ${hex} leaked into the component`,
        ).not.toContain(hex);
        expect(
          css,
          `${accent.id}: ${hex} leaked into the stylesheet`,
        ).not.toContain(hex);
      }
    }
  });

  it("maps ACCENT_PRESETS rather than hand-listing the six", () => {
    // Swatch order is merchant-facing and recorded in the array's literal order.
    expect(body).toContain("ACCENT_PRESETS.map(");
    for (const accent of ACCENT_PRESETS) {
      expect(body, `${accent.id} is hand-listed`).not.toContain(
        `"${accent.label}"`,
      );
    }
  });

  it("passes the two tones as custom properties", () => {
    expect(body).toContain("--appx-chip-fill");
    expect(body).toContain("--appx-chip-ink");
    expect(css).toContain("var(--appx-chip-fill)");
    expect(css).toContain("var(--appx-chip-ink)");
  });
});

describe("the selected state does not rely on colour alone", () => {
  it("🔴 renders a non-colour indicator on the checked chip (WCAG 1.4.1)", () => {
    // This control's entire content is colour, so "the one with a thicker ring in
    // a slightly different tone" is unusable for a merchant with low colour
    // discrimination. ⚠️ `aria-checked` does not cover this — it is for assistive
    // tech, and this is for eyes. Two separate requirements.
    expect(body).toMatch(/styles\.check/);
    expect(css).toMatch(/\.check\s*\{/);
  });

  it("outlines the checked chip rather than only thickening its border", () => {
    // The border is already the accent's own ink tone, so thickening it says
    // "selected" in colour only. An outline sits outside the chip in the row's ink.
    expect(css).toMatch(/\[aria-checked="true"\][\s\S]*?outline:/);
  });

  it("keeps a visible focus ring, distinct from the palette", () => {
    // A ring drawn in the accent's colour is invisible on the chip it surrounds.
    expect(css).toMatch(/:focus-visible[\s\S]*?outline:[^;]*currentColor/);
  });

  it("honours prefers-reduced-motion", () => {
    // Cheap, and exactly the kind of thing dropped in a rewrite. The row is
    // complete without the hover nudge.
    expect(css).toContain("prefers-reduced-motion");
  });
});
