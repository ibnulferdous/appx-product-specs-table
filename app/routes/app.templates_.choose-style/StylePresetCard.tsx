import { useId, useMemo } from "react";
import { Link } from "react-router";
import type { AccentPreset, StylePreset } from "../../utils/stylePresets";
import {
  galleryHref,
  presetHighlights,
  seedStylingFromPreset,
} from "../../utils/stylePresets";
import { renderSpecTablePreviewDocument } from "../app.templates_.$id/specTablePreviewHtml";
import { STYLE_PREVIEW_SAMPLE_ROWS } from "./sampleRows";
import styles from "./StylePresetCard.module.css";

// The style-preset gallery's cards (feature 88 · step 90; binding spec in features/90). Step 91 lays
// six of these out; this file owns one card and nothing about the page.
//
// Presets are CREATE-TIME ONLY, which is why both cards are LINKS INTO CREATION rather than pickers:
// there's no editor state to mutate, no selected state to hold, no way back once a template exists. A
// card's entire behaviour is its href.
//
// Why the pipeline, not a static thumbnail: the preview renders through
// `renderSpecTablePreviewDocument` — the same function the editor's device previews use, into the
// same sandboxed iframe. Zero drift against the storefront is that pipeline's whole reason, and a
// gallery is the worst place to lose it (a stale screenshot would keep promising a look the app no
// longer produces, and nothing would fail). The cost is five documents on one page (measured in 91).
//
// Scale, don't shrink: the frame is a REAL desktop-width table scaled down by CSS, not a table
// rendered into a 320px box (see the geometry note in the CSS module) — rendering narrow would trip
// the storefront's 749px mobile breakpoint and show all five cards in their identical phone form.
//
// Sandbox: `sandbox=""` — stricter than SpecTablePreview's `allow-scripts`, deliberately. These
// frames are a FIXED viewport that crops, so nothing reads a measured height and the shim (still in
// the shared document) never runs. The frame stays a unique opaque origin either way.

/**
 * Join the derived phrases into the card's one description string.
 *
 * 🔴 The spaces INSIDE a phrase are non-breaking, and that is the whole function (observed live
 * 2026-07-31). With ordinary spaces the browser breaks mid-phrase, so a wrapped line opens on a
 * fragment — the exact scanning this line exists to enable. The separator carries a non-breaking
 * space BEFORE the dot and an ordinary one after, so the only break opportunity is immediately after
 * a `·`; a wrapped line ends with its separator and the next begins on a whole phrase. `text-wrap:
 * balance` then distributes whole phrases between rows.
 *
 * ⚠️ A phrase wider than the card's 440px content box would overflow rather than break (the cost of
 * forbidding the break). The ≤96-char guard in `stylePresets.test.ts` bounds the line, but a
 * genuinely long new phrase is the thing to watch.
 *
 * 🚫 Not solved by wrapping each phrase in its own `<span white-space: nowrap>` — that breaks the
 * accessible name: `aria-describedby` concatenates TEXT CONTENT, and sibling spans have no space
 * between them (see the note at the render site).
 */
function highlightLine(phrases: readonly string[]): string {
  // ⚠️ Written as \u00a0 escapes, never literal non-breaking spaces: a raw U+00A0 is invisible in a
  // diff and indistinguishable from an ordinary space in an editor, so the one property this function
  // exists for would be unreviewable and deletable by accident.
  return phrases
    .map((phrase) => phrase.replace(/ /g, "\u00a0"))
    .join("\u00a0· ");
}

