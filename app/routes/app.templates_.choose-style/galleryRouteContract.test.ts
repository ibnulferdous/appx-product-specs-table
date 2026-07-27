// Feature 88 · step 91 — the gallery page's structural contract.
//
// jsdom cannot render Polaris web components, so the page is tested by reading
// its real source off disk — the established technique (`styleTabContract`,
// `specTableAriaContract`, and step 90's `StylePresetCardContract`). Comments
// are stripped first for the same reason those files strip them: this file's
// subject matter IS `inlineSize`, `auto-fit`, `STYLE_PRESETS` and the breadcrumb,
// and `route.tsx` narrates every one of them in prose. A guard that counts its
// own documentation passes vacuously.
//
// ⚠️ STRUCTURE, NOT BEHAVIOUR. This cannot see that the gallery looks right or
// that five iframes are affordable — those are the live checks. It catches the
// regressions that are invisible by eye: a page width that silently stops
// matching the card geometry, a grid that quietly starts fitting three cards,
// and a card list that drifts out of merchant-facing order.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STYLE_PRESETS } from "../../utils/stylePresets";

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

const body = read("./route.tsx")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const css = read("./route.module.css").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the page is sized for the card geometry", () => {
  it("renders an inlineSize=base page", () => {
    // Not cosmetic. The card's scale (0.55) is arithmetic against a MEASURED
    // 966px base content width: two 466px cards + a 16px gap = 948px. A
    // silent switch to `large` breaks nothing visibly — it just leaves a third
    // card's worth of dead space beside a two-column grid, which is exactly the
    // kind of wrong that never gets noticed.
    expect(body).toContain("<s-page");
    expect(body).toContain('inlineSize="base"');
  });
});

