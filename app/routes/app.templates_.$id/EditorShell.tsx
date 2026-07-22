import type {
  ComponentProps,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useId, useRef, useState } from "react";
import { isPreviewView, type DeviceView, type ViewId } from "./deviceView";
import { useScrollRegionHeight } from "./useScrollRegionHeight";
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

// The mockup's editor card (design/spec-editor-mockup.html → `.editor`): a
// full-bleed Polaris card with a control row (segmented tabs + device toggle)
// above a stage-wrap (a sidebar shown only on Style/Settings + the always-present
// stage). This component is PRESENTATIONAL — it owns only `activeTab`/`activeView`
// and renders slots. The editing engine is wired one level up by the
// `SpecTableEditor` wrapper (`stage={<ContentTab engine={engine} />}`); the shell
// itself never touches the engine. See
// `context/features/16-reshell-a2-editor-shell.md` and
// `context/features/18-reshell-a1-extract-row-engine.md`.

// The icon-name union accepted by <s-icon type>, derived from the element's own
// props so the segmented options stay in lockstep with Polaris (no separate
// import, no drift).
type SIconType = NonNullable<ComponentProps<"s-icon">["type"]>;

interface SegOption<T extends string> {
  value: T;
  label: string;
  icon: SIconType;
  // Icon-only segments (the device previews) hide the visible label but keep it
  // as the button's accessible name.
  hideLabel?: boolean;
}

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

// A single-select segmented control. <s-button-group> renders no slot
// ([[polaris-web-component-gotchas]]), so the segments are plain <button>s; the
// gray track + white active pill come from Polaris <s-box> background tokens
// (`subdued` track, `base` active pill) — no hardcoded color. Semantics are a
// real WAI-ARIA radiogroup: roving tabindex, with arrows / Home / End moving and
// checking the focused segment.
function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options.findIndex((option) => option.value === value);

  // Stable, instance-unique prefix so two SegmentedControls on the page don't
  // collide on tooltip ids. Only `hideLabel` (icon-only) segments get a tooltip —
  // labelled segments already show their text, so a tooltip would be redundant.
  const tooltipBase = useId();
  // `interestFor` is not in React's typings for a native <button>, so attach it via
  // a spread (JSX spread skips excess-property checks). Empty object for labelled
  // segments leaves the button untouched.
  const interestProps = (option: SegOption<T>): Record<string, string> =>
    option.hideLabel ? { interestFor: `${tooltipBase}-${option.value}` } : {};

  const moveTo = (rawIndex: number) => {
    const count = options.length;
    const index = ((rawIndex % count) + count) % count;
    onChange(options[index].value);
    buttonsRef.current[index]?.focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(activeIndex + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(options.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <s-box background="subdued" borderRadius="base" padding="small-400">
      {/* A radiogroup container is intentionally NOT focusable — focus is managed
          by roving tabindex on the radios (WAI-ARIA APG), so the key handler lives
          on the buttons, not here. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div role="radiogroup" aria-label={ariaLabel} className={styles.segGroup}>
        {options.map((option, index) => {
          const isActive = option.value === value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={option.hideLabel ? option.label : undefined}
              // Icon-only segments point at a sibling <s-tooltip> so sighted mouse
              // users get the label on hover/focus (the aria-label already covers
              // assistive tech). `interestFor` is the same invoker family as the
              // `commandFor` this build already ships.
              {...interestProps(option)}
              tabIndex={isActive ? 0 : -1}
              className={styles.segBtn}
              onClick={() => onChange(option.value)}
              onKeyDown={handleKeyDown}
            >
              <s-box
                background={isActive ? "base" : "transparent"}
                borderRadius="base"
                paddingBlock="small-300"
                paddingInline="small-200"
              >
                <s-stack direction="inline" gap="small-300" alignItems="center">
                  <s-icon
                    type={option.icon}
                    color={isActive ? undefined : "subdued"}
                    aria-hidden="true"
                  ></s-icon>
                  {option.hideLabel ? null : (
                    <s-text color={isActive ? undefined : "subdued"}>
                      {option.label}
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            </button>
          );
        })}
      </div>
      {/* Tooltips for the icon-only segments. Kept OUTSIDE the radiogroup so they
          don't sit among the role="radio" children; `interestFor` on each button
          references these by id, so their DOM position is free. */}
      {options
        .filter((option) => option.hideLabel)
        .map((option) => (
          <s-tooltip key={option.value} id={`${tooltipBase}-${option.value}`}>
            {option.label}
          </s-tooltip>
        ))}
    </s-box>
  );
}

interface EditorShellProps {
  // The Content stage (the grid). In the sandbox this is a dummy static grid; at
  // A1 it becomes the engine-driven <ContentTab>. A presentational slot — never
  // the engine itself.
  stage: ReactNode;
  // The read-only device preview slot (feature 49). Rendered in place of `stage`
  // whenever a device view is active; receives the active device view so the
  // preview can size itself. Optional + a `stage` fallback, so the toggle stays
  // harmless when no preview is wired.
  preview?: (view: DeviceView) => ReactNode;
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
          <SegmentedControl
            ariaLabel="Preview device"
            options={VIEWS}
            value={activeView}
            onChange={handleViewChange}
          />
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
            accessibilityRole="region"
            accessibilityLabel={activeTab === "style" ? "Style" : "Settings"}
          >
            {/* The rail scrolls internally (see `railMaxHeight` above) so the long
                Style controls never push the preview out of view. The landmark +
                padding stay on the `s-box`; only the scroll lives on this div. */}
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
