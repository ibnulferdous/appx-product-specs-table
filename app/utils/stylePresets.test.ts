import { describe, it, expect } from "vitest";
import {
  PRESET_SCOPED_FIELDS,
  STYLE_PRESETS,
  findStylePreset,
  isCustomizedFromPreset,
  isThemeDefault,
  presetScopedEquals,
  seedStylingFromPreset,
  stylePresetValues,
} from "./stylePresets";
import {
  DEFAULT_STYLING_VALUES,
  STYLING_FIELD_NAMES,
  parseStylingValues,
  serializeStylingOverrides,
  type StylingFieldName,
} from "./tableStyling";

// Which fields accept a hex, probed through the real parser rather than
// hand-listed — the same technique (and the same reason) as
// `stylingControls.test.ts`: a tenth color added later is covered here with no
// edit, where a hardcoded list would quietly stop covering it.
const COLOR_FIELDS: readonly StylingFieldName[] = STYLING_FIELD_NAMES.filter(
  (field) => parseStylingValues({ [field]: "#abc" })[field] === "#abc",
);

describe("style presets — the constants", () => {
  it("probe found the nine color fields (guards the probe itself)", () => {
    // If the parser ever stopped accepting `#abc` shorthand, the probe above
    // would silently return an empty list and the "no bundle sets a color"
    // test below would pass vacuously. Pin the count so the guard fails loudly
    // instead of going quiet.
    expect(COLOR_FIELDS).toHaveLength(9);
  });

  it("ids are unique, non-empty and URL-safe", () => {
    // `basedOnPreset` is a persisted column and `?style=<id>` is a query param,
    // so these strings are a wire format: a duplicate would make
    // `findStylePreset` ambiguous, and a space or slash would break the route.
    const ids = STYLE_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("every preset carries a label and a one-line description", () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      // The rail card is 300px wide (the fixed rail track). Feature 86 found
      // the hard way that character counts filter but do not substitute for
      // looking — this is the filter, not the verification.
      expect(preset.description.length).toBeLessThanOrEqual(64);
    }
  });

  it("every bundle only sets fields in PRESET_SCOPED_FIELDS", () => {
    // The drift guard between the two lists. A bundle setting a field outside
    // the comparison scope is invisible to the "Customized" hint FOREVER — the
    // merchant could move that knob and the rail would keep insisting they are
    // still on the pattern.
    for (const preset of STYLE_PRESETS) {
      for (const field of Object.keys(preset.bundle)) {
        expect(
          (PRESET_SCOPED_FIELDS as readonly string[]).includes(field),
          `${preset.id} sets ${field}, which is outside PRESET_SCOPED_FIELDS`,
        ).toBe(true);
      }
    }
  });

  it("the comparison scope contains no color field", () => {
    // Together with the test above this is the structure-only rule: bundles
    // may only touch scoped fields, and no scoped field is a color. Stated on
    // the scope rather than on each bundle so feature 89 has exactly one place
    // to revisit when accent colors join the scope.
    for (const field of PRESET_SCOPED_FIELDS) {
      expect(COLOR_FIELDS).not.toContain(field);
    }
  });

  it("no bundle sets a typography, density, width or frame field", () => {
    // Falls out of the scope guard above, but asserted by name because that is
    // how the rule was recorded: those knobs are TUNING WITHIN a pattern, and a
    // future edit that widened PRESET_SCOPED_FIELDS would silently take the
    // scope guard with it. This one does not move.
    const OFF_LIMITS: readonly StylingFieldName[] = [
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "labelCase",
      "labelWidthPct",
      "density",
      "tableMaxWidthPx",
      "tableAlign",
      "outerBorderWidthPx",
      "outerBorderRadiusPx",
      "headerFontSizePx",
      "headerFontWeight",
      "headerCase",
      "headerPaddingBlockPx",
      "columnDividerStyle",
      "gridMinColumnWidthPx",
    ];
    for (const preset of STYLE_PRESETS) {
      for (const field of OFF_LIMITS) {
        expect(
          preset.bundle,
          `${preset.id} must not set ${field}`,
        ).not.toHaveProperty(field);
      }
    }
  });

  it("every bundle is a fixed point of parse then serialize", () => {
    // The hole `Partial<StylingValues>` cannot close: a value of the right TYPE
    // but the wrong RANGE (`sectionGapPx: 100`) is clamped on the way in, so
    // the card would ship a bundle that does not describe what it applies. Also
    // catches a field set to its own default, which serializes away to nothing.
    for (const preset of STYLE_PRESETS) {
      expect(
        serializeStylingOverrides(parseStylingValues(preset.bundle)),
        `${preset.id} does not survive a parse/serialize round trip`,
      ).toEqual(preset.bundle);
    }
  });

  it("no bundle ships GRID with STRIPES", () => {
    // Feature 85's explicit B2 requirement. A preset writes styling values
    // WITHOUT passing through the rail's option list, so it is the one writer
    // that can produce the combination the rail hides; the CSS stand-down means
    // the stripes would simply not paint and the card would lie.
    //
    // It now also falls out of the structure-only rule (no bundle names a
    // divider style other than NONE), but it is asserted by name because that
    // is the form the requirement was recorded in.
    for (const preset of STYLE_PRESETS) {
      const values = stylePresetValues(preset);
      expect(
        values.rowLayout === "GRID" && values.rowDividerStyle === "STRIPES",
        `${preset.id} ships GRID + STRIPES`,
      ).toBe(false);
    }
  });
});

