import { describe, it, expect } from "vitest";
import {
  ACCENT_PRESETS,
  ACCENT_SCOPED_FIELDS,
  PRESET_SCOPED_FIELDS,
  STYLE_PRESETS,
  findAccent,
  findStylePreset,
  galleryHref,
  isCustomizedFromPreset,
  isThemeDefault,
  normalizeStylePresetStamp,
  presetScopedEquals,
  resolveGalleryParams,
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
  it("probe found the ten color fields (guards the probe itself)", () => {
    // If the parser ever stopped accepting `#abc` shorthand, the probe above
    // would silently return an empty list and the "no bundle sets a color"
    // test below would pass vacuously. Pin the count so the guard fails loudly
    // instead of going quiet.
    //
    // 9 -> 10 for feature 96's `headerUnderlineColor`. Moving this number is the
    // ONLY edit that colour cost this file, which is the probe paying off: the
    // "no bundle sets a color" law below picked the new field up untouched, so
    // the preset cards keep their zero-colour promise by construction rather
    // than by anyone remembering to re-check.
    expect(COLOR_FIELDS).toHaveLength(10);
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
    // the scope rather than on each bundle, so it holds for a bundle nobody has
    // written yet.
    //
    // 🔴 **This assertion is PERMANENT — feature 93 settled that** (doc
    // `93-style-accent-themes.md` §D7; this comment previously said the scope
    // was "one place to revisit when accent colors join"). They never join:
    // appending one makes every seeded template read "Customized" on creation,
    // and there is no accent provenance column to compare colours against, so
    // that half of the comparison would be undefined rather than merely wrong.
    // The accent vocabulary has its own scope and the two are asserted disjoint
    // in the `accents` block below.
    for (const field of PRESET_SCOPED_FIELDS) {
      expect(COLOR_FIELDS).not.toContain(field);
    }
  });

  it("no bundle sets a typography, density or width field", () => {
    // Falls out of the scope guard above, but asserted by name because that is
    // how the rule was recorded: those knobs are TUNING WITHIN a pattern, and a
    // future edit that widened PRESET_SCOPED_FIELDS would silently take the
    // scope guard with it. This list is the part that does not move with it.
    //
    // 📌 2026-07-27: `outerBorderWidthPx`, `outerBorderRadiusPx` and
    // `columnDividerStyle` were REMOVED from this list when the Classic card
    // took a frame, a column rule and stripes. That was a deliberate merchant
    // decision, not drift — the frame has been pattern axis 4 in
    // `stylePresets.ts`'s taxonomy since the module was written, and the column
    // rule is the vertical twin of the already-scoped `rowDividerStyle`. The
    // fields below are the ones with no such claim: they change how a pattern is
    // TUNED, never which pattern it is. Moving one out of this list is a design
    // decision that needs the same kind of reason, in writing.
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
      "headerFontSizePx",
      "headerFontWeight",
      "headerCase",
      "headerPaddingBlockPx",
      // Stays off-limits even though its siblings moved: feature 85 measured the
      // stylesheet's own 240px SHORTER than any narrower value on the live
      // 44-row reference, so a bundle pinning a number would ship the worse
      // default. The Multi-column card's comment states the same thing.
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
    // 🔴 **This guard is LIVE again and must not be read as redundant.** It
    // carried a note claiming it "falls out of the structure-only rule, since no
    // bundle names a divider style other than NONE" — untrue when written
    // (Classic shipped STRIPES) and doubly untrue since 2026-07-30, when the
    // stripes moved to Accordion. Two bundles now set `rowLayout` and
    // `rowDividerStyle` independently, so nothing but this test stands between a
    // future bundle and the combination the stylesheet refuses to paint.
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

    // The full grid, every claim its description makes. Revised 2026-07-30:
    // UNDERLINED headers, and row LINES where it used to ship STRIPES.
    expect(values("classic").sectionHeaderStyle).toBe("TEXT_ONLY");
    // 🔴 LINES is what makes this card a GRID, and it is asserted on the RESOLVED
    // values rather than on the bundle for a reason: LINES is the default, so the
    // bundle must NOT name it (the fixed-point guard above would fail), and the
    // only place the claim is checkable is after `parseStylingValues` fills it in.
    // STRIPES here would mean `border-block-end: none` on every row — the striped
    // build had no interior horizontal edges at all.
    expect(values("classic").rowDividerStyle).toBe("LINES");
    expect(values("classic").columnDividerStyle).toBe("LINE");
    expect(values("classic").outerBorderWidthPx).toBe(1);
    // Square corners — the radius is a taste knob, not part of the pattern.
    expect(values("classic").outerBorderRadiusPx).toBeNull();

    expect(values("minimal").sectionHeaderStyle).toBe("PLAIN");
    expect(values("minimal").rowDividerStyle).toBe("NONE");

    expect(values("multi-column").rowLayout).toBe("GRID");
    // BANDED, inherited rather than set (2026-07-27). A GRID section header
    // spans every track, so without a band it reads as a bare line of text
    // floating over the flow with nothing tying it to the items beneath.
    expect(values("multi-column").sectionHeaderStyle).toBe("BANDED");
    // Null, not a number: the stylesheet's own 240px measured shorter than any
    // narrower value, so pinning one would ship the worse default (feature 85).
    expect(values("multi-column").gridMinColumnWidthPx).toBeNull();

    expect(values("accordion").sectionsCollapsible).toBe(true);
    // 🔴 BANDED as of 2026-07-30 (it shipped TEXT_ONLY), and inherited rather
    // than set — BANDED is the default, so the bundle must NOT name it or the
    // fixed-point guard above fails. A filled strip reads as a pressable target
    // where a 2px rule reads as a boundary, and the stylesheet's
    // `--collapsible.--section-banded` summary variant is what carries the band
    // through the disclosure shape.
    expect(values("accordion").sectionHeaderStyle).toBe("BANDED");
    expect(values("accordion").sectionGapPx).toBe(12);
    // Moved here from Classic 2026-07-30. Inside a disclosure the alternating
    // fill is a within-section reading aid, and the storefront restarts the
    // parity at every <tbody>, so a closed section leaves no stale checkerboard.
    expect(values("accordion").rowDividerStyle).toBe("STRIPES");
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

describe("normalizeStylePresetStamp — the column's one gate", () => {
  it("passes through every known preset id", () => {
    // Derived from the array, so a sixth card is covered here with no edit.
    for (const preset of STYLE_PRESETS) {
      expect(normalizeStylePresetStamp(preset.id)).toBe(preset.id);
    }
  });

  it("returns null for anything else, whatever its type", () => {
    // The Save payload is JSON the client composes, so this is the server's
    // re-validation — same posture as `parseRows` and `parseStylingValues`. The
    // non-string cases matter as much as the wrong-string ones: a hand-crafted
    // POST is not obliged to send a string at all.
    for (const junk of [
      null,
      undefined,
      "",
      "   ",
      "Banded", // right card, wrong case
      "bordered", // a card that was specced and withdrawn
      "banded ", // trailing space — no trimming, no guessing
      "<script>alert(1)</script>",
      "x".repeat(10_000),
      42,
      0,
      true,
      {},
      [],
      ["banded"],
      { id: "banded" },
    ]) {
      expect(normalizeStylePresetStamp(junk), `${String(junk)}`).toBeNull();
    }
  });

  it("can only ever emit null or a member of the id set", () => {
    // The closed-vocabulary claim, stated rather than assumed: it is what lets a
    // later reader treat `basedOnPreset` as an enum-in-a-string without auditing
    // every writer, and what makes normalizing on READ enough to heal a stamp
    // left behind by a preset removed in a future release.
    const ids = new Set(STYLE_PRESETS.map((preset) => preset.id));
    for (const input of [...ids, "nope", 7, null, {}]) {
      const stamp = normalizeStylePresetStamp(input);
      expect(stamp === null || ids.has(stamp)).toBe(true);
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

  it("lets an accent overlay win over the bundle (feature 93 seam)", () => {
    // Written before `ACCENT_PRESETS` existed, to assert the merge order feature
    // 93 would depend on. It shipped in step 97, and step 99 found that this is
    // the ONLY test protecting that order — mutation-verified: reversing the two
    // spreads in `seedStylingFromPreset` fails this and nothing else.
    //
    // 🔬 The reason is the accent below being SYNTHETIC. It carries
    // `sectionHeaderStyle`, a structure field no real accent may set (the two
    // scopes are asserted disjoint), so the bundle and the accent collide here
    // and nowhere in shipping data. A precedence law cannot be tested with values
    // that never overlap — so this test fabricates the overlap on purpose.
    // 🚫 Do not "tidy" it into using a real accent from `ACCENT_PRESETS`: it would
    // still pass, and it would stop testing anything.
    const seeded = seedStylingFromPreset("minimal", {
      headerBgColor: "#112233",
      sectionHeaderStyle: "BANDED",
    });
    expect(seeded.headerBgColor).toBe("#112233");
    expect(seeded.sectionHeaderStyle).toBe("BANDED");
    // The bundle's other structure survives the overlay.
    expect(seeded.rowDividerStyle).toBe("NONE");
  });

  it("🔴 equals stylePresetValues when no accent is given (step 101)", () => {
    // The no-op proof for step 101's resolver switch. `StylePresetCard` used to
    // build its preview from `stylePresetValues(preset)` and now builds it from
    // `seedStylingFromPreset(preset.id, accent?.bundle)` — the SAME function the
    // loader uses, so a card can never promise a look the seeded template does not
    // produce.
    //
    // That switch is only safe if the two agree at `accent = null`, which is what
    // this pins. Without it, "the change is behaviour-neutral for Theme" would be a
    // claim about two expressions nobody had compared — and a silent restyle of
    // every card in today's gallery is exactly the kind of regression a preset
    // gallery cannot afford.
    for (const preset of STYLE_PRESETS) {
      expect(seedStylingFromPreset(preset.id), preset.id).toEqual(
        stylePresetValues(preset),
      );
    }
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

describe("resolveGalleryParams — the create flow's one decode (steps 92 + 99)", () => {
  const resolve = (query: string) =>
    resolveGalleryParams(new URLSearchParams(query));

  const PRESET_IDS = STYLE_PRESETS.map((preset) => preset.id);
  const ACCENT_IDS = ACCENT_PRESETS.map((accent) => accent.id);

  it("round-trips every preset id — styling AND stamp", () => {
    // Derived by iterating the array, so a sixth pattern is covered the day it
    // is added.
    for (const preset of STYLE_PRESETS) {
      const resolved = resolve(`style=${encodeURIComponent(preset.id)}`);
      expect(resolved.styling, preset.id).toEqual(stylePresetValues(preset));
      expect(resolved.basedOnPreset, preset.id).toBe(preset.id);
    }
  });

  it("🔴 never seeds without stamping, and never stamps without seeding", () => {
    // THE test step 92 was arranged around. It states "styled like Classic but
    // stamped null" and "stamped classic but styled like nothing" as the same
    // forbidden thing, without naming either — so a resolver that splits its
    // two outputs across two lookups fails here however it drifts.
    //
    // 🔴 **RESTATED for accents (step 99), not relaxed.** It used to read "if the
    // stamp is null the styling must equal DEFAULT_STYLING_VALUES", and `accent=blue`
    // was already in the matrix below as an ignored param. Step 99 makes that
    // input seed five real colours with a null stamp, so the old shortcut is
    // false. Deleting the input would have thrown away the guard's whole point.
    //
    // ✅ Instead the invariant is stated in TWO HALVES, one per scope: the STAMP
    // must explain every structure field, and the ACCENT PARAM must explain every
    // colour field. **This is only writable because step 97 proved the two scopes
    // disjoint** — with no overlap, "the stamp explains the structure" survives
    // accents completely untouched. It is also strictly stronger than the original:
    // every structure field is pinned individually, and the colour half is a claim
    // the old form had no vocabulary for.
    const inputs = [
      "",
      "style=",
      "style=zzz",
      "style=Classic", // wrong case
      "style=bordered", // a withdrawn card
      "style=%20classic%20", // padded
      "style=classic&style=minimal", // repeated key
      `style=${"x".repeat(10_000)}`,
      "accent=blue", // 🔴 null stamp, NON-default styling (step 99 D2)
      "accent=",
      "accent=zzz",
      "accent=Blue", // wrong case
      "accent=theme", // there is no `theme` accent — it is the absence of one
      "accent=%20blue%20", // padded
      `accent=${"x".repeat(10_000)}`,
      "accent=blue&accent=plum", // repeated key
      "style=zzz&accent=blue", // bad half, good half
      "style=classic&accent=zzz", // good half, bad half
      "style=classic&accent=Blue",
      ...PRESET_IDS.map((id) => `style=${encodeURIComponent(id)}`),
      ...ACCENT_IDS.map((id) => `accent=${encodeURIComponent(id)}`),
      ...PRESET_IDS.flatMap((styleId) =>
        ACCENT_IDS.map((accentId) => `style=${styleId}&accent=${accentId}`),
      ),
    ];

    for (const query of inputs) {
      const params = new URLSearchParams(query);
      const { styling, basedOnPreset } = resolveGalleryParams(params);

      // Half 1 — the STRUCTURE is explained by the stamp. A stamp that names
      // nothing is itself the failure; a stamp that names a preset the styling
      // does not match is the "stamped classic, styled like nothing" lie.
      const preset = findStylePreset(basedOnPreset);
      if (basedOnPreset !== null) expect(preset, query).not.toBeNull();
      const structure = preset
        ? stylePresetValues(preset)
        : DEFAULT_STYLING_VALUES;
      for (const field of PRESET_SCOPED_FIELDS) {
        expect(styling[field], `${query} / ${field}`).toBe(structure[field]);
      }

      // Half 2 — the COLOUR is explained by the accent param, and is all-null
      // when that param names nothing. This is what stops a resolver from
      // seeding an accent it cannot account for, in either direction.
      const accent = findAccent(params.get("accent"));
      for (const field of ACCENT_SCOPED_FIELDS) {
        expect(styling[field], `${query} / ${field}`).toBe(
          accent ? (accent.bundle[field] ?? null) : null,
        );
      }
    }
  });

  it("🔴 every preset × every accent: the bundle survives and five hexes land", () => {
    // The merge law at the route boundary — 30 combinations, derived from the two
    // arrays so a seventh accent is covered with no edit.
    //
    // ⚠️ Asserted against each bundle's and each accent's OWN entries, never
    // against `seedStylingFromPreset(...)`. Routing the expectation through the
    // same helper the implementation calls would make this test agree with a
    // broken merge — it would only be checking that the function equals itself.
    for (const preset of STYLE_PRESETS) {
      for (const accent of ACCENT_PRESETS) {
        const where = `${preset.id} + ${accent.id}`;
        const { styling, basedOnPreset } = resolve(
          `style=${encodeURIComponent(preset.id)}` +
            `&accent=${encodeURIComponent(accent.id)}`,
        );

        expect(basedOnPreset, where).toBe(preset.id);
        for (const [field, value] of Object.entries(preset.bundle)) {
          expect(
            styling[field as StylingFieldName],
            `${where} lost the bundle's ${field}`,
          ).toBe(value);
        }
        for (const [field, value] of Object.entries(accent.bundle)) {
          expect(
            styling[field as StylingFieldName],
            `${where} lost the accent's ${field}`,
          ).toBe(value);
        }
      }
    }
  });

  it("🔴 honours `accent` with no `style` — the parser stays TOTAL (D2)", () => {
    // Doc 93 §D4 ("Blank ignores the accent") is a decision about the CARD'S
    // HREF, not about this function: the Blank card never emits the param. This
    // is the test that fails if someone later "fixes" D4 here, by ignoring the
    // accent when no preset was given — which would also cost the one-line,
    // no-call-site-change property the whole seam was cut for.
    const teal = findAccent("teal")!;
    const { styling, basedOnPreset } = resolve("accent=teal");

    expect(basedOnPreset).toBeNull();
    for (const [field, value] of Object.entries(teal.bundle)) {
      expect(styling[field as StylingFieldName], field).toBe(value);
    }
    // ...and the structure is untouched: colours without a pattern.
    for (const field of PRESET_SCOPED_FIELDS) {
      expect(styling[field], field).toBe(DEFAULT_STYLING_VALUES[field]);
    }
  });

  it("🔴 the stamp does not move when the accent moves", () => {
    // `basedOnPreset` names the PATTERN. An accent has no provenance column (doc
    // 93 §D7), so a resolver that tried to encode one — `"classic+blue"`, or the
    // accent id when no style was given — would fill a column that is read back
    // as a closed vocabulary with values `findStylePreset` cannot resolve.
    const tails = [
      "",
      ...ACCENT_IDS.map((id) => `&accent=${id}`),
      "&accent=zzz",
    ];
    for (const preset of STYLE_PRESETS) {
      for (const tail of tails) {
        const query = `style=${encodeURIComponent(preset.id)}${tail}`;
        expect(resolve(query).basedOnPreset, query).toBe(preset.id);
      }
    }
    // The null case too — an accent alone must not become a stamp.
    for (const id of ACCENT_IDS) {
      expect(resolve(`accent=${id}`).basedOnPreset, id).toBeNull();
    }
  });

  it("🔴 stamps `banded` even though it changes no styling value", () => {
    // The Modern card's bundle is `{}`, so the stamp is the ONLY observable
    // effect of picking it. A resolver that skipped stamping when the bundle
    // resolved to the defaults would pass every other test in this block, and
    // would make Modern indistinguishable from Blank in Postgres forever.
    const resolved = resolve("style=banded");
    expect(resolved.styling).toEqual(DEFAULT_STYLING_VALUES);
    expect(resolved.basedOnPreset).toBe("banded");
  });

  it("treats absent, empty and unknown as the Blank landing", () => {
    // All three are byte-identical to what bare /app/templates/new returned
    // before this step — no error, no redirect, no toast (D6).
    const blank = resolve("");
    expect(blank).toEqual({
      styling: DEFAULT_STYLING_VALUES,
      basedOnPreset: null,
    });
    expect(resolve("style=")).toEqual(blank);
    expect(resolve("style=zzz")).toEqual(blank);
    expect(resolve("foo=1&bar=2")).toEqual(blank);
  });

  it("every invalid accent token is indistinguishable from no accent at all", () => {
    // The whole of step 99 D3 in one assertion. ⚠️ This is the descendant of
    // step 92's `ignores unrelated params, "accent" included`, whose comment
    // nominated itself: "accent is not read yet — when it is, this assertion is
    // the one that changes". It changed: `accent=blue` is now honoured, and what
    // survives is that every *invalid* token degrades exactly like an absent one.
    const plain = resolve("style=classic");
    const badTokens = [
      "", // present but empty
      "zzz", // unknown
      "Blue", // wrong case
      "theme", // there is no `theme` accent (step 97 D1)
      "%20blue%20", // padded
      "x".repeat(10_000),
    ];

    for (const token of badTokens) {
      expect(resolve(`style=classic&accent=${token}`), token).toEqual(plain);
    }
    // An unrelated param is still ignored, which is the half of the old test
    // that did NOT change.
    expect(resolve("style=classic&accent=zzz&foo=1")).toEqual(plain);
  });

  it("with no accent, all ten colour fields stay null (theme inheritance)", () => {
    // The zero-config promise, pinned where the URL ENTERS rather than only on
    // `seedStylingFromPreset`. A resolver that defaulted to Graphite instead of
    // to nothing would opt every merchant out of theme inheritance at create
    // time, which is the one thing this module is arranged to protect.
    for (const query of ["", "style=classic", "style=banded&accent=zzz"]) {
      const { styling } = resolve(query);
      for (const field of COLOR_FIELDS) {
        expect(styling[field], `${query} / ${field}`).toBeNull();
      }
    }
  });

  it("takes the FIRST value of a repeated `accent` key", () => {
    // `URLSearchParams.get` semantics, same as `style` below — pinned separately
    // because a double-appended `&accent=` is exactly what a swatch row that
    // built hrefs by string concatenation would produce.
    const { styling } = resolve("accent=blue&accent=plum");
    expect(styling.headerBgColor).toBe(
      findAccent("blue")!.bundle.headerBgColor,
    );
    expect(styling.headerBgColor).not.toBe(
      findAccent("plum")!.bundle.headerBgColor,
    );
  });

  it("takes the FIRST value of a repeated `style` key", () => {
    // `URLSearchParams.get` semantics, pinned because it is the one place URL
    // decoding could surprise a later reader — and because "?style=a&style=b"
    // is exactly what a hand-edited or double-appended URL looks like.
    expect(resolve("style=classic&style=minimal").basedOnPreset).toBe(
      "classic",
    );
  });

  it("decodes the param before matching", () => {
    // The ids are URL-safe today (a test above pins that), so encoding is a
    // no-op for every real one — asserted anyway because it is what makes the
    // `URLSearchParams` signature safe to rely on, and because a future id with
    // a hyphen-encoded character would otherwise fail silently.
    expect(resolve("style=multi%2Dcolumn").basedOnPreset).toBe("multi-column");
  });
});

describe("galleryHref — the decoder's inverse (step 101)", () => {
  // Resolve a href the way the editor's loader does, so the two halves of the wire
  // are composed rather than each checked against a hand-written string. The base
  // is arbitrary — `galleryHref` returns an app-relative path and only its query
  // survives the round trip.
  const decode = (href: string) =>
    resolveGalleryParams(new URL(href, "https://example.test").searchParams);

  it("🔴 round-trips every preset × every accent through the real decoder", () => {
    // THE test this step is arranged around, and the reason `galleryHref` is a pure
    // function in this file rather than a template string inside the card.
    //
    // Step 99 built the decode; this builds the encode. Composing them proves they
    // agree about the wire format for all 30 pairs — neither can drift without the
    // other failing — and it does so with no browser, where a card that concatenated
    // its own href would be checkable only by clicking it.
    //
    // ⚠️ The expectation is derived from the BUNDLES, not from
    // `seedStylingFromPreset` — routing it through the same helper the decoder calls
    // would make the test agree with a broken merge.
    for (const preset of STYLE_PRESETS) {
      for (const accent of ACCENT_PRESETS) {
        const where = `${preset.id} + ${accent.id}`;
        const { styling, basedOnPreset } = decode(
          galleryHref({ preset: preset.id, accent: accent.id }),
        );

        expect(basedOnPreset, where).toBe(preset.id);
        for (const [field, value] of Object.entries(preset.bundle)) {
          expect(
            styling[field as StylingFieldName],
            `${where} lost the bundle's ${field}`,
          ).toBe(value);
        }
        for (const [field, value] of Object.entries(accent.bundle)) {
          expect(
            styling[field as StylingFieldName],
            `${where} lost the accent's ${field}`,
          ).toBe(value);
        }
      }
    }
  });

  it("round-trips a preset with no accent, and an accent with no preset", () => {
    for (const preset of STYLE_PRESETS) {
      const resolved = decode(galleryHref({ preset: preset.id, accent: null }));
      expect(resolved.basedOnPreset, preset.id).toBe(preset.id);
      for (const field of COLOR_FIELDS) {
        expect(resolved.styling[field], `${preset.id} / ${field}`).toBeNull();
      }
    }
    // The hand-typed shape doc 93 §D4 leaves legal: colours, no stamp.
    for (const accent of ACCENT_PRESETS) {
      const resolved = decode(galleryHref({ preset: null, accent: accent.id }));
      expect(resolved.basedOnPreset, accent.id).toBeNull();
      expect(resolved.styling.headerBgColor, accent.id).toBe(
        accent.bundle.headerBgColor,
      );
    }
  });

  it("🚫 emits the BARE path when neither is given — Blank's exact literal", () => {
    // No trailing `?`, no `&`. `BlankStyleCard` keeps this as a hardcoded string
    // (doc 93 §D4 is enforced in that href and nowhere else), so this pins that the
    // two forms are byte-identical and the literal is not quietly diverging.
    expect(galleryHref({ preset: null, accent: null })).toBe(
      "/app/templates/new",
    );
    // Empty strings mean absent too — an empty id would otherwise emit `?style=`,
    // which decodes to the same place but is a URL no card should produce.
    expect(galleryHref({ preset: "", accent: "" })).toBe("/app/templates/new");
  });

  it("omits each param independently", () => {
    expect(galleryHref({ preset: "classic", accent: null })).toBe(
      "/app/templates/new?style=classic",
    );
    expect(galleryHref({ preset: null, accent: "blue" })).toBe(
      "/app/templates/new?accent=blue",
    );
    expect(galleryHref({ preset: "classic", accent: "blue" })).toBe(
      "/app/templates/new?style=classic&accent=blue",
    );
  });

  it("percent-encodes both values", () => {
    // The real ids are URL-safe (a test above pins that), so this is about the
    // encoding being present at all rather than about any shipping id needing it.
    const href = galleryHref({ preset: "a b&c=d", accent: "e/f?g" });
    expect(href).not.toContain("a b");
    // Survives the round trip as the same string it went in as, which is the
    // property that matters — not which escaping scheme was used.
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("style")).toBe("a b&c=d");
    expect(params.get("accent")).toBe("e/f?g");
  });

  it("🔴 maps `preset` to `style=` and `accent` to `accent=`", () => {
    // The two are the same type, so a transposition INSIDE the function is a
    // silent, total feature failure: `?style=blue&accent=classic` resolves in
    // neither lookup, so every card would create a blank, unstamped, uncoloured
    // template.
    //
    // 🔬 The mutation that motivated the named-object signature transposed the CALL
    // SITE instead, and this test could not see it — nor could any of the other 118.
    // That is why the fix was a type change rather than another assertion: with
    // named keys the transposition has to be spelled out and reads as wrong. This
    // test covers the half that IS reachable from here.
    const params = new URL(
      galleryHref({ preset: "classic", accent: "blue" }),
      "https://example.test",
    ).searchParams;
    expect(params.get("style")).toBe("classic");
    expect(params.get("accent")).toBe("blue");
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

// --- Accents (feature 93 · step 97) -------------------------------------------

describe("accents — the constants", () => {
  it("ships six, in the merchant-facing swatch order", () => {
    // Order is what a merchant sees, so it is pinned here rather than left to
    // the array. `graphite` leads deliberately: it is the near-neutral one, the
    // closest of the six to "no accent", so the row reads outward from the least
    // committal choice.
    expect(ACCENT_PRESETS.map((accent) => accent.id)).toEqual([
      "graphite",
      "blue",
      "teal",
      "amber",
      "terracotta",
      "plum",
    ]);
  });

  it("ids are unique, non-empty and URL-safe", () => {
    // `?accent=<id>` carries these verbatim. Unlike a preset id they are NOT
    // persisted, so a rename breaks a bookmarked gallery URL and nothing else —
    // but the param still has to survive a round trip through the query string.
    const ids = ACCENT_PRESETS.map((accent) => accent.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).not.toBe("");
      expect(encodeURIComponent(id)).toBe(id);
    }
  });

  it("labels are unique and non-empty", () => {
    // Each label is the swatch's accessible name (a colour cannot BE its own
    // name), so two accents sharing one would produce two indistinguishable
    // radio options for a screen-reader user.
    const labels = ACCENT_PRESETS.map((accent) => accent.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label).not.toBe("");
  });

  it("has no `theme` entry", () => {
    // "Theme" is the ABSENCE of an accent, exactly as the gallery's Blank card
    // is the absence of a preset. A seventh member with an empty bundle would
    // give one state two representations and the swatch row two code paths.
    expect(ACCENT_PRESETS.map((accent) => accent.id)).not.toContain("theme");
    expect(findAccent("theme")).toBeNull();
  });

  it("every accent sets exactly ACCENT_SCOPED_FIELDS", () => {
    // Both directions, and the asymmetry with the bundle guard above is
    // deliberate. A bundle may legitimately set a SUBSET — banded's is `{}`,
    // because the default already is the banded pattern. An accent has no such
    // story: a partial accent leaves one surface neutral grey beside tinted
    // neighbours, and per doc 93's reach table that inconsistency is invisible
    // on four of the five cards and shows only on the one preset where that
    // surface is live. A count-based guard would miss it.
    const scope = [...ACCENT_SCOPED_FIELDS].sort();
    for (const accent of ACCENT_PRESETS) {
      expect(
        Object.keys(accent.bundle).sort(),
        `${accent.id} does not set exactly the accent scope`,
      ).toEqual(scope);
    }
  });

  it("every field in the accent scope is a color field", () => {
    // Probed through the real parser, like COLOR_FIELDS itself — the
    // mirror-inverse of "the comparison scope contains no color field" above.
    // Together the two are the composition rule: structure on one side, colour
    // on the other.
    for (const field of ACCENT_SCOPED_FIELDS) {
      expect(COLOR_FIELDS).toContain(field);
    }
  });

  it("the accent scope is disjoint from the preset scope", () => {
    // "A bundle sets structure, an accent sets colour, they compose" in one
    // line. 🔴 This is also the guard that fails if anyone ever acts on the
    // prediction doc 93 §D7 corrected — appending a colour to
    // PRESET_SCOPED_FIELDS fails here AND in the no-color test above, so the
    // reversal is enforced from two directions.
    for (const field of ACCENT_SCOPED_FIELDS) {
      expect(PRESET_SCOPED_FIELDS as readonly string[]).not.toContain(field);
    }
  });

  it("no accent sets a structure field", () => {
    // Falls out of the disjointness guard, but asserted directly because it is
    // the half a reader checks first, and because it bites on the bundle even if
    // a future edit widens ACCENT_SCOPED_FIELDS along with it.
    for (const accent of ACCENT_PRESETS) {
      for (const field of PRESET_SCOPED_FIELDS) {
        expect(
          accent.bundle,
          `${accent.id} must not set the structure field ${field}`,
        ).not.toHaveProperty(field);
      }
    }
  });

  it("every accent is a fixed point of parse then serialize", () => {
    // The hole `Partial<StylingValues>` cannot close, same as for the bundles: a
    // hex the parser rejects (a 5-digit value, a named colour, a `rgb()` string)
    // is dropped to `null` on the way in, so the swatch would ship a colour that
    // never paints and nothing would fail.
    for (const accent of ACCENT_PRESETS) {
      expect(
        serializeStylingOverrides(parseStylingValues(accent.bundle)),
        `${accent.id} does not survive a parse/serialize round trip`,
      ).toEqual(accent.bundle);
    }
  });

  it("carries the approved palette byte-for-byte", () => {
    // 🔴 DATA, not derivation. These were approved by the merchant 2026-07-30
    // from a 1:1 render study, and two roles were tuned against measured
    // references (blue's stripe against a real storefront's `#f1f8ff`). A
    // runtime `hsl()` derivation would produce similar values while silently
    // discarding that approval, so the values are pinned and a revision is a
    // dated decision rather than a refactor.
    //
    // ⚠️ `headerUnderlineColor` is deliberately ABSENT here — it is provisional
    // and pinned in its own test below, so step 98's revision touches one
    // clearly-labelled assertion and not this one.
    const approved: Record<
      string,
      { band: string; title: string; border: string; stripe: string }
    > = {
      graphite: {
        band: "#e6ebf7",
        title: "#1c2333",
        border: "#c2c9d8",
        stripe: "#f3f6fb",
      },
      blue: {
        band: "#e6effc",
        title: "#0a4e9e",
        border: "#b3cbec",
        stripe: "#f1f6fd",
      },
      teal: {
        band: "#ddf3ee",
        title: "#04564a",
        border: "#a6d3c9",
        stripe: "#f4fbf9",
      },
      amber: {
        band: "#fbeeda",
        title: "#5f3f06",
        border: "#e5d0a2",
        stripe: "#fef9f1",
      },
      terracotta: {
        band: "#fbe9e4",
        title: "#79220d",
        border: "#e8c2b5",
        stripe: "#fdf4f2",
      },
      plum: {
        band: "#f4e8f8",
        title: "#501760",
        border: "#d5bade",
        stripe: "#f9f3fb",
      },
    };

    // Derived from the array, so a seventh accent added without a palette entry
    // fails here instead of shipping unpinned.
    expect(Object.keys(approved).sort()).toEqual(
      ACCENT_PRESETS.map((accent) => accent.id).sort(),
    );

    for (const accent of ACCENT_PRESETS) {
      const want = approved[accent.id];
      expect(accent.bundle.headerBgColor, `${accent.id} band`).toBe(want.band);
      expect(accent.bundle.headerTextColor, `${accent.id} title`).toBe(
        want.title,
      );
      expect(accent.bundle.borderColor, `${accent.id} border`).toBe(
        want.border,
      );
      expect(accent.bundle.stripeBgColor, `${accent.id} stripe`).toBe(
        want.stripe,
      );
    }
  });

  it("carries an underline colour equal to the title", () => {
    // ✅ CONFIRMED by measurement, step 98 (2026-07-30) — it shipped in step 97
    // as provisional, because the palette study rendered banded + stripes where a
    // header has no rule.
    //
    // The title tone rather than the paler border tone, because an underline is a
    // HEADING and must not tone-match the row boundaries around it. Measured at
    // 1:1 on the Accordion card: underline `1.81818px` at the title tone, row
    // rules in the same table at the border tone (contrast to white 1.66), so the
    // two are plainly different surfaces. The border hex would have collapsed
    // them into one.
    //
    // ⚠️ Historical as to its CARD: Accordion moved to BANDED on 2026-07-30, so
    // **Classic** is now the only preset an underline reaches. The finding holds
    // there unchanged — Classic ships row LINES at the border tone under the same
    // underline.
    for (const accent of ACCENT_PRESETS) {
      expect(
        accent.bundle.headerUnderlineColor,
        `${accent.id} underline is provisional and tracks the title`,
      ).toBe(accent.bundle.headerTextColor);
    }
  });

  it("no accent's underline duplicates its border", () => {
    // 🚫 The one redundancy the data must not carry: the stylesheet already
    // falls back `header-underline-color -> border-color -> currentColor`
    // (`spec-table.css:205`) and `borderColor` IS in the accent, so equal values
    // make the dedicated field a pure no-op.
    //
    // Step 98 confirmed the title tone, so this holds by construction today. It
    // stays as the guard on a future palette revision: if the pale tone is ever
    // wanted here, the right change is to DROP the field from the scope rather
    // than write the same value twice, and this test is what forces that choice
    // to be made deliberately.
    for (const accent of ACCENT_PRESETS) {
      expect(
        accent.bundle.headerUnderlineColor,
        `${accent.id}: an underline equal to the border is a no-op`,
      ).not.toBe(accent.bundle.borderColor);
    }
  });
});

describe("accents — the merge law", () => {
  it("every preset × every accent resolves to both halves", () => {
    // The whole reason the vocabulary is SPLIT, asserted over all 30
    // combinations and derived from the two arrays — so a seventh accent or a
    // sixth preset is covered with no edit here.
    for (const preset of STYLE_PRESETS) {
      for (const accent of ACCENT_PRESETS) {
        const resolved = seedStylingFromPreset(preset.id, accent.bundle);

        // The colour half arrives intact...
        for (const field of ACCENT_SCOPED_FIELDS) {
          expect(
            resolved[field],
            `${preset.id} + ${accent.id} lost ${field}`,
          ).toBe(accent.bundle[field]);
        }

        // ...and the structure half is untouched by it. No bundle sets a colour
        // and no accent sets structure, so today there is nothing to contest;
        // this is what fails if that ever stops being true.
        for (const [field, value] of Object.entries(preset.bundle)) {
          expect(
            resolved[field as StylingFieldName],
            `${accent.id} overwrote ${preset.id}'s ${field}`,
          ).toBe(value);
        }
      }
    }
  });

  it("no accent still resolves to a fully theme-inherited table", () => {
    // The zero-config promise the whole module is arranged to protect, pinned
    // against this step: picking a card with "Theme" selected writes no colour.
    for (const preset of STYLE_PRESETS) {
      const resolved = seedStylingFromPreset(preset.id);
      for (const field of COLOR_FIELDS) {
        expect(
          resolved[field],
          `${preset.id} with no accent must not set ${field}`,
        ).toBeNull();
      }
    }
  });

  it("an unknown accent token degrades to Theme", () => {
    // Every invalid input lands on the same state as never having picked one —
    // the posture `findStylePreset` established, so the route contract stays
    // total without a validation branch at the call site.
    for (const token of ["", "nope", "BLUE", "theme", "x".repeat(10_000)]) {
      expect(findAccent(token), `findAccent(${JSON.stringify(token)})`).toBe(
        null,
      );
    }
    expect(findAccent(null)).toBeNull();
    expect(findAccent(undefined)).toBeNull();
  });
});
