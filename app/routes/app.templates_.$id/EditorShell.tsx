import type { CSSProperties, ReactNode } from "react";
import { useRef, useState } from "react";
import { isPreviewView, type DeviceView, type ViewId } from "./deviceView";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
import { SegmentedControl, type SegOption } from "./SegmentedControl";
import { PreviewModal } from "./PreviewModal";
import { PREVIEW_MODAL_ID } from "./editorShared";
import {
  DEFAULT_VIEW_MEMORY,
  rememberView,
  setPreviewDevice,
  viewAnnouncement,
  viewForTab,
  type TabId,
  type ViewMemory,
} from "./tabViewMemory";
import styles from "./SpecTableEditor.module.css";
import shellStyles from "./EditorShell.module.css";

// The mockup's editor card (design/spec-editor-mockup.html → `.editor`): a
// full-bleed Polaris card with a control row (segmented tabs + device toggle)
// above a stage-wrap (a sidebar shown only on Style/Settings + the always-present
// stage). This component is PRESENTATIONAL — it owns only `activeTab`/`activeView`
// and renders slots. The editing engine is wired one level up by the
// `SpecTableEditor` wrapper (`stage={<ContentTab engine={engine} />}`); the shell
// itself never touches the engine. See
// `context/features/16-reshell-a2-editor-shell.md` and
// `context/features/18-reshell-a1-extract-row-engine.md`.

const TABS: ReadonlyArray<SegOption<TabId>> = [
  { value: "content", label: "Content", icon: "compose" },
  { value: "style", label: "Style", icon: "paint-brush-flat" },
  { value: "settings", label: "Settings", icon: "settings" },
];

