import { useEffect, useRef } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { EditorShell } from "./EditorShell";
import { ContentTab } from "./ContentTab";
import { SAVE_BAR_ID } from "./editorShared";
import { useRowEngine, type SpecTableEditorProps } from "./useRowEngine";
import styles from "./SpecTableEditor.module.css";

// The spec-table editor entry point (reshell A1). Once a 1,521-line monolith, now
// a thin wrapper: `useRowEngine` owns all state/refs/handlers/effects, the
// presentational `EditorShell` card hosts the engine-driven `ContentTab` in its
// `stage` slot, and the App Bridge `<SaveBar>` rides the engine's dirty/saving
// state. Behavior is unchanged from the pre-reshell editor; the layout is the
// agreed mockup (tabbed card + bounded inner-scroll). See
// `context/features/18-reshell-a1-extract-row-engine.md`.
export function SpecTableEditor(props: SpecTableEditorProps) {
  const engine = useRowEngine(props);

  // Freeze the whole editor card while a save is in flight. `inert` blocks
  // pointer, keyboard, and focus across the entire subtree — the contenteditable
  // value cells, the toolbar, drag/paste, and the tab controls — and removes it
  // from the tab order and a11y tree, so the merchant cannot keep editing into an
  // in-flight save (those edits would never reach the server and would be lost).
  // Set imperatively, not as JSX: on React 18 `inert` is not a managed prop, and
  // because it is an HTML boolean attribute, rendering `inert="false"` would STILL
  // freeze the card — toggling the attribute by hand avoids that footgun. The App
  // Bridge <SaveBar> portals to the admin top bar, OUTSIDE this wrapper, so its
  // Save/Discard buttons stay interactive (Save shows its loading spinner;
  // App Bridge disables a loading button so it cannot be double-submitted).
  const freezeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = freezeRef.current;
    if (!el) return;
    if (engine.saving) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [engine.saving]);

  return (
    <>
      <div
        ref={freezeRef}
        className={styles.stageFreeze}
        aria-busy={engine.saving || undefined}
      >
        <EditorShell stage={<ContentTab engine={engine} />} />
      </div>

      {/* The App Bridge contextual save bar (Step 9.5). Rendered at the wrapper
          level (outside EditorShell) so the "Unsaved changes" state persists
          across tab switches — it portals to the admin top bar regardless of the
          active tab. Save persists to Postgres + the storefront metaobject;
          Discard remounts the editor to the saved rows. Discard is disabled while
          a save is in flight so it cannot remount (and tear down the in-flight
          fetcher) mid-save. */}
      <SaveBar id={SAVE_BAR_ID} open={engine.isDirty}>
        <button
          variant="primary"
          onClick={engine.handleSave}
          loading={engine.saving}
        >
          Save
        </button>
        <button onClick={engine.handleDiscard} disabled={engine.saving}>
          Discard
        </button>
      </SaveBar>
    </>
  );
}
