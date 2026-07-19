import { useRef } from "react";
import {
  COLOR_KNOBS,
  CUSTOM_FONT_SIZE_SEED_PX,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  FONT_STYLE_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  LABEL_CASE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  ROW_DIVIDER_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  fontSizeControlValue,
  fromColorControlValue,
  fromControlValue,
  fromLabelWidthControlValue,
  nextFontSizeForControl,
  parseCustomFontSizePx,
  rememberedCustomFontSizePx,
  showsCustomFontSizeInput,
  showsLabelWidthControl,
  showsMobileLayoutControl,
  showsSectionsInitialStateControl,
  toColorControlValue,
  toControlValue,
  toLabelWidthControlValue,
  type StylingOption,
} from "./stylingControls";
import {
  FONT_SIZE_PX_MAX,
  FONT_SIZE_PX_MIN,
  LABEL_CASES,
  LABEL_WIDTH_PCT_MAX,
  LABEL_WIDTH_PCT_MIN,
  LINE_HEIGHTS,
  STYLING_FONT_STYLES,
  STYLING_FONT_WEIGHTS,
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
function selectedHelpText<T extends string>(
  options: ReadonlyArray<StylingOption<T>>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.helpText ?? "";
}

export function StyleTab({ engine }: { engine: RowEngine }) {
  const { styling, setStylingField } = engine;

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
    <s-stack direction="block" gap="base">
      <s-text type="strong">Style</s-text>

      {/* Layout — complete as of Step 10b, which fills the slot Step 8 left
          open for `labelWidthPct`. */}
      <s-stack direction="block" gap="base">
        <s-text type="strong">Layout</s-text>

        <s-select
          label="Row layout"
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
        <s-text color="subdued">
          {selectedHelpText(ROW_LAYOUT_OPTIONS, styling.rowLayout)}
        </s-text>

        {/* Hidden for a stacked table, where both options mean the same thing.
            Hiding only — `styling.mobileLayout` keeps the merchant's value, so
            it comes back intact if they switch back to two-column. */}
        {showsMobileLayoutControl(styling) && (
          <>
            <s-select
              label="On mobile"
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
            <s-text color="subdued">
              {selectedHelpText(MOBILE_LAYOUT_OPTIONS, styling.mobileLayout)}
            </s-text>
          </>
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
          <>
            <s-number-field
              label="Label width"
              suffix="%"
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
            <s-text color="subdued">
              {styling.labelWidthPct === null
                ? "Using your theme's column split. Values take up the rest."
                : `Values take up the remaining ${100 - styling.labelWidthPct}%.`}
            </s-text>
          </>
        )}
      </s-stack>

      {/* Sections — complete as of Step 9b. */}
      <s-stack direction="block" gap="base">
        <s-text type="strong">Sections</s-text>

        <s-select
          label="Section headers"
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
        <s-text color="subdued">
          {selectedHelpText(SECTION_HEADER_OPTIONS, styling.sectionHeaderStyle)}
        </s-text>

        {/* The rail's first NON-select control (Step 9b) — `sectionsCollapsible`
            is the one boolean in `StylingValues`, so it needs no option list.
            This is what confirms Step 8's rejection of a generic
            `<StylingSelect>` wrapper: the shapes really do diverge. */}
        <s-switch
          label="Collapsible sections"
          checked={styling.sectionsCollapsible}
          onChange={(event: Event) => {
            setStylingField("sectionsCollapsible", readChecked(event));
          }}
        />
        <s-text color="subdued">
          Each section becomes an expandable group shoppers can open and close.
        </s-text>

        {/* Hidden, not disabled, while collapsing is off — it describes which
            disclosures start open, which means nothing without disclosures.
            Hiding is a pure READ (see `showsSectionsInitialStateControl`), so
            the merchant's choice survives a trip through off and back on. */}
        {showsSectionsInitialStateControl(styling) && (
          <>
            <s-select
              label="When the page loads"
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
            <s-text color="subdued">
              {selectedHelpText(
                SECTIONS_INITIAL_STATE_OPTIONS,
                styling.sectionsInitialState,
              )}
            </s-text>
          </>
        )}
      </s-stack>

      {/* Rows — the Step 5 Dividers control, unchanged, now under a heading. */}
      <s-stack direction="block" gap="base">
        <s-text type="strong">Rows</s-text>

        <s-select
          label="Row dividers"
          value={styling.rowDividerStyle}
          onChange={(event: Event) => {
            setStylingField(
              "rowDividerStyle",
              readValue(event) as typeof styling.rowDividerStyle,
            );
          }}
        >
          {ROW_DIVIDER_OPTIONS.map((option) => (
            <s-option key={option.value} value={option.value}>
              {option.label}
            </s-option>
          ))}
        </s-select>
        <s-text color="subdued">
          {selectedHelpText(ROW_DIVIDER_OPTIONS, styling.rowDividerStyle)}
        </s-text>

        <s-select
          label="Density"
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
        <s-text color="subdued">
          {selectedHelpText(DENSITY_OPTIONS, styling.density)}
        </s-text>
      </s-stack>

      {/* Colors (Step 10a) — the rail's first NULLABLE group, and the first
          place "inherit from the theme" needs to be visible and reachable.
          An empty swatch IS the Theme state, and clearing the field is the
          explicit way back to it; `fromColorControlValue` is what keeps the
          `""` sentinel from ever reaching styling state.

          Two-up because seven full-width fields would push the rest of the rail
          off-screen. `alpha` is per-knob, not a group setting — see the lock in
          `stylingControls.ts`. */}
      <s-stack direction="block" gap="base">
        <s-text type="strong">Colors</s-text>
        <s-text color="subdued">
          Leave a swatch empty to inherit that color from your theme.
        </s-text>

        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          {COLOR_KNOBS.map((knob) => (
            <s-color-field
              key={knob.field}
              label={knob.label}
              details={knob.helpText}
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

      {/* Typography (Step 10b). Four nullable keyword selects that lead with
          `Inherit`, plus the one genuinely three-shaped knob. */}
      <s-stack direction="block" gap="base">
        <s-text type="strong">Typography</s-text>

        <s-select
          label="Font size"
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
        <s-text color="subdued">
          {selectedHelpText(
            FONT_SIZE_OPTIONS,
            fontSizeControlValue(styling.fontSize),
          )}
        </s-text>

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
          label="Label weight"
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
        <s-text color="subdued">
          {selectedHelpText(
            FONT_WEIGHT_OPTIONS,
            toControlValue(styling.fontWeight),
          )}
        </s-text>

        <s-select
          label="Text style"
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
        <s-text color="subdued">
          {selectedHelpText(
            FONT_STYLE_OPTIONS,
            toControlValue(styling.fontStyle),
          )}
        </s-text>

        <s-select
          label="Line height"
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
        <s-text color="subdued">
          {selectedHelpText(
            LINE_HEIGHT_OPTIONS,
            toControlValue(styling.lineHeight),
          )}
        </s-text>

        {/* Label column only — the section header takes no case var. */}
        <s-select
          label="Label case"
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
        <s-text color="subdued">
          {selectedHelpText(
            LABEL_CASE_OPTIONS,
            toControlValue(styling.labelCase),
          )}
        </s-text>
      </s-stack>
    </s-stack>
  );
}
