import type { CSSProperties, ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { isPreviewView, type DeviceView, type ViewId } from "./deviceView";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
import { SegmentedControl, type SegOption } from "./SegmentedControl";
import { RAIL_REGION_ID, railToggleLabel, type RailTab } from "./editorShared";
import {
  DEFAULT_VIEW_MEMORY,
  rememberView,
  viewAnnouncement,
  viewForTab,
  type TabId,
  type ViewMemory,
} from "./tabViewMemory";
import styles from "./SpecTableEditor.module.css";
import shellStyles from "./EditorShell.module.css";

// The mockup's editor card: a full-bleed Polaris card with a control row (segmented tabs + device
// toggle) above a stage-wrap (a sidebar shown only on Style/Settings + the always-present stage).
// PRESENTATIONAL — it owns only `activeTab`/`activeView` and renders slots; the editing engine is
// wired one level up by `SpecTableEditor`. (features/16, features/18)

const TABS: ReadonlyArray<SegOption<TabId>> = [
  { value: "content", label: "Content", icon: "compose" },
  { value: "style", label: "Style", icon: "paint-brush-flat" },
  { value: "settings", label: "Settings", icon: "settings" },
];

// The clip-rect visually-hidden recipe, inline rather than a CSS-module class on purpose: Step 11's
// DoD requires `SpecTableEditor.module.css` to diff clean against the Step 10 sign-off (the tripwire
// that stops this step becoming the withdrawn one). A live region is not a style.
const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

const VIEWS: ReadonlyArray<SegOption<ViewId>> = [
  { value: "edit", label: "Edit", icon: "edit" },
  { value: "desktop", label: "Desktop", icon: "desktop", hideLabel: true },
  { value: "mobile", label: "Mobile", icon: "mobile", hideLabel: true },
];

interface EditorShellProps {
  // The Content stage (the grid) — the engine-driven <ContentTab>. A presentational slot.
  stage: ReactNode;
  // The read-only device preview slot (feature 49), rendered in place of `stage` on a device view.
  // Optional + a `stage` fallback, so the toggle stays harmless when no preview is wired.
  preview?: (view: DeviceView) => ReactNode;
  // The Style / Settings rail slots; undefined → an empty placeholder renders.
  stylePanel?: ReactNode;
  settingsPanel?: ReactNode;
}

export function EditorShell({
  stage,
  preview,
  stylePanel,
  settingsPanel,
}: EditorShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("content");
  // Feature 57 · Step 11: the active view is DERIVED from the active tab (`tabViewMemory.ts`) — its
  // edit-or-preview mode, resolved against the shared device. Opening Style lands on a preview (the
  // only surface that shows styling) without disabling the view control or re-overriding a merchant's
  // last Edit choice there. In-memory only: a reload returns to Content/`edit`/`desktop`.
  const [viewMemory, setViewMemory] = useState<ViewMemory>(DEFAULT_VIEW_MEMORY);
  const activeView = viewForTab(viewMemory, activeTab);

  // Announced only when a TAB switch moved the view under the merchant. A view
  // the merchant clicked themselves announces via the radio's own state change.
  const [announcement, setAnnouncement] = useState("");

  // Feature 76: is the rail collapsed to zero width? ONE boolean shared by both tabs (the rail is a
  // single surface; per-tab collapse memory is state the merchant never asked for). In-memory only, so
  // a reload returns to an expanded rail — a merchant who collapses it and forgets can't get stuck.
  const [railCollapsed, setRailCollapsed] = useState(false);

  const handleTabChange = (next: TabId) => {
    setActiveTab(next);
    const nextView = viewForTab(viewMemory, next);
    setAnnouncement(nextView === activeView ? "" : viewAnnouncement(nextView));
  };

  const handleViewChange = (next: ViewId) => {
    setViewMemory((memory) => rememberView(memory, activeTab, next));
    setAnnouncement("");
  };

  // Tabs reveal/hide the sidebar; they never replace the stage. The device toggle drives the stage
  // content (feature 49): a device view renders the read-only `preview` slot instead of `stage`;
  // `edit` keeps the editor. Previews replace the STAGE only. `railTab` is `activeTab` narrowed to the
  // tabs that have a rail, so the toggle's label helper is total over its domain (feature 76).
  const railTab: RailTab | null = activeTab === "content" ? null : activeTab;
  const showSidebar = railTab !== null;
  const sidebarContent = activeTab === "style" ? stylePanel : settingsPanel;
  const stageContent = isPreviewView(activeView)
    ? (preview?.(activeView) ?? stage)
    : stage;

  // Bound the rail to the remaining iframe viewport so ONLY the rail scrolls (the preview beside it
  // stays in view). Reuses the Content tab's A3 measurer (`useScrollRegionHeight`); `.railScroller`
  // supplies the scroll + floor. Called unconditionally; no-ops until `railRef` is mounted. The key
  // includes `railCollapsed` (feature 76) because the rail is HIDDEN, not unmounted: a measurement
  // while collapsed reads `top: 0` and yields a stale-wrong `maxHeight`. The effect re-runs after
  // commit, so the first measurement on expand is taken against settled layout.
  const railRef = useRef<HTMLDivElement>(null);
  const railMaxHeight = useScrollRegionHeight(
    railRef,
    showSidebar && !railCollapsed ? 1 : 0,
  );

  // Stable, instance-unique id linking the rail toggle to its <s-tooltip>, so a sighted mouse user
  // gets the same label the aria-label gives AT (matches SegmentedControl's device-toggle tooltips).
  const railToggleTooltipId = useId();

  return (
    <s-box
      background="base"
      border="base"
      borderRadius="large"
      overflow="hidden"
    >
      {/* Control row: tabs pinned left, device toggle pinned right. */}
      <s-box background="subdued" padding="small-300">
        <div className={styles.controlrow}>
          {/* The tab group and the rail toggle are wrapped as ONE flex child: `.controlrow` is
              `space-between` with exactly two children, so a third would strand the device toggle in
              the middle — and that rule lives in the tripwired `SpecTableEditor.module.css`. */}
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <SegmentedControl
              ariaLabel="Editor tab"
              options={TABS}
              value={activeTab}
              onChange={handleTabChange}
            />
            {/* Collapses the rail to zero width (feature 76), handing the stage the full editor card so
                the Desktop preview clears the storefront's 749px breakpoint. Beside the tabs: they
                choose WHICH rail shows, this chooses WHETHER — and the rail collapses to nothing, so
                there's no strip for the button to live in. One STABLE icon in a FIXED position, in both
                states (a moving/swapping toggle is one you have to re-find and is ambiguous about
                state-vs-action). Rendered only where a rail exists.

                A plain <button> rather than an `<s-button variant="tertiary">` (what it started as):
                the host `<s-button>` carries NO role and forwards only `accessibilityLabel` to its
                shadow `<button>` — `aria-expanded`/`aria-controls` are dropped, so an s-button toggle's
                state would exist for sighted users only. `.segBtn` is the same chrome-reset +
                `:focus-visible` ring the tab segments use, imported from the tripwired module, and the
                nested `<s-box>` supplies the hit area. (features/76 Step 0.2) */}
            {railTab ? (
              <>
                <button
                  type="button"
                  className={styles.segBtn}
                  aria-label={railToggleLabel(railTab, railCollapsed)}
                  aria-expanded={!railCollapsed}
                  aria-controls={RAIL_REGION_ID}
                  // Points at the sibling <s-tooltip> for a sighted mouse user (the aria-label covers
                  // AT). `interestFor` isn't in React's typings for a native <button>, so it's spread in.
                  {...({ interestFor: railToggleTooltipId } as Record<
                    string,
                    string
                  >)}
                  onClick={() => setRailCollapsed((collapsed) => !collapsed)}
                >
                  <s-box
                    borderRadius="base"
                    paddingBlock="small-300"
                    paddingInline="small-200"
                  >
                    {/* Presentational: the button is already named by its `aria-label`. */}
                    <s-icon
                      type="layout-sidebar-left"
                      aria-hidden="true"
                    ></s-icon>
                  </s-box>
                </button>
                {/* Same copy as the aria-label; flips Show/Hide with the state. */}
                <s-tooltip id={railToggleTooltipId}>
                  {railToggleLabel(railTab, railCollapsed)}
                </s-tooltip>
              </>
            ) : null}
          </s-stack>
          <SegmentedControl
            ariaLabel="Preview device"
            options={VIEWS}
            value={activeView}
            onChange={handleViewChange}
          />
        </div>
      </s-box>

      {/* Polite live region for a view change the merchant did NOT click (a tab switch moving the
          stage). Visually hidden; kept OUTSIDE the control row so it never affects that layout. */}
      <div aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
        {announcement}
      </div>

      <s-divider></s-divider>

      {/* Stage-wrap: the 300px sidebar shows only on Style/Settings; the stage is always present.
          ⚠️ The grid template and the rail's hide class MUST move together (feature 76): `display: none`
          drops the rail as a grid ITEM, so leaving the template at `18.75rem 1fr` while hiding the rail
          would render the STAGE inside the 300px column. */}
      {showSidebar ? (
        <s-grid gridTemplateColumns={railCollapsed ? "1fr" : "18.75rem 1fr"}>
          {/* A named LANDMARK, not just a grey box (feature 57 Step 12): without a region role a
              screen-reader user has nothing to jump to and no way to skip past the rail to the table.
              One box sits behind BOTH tabs, so this lands for Settings too (recorded in the tracker so
              Phase C neither redoes it nor reads it as "handled"). */}
          <s-box
            // Hidden, NOT unmounted (feature 76), so the rail's React state survives: StyleTab's
            // collapsible sections keep their open/closed state and the scroller keeps its offset. The
            // `display: none` hangs off this attribute rather than a class because Polaris's JSX types
            // reject `className` on an `<s-box>`. Absent, never `"false"` — the selector matches on presence.
            data-appx-rail-collapsed={railCollapsed ? "" : undefined}
            background="subdued"
            padding="base"
            // The ONE side the box doesn't own: the scroller below owns its inline-end gutter, so its
            // scrollbar rides the panel's real right edge rather than floating 1rem inside it.
            paddingInlineEnd="none"
            accessibilityRole="region"
            accessibilityLabel={activeTab === "style" ? "Style" : "Settings"}
          >
            {/* The rail scrolls internally (see `railMaxHeight`) so the long Style controls never push
                the preview out of view. The landmark stays on the `s-box`; the scroll + gutter here. */}
            <div
              id={RAIL_REGION_ID}
              ref={railRef}
              className={shellStyles.railScroller}
              style={{ maxHeight: railMaxHeight }}
            >
              {sidebarContent ?? (
                <SidebarPlaceholder
                  label={activeTab === "style" ? "Style" : "Settings"}
                />
              )}
            </div>
          </s-box>
          <s-box>{stageContent}</s-box>
        </s-grid>
      ) : (
        <s-box>{stageContent}</s-box>
      )}
    </s-box>
  );
}

// A2 placeholder for the Style / Settings sidebar, shown when a panel slot is unwired.
function SidebarPlaceholder({ label }: { label: string }) {
  return (
    <s-stack direction="block" gap="small-200">
      <s-text type="strong">{label}</s-text>
      <s-text color="subdued">
        Controls for this tab arrive in a later step.
      </s-text>
    </s-stack>
  );
}