/** Everything both card shapes share: the frame, the name, the help text. */
function CardFrame({
  to,
  label,
  description,
  action,
  visual,
}: {
  to: string;
  label: string;
  /**
   * The ONE explanatory line under the name.
   *
   * 🔴 One line, not two. Until 2026-07-31 there were two (a hand-written `StylePreset.description`
   * and the derived `presetHighlights` readout) saying nearly the same thing in two ink tones, on a
   * page whose whole problem was six cards being hard to compare. The hand-written half went.
   *
   * ⚠️ A plain string rather than the highlight ARRAY because the two card shapes fill it differently
   * — the preset cards join their derived phrases, Blank passes a literal sentence. Taking the array
   * here would make Blank the special case in a component that exists precisely to have none.
   */
  description: string;
  /**
   * The call-to-action line. Per-card rather than one shared string because Blank is not a style, so
   * "Use this style" would be false on it.
   */
  action: string;
  /** The thumbnail or its stand-in. Decorative — the caller hides it from AT. */
  visual: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    // Accessible name is the LABEL alone, with the description associated as help text — not
    // concatenated into the name. Without the explicit `aria-labelledby` the anchor's name would be
    // its whole text content, read aloud twice (as name and as description).
    <Link
      to={to}
      className={styles.card}
      aria-labelledby={titleId}
      // 🔴 The description is the merchant's ENTIRE basis for choosing when they can't see the card:
      // the preview is `aria-hidden`, so this one string is all a screen-reader user gets. It must
      // never take the action line's `aria-hidden` treatment.
      aria-describedby={descriptionId}
    >
      {visual}
      <span className={styles.body}>
        <span className={styles.title} id={titleId}>
          {label}
        </span>
        {/* ⚠️ ONE text node, and on the preset cards the middle dots are IN it. `aria-describedby`
            concatenates text content, and `<span>A</span><span>B</span>` reads "AB", so chip spans
            would announce "Shaded section headersLine between rows". A CSS `::before` separator fails
            the other way (some AT reads generated content, some doesn't). Keeping the separator in the
            DOM makes eye and screen reader get the same string.
            🚫 NOT a `<ul>`: `.body` is a `<span>` (phrasing content, can't contain flow content);
            swapping it for a `<div>` would put a block element inside the anchor's flex column. */}
        <span className={styles.description} id={descriptionId}>
          {description}
        </span>
      </span>
      {/* The affordance, and 🔴 it is TEXT INSIDE THE ANCHOR — never a nested `<button>`/`<Link>`.
          Interactive content inside a link is invalid HTML and announces as a broken nested control;
          it would also give up the whole-card target. The preview is the thing being judged, so it
          has to be what you click (see `pointer-events: none` on the frame) — a real button would
          shrink the target to ~110×36 and leave the table inert under the pointer.
          Over hover: hover is invisible until you're on the card and absent on a touch admin; this
          says "a click starts a template", always, on every device.
          ⚠️ `aria-hidden` deliberately: the anchor already announces as a link named "Modern" (the
          role IS "this activates"), so exposing the line would add six identical strings for no
          information. Safe only because the accessible name comes from `aria-labelledby` above. */}
      <span className={styles.action} aria-hidden="true">
        {action}
        <span className={styles.actionArrow}>&rarr;</span>
      </span>
    </Link>
  );
}

/**
 * One of the five built-in patterns, previewed live in the merchant's chosen accent.
 *
 * Targets `/app/templates/new?style=<id>&accent=<id>`; steps 92 + 99 make both params seed the
 * scaffold and stamp `basedOnPreset`. The accent half is null until the swatch row is touched (93·101).
 */
