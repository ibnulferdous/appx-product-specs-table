import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useId, useRef } from "react";
import { ACCENT_PRESETS } from "../../utils/stylePresets";
import { nextRovingIndex } from "../../utils/rovingRadioKeys";
import styles from "./AccentSwatchRow.module.css";

// The gallery's colour-theme swatch row (feature 93 · step 100; binding spec in features/100, design
// in 93). Seven options: "Theme" plus the six accents. Step 101 mounts this in the page header slot
// and wires it to the cards; this file owns the control and nothing about the page.
//
// Why not `SegmentedControl`: it's already a real WAI-ARIA radiogroup, but it can't be reused here —
// `SegOption.icon` is REQUIRED and typed to `<s-icon type>`'s union (no member carries a hex), and it
// imports the tripwired `SpecTableEditor.module.css`. Only the BEHAVIOUR is shared, and the shared
// part is extracted (`nextRovingIndex`), so the duplication here is React glue, not arithmetic.
//
// The palette lives in ACCENT_PRESETS and nowhere else: chip colours arrive as inline custom
// properties read off each bundle, never per-accent CSS classes (seven palette classes would be a
// second copy of merchant-approved data). A test asserts no hex literal appears in this file or its CSS.

/**
 * A colour-theme choice for the whole gallery.
 *
 * 🔴 `null` IS "Theme" — there is deliberately no `"theme"` token. Step 97 refused a seventh
 * `ACCENT_PRESETS` member with an empty bundle (a second way to express one state); a magic prop
 * string would reintroduce that. `null` is already what `findAccent` returns for an unknown token, so
 * one representation runs from the URL through these props to the colour columns.
 */
export function AccentSwatchRow({
  value,
  onChange,
}: {
  /** The selected accent id, or `null` for "Theme" (the pre-selected default). */
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  // "Theme" is a hardcoded FIRST option, not a data member. Its value is `null`, so the options list
  // and the prop share one vocabulary. ⚠️ Mapped from `ACCENT_PRESETS`, never hand-listed: swatch
  // order is merchant-facing and recorded in that array's literal order (Graphite leads as the
  // near-neutral one); enumerating them here would copy that decision into a second place.
  const options: ReadonlyArray<{
    id: string | null;
    label: string;
    fill?: string;
    ink?: string;
  }> = [
    // 🔴 "Your theme's colors", not "Theme" (2026-07-30). "Theme" was circular against the caption
    // ("Color theme"), restating the question instead of answering it. This states the outcome and
    // whose theme, matching the app's existing voice (the Blank card, the Style rail's empty swatches).
    // ⚠️ It is the accessible name as well as the tooltip (`aria-label` below). 📌 The lowercase
    // `"theme"` sentinel count in the contract test is unaffected (it matches `"theme"` WITH quotes).
    { id: null, label: "Your theme's colors" },
    ...ACCENT_PRESETS.map((accent) => ({
      id: accent.id,
      label: accent.label,
      // The two tones the chip shows. The band alone would be six near-white circles (every band tone
      // is >0.85 luminance), and the title alone would throw away the pairing — so the chip previews
      // both, from the accent's own bundle.
      fill: accent.bundle.headerBgColor ?? undefined,
      ink: accent.bundle.headerTextColor ?? undefined,
    })),
  ];

  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options.findIndex((option) => option.id === value);
  const tooltipBase = useId();

  // `interestFor` isn't in React's typings for a native <button>, so it's attached via a spread (JSX
  // spread skips excess-property checks). Same workaround as `SegmentedControl`.
  const interestProps = (key: string): Record<string, string> => ({
    interestFor: `${tooltipBase}-${key}`,
  });

  const moveTo = (index: number) => {
    onChange(options[index].id);
    buttonsRef.current[index]?.focus();
  };

  // 🔴 The ONLY place the string "theme" appears in this file (a test pins it appears once). `null`
  // isn't usable as a React key or element-id fragment, so the Theme option needs some DOM-level name;
  // naming it once, in a function whose return type is a DOM key rather than an accent id, keeps D1
  // checkable by counting.
  const domKey = (id: string | null) => id ?? "theme";

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next = nextRovingIndex(event.key, activeIndex, options.length);
    // 🔴 `next === null` must fall through untouched, and `!next` would NOT do: index 0 is falsy, so a
    // truthiness check would swallow every Home press and every wrap onto the first swatch.
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };

  return (
    // The visible caption doubles as the group's accessible name ("Color theme, radio group"). `useId`
    // over a hardcoded id because nothing stops a second row existing on a page later.
    //
    // 🔴 "Color", not "Colour" (2026-07-30). This was the ONLY merchant-facing British spelling in the
    // app; every Style-rail label reads `… color`, and Shopify's admin/Polaris/API are US English. ⚠️
    // Prose comments across the codebase still say "colour" — deliberately left alone (not
    // merchant-facing; a sweep would churn hundreds of lines to change nothing anyone sees).
    <div className={styles.row}>
      <span className={styles.caption} id={`${tooltipBase}-caption`}>
        Color theme
      </span>
      {/* A radiogroup container is intentionally NOT focusable — focus is managed by roving tabindex
          on the radios (WAI-ARIA APG), so the key handler lives on the buttons. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        role="radiogroup"
        aria-labelledby={`${tooltipBase}-caption`}
        className={styles.group}
      >
        {options.map((option, index) => {
          const isChecked = option.id === value;
          const key = domKey(option.id);
          return (
            <button
              key={key}
              ref={(element) => {
                buttonsRef.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isChecked}
              // The chip carries no text — the merchant is choosing a COLOUR they can see, and seven
              // labelled chips don't fit the header slot. So the label is the accessible name, with a
              // tooltip below for sighted mouse users.
              aria-label={option.label}
              {...interestProps(key)}
              // One tab stop for the whole group. Seven is the classic wrong build.
              tabIndex={isChecked ? 0 : -1}
              className={styles.swatch}
              onClick={() => onChange(option.id)}
              onKeyDown={handleKeyDown}
            >
              <span
                className={option.fill ? styles.chip : styles.chipTheme}
                // Inline custom properties, so the hexes stay in `ACCENT_PRESETS`. "Theme" sets
                // neither and takes the stylesheet's dashed neutral — the same vocabulary
                // `BlankStyleCard`'s dashed plate uses ("nothing added").
                style={
                  option.fill
                    ? ({
                        "--appx-chip-fill": option.fill,
                        "--appx-chip-ink": option.ink,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {/* 🔴 The non-colour half of the selected state (WCAG 1.4.1). This control's entire
                    content is colour, so a thicker ring in a different tone is a colour-only state.
                    The glyph plus the stylesheet's offset outline make the choice legible without hue.
                    ⚠️ `aria-checked` above does NOT cover this (it's for AT; this is for eyes).
                    `aria-hidden` because the radio already announces its checked state. */}
                {isChecked ? (
                  <span className={styles.check} aria-hidden="true">
                    &#10003;
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {/* Tooltips for the chips, kept OUTSIDE the radiogroup so they don't sit among the
          `role="radio"` children — `interestFor` references them by id, so their DOM position is free. */}
      {options.map((option) => (
        <s-tooltip
          key={domKey(option.id)}
          id={`${tooltipBase}-${domKey(option.id)}`}
        >
          {option.label}
        </s-tooltip>
      ))}
    </div>
  );
}
