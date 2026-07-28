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

// The editor's Style-tab sidebar (feature 57 Step 5). Presentational, and the
// sibling of `SettingsTab` in every respect: it reads the live styling off the
// engine, calls the engine's one mutator, and rides the same meta-JSON dirty
// snapshot — so changing a knob opens the contextual SaveBar and Save persists it
// alongside rows/name/status/scope in a single request. It renders in
// EditorShell's `stylePanel` slot, INSIDE the editor's inert freeze wrapper
// (SpecTableEditor), so it is frozen with the rest of the editor during an
// in-flight save — no separate `saving` guard here.
//
// THE RAIL'S ORGANISING RULE, and the one thing to preserve when adding a knob
// (feature 86): the eight groups are cut on ONE axis — the OBJECT being styled —
// and every group ends with its own colors. "Structure knobs, then colors" is a
// rule a merchant learns once and reapplies in every group.
//
//   1 Table layout · 2 Table size & frame · 3 Table text · 4 Section headers
//   5 Collapsible sections · 6 Rows · 7 Labels · 8 Values
//
// It was NOT always so, and the failure mode is worth keeping: the rail used to
// carry six groups cut on TWO axes at once — four by object (Layout / Size &
// frame / Sections / Rows) and two by CSS property (Colors / Typography). The
// cost was not untidiness, it was distance. `headerBgColor` sat ~20 controls
// from the select that makes the band visible; the label column had its weight
// in Typography, its colors in Colors, and no group of its own anywhere. A new
// knob filed by "what kind of CSS is this" rather than "what does it style"
// re-creates that, so file by object.
//
// ⚠️ Where a knob goes is decided by WHERE THE CSS VAR LANDS, not by what the
// control sounds like. `font-size` / `font-style` / `line-height` sit on
// `.appx-spec-table__table`, so they are Table text; `font-weight` and
// `text-transform` sit on `.appx-spec-table__label`, so they are Labels. Check
// `spec-table.css` before filing — the split is falsifiable in one click, and a
// group heading that lies is worse than no heading.
//
// ⚠️ THE GROUP HEADINGS ARE LOAD-BEARING. Feature 86 shortened labels that used
// to name their own scope ("Label weight" → "Weight", "Section title case" →
// "Title case") on the strength of the heading stating it instead, and two
// swatch pairs (Labels, Values) are character-identical. That only holds while
// every group is a `role="group"` wired to its heading by `aria-labelledby`,
// which is what makes the scope ANNOUNCED rather than merely seen. Deleting a
// wrapper silently widens two controls' apparent scope to the whole table — see
// the lock note in `stylingControls.ts`.
//
// ⚠️ NO GROUP MAY CONSIST ENTIRELY OF HIDE-GATED CONTROLS. Ten of the 35 are
// behind a visibility predicate; a group where all of them were would render as
// a heading and a divider fencing nothing — an empty section a merchant reads as
// a broken screen, and a `role="group"` with no members. Pinned in
// `styleTabContract.test.ts`.
//
// Seven of those ten are JSX guards — `{showsX(styling) && <control/>}`. The
// other three (features 95, 96) gate COLORS, which this file never writes as
// JSX: the ten swatches are one `.filter(…).map(…)` over `COLOR_KNOBS`, so their
// predicates ride `ColorKnob.visibleWhen` and are applied inside `colorGrid`.
// Same law, same registry, different attachment point — and they carry their own
// version of the rule above: no group's swatches may ALL be gated, or
// `colorGrid` paints an empty `<s-grid>`. ⚠️ Section headers is now the closest
// call in the rail — 2 of its 3 swatches are gated, and only `Title color`
// stands between that group and an empty grid. Rows is the same shape with
// `Divider color`. Pinned in `stylingControls.test.ts`.
//
// Knobs added here already rode the pipe end to end before they had a control:
// the previews and the live storefront both render from the same
// `tableStylingCss.ts` mapping, so these are UI-only additions. If flipping one
// fails to repaint the preview, the bug is in the mapping, not here.
//
// NULLABLE knobs (all nine colors and the keyword selects) must be able to reach
// unset and get back. The `""`-to-null conversion lives entirely in
// `stylingControls.ts`; nothing in this file may write a bare `""` into styling
// state.
//
// ACCESSIBILITY — the rail conveys structure and description PROGRAMMATICALLY,
// not just visually, and each piece is deliberate:
//
//   · Help text rides the control's own `details` attribute, never an
//     unassociated sibling `<s-text>`, so a screen reader reads the description
//     WITH the field instead of finding it stranded between controls.
//   · Group headings are real `<s-heading>`s inside `role="group"` wrappers that
//     reference them. `s-text`'s `type` union has no heading variant, which is
//     why this needs a different element; `s-box`'s `accessibilityRole` union has
//     no `group`, which is why the wrapper is a raw light-DOM div (an established
//     pattern here — see EditorShell's radiogroup).
//   · The rail CONTAINER is a named landmark — but that lives in `EditorShell`,
//     since one box sits behind both Style and Settings.
//   · ⚠️ `s-heading` takes NO level prop (only `accessibilityRole`), so the panel
//     title and all eight group headings are peers rather than nested. Known and
//     accepted: `role="group"` + `aria-labelledby` is what carries the structure,
//     and the alternative — wrapping each group in `s-section` to establish a
//     level — would add card chrome the rail does not want.
//
// NO CONTRAST CHECKING, and this is a decision rather than a deferral (see
// `context/features/69-…` §3): the app cannot compute contrast — a null color
// inherits an unknown theme value and every background knob allows alpha — so any
// warning would be a guess, and an unreliable a11y warning is worse than none.
//
// NO GENERIC CONTROL WRAPPER, deliberately. Five near-identical selects look like
// they want a `<StylingSelect knob={…}>`, but at this size the abstraction would
// be bigger than what it removes. Step 9b's switch and Step 10's color fields and
// number fields have since confirmed the call: the shapes really do diverge, and
// only the `selectedHelpText` lookup — which knows nothing about how a value is
// picked — turned out to be worth sharing.

