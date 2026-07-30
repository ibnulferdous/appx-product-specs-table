import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useId, useRef } from "react";
import { ACCENT_PRESETS } from "../../utils/stylePresets";
import { nextRovingIndex } from "../../utils/rovingRadioKeys";
import styles from "./AccentSwatchRow.module.css";

// The gallery's colour-theme swatch row (feature 93 · step 100). Binding spec:
// `context/features/100-accent-swatch-row.md`; the design is
// `93-style-accent-themes.md`.
//
// Seven options: "Theme" plus the six accents. Step 101 mounts this in the page
// header slot `choose-style/route.tsx` reserved for it and wires it to the cards;
// this file owns the control and nothing about the page.
//
// --- Why not `SegmentedControl` ----------------------------------------------
//
// The editor's `SegmentedControl` is already a real WAI-ARIA radiogroup and its
// own comment warns against a divergent copy. It cannot be reused here for two
// reasons that are not taste: `SegOption.icon` is REQUIRED and typed to
// `<s-icon type>`'s union, so there is no member to carry a hex; and it imports
// the tripwired `SpecTableEditor.module.css`, which a swatch chip would have to
// change. Only the BEHAVIOUR is shared, and the shared part is extracted —
// `nextRovingIndex` — so the duplication here is React glue, not arithmetic. See
// doc 100's finding for why `SegmentedControl` is not switched over in this step.
//
// --- The palette lives in ACCENT_PRESETS and nowhere else --------------------
//
// Chip colours arrive as inline custom properties read off each bundle, never as
// per-accent CSS classes. Seven palette classes in a stylesheet would be a second
// copy of merchant-approved data, which is the same objection step 97 D4 raised
// against deriving the palette with `hsl()`. A test asserts no hex literal appears
// in this file or its stylesheet.

/**
 * A colour-theme choice for the whole gallery.
 *
 * 🔴 **`null` IS "Theme" — there is deliberately no `"theme"` token.** Step 97
 * refused a seventh `ACCENT_PRESETS` member with an empty bundle because it would
 * add a second way to express one state; a magic prop string would reintroduce
 * exactly that. `null` is already what `findAccent` returns for an unknown token
 * and what leaves all ten colour fields inheriting the storefront, so one
 * representation runs from the URL through these props to the colour columns.
 */
