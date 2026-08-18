import type {
  ComponentProps,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useId, useRef } from "react";
import styles from "./SpecTableEditor.module.css";

// The editor's segmented control (reshell A2). Its own module rather than inside `EditorShell.tsx` so
// every segmented group is one control — the tab group and the device toggle are the same radiogroup
// with different options. IMPORTS the tripwired `SpecTableEditor.module.css` (`.segGroup` / `.segBtn`)
// but never edits it.

// The icon-name union accepted by <s-icon type>, derived from the element's own props so the options
// stay in lockstep with Polaris (no separate import, no drift).
export type SIconType = NonNullable<ComponentProps<"s-icon">["type"]>;

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon: SIconType;
  // Icon-only segments hide the visible label but keep it as the button's accessible name.
  hideLabel?: boolean;
}

// A single-select segmented control. <s-button-group> renders no slot
// ([[polaris-web-component-gotchas]]), so the segments are plain <button>s; the track + active pill
// come from <s-box> background tokens (`subdued` / `base`), no hardcoded color. A real WAI-ARIA
// radiogroup: roving tabindex, arrows / Home / End move and check the focused segment.
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

  // Stable, instance-unique prefix so two SegmentedControls don't collide on tooltip ids. Only
  // `hideLabel` (icon-only) segments get a tooltip — labelled ones already show their text.
  const tooltipBase = useId();
  // `interestFor` isn't in React's typings for a native <button>, so attach it via a spread. Empty
  // object for labelled segments leaves the button untouched.
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
      {/* A radiogroup container is intentionally NOT focusable — focus is managed by roving tabindex
          on the radios (WAI-ARIA APG), so the key handler lives on the buttons. */}
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
              // Icon-only segments point at a sibling <s-tooltip> for sighted mouse users (the
              // aria-label covers AT). `interestFor` is the same invoker family as `commandFor`.
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
      {/* Tooltips for the icon-only segments, kept OUTSIDE the radiogroup so they don't sit among the
          role="radio" children; `interestFor` references them by id, so their DOM position is free. */}
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
