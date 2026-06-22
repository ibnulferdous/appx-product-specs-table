import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useRef, useState } from "react";
import styles from "./SpecTableEditor.module.css";

// The mockup's editor card (design/spec-editor-mockup.html → `.editor`): a
// full-bleed Polaris card with a control row (segmented tabs + device toggle)
// above a stage-wrap (a sidebar shown only on Style/Settings + the always-present
// stage). This component is PRESENTATIONAL — it owns only `activeTab`/`activeView`
// and renders slots. The editing engine is wired one level up (A1:
// `stage={<ContentTab engine={engine} />}`); the sandbox route passes a dummy
// stage so the chrome can be proven without the engine. See
// `context/features/16-reshell-a2-editor-shell.md`.

// The icon-name union accepted by <s-icon type>, derived from the element's own
// props so the segmented options stay in lockstep with Polaris (no separate
// import, no drift).
type SIconType = NonNullable<ComponentProps<"s-icon">["type"]>;

type TabId = "content" | "style" | "settings";
type ViewId = "edit" | "desktop" | "tablet" | "mobile";

interface SegOption<T extends string> {
  value: T;
  label: string;
  icon: SIconType;
  // Icon-only segments (the device previews) hide the visible label but keep it
  // as the button's accessible name.
  hideLabel?: boolean;
}

const TABS: ReadonlyArray<SegOption<TabId>> = [
  { value: "content", label: "Content", icon: "edit" },
  { value: "style", label: "Style", icon: "wand" },
  { value: "settings", label: "Settings", icon: "settings" },
];

const VIEWS: ReadonlyArray<SegOption<ViewId>> = [
  { value: "edit", label: "Edit", icon: "edit" },
  { value: "desktop", label: "Desktop", icon: "desktop", hideLabel: true },
  { value: "tablet", label: "Tablet", icon: "tablet", hideLabel: true },
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
    </s-box>
  );
}

interface EditorShellProps {
  // The Content stage (the grid). In the sandbox this is a dummy static grid; at
  // A1 it becomes the engine-driven <ContentTab>. A presentational slot — never
  // the engine itself.
  stage: ReactNode;
  // Reserved for Phase B / C. Undefined in A2 → an empty placeholder renders.
  stylePanel?: ReactNode;
  settingsPanel?: ReactNode;
}

export function EditorShell({
  stage,
  stylePanel,
  settingsPanel,
}: EditorShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>("content");
  const [activeView, setActiveView] = useState<ViewId>("edit");

  // Tabs reveal/hide the sidebar; they never replace the stage (mirrors the
  // mockup). The device toggle is visual-only in A2 — the stage does not yet
  // react to activeView (the read-only device previews are Phase D).
  const showSidebar = activeTab !== "content";
  const sidebarContent = activeTab === "style" ? stylePanel : settingsPanel;

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
            onChange={setActiveTab}
          />
          <SegmentedControl
            ariaLabel="Preview device"
            options={VIEWS}
            value={activeView}
            onChange={setActiveView}
          />
        </div>
      </s-box>

      <s-divider></s-divider>

      {/* Stage-wrap: the 300px sidebar shows only on Style/Settings; the stage is
          always present. The `subdued` sidebar reads as a distinct panel against
          the `base` stage with no border needed. */}
      {showSidebar ? (
        <s-grid gridTemplateColumns="18.75rem 1fr">
          <s-box background="subdued" padding="base">
            {sidebarContent ?? (
              <SidebarPlaceholder
                label={activeTab === "style" ? "Style" : "Settings"}
              />
            )}
          </s-box>
          <s-box>{stage}</s-box>
        </s-grid>
      ) : (
        <s-box>{stage}</s-box>
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
