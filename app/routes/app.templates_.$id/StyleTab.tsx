import { useId, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { RESET_STYLING_MODAL_ID } from "./editorShared";
import {
  COLOR_KNOBS,
  COLUMN_DIVIDER_OPTIONS,
  CUSTOM_FONT_SIZE_SEED_PX,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  HEADER_CASE_OPTIONS,
  HEADER_FONT_WEIGHT_OPTIONS,
  LABEL_CASE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  STYLE_GROUP_HEADINGS,
  TABLE_ALIGN_OPTIONS,
  fontSizeControlValue,
  fromColorControlValue,
  fromControlValue,
  fromGridMinColumnWidthControlValue,
  fromHeaderFontSizeControlValue,
  fromHeaderPaddingBlockControlValue,
  fromLabelWidthControlValue,
  fromOuterBorderRadiusControlValue,
  fromOuterBorderWidthControlValue,
  fromSectionGapControlValue,
  fromTableMaxWidthControlValue,
  liveCommitValue,
  nextFontSizeForControl,
  parseCustomFontSizePx,
  rememberedCustomFontSizePx,
  rowDividerOptionsFor,
  showsCustomFontSizeInput,
  showsGridMinColumnWidthControl,
  showsLabelWidthControl,
  showsMobileLayoutControl,
  showsSectionGapControl,
  showsSectionsInitialStateControl,
  showsTableAlignControl,
  toBoundedIntControlValue,
  toColorControlValue,
  toControlValue,
  toGridMinColumnWidthControlValue,
  toHeaderFontSizeControlValue,
  toHeaderPaddingBlockControlValue,
  toLabelWidthControlValue,
  toZeroMeansOffControlValue,
  ZERO_MEANS_OFF_CONTROL_MIN,
  type StyleGroupId,
  type StylingOption,
} from "./stylingControls";
import {
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
  GRID_MIN_COLUMN_WIDTH_PX_MAX,
  GRID_MIN_COLUMN_WIDTH_PX_MIN,
  HEADER_PADDING_BLOCK_PX_MAX,
  HEADER_PADDING_BLOCK_PX_MIN,
  LABEL_CASES,
  LABEL_WIDTH_PCT_MAX,
  LABEL_WIDTH_PCT_MIN,
  LINE_HEIGHTS,
  OUTER_BORDER_RADIUS_PX_MAX,
  OUTER_BORDER_WIDTH_PX_MAX,
  SECTION_GAP_PX_MAX,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
  TABLE_MAX_WIDTH_PX_MAX,
  TABLE_MAX_WIDTH_PX_MIN,
} from "../../utils/tableStyling";
import type { RowEngine } from "./useRowEngine";

// The editor's Style-tab sidebar (feature 57 Step 5). Presentational, sibling of `SettingsTab`: it
// reads the live styling off the engine, calls the engine's one mutator, and rides the same meta-JSON
// dirty snapshot, so changing a knob opens the SaveBar. It renders in EditorShell's `stylePanel` slot,
// INSIDE the editor's inert freeze wrapper, so it is frozen during a save — no separate `saving` guard.
//
// THE RAIL'S ORGANISING RULE (feature 86), the one thing to preserve when adding a knob: the eight
// groups are cut on ONE axis — the OBJECT being styled — and every group ends with its own colors.
// "Structure knobs, then colors" is a rule a merchant learns once and reapplies in every group.
//   1 Table layout · 2 Table size & frame · 3 Table text · 4 Section headers
//   5 Collapsible sections · 6 Rows · 7 Labels · 8 Values
// The rail used to be cut on TWO axes (four by object, two by CSS property: Colors / Typography),
// which put `headerBgColor` ~20 controls from the select that makes the band visible. File by object.
//
// ⚠️ Where a knob goes is decided by WHERE THE CSS VAR LANDS, not by what the control sounds like.
// `font-size` / `font-style` / `line-height` sit on `.appx-spec-table__table` (Table text);
// `font-weight` / `text-transform` sit on `.appx-spec-table__label` (Labels). Check `spec-table.css`
// before filing — the split is falsifiable in one click, and a heading that lies is worse than none.
//
// ⚠️ THE GROUP HEADINGS ARE LOAD-BEARING. Feature 86 shortened labels that named their own scope
// ("Label weight" → "Weight"), and two swatch pairs (Labels, Values) are character-identical. That
// only holds while every group is a `role="group"` wired to its heading by `aria-labelledby`, which
// makes the scope ANNOUNCED, not merely seen. Deleting a wrapper silently widens two controls' scope
// to the whole table — see the lock note in `stylingControls.ts`.
//
// ⚠️ NO GROUP MAY CONSIST ENTIRELY OF HIDE-GATED CONTROLS. Ten of the 35 are behind a visibility
// predicate; a group where all were would render as a heading + divider fencing nothing. Pinned in
// `styleTabContract.test.ts`. Seven of the ten are JSX guards; the other three (features 95, 96) gate
// COLORS, applied inside `colorGrid` via `ColorKnob.visibleWhen` — same law, and no group's swatches
// may ALL be gated or `colorGrid` paints an empty `<s-grid>`. Section headers is the closest call
// (2 of 3 gated; only `Title color` stands between it and an empty grid); Rows is the same with
// `Divider color`.
//
// Knobs added here already rode the pipe end to end (previews + storefront render from the same
// `tableStylingCss.ts` mapping), so these are UI-only additions — if flipping one fails to repaint the
// preview, the bug is in the mapping.
//
// NULLABLE knobs (all nine colors + the keyword selects) must reach unset and back. The `""`-to-null
// conversion lives entirely in `stylingControls.ts`; nothing here may write a bare `""` into styling.
//
// ACCESSIBILITY: help text rides the control's own `details` attribute (never a stranded sibling
// `<s-text>`); group headings are real `<s-heading>`s inside `role="group"` wrappers referencing them
// (s-text has no heading variant, s-box has no `group` role — hence a raw div, as in EditorShell's
// radiogroup). ⚠️ `s-heading` takes NO level prop, so the panel title and eight group headings are
// peers — accepted, since `role="group"` + `aria-labelledby` carries the structure. NO CONTRAST
// CHECKING (decision, not deferral, features/69 §3): the app can't compute contrast, so any warning
// would be a guess.
//
// EVERY NUMBER BOX CARRIES BOTH `onInput` AND `onChange`, and dropping either is a bug (2026-07-31).
// `onChange` fires on COMMIT (blur/Enter) — with it alone, typing `1000` into Maximum width shows no
// SaveBar and leaving before blur throws the number away. `onInput` alone is worse: the boxes are
// controlled and every `from…` clamps, rewriting a half-typed number under the caret. The
// reconciliation is `liveCommitValue` (commit on a keystroke only when the text already spells what
// would be stored), and the ONLY correct read of its result is `!== undefined` (`null` is a real value
// — a cleared box, or a zero-means-off `0`). Selects/swatches need none of this. Pinned per box.
//
// NO GENERIC CONTROL WRAPPER, deliberately: at this size the abstraction would be bigger than what it
// removes, and Steps 9b/10 confirmed the shapes really diverge — only `selectedHelpText` was worth sharing.

// Read the `value` off a Polaris web-component change event (custom elements, so `currentTarget.value`
// isn't in the DOM typings). Same helper as SettingsTab — duplicated rather than shared, since each
// panel's event handling is otherwise independent.
function readValue(event: Event): string {
  return (event.currentTarget as unknown as { value: string }).value;
}

// The `checked` counterpart for the one boolean knob (Step 9b). Same reasoning as `readValue`.
function readChecked(event: Event): boolean {
  return (event.currentTarget as unknown as { checked: boolean }).checked;
}

// The subdued line under a control, describing the current selection. A lookup, not a control
// abstraction, so it stays valid for Step 10's non-select shapes.
//
// ⚠️ Returns `undefined`, never `""` (feature 86): most options carry no gloss, and a `details=""`
// paints an empty subdued line. The `||` (not `??`) catches a stray `""` in the option data as well
// as a missing key.
function selectedHelpText<T extends string>(
  options: ReadonlyArray<StylingOption<T>>,
  value: T,
): string | undefined {
  return (
    options.find((option) => option.value === value)?.helpText || undefined
  );
}

export function StyleTab({ engine }: { engine: RowEngine }) {
  const { styling, setStylingField } = engine;
  const shopify = useAppBridge();

  // Stable, instance-unique prefix for the group headings each `role="group"` points at with
  // `aria-labelledby`. Same approach as EditorShell's tooltip ids.
  const groupId = useId();
  const headingId = (group: string) => `${groupId}-${group}`;

  // The px a merchant last typed, so leaving and re-entering Custom is non-destructive (S → Custom →
  // S → Custom must return their number, not the seed). It can't live in `StylingValues` (fontSize
  // holds one of three shapes), so it's UI memory. A ref, not state, because nothing renders from it
  // — only read at the moment Custom is picked.
  const rememberedPxRef = useRef(
    rememberedCustomFontSizePx(styling.fontSize, CUSTOM_FONT_SIZE_SEED_PX),
  );
  rememberedPxRef.current = rememberedCustomFontSizePx(
    styling.fontSize,
    rememberedPxRef.current,
  );
  const rememberedPx = rememberedPxRef.current;

  // One group's swatches, 2-up (feature 86 Step 4). Selected by FILTERING, which lets `COLOR_KNOBS`
  // stay in `STYLING_FIELD_NAMES` order (the test derives the expected order from it). A plain
  // function called `{colorGrid("labels")}`, NOT a `<ColorGrid/>` component: a component declared
  // inside StyleTab would be a new type every render and remount its subtree, blowing away focus and
  // any half-typed hex; it's not hoisted to module scope because it closes over `styling`/`setStylingField`.
  //
  // Stays 2-up even for `tableFrame` (one swatch → a half-width field with a gap) — a full-width lone
  // swatch would make Outline color the only differently-sized color input. A swatch may carry its own
  // `visibleWhen`, applied HERE rather than a `{showsX && }` guard because these controls are
  // generated, not written (the predicate still lives in `stylingControls.ts` under preserve-on-hide).
  //
  // ⚠️ THE EARLY RETURN IS LOAD-BEARING (2026-07-29). The `<s-grid>` used to be built outside the
  // filter, so a group with no surviving swatch painted an EMPTY grid — a blank strip carrying the
  // stack's gap. Unreachable until `outerBorderColor` was gated (`tableFrame` is the only single-swatch
  // group). Returning null also keeps the contract test's bare-heading count honest.
  const colorGrid = (group: StyleGroupId) => {
    const visible = COLOR_KNOBS.filter(
      (knob) => knob.group === group && (knob.visibleWhen?.(styling) ?? true),
    );
    if (visible.length === 0) return null;

    return (
      <s-grid gridTemplateColumns="1fr 1fr" gap="base">
        {visible.map((knob) => (
          <s-color-field
            key={knob.field}
            label={knob.label}
            // State-reporting (feature 86): an empty swatch says what it falls back to; a set one says
            // which surface it paints. ⚠️ `emptyHelpText` is OPTIONAL since feature 96, so this can be
            // undefined (renders no `details` line — intended). Exactly one swatch (`Underline color`)
            // omits it. Do NOT substitute `knob.helpText` as a default: it describes the surface a SET
            // colour paints, so an empty swatch would claim to be painting something.
            details={
              styling[knob.field] === null ? knob.emptyHelpText : knob.helpText
            }
            alpha={knob.alpha}
            value={toColorControlValue(styling[knob.field])}
            onChange={(event: Event) => {
              setStylingField(
                knob.field,
                fromColorControlValue(readValue(event)),
              );
            }}
          />
        ))}
      </s-grid>
    );
  };

  return (
    // Two gap scales, and the difference is the whole separation treatment (feature 86 Step 3). The
    // OUTER stack runs `large-200` and the inner per-group stacks stay `base`, so whitespace alone
    // groups the rail; the `<s-divider>`s draw the same boundary for anyone who reads structure. ⚠️ The
    // two scales must STAY different — flattening the outer to `base` would leave the dividers doing the
    // work alone.
    <s-stack direction="block" gap="large-200">
      <s-heading>Style</s-heading>

      {/* 1 · Table layout. FIRST by merchant decision (feature 86): Row layout is the highest-leverage
          knob and it gates whether four other controls exist. No colors — a layout has no surface. */}
      <div role="group" aria-labelledby={headingId("tableLayout")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("tableLayout")}>
            {STYLE_GROUP_HEADINGS.tableLayout}
          </s-heading>

          <s-select
            label="Row layout"
            details={selectedHelpText(ROW_LAYOUT_OPTIONS, styling.rowLayout)}
            value={styling.rowLayout}
            onChange={(event: Event) => {
              // Safe by construction: every option's value comes from ROW_LAYOUTS.
              setStylingField(
                "rowLayout",
                readValue(event) as typeof styling.rowLayout,
              );
            }}
          >
            {ROW_LAYOUT_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* Grid only — the seventh hide rule. A MINIMUM WIDTH, never a column count: the browser
            fits as many tracks as the container allows (responsive with no media query), which also
            keeps this rail's ~640px Desktop preview honest. Clearing the box returns to 240px; 0 spells
            nothing here (contrast Outline thickness), so it clamps up. */}
          {showsGridMinColumnWidthControl(styling) && (
            <s-number-field
              label="Minimum column width"
              suffix="px"
              details={
                styling.gridMinColumnWidthPx === null
                  ? "Columns are at least 240px wide."
                  : "Columns are at least this wide. Fewer, wider columns on narrow screens."
              }
              min={GRID_MIN_COLUMN_WIDTH_PX_MIN}
              max={GRID_MIN_COLUMN_WIDTH_PX_MAX}
              step={10}
              value={toGridMinColumnWidthControlValue(
                styling.gridMinColumnWidthPx,
              )}
              onInput={(event: Event) => {
                const value = liveCommitValue(
                  readValue(event),
                  fromGridMinColumnWidthControlValue,
                  toGridMinColumnWidthControlValue,
                );
                if (value !== undefined)
                  setStylingField("gridMinColumnWidthPx", value);
              }}
              onChange={(event: Event) => {
                setStylingField(
                  "gridMinColumnWidthPx",
                  fromGridMinColumnWidthControlValue(readValue(event)),
                );
              }}
            />
          )}

          {/* Two-column only. A stacked table is stacked everywhere and a grid is responsive, so both
            options would mean the same. Hiding only — `styling.mobileLayout` keeps the value. */}
          {showsMobileLayoutControl(styling) && (
            <s-select
              label="On mobile"
              details={selectedHelpText(
                MOBILE_LAYOUT_OPTIONS,
                styling.mobileLayout,
              )}
              value={styling.mobileLayout}
              onChange={(event: Event) => {
                setStylingField(
                  "mobileLayout",
                  readValue(event) as typeof styling.mobileLayout,
                );
              }}
            >
              {MOBILE_LAYOUT_OPTIONS.map((option) => (
                <s-option key={option.value} value={option.value}>
                  {option.label}
                </s-option>
              ))}
            </s-select>
          )}

          {/* Two-column only — a stacked table has no label column to size. The third hide rule, a pure
            read, so the merchant's percentage survives a trip through Stacked. A number field rather
            than a slider: Polaris ships no slider element, and a hand-rolled range would look foreign
            and owe its own a11y pass. Clearing the box returns to the theme's default ratio. */}
          {showsLabelWidthControl(styling) && (
            <s-number-field
              label="Label column width"
              suffix="%"
              details={
                styling.labelWidthPct === null
                  ? "Using your theme's column split. Values take up the rest."
                  : `Values take up the remaining ${100 - styling.labelWidthPct}%.`
              }
              min={LABEL_WIDTH_PCT_MIN}
              max={LABEL_WIDTH_PCT_MAX}
              step={1}
              value={toLabelWidthControlValue(styling.labelWidthPct)}
              onInput={(event: Event) => {
                const value = liveCommitValue(
                  readValue(event),
                  fromLabelWidthControlValue,
                  toLabelWidthControlValue,
                );
                if (value !== undefined)
                  setStylingField("labelWidthPct", value);
              }}
              onChange={(event: Event) => {
                setStylingField(
                  "labelWidthPct",
                  fromLabelWidthControlValue(readValue(event)),
                );
              }}
            />
          )}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 2 · Table size & frame — the container knobs. Every one defaults OFF (no cap, no outline,
          square corners), so an untouched table renders as before the group existed. ⚠️ The outline's
          COLOR lives HERE (the reversal that is the whole point of feature 86: Outline thickness and
          Outline color are one decision), and since 2026-07-29 the colour only appears once the
          thickness has turned the outline on. */}
      <div role="group" aria-labelledby={headingId("tableFrame")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("tableFrame")}>
            {STYLE_GROUP_HEADINGS.tableFrame}
          </s-heading>

          {/* Empty = full width (the default). A CAP, not a fixed width: it shrinks below the cap on a
              narrow screen, so it can't fight the mobile breakpoint or overflow a phone. */}
          <s-number-field
            label="Maximum width"
            suffix="px"
            details={
              styling.tableMaxWidthPx === null
                ? "Full width. Enter a number to cap it."
                : "Wider screens cap here; narrower ones shrink to fit."
            }
            min={TABLE_MAX_WIDTH_PX_MIN}
            max={TABLE_MAX_WIDTH_PX_MAX}
            step={10}
            value={toBoundedIntControlValue(styling.tableMaxWidthPx)}
            onInput={(event: Event) => {
              const value = liveCommitValue(
                readValue(event),
                fromTableMaxWidthControlValue,
                toBoundedIntControlValue,
              );
              if (value !== undefined)
                setStylingField("tableMaxWidthPx", value);
            }}
            onChange={(event: Event) => {
              setStylingField(
                "tableMaxWidthPx",
                fromTableMaxWidthControlValue(readValue(event)),
              );
            }}
          />

          {/* Hidden at full width, where all three options look the same. The fifth hide rule, a pure
              read — the alignment survives clearing the width above. */}
          {showsTableAlignControl(styling) && (
            <s-select
              label="Alignment"
              details={selectedHelpText(
                TABLE_ALIGN_OPTIONS,
                styling.tableAlign,
              )}
              value={styling.tableAlign}
              onChange={(event: Event) => {
                setStylingField(
                  "tableAlign",
                  readValue(event) as typeof styling.tableAlign,
                );
              }}
            >
              {TABLE_ALIGN_OPTIONS.map((option) => (
                <s-option key={option.value} value={option.value}>
                  {option.label}
                </s-option>
              ))}
            </s-select>
          )}

          {/* "Outline THICKNESS", not width, since 2026-07-29 — `Maximum width` two fields up caps the
              horizontal size; this is a stroke weight, and the shared word meant different axes ~40px
              apart. Feature 86 split the vocabulary into Divider (row/column rules) and Outline (frame)
              so "border" never names two things; both swatches' help texts name each other. */}
          <s-number-field
            label="Outline thickness"
            suffix="px"
            details={
              styling.outerBorderWidthPx === null
                ? "No outline. Set 1 or more to frame the table."
                : "Colored by Outline color, or Divider color if that is unset."
            }
            min={ZERO_MEANS_OFF_CONTROL_MIN}
            max={OUTER_BORDER_WIDTH_PX_MAX}
            step={1}
            value={toZeroMeansOffControlValue(styling.outerBorderWidthPx)}
            onInput={(event: Event) => {
              const value = liveCommitValue(
                readValue(event),
                fromOuterBorderWidthControlValue,
                toZeroMeansOffControlValue,
              );
              if (value !== undefined)
                setStylingField("outerBorderWidthPx", value);
            }}
            onChange={(event: Event) => {
              setStylingField(
                "outerBorderWidthPx",
                fromOuterBorderWidthControlValue(readValue(event)),
              );
            }}
          />

          {/* Independent of the outline: a radius rounds the section band and stripe fills whether or
              not a frame is drawn. */}
          <s-number-field
            label="Corner radius"
            suffix="px"
            details={
              styling.outerBorderRadiusPx === null
                ? "Square corners. Set 1 or more to round them."
                : "Rounds the table's corners, outline or not."
            }
            min={ZERO_MEANS_OFF_CONTROL_MIN}
            max={OUTER_BORDER_RADIUS_PX_MAX}
            step={1}
            value={toZeroMeansOffControlValue(styling.outerBorderRadiusPx)}
            onInput={(event: Event) => {
              const value = liveCommitValue(
                readValue(event),
                fromOuterBorderRadiusControlValue,
                toZeroMeansOffControlValue,
              );
              if (value !== undefined)
                setStylingField("outerBorderRadiusPx", value);
            }}
            onChange={(event: Event) => {
              setStylingField(
                "outerBorderRadiusPx",
                fromOuterBorderRadiusControlValue(readValue(event)),
              );
            }}
          />

          {/* Outline color — renders NOTHING until the thickness above is 1+ (at 0 the one consumer is
              `border: 0 solid <color>`, no referent). The first `colorGrid` call that can return null
              (`tableFrame` is the only single-swatch group). Its empty state points at ANOTHER control
              ("Follows Divider color.") — it falls back through `borderColor`. */}
          {colorGrid("tableFrame")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 3 · Table text — the type knobs that apply to the WHOLE table, and only those. Feature 86
          split the old Typography group on where the CSS var lands (verified against `spec-table.css`):
          `font-size` / `font-style` / `line-height` sit on `__table`; `font-weight` / `text-transform`
          sit on `__label` and moved to Labels. FALSIFIABLE IN ONE CLICK: set Case here and only the
          label column changes. */}
      <div role="group" aria-labelledby={headingId("tableText")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("tableText")}>
            {STYLE_GROUP_HEADINGS.tableText}
          </s-heading>

          <s-select
            label="Text size"
            details={selectedHelpText(
              FONT_SIZE_OPTIONS,
              fontSizeControlValue(styling.fontSize),
            )}
            value={fontSizeControlValue(styling.fontSize)}
            onChange={(event: Event) => {
              setStylingField(
                "fontSize",
                nextFontSizeForControl(readValue(event), rememberedPx),
              );
            }}
          >
            {FONT_SIZE_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* The fourth hide rule. Small / Medium / Large are theme-RELATIVE (an em multiplier); this
              box is the ABSOLUTE escape hatch, so it only exists in Custom mode. An emptied box is
              ignored rather than treated as inherit — Inherit is its own option, so clearing mustn't
              flip the mode. */}
          {showsCustomFontSizeInput(styling) && (
            <s-number-field
              label="Custom size"
              suffix="px"
              min={FONT_SIZE_PX_MIN}
              max={FONT_SIZE_PX_MAX}
              step={1}
              value={String(styling.fontSize)}
              onInput={(event: Event) => {
                // Two guards, different meanings. `undefined` = "still typing"; `null` = this box's own
                // "nothing usable to store" (an emptied field must not flip the select out of Custom,
                // which is why the blur handler carries the same `!== null` test).
                const px = liveCommitValue(
                  readValue(event),
                  parseCustomFontSizePx,
                  toBoundedIntControlValue,
                );
                if (px !== undefined && px !== null)
                  setStylingField("fontSize", px);
              }}
              onChange={(event: Event) => {
                const px = parseCustomFontSizePx(readValue(event));
                if (px !== null) setStylingField("fontSize", px);
              }}
            />
          )}

          <s-select
            label="Text style"
            details={selectedHelpText(
              FONT_STYLE_OPTIONS,
              toControlValue(styling.fontStyle),
            )}
            value={toControlValue(styling.fontStyle)}
            onChange={(event: Event) => {
              setStylingField(
                "fontStyle",
                fromControlValue(readValue(event), STYLING_FONT_STYLES),
              );
            }}
          >
            {FONT_STYLE_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          <s-select
            label="Line height"
            details={selectedHelpText(
              LINE_HEIGHT_OPTIONS,
              toControlValue(styling.lineHeight),
            )}
            value={toControlValue(styling.lineHeight)}
            onChange={(event: Event) => {
              setStylingField(
                "lineHeight",
                fromControlValue(readValue(event), LINE_HEIGHTS),
              );
            }}
          >
            {LINE_HEIGHT_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 4 · Section headers. Eight controls — the style select, the four feature-81 typography knobs
          that refine the band, the gap that separates one section from the next (feature 94), and the
          band's own two colors. `headerBgColor` used to sit ~20 controls from the select that makes it
          visible — the clearest symptom of the old cut. */}
      <div role="group" aria-labelledby={headingId("sectionHeaders")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("sectionHeaders")}>
            {STYLE_GROUP_HEADINGS.sectionHeaders}
          </s-heading>

          <s-select
            label="Header style"
            details={selectedHelpText(
              SECTION_HEADER_OPTIONS,
              styling.sectionHeaderStyle,
            )}
            value={styling.sectionHeaderStyle}
            onChange={(event: Event) => {
              setStylingField(
                "sectionHeaderStyle",
                readValue(event) as typeof styling.sectionHeaderStyle,
              );
            }}
          >
            {SECTION_HEADER_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* Feature 81 — four knobs refining the band the select turns on. None is hidden in any shape
            (all apply to the flat `th` and the collapsible `<summary>` alike). The section title's
            COLOR isn't here — it's a color, so it lives with the swatches below. Blank boxes, not
            zero-means-off: clearing means "use the default", a real state distinct from any number. */}
          <s-number-field
            label="Title size"
            suffix="px"
            details={
              styling.headerFontSizePx === null
                ? "Matches the surrounding text."
                : "An exact size for section titles."
            }
            min={FONT_SIZE_PX_MIN}
            max={FONT_SIZE_PX_MAX}
            step={1}
            value={toHeaderFontSizeControlValue(styling.headerFontSizePx)}
            onInput={(event: Event) => {
              const value = liveCommitValue(
                readValue(event),
                fromHeaderFontSizeControlValue,
                toHeaderFontSizeControlValue,
              );
              if (value !== undefined)
                setStylingField("headerFontSizePx", value);
            }}
            onChange={(event: Event) => {
              setStylingField(
                "headerFontSizePx",
                fromHeaderFontSizeControlValue(readValue(event)),
              );
            }}
          />

          <s-select
            label="Title weight"
            details={selectedHelpText(
              HEADER_FONT_WEIGHT_OPTIONS,
              toControlValue(styling.headerFontWeight),
            )}
            value={toControlValue(styling.headerFontWeight)}
            onChange={(event: Event) => {
              setStylingField(
                "headerFontWeight",
                fromControlValue(readValue(event), STYLING_FONT_WEIGHTS),
              );
            }}
          >
            {HEADER_FONT_WEIGHT_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          <s-select
            label="Title case"
            details={selectedHelpText(
              HEADER_CASE_OPTIONS,
              toControlValue(styling.headerCase),
            )}
            value={toControlValue(styling.headerCase)}
            onChange={(event: Event) => {
              setStylingField(
                "headerCase",
                fromControlValue(readValue(event), LABEL_CASES),
              );
            }}
          >
            {HEADER_CASE_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* ⚠️ The one box where an EMPTY field and a typed `0` mean different things, both valid:
            empty inherits the standard spacing, 0 removes it. Safe only because this knob's null means
            "the default" rather than "off". */}
          <s-number-field
            label="Title spacing"
            suffix="px"
            details={
              styling.headerPaddingBlockPx === null
                ? "Standard space above and below a title."
                : "Space above and below a title. 0 removes it."
            }
            min={HEADER_PADDING_BLOCK_PX_MIN}
            max={HEADER_PADDING_BLOCK_PX_MAX}
            step={1}
            value={toHeaderPaddingBlockControlValue(
              styling.headerPaddingBlockPx,
            )}
            onInput={(event: Event) => {
              const value = liveCommitValue(
                readValue(event),
                fromHeaderPaddingBlockControlValue,
                toHeaderPaddingBlockControlValue,
              );
              if (value !== undefined)
                setStylingField("headerPaddingBlockPx", value);
            }}
            onChange={(event: Event) => {
              setStylingField(
                "headerPaddingBlockPx",
                fromHeaderPaddingBlockControlValue(readValue(event)),
              );
            }}
          />

          {/* Feature 80, moved here by feature 94: a gap is a property of the section headers it
            separates, not of collapsing. The LAST structural knob before the colors, next to Title
            spacing (the padding INSIDE a header; this is the margin OUTSIDE one). Hidden not disabled,
            a pure read. Zero-means-off box like Outline thickness / Corner radius: 0 is what "no gap"
            looks like on a px control. */}
          {showsSectionGapControl(styling) && (
            <s-number-field
              label="Gap between sections"
              suffix="px"
              details={
                styling.sectionGapPx === null
                  ? "No gap between sections."
                  : "Space between each section."
              }
              min={ZERO_MEANS_OFF_CONTROL_MIN}
              max={SECTION_GAP_PX_MAX}
              step={1}
              value={toZeroMeansOffControlValue(styling.sectionGapPx)}
              onInput={(event: Event) => {
                const value = liveCommitValue(
                  readValue(event),
                  fromSectionGapControlValue,
                  toZeroMeansOffControlValue,
                );
                if (value !== undefined) setStylingField("sectionGapPx", value);
              }}
              onChange={(event: Event) => {
                setStylingField(
                  "sectionGapPx",
                  fromSectionGapControlValue(readValue(event)),
                );
              }}
            />
          )}

          {/* Three swatches; the geometry is the design. `Background` (Banded only, feature 95) and
              `Underline color` (Underlined only, feature 96) are MUTUALLY EXCLUSIVE, each member
              hardcoding the other's surface away — so slot 1 always holds whatever the current header
              style paints, and `Title color` always holds slot 2. `Title color` stays ungated (the base
              `color:` is never overridden by a member) and keeps this grid from ever rendering empty —
              the role `Divider color` plays in Rows. It keeps the "Title" qualifier because band, rule
              and text are three surfaces. */}
          {colorGrid("sectionHeaders")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 5 · Collapsible sections — BEHAVIOR, not appearance, which is why it split from Section headers
          (feature 86). Small on purpose: the switch plus the ONE control that only means anything once
          it's on. Hidden rather than disabled while off, so the group collapses to a single switch. ⚠️
          The section gap moved to Section headers in feature 94; the group still leads with an UNGATED
          switch, so it can never render as a heading fencing nothing (the Step 5 invariant). */}
      <div role="group" aria-labelledby={headingId("collapsibleSections")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("collapsibleSections")}>
            {STYLE_GROUP_HEADINGS.collapsibleSections}
          </s-heading>

          {/* The rail's first NON-select control (Step 9b) — the one boolean in `StylingValues`, so no
            option list. Confirms Step 8's rejection of a generic `<StylingSelect>` wrapper. */}
          <s-switch
            label="Enable collapsing"
            details="Each section becomes an expandable group shoppers can open and close."
            checked={styling.sectionsCollapsible}
            onChange={(event: Event) => {
              setStylingField("sectionsCollapsible", readChecked(event));
            }}
          />

          {/* Hidden, not disabled, while collapsing is off — it describes which disclosures start open,
            meaningless without disclosures. Hiding is a pure READ, so the choice survives off and back. */}
          {showsSectionsInitialStateControl(styling) && (
            <s-select
              label="Sections start"
              details={selectedHelpText(
                SECTIONS_INITIAL_STATE_OPTIONS,
                styling.sectionsInitialState,
              )}
              value={styling.sectionsInitialState}
              onChange={(event: Event) => {
                setStylingField(
                  "sectionsInitialState",
                  readValue(event) as typeof styling.sectionsInitialState,
                );
              }}
            >
              {SECTIONS_INITIAL_STATE_OPTIONS.map((option) => (
                <s-option key={option.value} value={option.value}>
                  {option.label}
                </s-option>
              ))}
            </s-select>
          )}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 6 · Rows. Five controls: the two divider selects, density, and the two colors those dividers
          use. `stripeBgColor` sits with the Row dividers select it depends on (and is GATED on it since
          feature 95); `borderColor` sits with the rules it paints. Renders four or five controls —
          never an empty color grid, because Divider color is unconditional. */}
      <div role="group" aria-labelledby={headingId("rows")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("rows")}>
            {STYLE_GROUP_HEADINGS.rows}
          </s-heading>

          {/* The one control whose OPTION LIST depends on another knob (feature 85): Grid drops Stripes
              (DOM-order parity paints a checkerboard). Derived rather than filtered inline because of
              the orphan case — a merchant already on Stripes who switches to Grid keeps a stored value
              the list would otherwise no longer contain. See `rowDividerOptionsFor`. */}
          <s-select
            label="Row dividers"
            details={selectedHelpText(
              rowDividerOptionsFor(styling),
              styling.rowDividerStyle,
            )}
            value={styling.rowDividerStyle}
            onChange={(event: Event) => {
              setStylingField(
                "rowDividerStyle",
                readValue(event) as typeof styling.rowDividerStyle,
              );
            }}
          >
            {rowDividerOptionsFor(styling).map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* Directly under Row dividers — its vertical partner. Always shown, including on stacked
              layouts where it has no seam: the choice has to survive a trip through Stacked, and the
              option's own help text carries the caveat. */}
          <s-select
            label="Column divider"
            details={selectedHelpText(
              COLUMN_DIVIDER_OPTIONS,
              styling.columnDividerStyle,
            )}
            value={styling.columnDividerStyle}
            onChange={(event: Event) => {
              setStylingField(
                "columnDividerStyle",
                readValue(event) as typeof styling.columnDividerStyle,
              );
            }}
          >
            {COLUMN_DIVIDER_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          <s-select
            label="Density"
            details={selectedHelpText(DENSITY_OPTIONS, styling.density)}
            value={styling.density}
            onChange={(event: Event) => {
              setStylingField(
                "density",
                readValue(event) as typeof styling.density,
              );
            }}
          >
            {DENSITY_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* ⚠️ The rail's ONE asymmetry, both halves decisions. `Stripe background` hides unless Row
              dividers is Stripes (feature 95) — one field, one declaration, no referent otherwise.
              `Divider color` stays VISIBLE at Row dividers = None (feature 86 decision 3) — it also
              dresses the column divider, the section separator, and the outline when Outline color is
              unset, so hiding it would leave a lines-free table with no control for two live surfaces.
              Its help text carries the coupling. */}
          {colorGrid("rows")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 7 · Labels — the label column as one object: how its text is set and what it's painted in. The
          clearest thing feature 86 bought (before it, styling the label column meant visiting
          Typography and Colors with no "labels" group anywhere). ⚠️ THE SHORT LABELS ARE LOAD-BEARING
          ON THE HEADING: "Weight"/"Case" used to read "Label weight"/"Label case"; the heading states
          the scope now, wired `role="group"` + `aria-labelledby`. Drop the wrapper and two controls
          silently claim the whole table. */}
      <div role="group" aria-labelledby={headingId("labels")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("labels")}>
            {STYLE_GROUP_HEADINGS.labels}
          </s-heading>

          {/* Written out rather than looped, to match every other control here — and because a loop
              would need a cast per field to re-narrow the union `fromControlValue` already narrowed. */}
          <s-select
            label="Weight"
            details={selectedHelpText(
              FONT_WEIGHT_OPTIONS,
              toControlValue(styling.fontWeight),
            )}
            value={toControlValue(styling.fontWeight)}
            onChange={(event: Event) => {
              // `fromControlValue` keeps the `""` sentinel out of styling state; its domain-list check
              // makes the narrowing real.
              setStylingField(
                "fontWeight",
                fromControlValue(readValue(event), STYLING_FONT_WEIGHTS),
              );
            }}
          >
            {FONT_WEIGHT_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {/* Label column only — the section header takes no case var, which is why Section headers has
              a Title case of its own rather than sharing this one. */}
          <s-select
            label="Case"
            details={selectedHelpText(
              LABEL_CASE_OPTIONS,
              toControlValue(styling.labelCase),
            )}
            value={toControlValue(styling.labelCase)}
            onChange={(event: Event) => {
              setStylingField(
                "labelCase",
                fromControlValue(readValue(event), LABEL_CASES),
              );
            }}
          >
            {LABEL_CASE_OPTIONS.map((option) => (
              <s-option key={option.value} value={option.value}>
                {option.label}
              </s-option>
            ))}
          </s-select>

          {colorGrid("labels")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 8 · Values — the rail's smallest group, the only one that is nothing but swatches. Kept
          separate from Labels because the pair mirrors the table's two columns (the merchant's own
          model). Its `Background` and `Text color` are character-identical to Labels' pair — deliberate
          symmetry, legible ONLY because each sits under its own announced heading. */}
      <div role="group" aria-labelledby={headingId("values")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("values")}>
            {STYLE_GROUP_HEADINGS.values}
          </s-heading>

          {colorGrid("values")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Reset (Step 12) — last in the rail and LOW-emphasis: a bulk undo of every knob, not a primary
          action. Never applies on first click; the confirmation lives in `ResetStylingModal`, mounted
          up in `SpecTableEditor` so switching tabs can't tear it out mid-confirm. No `saving` guard —
          the whole rail is inside the editor's inert freeze, unlike the portalled modal it opens. Takes
          a divider like a group (it acts on everything above it, so the rule reads "end of the knobs").
          Lost its `paddingBlockStart` in Step 3 — the stack's own `large-200` supplies it now. */}
      <s-box>
        <s-button onClick={() => shopify.modal.show(RESET_STYLING_MODAL_ID)}>
          Reset to theme defaults
        </s-button>
      </s-box>
    </s-stack>
  );
}
