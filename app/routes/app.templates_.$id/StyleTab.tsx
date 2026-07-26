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
// Step 8 fills in the remaining four NON-NULLABLE keyword knobs, so the rail now
// carries its first three groups in `admin-screen-plan.md` §Tab 2 order —
// Layout · Sections · Rows — with the Step 5 Dividers control moved under Rows
// unchanged (same control, new heading, no behavior diff). Every knob added here
// already rode the pipe end to end before it had a control: the previews (Step 6)
// and the live storefront (Step 7) both render from the same `tableStylingCss.ts`
// mapping, so these are UI-only additions. If flipping one of them fails to
// repaint the preview, the bug is in Step 6, not here.
//
// Step 9b completes the Sections group with the two collapsible knobs, whose
// `<details>/<summary>` markup landed dormant in 9a.
//
// Step 10a adds the Colors group — the rail's first NULLABLE knobs, where the
// merchant has to be able to both leave a value unset and get back to unset. The
// `""`-to-null conversion lives entirely in `stylingControls.ts`; nothing in this
// file may write a bare `""` into styling state.
//
// Step 12 closes the rail's accessibility gaps and adds its one missing control.
// All three gaps were the same fault — the rail conveyed structure and
// description VISUALLY but not PROGRAMMATICALLY:
//
//   · Help text moved from an unassociated sibling `<s-text color="subdued">`
//     onto the control's own `details` attribute. Identical rendering, but a
//     screen reader now reads the description with the field instead of leaving
//     it stranded between controls. The Colors group already did this right; the
//     other twelve blocks now match it.
//   · Group headings became real `<s-heading>`s inside `role="group"` wrappers
//     that reference them, so the rail is navigable by heading and "Border" is
//     announced as belonging to Colors. `s-text`'s `type` union has no heading
//     variant, which is why this needed a different element; `s-box`'s
//     `accessibilityRole` union has no `group`, which is why the wrapper is a raw
//     light-DOM div (an established pattern here — see EditorShell's radiogroup).
//   · The rail CONTAINER became a named landmark — but that lives in
//     `EditorShell`, since one box sits behind both Style and Settings.
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

      {/* Layout — complete as of Step 10b, which fills the slot Step 8 left
          open for `labelWidthPct`. */}
      <div role="group" aria-labelledby={headingId("layout")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("layout")}>Layout</s-heading>

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

      {/* Size & frame — the container knobs. Every one of these defaults to an
          OFF state (no cap, no outline, square corners), so an untouched table
          renders exactly as it did before the group existed.

          The outline's COLOR is deliberately not here: it is a color, so it
          lives with the other swatches below, the same way row-divider style
          sits in Layout while its color sits in Colors. */}
      <div role="group" aria-labelledby={headingId("frame")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("frame")}>Size &amp; frame</s-heading>

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
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Sections — complete as of Step 9b. */}
      <div role="group" aria-labelledby={headingId("sections")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("sections")}>Sections</s-heading>

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

          {/* Feature 80. Hidden alongside the control above, and for a harder
            reason: a gap is not merely meaningless without disclosures, it is
            unexpressible — a flat section header is a table row, and a table
            row takes no margin. Also a pure read, so the px value survives the
            round trip. Zero-means-off box, like Outline width and Corner
            radius: 0 is exactly what "no gap" looks like on a px control. */}
          {showsSectionGapControl(styling) && (
            <s-number-field
              label="Gap between sections"
              suffix="px"
              details={
                styling.sectionGapPx === null
                  ? "No gap between sections."
                  : "Space between each collapsible section."
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
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Rows — the Step 5 Dividers control, unchanged, now under a heading. */}
      <div role="group" aria-labelledby={headingId("rows")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("rows")}>Rows</s-heading>

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
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Colors (Step 10a) — the rail's first NULLABLE group, and the first
          place "inherit from the theme" needs to be visible and reachable.
          An empty swatch IS the Theme state, and clearing the field is the
          explicit way back to it; `fromColorControlValue` is what keeps the
          `""` sentinel from ever reaching styling state.

          Two-up because seven full-width fields would push the rest of the rail
          off-screen. `alpha` is per-knob, not a group setting — see the lock in
          `stylingControls.ts`. */}
      {/* The group note here describes the GROUP, not any one swatch, so it stays
          a sibling — and `aria-describedby` on the group is what associates it,
          the same fix as the per-control `details` everywhere else. */}
      <div
        role="group"
        aria-labelledby={headingId("colors")}
        aria-describedby={headingId("colors-note")}
      >
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("colors")}>Colors</s-heading>
          <s-text id={headingId("colors-note")} color="subdued">
            Leave a swatch empty to inherit that color from your theme.
          </s-text>

          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            {COLOR_KNOBS.map((knob) => (
              <s-color-field
                key={knob.field}
                label={knob.label}
                // State-reporting, like the rail's six number fields (feature
                // 86). An empty swatch says what it currently falls back to;
                // a set one says which surface it paints. This is what replaces
                // the group note above — see `ColorKnob.emptyHelpText`.
                details={
                  styling[knob.field] === null
                    ? knob.emptyHelpText
                    : knob.helpText
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
        </s-stack>
      </div>

      <s-divider></s-divider>

      {/* Typography (Step 10b). Four nullable keyword selects that lead with
          `Inherit`, plus the one genuinely three-shaped knob. */}
      <div role="group" aria-labelledby={headingId("typography")}>
        <s-stack direction="block" gap="base">
          <s-heading id={headingId("typography")}>Typography</s-heading>

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
            An emptied box is ignored rather than treated as inherit — Inherit is
            its own option above, so clearing must not flip the mode. */}
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

          {/* The four nullable keyword knobs. Written out rather than looped, to
            match every other control in this file — and because a loop would
            need a cast per field to re-narrow the union that
            `fromControlValue` already narrowed correctly.

            "Label weight", not "Font weight": Step 3 put the var on
            `.appx-spec-table__label`, so the control names its own scope. */}
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

          {/* Label column only — the section header takes no case var. */}
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