// The standard clip-rect visually-hidden recipe, inline rather than a CSS-module
// class on purpose: Step 11's definition of done requires
// `SpecTableEditor.module.css` to diff clean against the Step 10 sign-off, which
// is the tripwire that stops this step quietly becoming the withdrawn one. A
// live region is not a style, so it does not earn an exception.
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
  // The Content stage (the grid). In the sandbox this is a dummy static grid; at
  // A1 it becomes the engine-driven <ContentTab>. A presentational slot — never
  // the engine itself.
  stage: ReactNode;
  // The read-only device preview slot (feature 49). Rendered in place of `stage`
  // whenever a device view is active; receives the active device view so the
  // preview can size itself. Optional + a `stage` fallback, so the toggle stays
  // harmless when no preview is wired.
  //
  // Feature 75 adds the optional second argument: the full-size preview modal
  // renders this SAME slot, but its height budget cannot come from
  // `useScrollRegionHeight` (an element-top → iframe-bottom measurement is
  // meaningless inside a centred dialog), so it passes one in. Omitted by the
  // card, which keeps measuring itself.
  preview?: (
    view: DeviceView,
    options?: { availableHeight?: number },
  ) => ReactNode;
  // Reserved for Phase B / C. Undefined in A2 → an empty placeholder renders.
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
  // Feature 57 · Step 11: the active view is DERIVED from the active tab
  // (`tabViewMemory.ts`) — its edit-or-preview mode, resolved against the shared
  // preview device. Opening Style therefore lands on a preview — the only surface
  // that shows styling — without disabling or hiding the view control, and without
  // re-overriding a merchant who chose Edit there last time. The device is shared,
  // so picking Mobile on one tab moves every previewing tab to Mobile. In-memory
  // only: a reload returns to Content/`edit`/`desktop`.
  const [viewMemory, setViewMemory] = useState<ViewMemory>(DEFAULT_VIEW_MEMORY);
  const activeView = viewForTab(viewMemory, activeTab);

  // Announced only when a TAB switch moved the view under the merchant. A view
  // the merchant clicked themselves announces via the radio's own state change.
  const [announcement, setAnnouncement] = useState("");

  const handleTabChange = (next: TabId) => {
    setActiveTab(next);
    const nextView = viewForTab(viewMemory, next);
    setAnnouncement(nextView === activeView ? "" : viewAnnouncement(nextView));
  };

  const handleViewChange = (next: ViewId) => {
    setViewMemory((memory) => rememberView(memory, activeTab, next));
    setAnnouncement("");
  };

  // The full-size modal's device toggle (feature 75). It belongs to no tab, so it
  // moves ONLY the shared device — `rememberView` would additionally flip the
  // active tab into `preview`, stranding Content on a read-only preview once the
  // modal closed.
  const handleModalDeviceChange = (next: DeviceView) => {
    setViewMemory((memory) => setPreviewDevice(memory, next));
  };

  // Tabs reveal/hide the sidebar; they never replace the stage (mirrors the
  // mockup). The device toggle drives the stage content (feature 49): on a device
  // view the stage renders the read-only `preview` slot instead of the editable
  // `stage`; `edit` keeps the editor. Previews replace the STAGE only — the
  // sidebar's show/hide stays governed by `activeTab`, unchanged.
  const showSidebar = activeTab !== "content";
  const sidebarContent = activeTab === "style" ? stylePanel : settingsPanel;
  const stageContent = isPreviewView(activeView)
    ? (preview?.(activeView) ?? stage)
    : stage;

  // Bound the Style/Settings rail to the remaining iframe viewport so ONLY the
  // rail scrolls — the preview beside it stays in view instead of the whole admin
  // iframe scrolling the preview off-screen. Reuses the Content tab's A3 measurer
  // (`useScrollRegionHeight`): it clamps `railRef`'s top → viewport bottom and
  // returns the px applied inline below, while `.railScroller` supplies the scroll
  // + floor. Called unconditionally (rules of hooks); it no-ops until `railRef` is
  // mounted, i.e. only on the Style/Settings tabs. The `showSidebar` re-measure key
  // makes it clamp the moment the rail appears.
  const railRef = useRef<HTMLDivElement>(null);
  const railMaxHeight = useScrollRegionHeight(railRef, showSidebar ? 1 : 0);

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
          <SegmentedControl
            ariaLabel="Editor tab"
            options={TABS}
            value={activeTab}
            onChange={handleTabChange}
          />
          {/* The device toggle and the full-size trigger are wrapped as ONE
              flex child. `.controlrow` is `justify-content: space-between` with
              exactly two children, so adding a third would strand the toggle in
              the middle of the row — and that rule lives in the tripwired
              `SpecTableEditor.module.css`, which this feature must not edit. */}
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <SegmentedControl
              ariaLabel="Preview device"
              options={VIEWS}
              value={activeView}
              onChange={handleViewChange}
            />
            {/* Opens the full-size preview (feature 75). NOT a fourth segment of
                the radiogroup above — it is an action, not a view, and putting it
                inside `role="radiogroup"` would corrupt the radio semantics.
                Declarative `commandFor` / `command`, so the shell needs no
                App Bridge import: nothing has to be prepared before it opens.
                Shown on every tab and view — "show me how this looks" is
                reasonable while editing rows too. */}
            <s-button
              variant="tertiary"
              icon="maximize"
              accessibilityLabel="Open full-size preview"
              commandFor={PREVIEW_MODAL_ID}
              command="--show"
            ></s-button>
          </s-stack>
        </div>
      </s-box>

      {/* Polite live region for a view change the merchant did NOT click (a tab
          switch moving the stage under them). Visually hidden — the segmented
          control already shows the change to sighted users. Kept OUTSIDE the
          control row so it never affects that layout. */}
      <div aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN}>
        {announcement}
      </div>

      <s-divider></s-divider>

      {/* Stage-wrap: the 300px sidebar shows only on Style/Settings; the stage is
          always present. The `subdued` sidebar reads as a distinct panel against
          the `base` stage with no border needed. */}
      {showSidebar ? (
        <s-grid gridTemplateColumns="18.75rem 1fr">
          {/* A named LANDMARK, not just a grey box (feature 57 Step 12). Sighted
              users read "controls left, table right" instantly from the
              background and position; without a region role there is nothing for
              a screen-reader user to jump to and no way to skip past the rail to
              reach the table — it is an unannounced run of controls that just
              ends. One box sits behind BOTH tabs, so this lands for Settings too;
              that is deliberate and recorded in the tracker so Phase C neither
              redoes it nor reads it as "Settings a11y is handled." */}
          <s-box
            background="subdued"
            padding="base"
            // The ONE side the box does not own: the scroller below owns its
            // inline-end gutter instead, so its scrollbar rides the panel's real
            // right edge rather than floating 1rem inside it. See the
            // `.railScroller` comment for why the padding has to move rather
            // than the scrollbar.
            paddingInlineEnd="none"
            accessibilityRole="region"
            accessibilityLabel={activeTab === "style" ? "Style" : "Settings"}
          >
            {/* The rail scrolls internally (see `railMaxHeight` above) so the long
                Style controls never push the preview out of view. The landmark
                stays on the `s-box`; the scroll and the inline-end gutter live
                on this div. */}
            <div
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

      {/* The full-size preview (feature 75). Mounted here rather than in
          `SpecTableEditor` because the shared device it toggles lives in this
          component's state; `EditorShell` never unmounts while the editor is
          open, and an <s-modal> portals outside the editor's inert save-freeze
          anyway (see ResetStylingModal). Still PRESENTATIONAL — it reaches the
          live rows/styling only through the same `preview` render prop the stage
          uses, so the shell keeps its hands off the engine. */}
      <PreviewModal
        device={viewMemory.device}
        onDeviceChange={handleModalDeviceChange}
        preview={preview}
      />
    </s-box>
  );
}

// A2 placeholder for the Style / Settings sidebar. Real controls land in Phases
// B / C; until then the slot just names the tab so the reveal/hide is visible.
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
