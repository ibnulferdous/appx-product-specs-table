import { ROW_DIVIDER_OPTIONS } from "./stylingControls";
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
// SCOPE NOTE (not a bug): changing a knob updates state and persists it, but
// NOTHING REPAINTS YET. The storefront stylesheet's modifier rules exist but are
// still dormant — the device previews start consuming styling in Step 6, the
// editing grid in Step 11, and the storefront itself only once the metaobject
// carries styling in Step 7. Until then a merchant sees the control remember its
// value across a save and reload, and sees no visual change. That is the intended
// state of this step.
//
// Dividers is the only control here on purpose: it is the simplest shape in
// `StylingValues` (a 3-way keyword knob with a non-null default), so it proves
// the whole seed → mutate → dirty → save → reload circuit before the remaining
// ~19 knobs land on top of it (Steps 8–10). Those add option lists to
// `stylingControls.ts` and groups here; they do not touch the engine.

// Read the `value` off a Polaris web-component change event (the elements are
// custom, so `currentTarget.value` isn't in the DOM typings). Same helper as
// SettingsTab — deliberately duplicated rather than shared, since each panel's
// event handling is otherwise independent.
function readValue(event: Event): string {
  return (event.currentTarget as unknown as { value: string }).value;
}

export function StyleTab({ engine }: { engine: RowEngine }) {
  const { styling, setStylingField } = engine;

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Style</s-text>

      {/* Rows group. Steps 8–10 add the remaining groups (layout, sections,
          density, colors, typography) as siblings below this one. */}
      <s-select
        label="Row dividers"
        value={styling.rowDividerStyle}
        onChange={(event: Event) => {
          // The cast is safe by construction: every option's value comes from
          // ROW_DIVIDER_STYLES, so the select can only ever emit a member.
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
        {ROW_DIVIDER_OPTIONS.find(
          (option) => option.value === styling.rowDividerStyle,
        )?.helpText ?? ""}
      </s-text>
    </s-stack>
  );
}