// Read the `value` off a Polaris web-component change event (the elements are
// custom, so `currentTarget.value` isn't in the DOM typings). Same helper as
// SettingsTab — deliberately duplicated rather than shared, since each panel's
// event handling is otherwise independent.
function readValue(event: Event): string {
  return (event.currentTarget as unknown as { value: string }).value;
}

// The `checked` counterpart for the one boolean knob (Step 9b). Same reasoning
// as `readValue`: the Polaris elements are custom, so the property isn't in the
// DOM typings.
function readChecked(event: Event): boolean {
  return (event.currentTarget as unknown as { checked: boolean }).checked;
}

// The subdued line under a control, describing whatever is currently selected.
// A lookup, not a control abstraction — it stays valid for Step 10's non-select
// shapes because it knows nothing about how the value is picked.
//
// ⚠️ Returns `undefined`, never `""` (feature 86). Most options no longer carry
// a gloss at all — see the rule on `StylingOption.helpText` — and a `details=""`
// paints an empty subdued line, so the control would keep the vertical space of
// a description it does not have. `undefined` omits the attribute instead.
// The `||` rather than `??` is deliberate: it catches a stray `""` in the option
// data as well as a missing key, so neither can reach the DOM.
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

  // Stable, instance-unique prefix for the group headings each `role="group"`
  // points at with `aria-labelledby`. Same approach as EditorShell's tooltip ids.
  const groupId = useId();
  const headingId = (group: string) => `${groupId}-${group}`;

  // The px a merchant last typed, so leaving and re-entering Custom is not
  // destructive: S → Custom → S → Custom must return their number, not the seed.
  // It cannot live in `StylingValues` — `fontSize` holds ONE of its three shapes
  // at a time — so it is UI memory, the same shape of fix as the four hide
  // rules. A ref rather than state because nothing renders from it directly;
  // it is only ever read at the moment Custom is picked.
  const rememberedPxRef = useRef(
    rememberedCustomFontSizePx(styling.fontSize, CUSTOM_FONT_SIZE_SEED_PX),
  );
  rememberedPxRef.current = rememberedCustomFontSizePx(
    styling.fontSize,
    rememberedPxRef.current,
  );
  const rememberedPx = rememberedPxRef.current;

  // One group's swatches, 2-up (feature 86 Step 4). The nine colors used to be a
  // single `Colors` group rendered by one `.map`; they now scatter across five
  // groups, each sitting with the controls it composes with — "structure knobs,
  // then colors" as one rule the merchant learns once and reapplies everywhere.
  //
  // Selected by FILTERING rather than by reordering, which is what lets
  // `COLOR_KNOBS` stay in `STYLING_FIELD_NAMES` order (`tableStyling.ts` pins the
  // color block as contiguous, and `stylingControls.test.ts` derives the expected
  // order from it). Within-group order is therefore inherited, not chosen.
  //
  // A plain function called as `{colorGrid("labels")}`, NOT a `<ColorGrid/>`
  // component: a component declared inside `StyleTab` would be a new type on
  // every render and would remount its subtree, blowing away focus and any
  // half-typed hex. This is also why it is not hoisted to module scope — it
  // closes over `styling` and `setStylingField`, and threading those through
  // props would buy nothing.
  //
  // Stays 2-up even for `tableFrame`, which has ONE swatch and so renders a
  // half-width field with a gap beside it. Deliberate: a full-width lone swatch
  // would make Outline color the only differently-sized color input in the rail,
  // trading a small alignment oddity for an inconsistency the eye tracks harder.
  // Feature 95 added the second half of the filter. A swatch may carry its own
  // visibility rule, and it is applied HERE rather than as a `{showsX(…) && }`
  // guard because these controls are generated, not written — there is no JSX
  // line to wrap. The predicate itself still lives in `stylingControls.ts` with
  // the other seven and is registered under the same preserve-on-hide law, so
  // hiding a swatch can never clear the merchant's hex.
  const colorGrid = (group: StyleGroupId) => (
    <s-grid gridTemplateColumns="1fr 1fr" gap="base">
      {COLOR_KNOBS.filter(
        (knob) => knob.group === group && (knob.visibleWhen?.(styling) ?? true),
      ).map((knob) => (
        <s-color-field
          key={knob.field}
          label={knob.label}
          // State-reporting, like the rail's six number fields (feature 86). An
          // empty swatch says what it currently falls back to; a set one says
          // which surface it paints. This is what replaced the old Colors group
          // note — see `ColorKnob.emptyHelpText`, and note the note was WRONG
          // about four of the nine.
          //
          // ⚠️ `emptyHelpText` is OPTIONAL since feature 96, so this can be
          // `undefined` — which renders no `details` line at all, and that is
          // the intended result rather than a hole to patch. Exactly one swatch
          // (`Underline color`) omits it, because its fallback chain is two
          // links deep and no true sentence about it fits the rail. Do not
          // substitute `knob.helpText` here as a "safe" default: it describes
          // the surface a SET colour paints, so an empty swatch would claim to
          // be painting something.
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

  return (
    // Two gap scales, and the difference between them is the whole separation
    // treatment (feature 86 Step 3). The OUTER stack runs `large-200` and the
    // inner per-group stacks stay `base`, so whitespace alone already groups the
    // rail: controls that belong together sit closer to each other than to
    // anything in the next group. The `<s-divider>`s then draw that same
    // boundary for anyone who reads structure rather than rhythm.
    //
    // ⚠️ The two scales have to STAY different. Setting the outer stack back to
    // `base` would not just tighten the rail, it would flatten the proximity
    // signal entirely and leave the dividers doing the work alone.
    <s-stack direction="block" gap="large-200">
      <s-heading>Style</s-heading>

      {/* 1 · Table layout. FIRST by merchant decision (feature 86): Row layout
          is the highest-leverage knob in the rail and it gates whether four
          other controls exist at all, so it has to be the thing a merchant
          meets before anything else. The group carries no colors — a layout has
          no surface of its own to paint. */}
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
              // Safe by construction: every option's value comes from ROW_LAYOUTS,
              // so the select can only ever emit a member of the union.
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

          {/* Grid only — the seventh hide rule. A MINIMUM WIDTH, never a column
            count: the browser fits as many tracks as the container allows, so
            the layout is responsive with no media query and cannot produce
            three unreadable tracks in a narrow theme. It is also what keeps
            this rail's own Desktop preview honest — that preview is ~640px on
            a laptop, so a count knob would render the same number of tracks
            there as on a 1400px storefront while looking nothing like it.

            Clearing the box is the way back to the stylesheet's 240px; 0 is
            not a spelling of anything here (contrast Outline width), so it
            clamps up to the floor. */}
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
              onChange={(event: Event) => {
                setStylingField(
                  "gridMinColumnWidthPx",
                  fromGridMinColumnWidthControlValue(readValue(event)),
                );
              }}
            />
          )}

          {/* Two-column only. A stacked table is already stacked everywhere and
            a grid is responsive by construction, so in both cases the two
            options would mean the same thing. Hiding only —
            `styling.mobileLayout` keeps the merchant's value, so it comes back
            intact if they switch back to two-column. */}
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

          {/* Two-column only — a stacked table has no label column to size. The
            third hide rule, and a pure read like the others, so the merchant's
            percentage survives a trip through Stacked.

            A number field rather than the plan's original "slider": Polaris web
            components ship no slider/range element (verified against
            `@shopify/polaris-types`), and a hand-rolled `<input type="range">`
            would look foreign in the rail and owe its own a11y pass. Clearing
            the box is the way back to the theme's default ratio. */}
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

      {/* 2 · Table size & frame — the container knobs. Every one of these
          defaults to an OFF state (no cap, no outline, square corners), so an
          untouched table renders exactly as it did before the group existed.

          ⚠️ The outline's COLOR now lives HERE, and that reversal is the whole
          point of feature 86. The old comment in this spot argued it belonged
          with the other swatches "the same way row-divider style sits in Layout
          while its color sits in Colors" — which is exactly the two-axis cut
          that made the rail hard to use. Outline width and Outline color are one
          decision; they are now one group. */}
      <div role="group" aria-labelledby={headingId("tableFrame")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("tableFrame")}>
            {STYLE_GROUP_HEADINGS.tableFrame}
          </s-heading>

          {/* Empty = full width, which is the default. A CAP rather than a
              fixed width: it shrinks below the cap on a narrow screen, so it
              cannot fight the mobile breakpoint or overflow a phone. */}
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
            onChange={(event: Event) => {
              setStylingField(
                "tableMaxWidthPx",
                fromTableMaxWidthControlValue(readValue(event)),
              );
            }}
          />

          {/* Hidden at full width, where all three options look the same. The
              fifth hide rule, and a pure read like the other four — the
              merchant's alignment survives clearing the width above. */}
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

          <s-number-field
            label="Outline width"
            suffix="px"
            details={
              styling.outerBorderWidthPx === null
                ? "No outline. Set 1 or more to frame the table."
                : // Feature 86 renamed both swatches this names. "Border" was
                  // ambiguous once it moved to Rows, and the old sentence ended
                  // "…if that is unset" — a reference that only parsed while the
                  // two sat next to each other in one Colors list.
                  "Colored by Outline color, or Divider color if that is unset."
            }
            min={ZERO_MEANS_OFF_CONTROL_MIN}
            max={OUTER_BORDER_WIDTH_PX_MAX}
            step={1}
            value={toZeroMeansOffControlValue(styling.outerBorderWidthPx)}
            onChange={(event: Event) => {
              setStylingField(
                "outerBorderWidthPx",
                fromOuterBorderWidthControlValue(readValue(event)),
              );
            }}
          />

          {/* Independent of the outline: a radius rounds the section band and
              the stripe fills whether or not a frame is drawn. */}
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
            onChange={(event: Event) => {
              setStylingField(
                "outerBorderRadiusPx",
                fromOuterBorderRadiusControlValue(readValue(event)),
              );
            }}
          />

          {/* Outline color. Directly under the width that turns the outline on,
              and the one swatch in the rail whose empty state points at ANOTHER
              control rather than at the theme — it falls back through
              `borderColor`, which is why its `emptyHelpText` reads "Follows
              Divider color." That sentence only became sayable once the two
              swatches stopped sharing one undifferentiated list. */}
          {colorGrid("tableFrame")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 3 · Table text — the type knobs that apply to the WHOLE table, and
          only those. Feature 86 split the old Typography group on where the CSS
          var actually lands (verified against `spec-table.css`, not assumed):
          `font-size`, `font-style` and `line-height` sit on
          `.appx-spec-table__table`, so they belong to the table; `font-weight`
          and `text-transform` sit on `.appx-spec-table__label`, so they moved to
          Labels instead.

          That split is FALSIFIABLE IN ONE CLICK, which is why it is not a matter
          of taste: set Case here and only the label column changes. Filing those
          two as table-wide would have been a group heading that lies. */}
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

          {/* The fourth hide rule. Small / Medium / Large are theme-RELATIVE (an
              em multiplier, so they survive a theme switch); this box is the
              ABSOLUTE escape hatch, which is why it only exists in Custom mode.
              An emptied box is ignored rather than treated as inherit — Inherit
              is its own option above, so clearing must not flip the mode. */}
          {showsCustomFontSizeInput(styling) && (
            <s-number-field
              label="Custom size"
              suffix="px"
              min={FONT_SIZE_PX_MIN}
              max={FONT_SIZE_PX_MAX}
              step={1}
              value={String(styling.fontSize)}
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

      {/* 4 · Section headers. Eight controls — the style select, the four
          feature-81 typography knobs that refine the band it turns on, the
          gap that separates one header's section from the next (feature 94),
          and the band's own two colors. `headerBgColor` used to sit ~20
          controls away from the select that makes it visible; that distance
          was the single clearest symptom of the old cut. */}
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

          {/* Feature 81 — four knobs refining the band the select above turns
            on, so they sit with it, above the collapsible/behavior controls.
            None of them is hidden in any shape: all four apply to the flat
            `th` and the collapsible `<summary>` alike, so the hide-rule count
            stays at 6. The section title's COLOR is not here — it is a color,
            so it lives with the other swatches below, the same split the band's
            own background already takes.

            Blank boxes, not the zero-means-off boxes the frame group uses:
            for these two, clearing the field means "use the default", which is
            a real state distinct from any number either box can hold. */}
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

          {/* ⚠️ The one box in the rail where an EMPTY field and a typed `0`
            mean different things, and both are valid: empty inherits the
            standard spacing, 0 removes it. Safe only because this knob's null
            means "the default" rather than "off" — the frame group's px knobs
            get the zero-means-off treatment precisely because for them the two
            states would be the same render. */}
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
            onChange={(event: Event) => {
              setStylingField(
                "headerPaddingBlockPx",
                fromHeaderPaddingBlockControlValue(readValue(event)),
              );
            }}
          />

          {/* Feature 80, moved here by feature 94. It sat in Collapsible
            sections while it was reachable only with disclosures on; now that
            it works in the flat block layouts too, a gap is not a property of
            collapsing but of the section headers it separates — the feature-86
            axis deciding its own placement, as it is meant to.

            The LAST structural knob before the colors, which keeps the group
            reading "structure knobs, then colors" and puts the two whitespace
            controls next to each other: Title spacing is the padding INSIDE a
            header, this is the margin OUTSIDE one.

            Still hidden rather than disabled, and still a pure read, so the px
            value survives a trip through Two-column and back. Zero-means-off
            box, like Outline width and Corner radius: 0 is exactly what "no
            gap" looks like on a px control. */}
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
              onChange={(event: Event) => {
                setStylingField(
                  "sectionGapPx",
                  fromSectionGapControlValue(readValue(event)),
                );
              }}
            />
          )}

          {/* Three swatches, and the group's geometry is the design. Two of
              them are MUTUALLY EXCLUSIVE: `Background` shows only under Banded
              (feature 95) and `Underline color` only under Underlined
              (feature 96), because each member hardcodes the other's surface
              away — so slot 1 always holds whatever the current header style
              actually paints, and `Title color` always holds slot 2 without
              moving. Plain shows `Title color` alone.

              `Title color` stays ungated because the base rule's `color:` is
              never overridden by a member, so a title is coloured under all
              three — and it is what keeps this grid from ever rendering empty,
              the same role `Divider color` plays in Rows.

              It is also the one swatch pair where the second keeps a qualifier
              ("Title color") rather than the bare "Text color" Labels and Values
              use: the band, the rule and the text are three different
              surfaces. */}
          {colorGrid("sectionHeaders")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 5 · Collapsible sections — BEHAVIOR, not appearance, which is the whole
          reason it split from Section headers (merchant decision, feature 86).
          The old `Sections` group ran to eight controls and mixed "what a
          section title looks like" with "can a shopper collapse it", so a
          merchant hunting one had to read past the other.

          Small on purpose: the switch plus the ONE control that only means
          anything once it is on. Hidden rather than disabled while it is off,
          so the group collapses to a single switch — the thin-group case
          Step 5 re-examined live and kept.

          ⚠️ Two controls until feature 94, which moved the section gap to
          Section headers once it stopped depending on disclosures. The group
          still leads with an UNGATED switch, so it can never render as a
          heading fencing nothing — the Step 5 invariant that a group may not
          consist entirely of hide-gated controls. */}
      <div role="group" aria-labelledby={headingId("collapsibleSections")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("collapsibleSections")}>
            {STYLE_GROUP_HEADINGS.collapsibleSections}
          </s-heading>

          {/* The rail's first NON-select control (Step 9b) — `sectionsCollapsible`
            is the one boolean in `StylingValues`, so it needs no option list.
            This is what confirms Step 8's rejection of a generic
            `<StylingSelect>` wrapper: the shapes really do diverge. */}
          <s-switch
            label="Enable collapsing"
            details="Each section becomes an expandable group shoppers can open and close."
            checked={styling.sectionsCollapsible}
            onChange={(event: Event) => {
              setStylingField("sectionsCollapsible", readChecked(event));
            }}
          />

          {/* Hidden, not disabled, while collapsing is off — it describes which
            disclosures start open, which means nothing without disclosures.
            Hiding is a pure READ (see `showsSectionsInitialStateControl`), so
            the merchant's choice survives a trip through off and back on. */}
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

      {/* 6 · Rows. Five controls: the two divider selects, density, and the two
          colors those dividers use. `stripeBgColor` sits with the Row dividers
          select it depends on, and `borderColor` sits with the rules it paints.
          Since feature 95 the stripe swatch is also GATED on that select, so
          this group renders four controls or five — never fewer, and never an
          empty color grid, because Divider color is unconditional. */}
      <div role="group" aria-labelledby={headingId("rows")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("rows")}>
            {STYLE_GROUP_HEADINGS.rows}
          </s-heading>

          {/* The one control whose OPTION LIST depends on another knob (feature
              85): Grid drops Stripes, because DOM-order parity paints a
              checkerboard across several tracks rather than alternating rows.
              Derived rather than filtered inline because of the orphan case —
              a merchant already on Stripes who switches to Grid keeps a stored
              value the list would otherwise no longer contain, and this select
              stays on screen. See `rowDividerOptionsFor`. */}
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

          {/* Directly under Row dividers — its vertical partner, and together
              with an Outline width the three make a full grid. Always shown,
              including on stacked layouts where it has no seam to sit on: the
              merchant's choice has to survive a trip through Stacked, and the
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

          {/* ⚠️ This grid holds the rail's ONE asymmetry, and both halves are
              decisions. `Stripe background` hides unless Row dividers is
              Stripes (feature 95) — one field, one CSS declaration, no referent
              otherwise. `Divider color` stays VISIBLE at Row dividers = None
              (feature 86 decision 3) — the same field also dresses the column
              divider, the feature-80 section separator, and the table outline
              whenever Outline color is unset, so hiding it would leave a
              merchant with a lines-free table holding no control for two live
              surfaces. Its help text carries the coupling instead. */}
          {colorGrid("rows")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* 7 · Labels — the label column as one object: how its text is set, and
          what it is painted in. This group is the clearest thing feature 86
          bought. Before it, styling the label column meant visiting Typography
          for the weight and the case and Colors for the two swatches, and there
          was no group anywhere in the rail that said "labels".

          ⚠️ THE SHORT LABELS HERE ARE LOAD-BEARING ON THE HEADING. "Weight" and
          "Case" used to read "Label weight" and "Label case" because the control
          had to name its own scope; the heading states it now, wired with
          `role="group"` + `aria-labelledby` so it is ANNOUNCED and not merely
          seen. Drop the wrapper and two controls silently start claiming the
          whole table — see the lock note in `stylingControls.ts`. */}
      <div role="group" aria-labelledby={headingId("labels")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("labels")}>
            {STYLE_GROUP_HEADINGS.labels}
          </s-heading>

          {/* Written out rather than looped, to match every other control in
              this file — and because a loop would need a cast per field to
              re-narrow the union that `fromControlValue` already narrowed
              correctly. */}
          <s-select
            label="Weight"
            details={selectedHelpText(
              FONT_WEIGHT_OPTIONS,
              toControlValue(styling.fontWeight),
            )}
            value={toControlValue(styling.fontWeight)}
            onChange={(event: Event) => {
              // `fromControlValue` is what keeps the `""` sentinel out of styling
              // state, and its domain-list check makes the narrowing real.
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

          {/* Label column only — the section header takes no case var, which is
              also why Section headers has a Title case of its own rather than
              sharing this one. */}
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

      {/* 8 · Values — the rail's smallest group, and the only one that is
          nothing but swatches. Kept as a group rather than folded into Labels
          because the pair mirrors the table's two columns, which is the
          merchant's own model of the thing: "labels on the left, values on the
          right" is what Row layout's help text already says.

          Its two swatches are `Background` and `Text color`, character-identical
          to Labels' pair. That is deliberate symmetry, and it is legible ONLY
          because each sits under its own announced heading — the same bet the
          short labels above make. */}
      <div role="group" aria-labelledby={headingId("values")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("values")}>
            {STYLE_GROUP_HEADINGS.values}
          </s-heading>

          {colorGrid("values")}
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Reset (Step 12) — last in the rail and LOW-emphasis on purpose: it is a
          bulk undo of every knob above it, not a primary action. It never applies
          on first click; the confirmation lives in `ResetStylingModal`, mounted up
          in `SpecTableEditor` so switching tabs cannot tear it out mid-confirm.
          No `saving` guard here — the whole rail is inside the editor's inert
          freeze, unlike the portalled modal it opens.

          It takes a divider like a group does, though it is not one: it acts on
          everything above it, so the rule reads as "end of the knobs" rather than
          as another boundary between two of them.

          The box lost its `paddingBlockStart` in Step 3 — it existed only to buy
          separation back when the outer stack ran `base` and there was no rule
          here. The stack's own `large-200` now supplies it, twice over. */}
      <s-box>
        <s-button onClick={() => shopify.modal.show(RESET_STYLING_MODAL_ID)}>
          Reset to theme defaults
        </s-button>
      </s-box>
    </s-stack>
  );
}
