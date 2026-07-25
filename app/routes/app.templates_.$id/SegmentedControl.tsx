import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useId, useRef } from "react";
import styles from "./SpecTableEditor.module.css";

// The editor's segmented control (reshell A2), extracted verbatim from
// `EditorShell.tsx` in feature 75 so the full-size preview modal's device toggle
// reuses this exact control instead of growing a second, divergent one. Pure
// move — no prop, markup, or behaviour change.
//
// It IMPORTS the tripwired `SpecTableEditor.module.css` (`.segGroup` / `.segBtn`)
// and does not edit it; importing that module is fine, changing it is not.

// The icon-name union accepted by <s-icon type>, derived from the element's own
// props so the segmented options stay in lockstep with Polaris (no separate
// import, no drift).
export type SIconType = NonNullable<ComponentProps<"s-icon">["type"]>;

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon: SIconType;
  // Icon-only segments (the device previews) hide the visible label but keep it
  // as the button's accessible name.
  hideLabel?: boolean;
}

// A single-select segmented control. <s-button-group> renders no slot
// ([[polaris-web-component-gotchas]]), so the segments are plain <button>s; the
// gray track + white active pill come from Polaris <s-box> background tokens
// (`subdued` track, `base` active pill) — no hardcoded color. Semantics are a
// real WAI-ARIA radiogroup: roving tabindex, with arrows / Home / End moving and
// checking the focused segment.
export function SegmentedControl<T extends string>({
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
