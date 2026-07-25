import { useEffect, useRef } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { EditorShell } from "./EditorShell";
import { ContentTab } from "./ContentTab";
import { SettingsTab } from "./SettingsTab";
import { StyleTab } from "./StyleTab";
import { SpecTablePreview } from "./SpecTablePreview";
import { ResetStylingModal } from "./ResetStylingModal";
import { EditorTips } from "./EditorTips";
import { SAVE_BAR_ID } from "./editorShared";
import type { RowEngine } from "./useRowEngine";
import styles from "./SpecTableEditor.module.css";

// The spec-table editor card (reshell A1; engine lifted in feature 20). The
// `useRowEngine` instance is now owned one level up by the page component
// (`TemplateOverview`) so the `<s-page>` header can read the same saving/dirty/
// name state and drive header actions; this component takes that single `engine`
// as a prop and renders only the editor body. The presentational `EditorShell`
// card hosts the engine-driven `ContentTab` in its `stage` slot, and the App
// Bridge `<SaveBar>` rides the engine's dirty/saving state. Behavior is unchanged
// from the pre-reshell editor; the layout is the agreed mockup (tabbed card +
// bounded inner-scroll). See `context/features/18-reshell-a1-extract-row-engine.md`
// and `context/features/20-template-lifecycle-actions.md`.
export function SpecTableEditor({ engine }: { engine: RowEngine }) {
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
        <EditorShell
          stage={<ContentTab engine={engine} />}
          preview={(view, options) => (
            <SpecTablePreview
              rows={engine.rows}
              styling={engine.styling}
              view={view}
              // Undefined from the card's stage (it measures itself); supplied by
              // the full-size modal, which cannot (feature 75).
              availableHeight={options?.availableHeight}
            />
          )}
          stylePanel={<StyleTab engine={engine} />}
          settingsPanel={<SettingsTab engine={engine} />}
        />
      </div>

      {/* The Style rail's reset confirmation (feature 57 Step 12) — a sibling
          AFTER the freeze <div> like the SaveBar, so it outlives the tab switch
          that unmounts the rail its trigger lives in. See ResetStylingModal. */}
      <ResetStylingModal engine={engine} />

      {/* Tips footer (feature 32) — a sibling AFTER the freeze <div>, so it sits
          below the editor card, outside it, and outside the save-freeze (tips stay
          readable/usable during a save). Manual-advance, one-tip-at-a-time; the
          home for the keyboard-nav tip and all future editor tips. */}
      <EditorTips />

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
          disabled={!engine.canSave}
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
