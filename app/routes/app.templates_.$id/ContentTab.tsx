import { MAX_TEMPLATE_ROWS } from "../../utils/rows";
import { RowActionsToolbar } from "./RowActionsToolbar";
import { RowGrid } from "./RowGrid";
import { InsertFieldModal } from "./InsertFieldModal";
import { PasteCapModal } from "./PasteCapModal";
import { BulkDeleteModal } from "./BulkDeleteModal";
import type { RowEngine } from "./useRowEngine";

// The Content stage hosted in the EditorShell's `stage` slot (reshell A1): the
// fixed action toolbar + the at-cap banner + the bounded rows scroller (or the
// empty state) + the Insert field modal. The outer <div onPaste> captures a bulk
// table paste over the whole Content subtree (Steps 12–13); the engine's
// skip-guards ignore field/modal targets, so a single-field paste is unaffected.
// Presentational — all state + handlers come from the engine.
export function ContentTab({ engine }: { engine: RowEngine }) {
  const { rows, atCap, handleContainerPaste } = engine;

  return (
    // Plain wrapper purely to capture a bulk table paste over the whole Content
    // subtree (Step 12). `onPaste` is not a typed prop on <s-stack>, and a plain
    // <div> gives full React ClipboardEvent typing; it adds no layout of its own.
    <div onPaste={handleContainerPaste}>
      <s-box padding="base">
        <s-stack direction="block" gap="base">
          <RowActionsToolbar engine={engine} />

          {atCap ? (
            <s-banner tone="warning">
              You’ve reached the {MAX_TEMPLATE_ROWS} row limit. Delete a row to
              make space.
            </s-banner>
          ) : null}

          {rows.length === 0 ? (
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-paragraph>
                No rows yet. Choose Add row to start building your spec table.
              </s-paragraph>
            </s-box>
          ) : (
            <RowGrid engine={engine} />
          )}

          <InsertFieldModal engine={engine} />
          <PasteCapModal engine={engine} />
          <BulkDeleteModal engine={engine} />
        </s-stack>
      </s-box>
    </div>
  );
}