export function AccentSwatchRow({
  value,
  onChange,
}: {
  /** The selected accent id, or `null` for "Theme" (the pre-selected default). */
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  // "Theme" is a hardcoded FIRST option, not a data member — the UI fact step 97
  // said it was. Its value is `null`, so the options list and the prop share one
  // vocabulary and the row needs no translation layer.
  //
  // ⚠️ Mapped from `ACCENT_PRESETS`, never hand-listed. Swatch order is
  // merchant-facing and is recorded in that array's literal order (Graphite leads
  // because it is the near-neutral one, the closest of the six to "no accent");
  // enumerating them here would copy that decision into a second place nothing
  // keeps in agreement. Same rule the cards follow in `route.tsx`.
  const options: ReadonlyArray<{
    id: string | null;
    label: string;
    fill?: string;
    ink?: string;
  }> = [
    // 🔴 **"Your theme's colors", not "Theme" (2026-07-30).** The original label
    // was circular against the caption beside it — the group reads "Color theme"
    // and the first chip read "Theme", so the tooltip restated the question
    // instead of answering it, and never said what picking it would DO.
    //
    // This label states the outcome and says WHOSE theme, which "Theme" and
    // "Theme's default" both leave open (the app's? the store's?). It is also the
    // app's existing voice for this exact idea: the Blank card next door says
    // "Start with your theme's own styles — nothing added", and the Style rail's
    // empty swatches say "inherit that color from your theme".
    //
    // ⚠️ It is the accessible name as well as the tooltip (`aria-label` below
    // takes the same string), so the improvement is not only for sighted users —
    // a screen reader now announces "Your theme's colors, selected" rather than
    // "Theme, selected" inside a group named "Color theme".
    //
    // 📌 The lowercase `"theme"` sentinel count in the contract test is unaffected:
    // it matches the literal `"theme"` WITH its quotes, and this string has none.
    { id: null, label: "Your theme's colors" },
    ...ACCENT_PRESETS.map((accent) => ({
      id: accent.id,
      label: accent.label,
      // The two tones the chip shows. Six chips filled with the band alone would
      // be six near-white circles (every band tone is above 0.85 luminance), and
      // the title alone would throw away the pairing the merchant is choosing —
      // so the chip previews both, from the accent's own bundle.
      fill: accent.bundle.headerBgColor ?? undefined,
      ink: accent.bundle.headerTextColor ?? undefined,
    })),
  ];

  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = options.findIndex((option) => option.id === value);
  const tooltipBase = useId();

  // `interestFor` is not in React's typings for a native <button>, so it is
  // attached via a spread — JSX spread skips excess-property checks. Same
  // workaround, for the same reason, as `SegmentedControl`; writing it as a plain
  // attribute is a TS2322 on the whole element.
  const interestProps = (key: string): Record<string, string> => ({
    interestFor: `${tooltipBase}-${key}`,
  });

  const moveTo = (index: number) => {
    onChange(options[index].id);
    buttonsRef.current[index]?.focus();
  };

  // 🔴 The ONLY place the string "theme" appears in this file, and a test pins that
  // it appears exactly once. `null` is not usable as a React key or as an element-id
  // fragment, so the Theme option needs *some* DOM-level name — but every extra
  // `?? "theme"` is a place a sentinel could quietly become a VALUE instead of a
  // label. Naming it once, in a function whose return type is a DOM key rather than
  // an accent id, keeps D1 checkable by counting.
  const domKey = (id: string | null) => id ?? "theme";

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next = nextRovingIndex(event.key, activeIndex, options.length);
    // 🔴 `next === null` must fall through untouched, and `!next` would NOT do:
    // index 0 is falsy, so a truthiness check would swallow every Home press and
    // every wrap onto the first swatch. The null check is the difference between
    // Tab leaving the group and Tab being eaten.
    if (next === null) return;
    event.preventDefault();
    moveTo(next);
  };

  return (
    // The visible caption doubles as the group's accessible name, so a screen
    // reader announces "Color theme, radio group" rather than an unnamed group of
    // seven. `useId` over a hardcoded id because nothing stops a second row
    // existing on a page later.
    //
    // 🔴 **"Color", not "Colour" (2026-07-30).** This string shipped in the
    // British spelling and was the ONLY merchant-facing one in the app that did:
    // every label in the Style rail already reads `Title color`, `Divider color`,
    // `Outline color`, `Text color`, `Underline color`. Shopify's admin, Polaris
    // and the Admin API are US English throughout (`color` is the field name on
    // the platform side too), so a lone "Colour" beside them read as a typo rather
    // than as a house style. ⚠️ Prose comments across the codebase still say
    // "colour" — deliberately left alone, since they are not merchant-facing and a
    // sweep would churn hundreds of lines to change nothing anyone sees.
    <div className={styles.row}>
      <span className={styles.caption} id={`${tooltipBase}-caption`}>
        Color theme
      </span>
      {/* A radiogroup container is intentionally NOT focusable — focus is managed
          by roving tabindex on the radios (WAI-ARIA APG), so the key handler lives
          on the buttons. Same shape as the editor's `SegmentedControl`. */}
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
              // The chip carries no text — the merchant is choosing a COLOUR,
              // which they can see, and seven labelled chips do not fit the page
              // header slot. So the label is the accessible name, exactly as the
              // editor's icon-only segments do it, with a tooltip below for
              // sighted mouse users.
              aria-label={option.label}
              {...interestProps(key)}
              // One tab stop for the whole group. Seven is the classic wrong
              // build of this control.
              tabIndex={isChecked ? 0 : -1}
              className={styles.swatch}
              onClick={() => onChange(option.id)}
              onKeyDown={handleKeyDown}
            >
              <span
                className={option.fill ? styles.chip : styles.chipTheme}
                // Inline custom properties, so the hexes stay in
                // `ACCENT_PRESETS`. "Theme" sets neither and takes the
                // stylesheet's dashed neutral instead — the same vocabulary
                // `BlankStyleCard`'s dashed plate uses, because the two mean the
                // same thing ("nothing added") in two places.
                style={
                  option.fill
                    ? ({
                        "--appx-chip-fill": option.fill,
                        "--appx-chip-ink": option.ink,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                {/* 🔴 The non-colour half of the selected state (WCAG 1.4.1).
                    This control's entire content is colour, so "the one with a
                    thicker ring in a slightly different tone" is a colour-only
                    state — unusable for a merchant with low colour
                    discrimination. The glyph plus the stylesheet's offset outline
                    are what make the choice legible without hue.

                    ⚠️ `aria-checked` above does NOT cover this. It is for
                    assistive tech; this is for eyes. Two requirements, and
                    satisfying one is not evidence about the other.

                    `aria-hidden` because the radio already announces its checked
                    state — exposing the glyph would add a second, redundant
                    announcement of the same fact. */}
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
      {/* Tooltips for the chips, kept OUTSIDE the radiogroup so they do not sit
          among the `role="radio"` children — `interestFor` references them by id,
          so their DOM position is free. Same arrangement as `SegmentedControl`. */}
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