describe("style presets — the five patterns", () => {
  it("banded's bundle is empty, because the app default IS that pattern", () => {
    // Pins the finding that merged the "start with your theme's styles" card
    // into this one. If `DEFAULT_STYLING_VALUES` ever changes on a scoped
    // field, this fails and forces the merge decision to be revisited rather
    // than letting the Banded card silently become a different pattern.
    const banded = findStylePreset("banded");
    expect(banded?.bundle).toEqual({});
    expect(isThemeDefault(stylePresetValues(banded!))).toBe(true);
  });

  it("each pattern differs from every other on a scoped field", () => {
    // The gallery's whole premise: five cards a merchant can tell apart at a
    // glance. Two presets agreeing on all five scoped fields would render
    // identically and differ only by name.
    for (const a of STYLE_PRESETS) {
      for (const b of STYLE_PRESETS) {
        if (a.id === b.id) continue;
        expect(
          presetScopedEquals(stylePresetValues(a), stylePresetValues(b)),
          `${a.id} and ${b.id} resolve to the same pattern`,
        ).toBe(false);
      }
    }
  });

  it("resolves each pattern to the values its reference table shows", () => {
    // Spot-checks rather than a full matrix — the round-trip test above already
    // proves the bundles survive parsing. These state the merchant-visible
    // claim each card makes.
    const values = (id: string) => stylePresetValues(findStylePreset(id)!);

    expect(values("banded").sectionHeaderStyle).toBe("BANDED");
    expect(values("banded").rowDividerStyle).toBe("LINES");

    expect(values("simple").sectionHeaderStyle).toBe("PLAIN");
    expect(values("simple").rowDividerStyle).toBe("LINES");

    expect(values("minimal").sectionHeaderStyle).toBe("PLAIN");
    expect(values("minimal").rowDividerStyle).toBe("NONE");

    expect(values("multi-column").rowLayout).toBe("GRID");
    // Null, not a number: the stylesheet's own 240px measured shorter than any
    // narrower value, so pinning one would ship the worse default (feature 85).
    expect(values("multi-column").gridMinColumnWidthPx).toBeNull();

    expect(values("accordion").sectionsCollapsible).toBe(true);
    // TEXT_ONLY, not PLAIN: a clickable header wants the 2px rule.
    expect(values("accordion").sectionHeaderStyle).toBe("TEXT_ONLY");
    expect(values("accordion").sectionGapPx).toBe(12);
  });
});

describe("findStylePreset — tolerant at every trust boundary", () => {
  it("resolves a known id", () => {
    expect(findStylePreset("minimal")?.label).toBe("Minimal");
  });

  it("degrades to null for anything unrecognized", () => {
    // The `?style=` param, a hand-edited `basedOnPreset`, and a stamp left
    // behind by a preset removed in a later release all land here. None may
    // throw, and none may guess a neighbour.
    for (const input of ["", "  ", "Banded", "bordered", null, undefined]) {
      expect(findStylePreset(input)).toBeNull();
    }
  });
});

