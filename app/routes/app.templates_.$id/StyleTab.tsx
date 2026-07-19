import {
  DENSITY_OPTIONS,
  MOBILE_LAYOUT_OPTIONS,
  ROW_DIVIDER_OPTIONS,
  ROW_LAYOUT_OPTIONS,
  SECTIONS_INITIAL_STATE_OPTIONS,
  SECTION_HEADER_OPTIONS,
  showsMobileLayoutControl,
  showsSectionsInitialStateControl,
  type StylingOption,
} from "./stylingControls";
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
// The groups are knowingly incomplete: `labelWidthPct` belongs visually under
// Layout and the colors/typography groups come with it in Step 10, because
// "null = inherit from the theme" needs a UI vocabulary this step doesn't build.
// Step 9b completes the Sections group with the two collapsible knobs, whose
// `<details>/<summary>` markup landed dormant in 9a — so this is again a
// UI-only change with zero non-UI diff.
//
// NO GENERIC CONTROL WRAPPER, deliberately. Five near-identical selects look like
// they want a `<StylingSelect knob={…}>`, but at this size the abstraction would
// be bigger than what it removes, and Step 10 brings toggles, swatches and
// sliders that would break its assumptions immediately. Revisit only if Step 10
// turns up real duplication.

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

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Style</s-text>

      {/* Layout. `labelWidthPct` joins this group in Step 10. */}
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
    </s-stack>
  );
}