describe("the grid is two columns by decision", () => {
  it("declares exactly two tracks", () => {
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("does not auto-fit", () => {
    // Stated negatively as well as positively because the negative is the one
    // that rots: `auto-fit` would seat a third card on a wide admin and turn a
    // merchant decision into a fallback, while still passing a "there are two
    // columns somewhere" check.
    expect(css).not.toContain("auto-fit");
    expect(css).not.toContain("auto-fill");
  });

  it("falls back to ONE column below the width two cards need", () => {
    // Found live in step 91: two cards that no longer fit do not shrink
    // gracefully — the preview box crops, so each card shows a left-hand slice
    // of its table and the gallery stops being comparable. A container query,
    // not a media query, because what decides the fit is the width `<s-page>`
    // hands us; and 948px because that is the card arithmetic (466 x 2 + 16),
    // not a guessed device width.
    expect(css).toContain("container-type: inline-size");
    expect(css).toMatch(/@container\s*\(width\s*<\s*948px\)/);
    expect(css).toMatch(
      /@container[^{]*\{\s*\.grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
  });
});

describe("nothing overflows its track when the admin is narrow", () => {
  // 🔴 The regression this pins is invisible at base width and was found only
  // by narrowing a real admin: the card boxes are CONTENT-box, so a plain
  // `max-width: 100%` caps the content at the grid track and lets the border
  // box overrun it by the padding and border — 26px per card of sideways
  // scroll. Each box therefore subtracts its own chrome.
  const cardCss = read("./StylePresetCard.module.css").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  it("🔴 keeps the one-column breakpoint equal to two cards plus the gap", () => {
    // The breakpoint lives in `route.module.css` and the scale that decides the
    // card width lives in `StylePresetCard.module.css`, so nothing but this
    // test keeps them in agreement. Derived from the CSS, not restated: change
    // the scale and this fails until the breakpoint follows.
    const renderWidth = Number(
      /--appx-preset-render-width:\s*(\d+)px/.exec(cardCss)?.[1],
    );
    const scale = Number(/--appx-preset-scale:\s*([\d.]+)/.exec(cardCss)?.[1]);
    const breakpoint = Number(
      /@container\s*\(width\s*<\s*(\d+)px\)/.exec(css)?.[1],
    );

    // 24px of padding + 2px of border is the card's chrome; 16px is the gap.
    const cardWidth = renderWidth * scale + 24 + 2;
    // `toBeCloseTo`, because 800 * 0.55 is 440.00000000000006 in binary floats
    // and the breakpoint is a whole number of pixels.
    expect(breakpoint).toBeCloseTo(cardWidth * 2 + 16, 6);
  });

  it("subtracts each box's own padding and border from its max-width", () => {
    expect(cardCss).toContain("max-width: calc(100% - 1.5rem - 0.125rem)");
    expect(cardCss).toContain("max-width: calc(100% - 0.125rem)");
    expect(cardCss).toContain("max-width: calc(100% - 0.25rem)");
  });

  it("leaves no bare max-width: 100% behind", () => {
    // The three fixed lines were all `max-width: 100%`. If one comes back, the
    // box it belongs to has started overflowing again.
    expect(cardCss).not.toContain("max-width: 100%");
  });
});

describe("the cards come from the data, not from the page", () => {
  it("🔴 maps STYLE_PRESETS instead of enumerating cards", () => {
    // The load-bearing guard. Card order is MERCHANT-FACING (doc 88: Modern
    // leads; the two structural departures come last) and lives in the array's
    // literal order. A hand-listed page renders identically today and drifts the
    // first time a pattern is added, reordered or renamed — with nothing to
    // catch it, because the two orders are never compared anywhere else.
    expect(body).toContain("STYLE_PRESETS.map");
  });

  it("🔴 hardcodes no preset id", () => {
    // Derived by iterating the array rather than hand-listing the five ids, so a
    // sixth pattern is covered the day it is added.
    for (const preset of STYLE_PRESETS) {
      expect(body).not.toContain(`"${preset.id}"`);
      expect(body).not.toContain(`'${preset.id}'`);
    }
  });

  it("appends Blank exactly once, after the map", () => {
    // Position IS the decision (doc 88): Blank is the absence of a preset and
    // the fallback for a merchant who wants none of the five, so it comes last.
    // Asserting presence alone would pass with Blank rendered first.
    const occurrences = body.match(/<BlankStyleCard/g) ?? [];
    expect(occurrences).toHaveLength(1);
    // ⚠️ The `>= 0` is not redundant. The mutation for the map guard above
    // (hand-listing the five cards) made `indexOf` return -1, and "Blank comes
    // after -1" is trivially true — so without this line the ordering claim
    // passed vacuously on a page that had no map at all. Found by running the
    // mutation, not by reading the test.
    const mapAt = body.indexOf("STYLE_PRESETS.map");
    expect(mapAt).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("<BlankStyleCard")).toBeGreaterThan(mapAt);
  });

  it("uses step 90's card components rather than its own markup", () => {
    // A page that inlined a second card shape would satisfy every other guard
    // here and silently fork the accessibility work — the link wrapper, the
    // aria-hidden preview and the untabbable frame all live in that component.
    expect(body).toMatch(
      /import\s*\{[^}]*BlankStyleCard[^}]*\}\s*from\s*"\.\/StylePresetCard"/,
    );
    expect(body).toMatch(
      /import\s*\{[^}]*StylePresetCard[^}]*\}\s*from\s*"\.\/StylePresetCard"/,
    );
    expect(body).not.toContain("<iframe");
  });
});

describe("the merchant can leave", () => {
  it("carries a breadcrumb link back to the template list", () => {
    // "No skip" (doc 88) means the merchant cannot PROCEED without choosing. It
    // must never mean they are trapped on the gallery.
    expect(body).toMatch(
      /<s-link\s+slot="breadcrumb-actions"\s+href="\/app\/templates">/,
    );
  });
});

describe("the route touches no data", () => {
  it("exports no loader and no action", () => {
    // D2, as code rather than prose: the gallery renders frozen constants, so it
    // has no shop-scoped query to get isolation wrong in and no DB footprint
    // from being visited. If a later step needs a loader, this is where the
    // justification gets written down.
    expect(body).not.toMatch(
      /export\s+(const|function|async function)\s+loader/,
    );
    expect(body).not.toMatch(
      /export\s+(const|function|async function)\s+action/,
    );
  });
});