describe("seedStylingFromPreset", () => {
  it("seeds the full working shape from a preset", () => {
    expect(seedStylingFromPreset("multi-column").rowLayout).toBe("GRID");
  });

  it("seeds theme defaults for the skip path and for garbage", () => {
    // One code path for three states — skipped, unknown, and "picked Banded" —
    // which is what keeps the route contract total. They differ only in whether
    // `basedOnPreset` is stamped, which is the caller's business.
    expect(seedStylingFromPreset(null)).toEqual(DEFAULT_STYLING_VALUES);
    expect(seedStylingFromPreset("nope")).toEqual(DEFAULT_STYLING_VALUES);
    expect(seedStylingFromPreset("banded")).toEqual(DEFAULT_STYLING_VALUES);
  });

  it("lets an accent overlay win over the bundle (feature 89 seam)", () => {
    // `ACCENT_PRESETS` does not exist yet; the merge order it will depend on
    // does, and is asserted now so Step 89 is additive rather than a rewrite.
    const seeded = seedStylingFromPreset("minimal", {
      headerBgColor: "#112233",
      sectionHeaderStyle: "BANDED",
    });
    expect(seeded.headerBgColor).toBe("#112233");
    expect(seeded.sectionHeaderStyle).toBe("BANDED");
    // The bundle's other structure survives the overlay.
    expect(seeded.rowDividerStyle).toBe("NONE");
  });

  it("writes no color when no accent is given", () => {
    // The zero-config theme-inherit promise, stated as a test: picking any card
    // must leave all nine swatches null.
    for (const preset of STYLE_PRESETS) {
      const seeded = seedStylingFromPreset(preset.id);
      for (const field of COLOR_FIELDS) {
        expect(seeded[field], `${preset.id} wrote ${field}`).toBeNull();
      }
    }
  });
});

describe("isCustomizedFromPreset — the rail hint", () => {
  const minimal = stylePresetValues(findStylePreset("minimal")!);

  it("is false immediately after a pick", () => {
    expect(isCustomizedFromPreset(minimal, "minimal")).toBe(false);
  });

  it("is true once a scoped field moves", () => {
    expect(
      isCustomizedFromPreset({ ...minimal, rowLayout: "GRID" }, "minimal"),
    ).toBe(true);
  });

  it("is FALSE when only a color changes", () => {
    // The decision this whole module is arranged around. When accents ship they
    // will write colors on every pick, and this is what stops every freshly
    // created template from reading "Customized" on arrival.
    for (const field of COLOR_FIELDS) {
      expect(
        isCustomizedFromPreset({ ...minimal, [field]: "#123456" }, "minimal"),
        `${field} should not count as customizing the pattern`,
      ).toBe(false);
    }
  });

  it("is FALSE when only typography or density changes", () => {
    expect(
      isCustomizedFromPreset({ ...minimal, density: "COMPACT" }, "minimal"),
    ).toBe(false);
    expect(
      isCustomizedFromPreset({ ...minimal, fontWeight: "BOLD" }, "minimal"),
    ).toBe(false);
  });

  it("is false when nothing was picked", () => {
    // No baseline to deviate from. "Customized" against nothing would show on
    // every unstyled template in the shop.
    expect(isCustomizedFromPreset(minimal, null)).toBe(false);
    expect(isCustomizedFromPreset(minimal, "nope")).toBe(false);
  });

  it("catches a Banded template moved off the default", () => {
    // The case "compare the bundle's own keys" would have missed entirely:
    // banded's bundle is `{}`, so a key-scoped compare would look at zero
    // fields and report no change however far the merchant moved.
    expect(isCustomizedFromPreset(DEFAULT_STYLING_VALUES, "banded")).toBe(
      false,
    );
    expect(
      isCustomizedFromPreset(
        { ...DEFAULT_STYLING_VALUES, rowLayout: "GRID" },
        "banded",
      ),
    ).toBe(true);
  });
});
