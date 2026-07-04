import { TEMPLATE_STATUS_OPTIONS } from "../../utils/templateStatus";
import type { RowEngine } from "./useRowEngine";

// The editor's Settings-tab sidebar (feature 36). Presentational — it reads the
// live `status`/`setStatus` off the engine and renders the status <s-select>.
// Changing the status flips the engine's dirty flag (status rides the meta-JSON
// snapshot), which opens the contextual SaveBar; Save persists the new status to
// Postgres AND re-syncs the storefront metaobject (route action, unchanged).
//
// This panel renders in EditorShell's `settingsPanel` slot, INSIDE the editor's
// inert freeze wrapper (SpecTableEditor), so it is frozen with the rest of the
// editor during an in-flight save — no separate `saving` guard needed here.
//
// Note the division of labour with the header: the <s-badge> in the page header
// (TemplateHeaderActions) shows the PERSISTED loader status; this control shows the
// PENDING edit. They converge after Save + revalidation.
export function SettingsTab({ engine }: { engine: RowEngine }) {
  const { status, setStatus } = engine;

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Settings</s-text>
      <s-select
        label="Status"
        value={status}
        onChange={(event: Event) =>
          setStatus((event.currentTarget as unknown as { value: string }).value)
        }
      >
        {TEMPLATE_STATUS_OPTIONS.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>
      <s-text color="subdued">
        Active makes this table eligible to show on the storefront for its
        assigned products. Draft and Archived are hidden. Your change takes
        effect when you save.
      </s-text>
    </s-stack>
  );
}
