import { SaveBar } from "@shopify/app-bridge-react";
import { EditorShell } from "./EditorShell";
import { ContentTab } from "./ContentTab";
import { SAVE_BAR_ID } from "./editorShared";
import { useRowEngine, type SpecTableEditorProps } from "./useRowEngine";

// The spec-table editor entry point (reshell A1). Once a 1,521-line monolith, now
// a thin wrapper: `useRowEngine` owns all state/refs/handlers/effects, the
// presentational `EditorShell` card hosts the engine-driven `ContentTab` in its
// `stage` slot, and the App Bridge `<SaveBar>` rides the engine's dirty/saving
// state. Behavior is unchanged from the pre-reshell editor; the layout is the
// agreed mockup (tabbed card + bounded inner-scroll). See
// `context/features/18-reshell-a1-extract-row-engine.md`.
export function SpecTableEditor(props: SpecTableEditorProps) {
  const engine = useRowEngine(props);

  return (
    <>
      <EditorShell stage={<ContentTab engine={engine} />} />

      {/* The App Bridge contextual save bar (Step 9.5). Rendered at the wrapper
          level (outside EditorShell) so the "Unsaved changes" state persists
          across tab switches — it portals to the admin top bar regardless of the
          active tab. Save persists to Postgres + the storefront metaobject;
          Discard remounts the editor to the saved rows. */}
      <SaveBar id={SAVE_BAR_ID} open={engine.isDirty}>
        <button
          variant="primary"
          onClick={engine.handleSave}
          loading={engine.saving}
        >
          Save
        </button>
        <button onClick={engine.handleDiscard}>Discard</button>
      </SaveBar>
    </>
  );
}
