import { useEffect, useRef } from "react";
import { SaveBar } from "@shopify/app-bridge-react";
import { EditorShell } from "./EditorShell";
import { ContentTab } from "./ContentTab";
import { SettingsTab } from "./SettingsTab";
import { StyleTab } from "./StyleTab";
import { SpecTablePreview } from "./SpecTablePreview";
import { ResetStylingModal } from "./ResetStylingModal";
import { EditorTips } from "./EditorTips";
import { SAVE_BAR_ID, saveBarSaveAttrs } from "./editorShared";
import type { RowEngine } from "./useRowEngine";
import styles from "./SpecTableEditor.module.css";

// The spec-table editor card (reshell A1; engine lifted in feature 20). The `useRowEngine` instance is
// owned one level up (`TemplateOverview`) so the `<s-page>` header reads the same saving/dirty/name
// state; this component takes that single `engine` as a prop and renders only the editor body. The
// `EditorShell` card hosts the engine-driven `ContentTab` in its `stage` slot, and the App Bridge
// `<SaveBar>` rides the engine's dirty/saving state. (features/18, features/20)
export function SpecTableEditor({
  engine,
  adminAppBase,
}: {
  engine: RowEngine;
  // Passed through to the Settings tab, whose conflict banner links the colliding template. Loader data.
  adminAppBase: string;
}) {
  // Freeze the whole editor card while a save is in flight. `inert` blocks pointer/keyboard/focus
  // across the subtree and removes it from the tab order + a11y tree, so the merchant can't keep
  // editing into an in-flight save (those edits would be lost). Set imperatively, not as JSX: on React
  // 18 `inert` isn't a managed prop, and since it's an HTML boolean attribute, rendering `inert="false"`
  // would STILL freeze the card. The App Bridge <SaveBar> portals OUTSIDE this wrapper, so its
  // Save/Discard stay interactive.
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
          preview={(view) => (
            <SpecTablePreview
              rows={engine.rows}
              styling={engine.styling}
              view={view}
            />
          )}
          stylePanel={<StyleTab engine={engine} />}
          settingsPanel={
            <SettingsTab engine={engine} adminAppBase={adminAppBase} />
          }
        />
      </div>

      {/* The Style rail's reset confirmation (feature 57 Step 12) — a sibling AFTER the freeze <div>
          like the SaveBar, so it outlives the tab switch that unmounts the rail its trigger lives in. */}
      <ResetStylingModal engine={engine} />

      {/* Tips footer (feature 32) — a sibling AFTER the freeze <div>, so it sits below the editor card
          and outside the save-freeze (tips stay usable during a save). */}
      <EditorTips />

      {/* The App Bridge contextual save bar (Step 9.5), at the wrapper level so the "Unsaved changes"
          state persists across tab switches (it portals to the admin top bar). Save persists to
          Postgres + the metaobject; Discard remounts the editor to the saved rows (disabled while
          saving so it can't tear down the in-flight fetcher). The Save button's `loading` / `disabled`
          pair comes from `saveBarSaveAttrs` — read its comment; these are NATIVE <button>s and a
          boolean `loading` is silently dropped by React 18. */}
      <SaveBar id={SAVE_BAR_ID} open={engine.isDirty}>
        <button
          variant="primary"
          onClick={engine.handleSave}
          {...saveBarSaveAttrs({
            saving: engine.saving,
            canSave: engine.canSave,
          })}
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