export function StylePresetCard({
  preset,
  accent,
}: {
  preset: StylePreset;
  // The RESOLVED accent, not an id — the gallery already looked it up, and passing the id would make
  // all five cards repeat the lookup. `null` is "Theme".
  accent: AccentPreset | null;
}) {
  // 🔴 Resolved through `seedStylingFromPreset` — THE SAME FUNCTION THE LOADER USES
  // (`resolveGalleryParams`). The gallery's zero-drift promise in one line: if the card merged
  // bundle-and-accent its own way while the loader merged them another, the two could disagree and
  // NOTHING WOULD FAIL (no test compares a rendered preview to a seeded template). It replaced
  // `stylePresetValues(preset)`, provably the same value at `accent = null` (pinned by a test).
  //
  // Memoized so the document is built once per (pattern, accent) — five `srcDoc` strings are this
  // page's whole rendering cost, and recomputing reloads all five frames. 🔴 `accent` MUST be in the
  // deps or the swatches would highlight and the cards never change (the exact symptom this feature
  // prevents). Referentially stable: `ACCENT_PRESETS` holds frozen module-level objects.
  const document = useMemo(
    () =>
      renderSpecTablePreviewDocument(
        STYLE_PREVIEW_SAMPLE_ROWS,
        seedStylingFromPreset(preset.id, accent?.bundle),
      ),
    [preset, accent],
  );

  return (
    <CardFrame
      to={galleryHref({ preset: preset.id, accent: accent?.id ?? null })}
      label={preset.label}
      // 🔴 DERIVED from the bundle, never a stored sentence. `StylePreset.description` was hand-written
      // copy that could (and did) disagree with the bundle: Classic's read "a line between every row"
      // while its bundle shipped `STRIPES`, which paints no row lines. This line can't drift — it IS
      // the values. ⚠️ NOT memoised alongside `document`: it resolves six frozen fields into a short
      // array; a memo would cost more dependency-array surface than the work it skips.
      description={highlightLine(presetHighlights(preset))}
      action="Use this style"
      visual={
        // ⚠️ DECORATIVE and hidden from AT: a screen-reader user must hear the description, not the
        // fake sample's nine rows read five times over. `tabIndex={-1}` goes with it (an iframe is
        // focusable by default, so hiding it from AT without removing it from the tab order would
        // leave a keyboard user stopping on a frame that announces nothing). `title` is present in
        // case `aria-hidden` is ever removed (and jsx-a11y requires it); `aria-hidden` wins today.
        <span className={styles.preview} aria-hidden="true">
          <iframe
            className={styles.frame}
            title={`${preset.label} preview`}
            sandbox=""
            srcDoc={document}
            tabIndex={-1}
          ></iframe>
        </span>
      }
    />
  );
}

/**
 * The sixth card: start with no pattern at all.
 *
 * ⚠️ Blank is NOT a `StylePreset` and must never be faked into one. Its output is byte-identical to
 * Modern's (`DEFAULT_STYLING_VALUES` already IS the banded pattern), so it's modelled as the ABSENCE
 * of a preset: no bundle, no `?style=` param, `basedOnPreset` left null. With the gallery unskippable,
 * that null means "chose Blank".
 *
 * It renders no preview: two pixel-identical thumbnails read as a bug, and the card offers a different
 * KIND of choice, which the plain dashed plate says.
 *
 * 🔴 It takes no `accent` prop, and its href is a LITERAL rather than a `galleryHref` call — the only
 * place doc 93 §D4 is enforced. Blank's copy is "start with your theme's own styles — nothing added",
 * and an accent would add five colours and make that false, where the merchant couldn't see it coming
 * (the one card with no preview). Step 99 left `resolveGalleryParams` TOTAL, so the decision lives
 * here in the href. The literal is kept so no accent can be threaded in by a later edit.
 */
export function BlankStyleCard() {
  return (
    <CardFrame
      to="/app/templates/new"
      label="Blank"
      // 🔴 The one card whose line is still a written SENTENCE, and the only one that may be: Blank has
      // no bundle to derive from, and deriving from `DEFAULT_STYLING_VALUES` would print Modern's exact
      // line on the card meaning "no pattern was chosen". 📌 Also the reason `CardFrame` takes a string
      // rather than the highlight array — this card just fills the slot from somewhere else.
      description="Start with your theme's own styles — nothing added."
      // ⚠️ NOT "Use this style". Blank is the absence of a preset, so the line names what happens.
      action="Start blank"
      visual={
        <span className={styles.blankPlate} aria-hidden="true">
          +
        </span>
      }
    />
  );
}
