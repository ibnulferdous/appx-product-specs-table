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

// The style-preset gallery's cards (feature 88 · step 90). Binding spec:
// `context/features/90-style-preset-card-preview.md`. Step 91 lays six of these
// out on `/app/templates/choose-style`; this file owns one card and nothing
// about the page.
//
// Presets are CREATE-TIME ONLY (merchant decision, 2026-07-27), which is why
// both cards are LINKS INTO CREATION rather than pickers: there is no editor
// state to mutate, no selected/unselected state to hold, and no way back to this
// gallery once a template exists. A card's entire behaviour is its href.
//
// --- Why the pipeline and not a static thumbnail ----------------------------
//
// The preview renders through `renderSpecTablePreviewDocument` — the same
// function the editor's device previews use, into the same kind of sandboxed
// iframe. Zero drift against the storefront is the whole reason that pipeline
// exists, and a gallery is the worst possible place to lose it: a stale
// screenshot would keep promising a look the app no longer produces, forever,
// and nothing would fail. Here the card cannot lie — it renders the same bytes
// the storefront ships.
//
// The cost is real (five documents on one page) and is measured in step 91.
//
// --- Scale, don't shrink -----------------------------------------------------
//
// The frame is a REAL desktop-width table scaled down by CSS, not a table
// rendered into a 320px box. See the geometry note in `StylePresetCard.module.css`:
// rendering narrow would trip the storefront stylesheet's 749px mobile
// breakpoint and show all five cards in their identical phone form.
//
// --- Sandbox ------------------------------------------------------------------
//
// `sandbox=""` — stricter than `SpecTablePreview`'s `allow-scripts`, and
// deliberately so. That component grants scripts to run feature 54's height
// shim; these frames are a FIXED viewport that crops, so nothing here reads a
// measured height and the shim (still present in the document, which is shared)
// simply never runs. Fewer capabilities for five frames, and no reason to grant
// more. The frame stays a unique opaque origin either way.

/**
 * Join the derived phrases into the card's one description string.
 *
 * 🔴 **The spaces INSIDE a phrase are non-breaking, and that is the whole
 * function** — observed live 2026-07-31, on the admin. With ordinary spaces the
 * browser breaks wherever the line runs out, and on Classic that landed
 * mid-phrase: `… · Line between` / `rows · Line between columns · Outer border`.
 * The second line then opens on a fragment, which is precisely the scanning this
 * line exists to make possible.
 *
 * The separator carries a non-breaking space BEFORE the dot and an ordinary one
 * after, so the only break opportunity in the whole string is immediately after
 * a `·`. A wrapped line therefore ends with its separator and the next begins on
 * a whole phrase — the shape Multi-column already happened to get. `text-wrap:
 * balance` then distributes whole phrases between the rows.
 *
 * ⚠️ A phrase wider than the card's 440px content box would overflow rather than
 * break, which is the cost of forbidding the break. The longest today is
 * "Several columns, label above each value" at roughly half that, and the
 * ≤96-character guard in `stylePresets.test.ts` bounds the whole line — but a
 * genuinely long new phrase is the thing to look at, not the number of them.
 *
 * 🚫 Not solved by wrapping each phrase in its own `<span>` with
 * `white-space: nowrap`. That is the obvious form and it breaks the accessible
 * name: `aria-describedby` concatenates TEXT CONTENT, and sibling spans have no
 * space between them (see the note at the render site).
 */
function highlightLine(phrases: readonly string[]): string {
  // ⚠️ Written as \u00a0 escapes, never as literal non-breaking spaces. A raw
  // U+00A0 is invisible in a diff and indistinguishable from an ordinary space
  // in an editor, so the one property this function exists for would be
  // unreviewable and deletable by accident.
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
   * The ONE explanatory line under the name — what this card gets you.
   *
   * 🔴 **One line, not two.** Until 2026-07-31 there were two: a hand-written
   * `StylePreset.description` and, below it, the derived
   * `presetHighlights` readout. They said nearly the same thing one line apart
   * in two ink tones ("A bordered grid with a line between every row." above
   * "Underlined section headers · Line between rows · Line between columns ·
   * Outer border"), which spent vertical space on a page whose whole problem was
   * six cards being hard to compare. The hand-written half went; see the note in
   * `stylePresets.ts` for what that cost.
   *
   * ⚠️ It is a plain string rather than the highlight ARRAY because the two card
   * shapes fill it from different places — the preset cards join their derived
   * phrases, Blank passes a literal sentence, having no bundle to derive from.
   * Taking the array here would make Blank the special case in a component that
   * exists precisely to have none.
   */
  description: string;
  /**
   * The call-to-action line — what happens when this card is activated, in the
   * merchant's words. Per-card rather than one shared string because Blank is
   * not a style, so "Use this style" would be false on it.
   */
  action: string;
  /** The thumbnail or its stand-in. Decorative — the caller hides it from AT. */
  visual: React.ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    // Accessible name is the LABEL alone, with the description associated as
    // help text — not concatenated into the name. Without the explicit
    // `aria-labelledby` the anchor's name would be its whole text content, so a
    // screen reader would read the sentence twice: once as the link's name and
    // again as its description.
    <Link
      to={to}
      className={styles.card}
      aria-labelledby={titleId}
      // 🔴 The description is the merchant's ENTIRE basis for choosing when they
      // cannot see the card: the preview is `aria-hidden` (rightly — five fake
      // tables read aloud is worse than nothing), so this one string is all a
      // screen-reader user gets. It must never take the action line's
      // `aria-hidden` treatment; that line is hidden because the link role
      // already announces it, where this is information available nowhere else.
      aria-describedby={descriptionId}
    >
      {visual}
      <span className={styles.body}>
        <span className={styles.title} id={titleId}>
          {label}
        </span>
        {/* ⚠️ ONE text node, and on the preset cards the middle dots between the
            phrases are IN it. `aria-describedby` concatenates the referenced
            element's text content, and `<span>A</span><span>B</span>` has the
            text content "AB" — no space at all, so rendering the phrases as a
            row of chip spans would announce "Shaded section headersLine between
            rows". A CSS `::before` separator fails the other way: generated
            content that some AT reads and some does not. Keeping the separator
            in the DOM is what makes the eye and the screen reader get the same
            string.

            🚫 NOT a `<ul>`, however much the preset cards read like a list:
            `.body` is a `<span>`, which is phrasing content and cannot contain
            flow content. Swapping it for a `<div>` to allow one would put a
            block element inside the anchor's flex column for no gain a merchant
            can see. */}
        <span className={styles.description} id={descriptionId}>
          {description}
        </span>
      </span>
      {/* The affordance, and 🔴 it is TEXT INSIDE THE ANCHOR — never a nested
          `<button>` or second `<Link>`. Interactive content inside a link is
          invalid HTML and announces as a broken nested control; it would also
          mean giving up the whole-card target, which is the one thing this
          gallery cannot afford. The preview is the thing being judged, so the
          preview has to be what you click (see `pointer-events: none` on the
          frame) — a real button would shrink the target from the full card to
          ~110×36 and leave the table inert under the pointer.

          What the line buys over the pre-existing hover treatment: hover is
          invisible until you are already on the card, and absent entirely on a
          touch admin. Six cards that look like pictures give a merchant nothing
          saying a click starts a template. This says it, always, on every
          device.

          ⚠️ `aria-hidden` deliberately. The anchor already announces as a link
          named "Modern" — the role IS "this activates" — so exposing the line
          would add six identical "Use this style" strings to the page for no
          information. It is a VISUAL restatement of the role, which is exactly
          what `aria-hidden` is for. Safe here only because the accessible name
          comes from `aria-labelledby` above and never from this subtree. */}
      <span className={styles.action} aria-hidden="true">
        {action}
        <span className={styles.actionArrow}>&rarr;</span>
      </span>
    </Link>
  );
}

/**
 * One of the five built-in patterns, previewed live in the merchant's chosen
 * accent.
 *
 * Targets `/app/templates/new?style=<id>&accent=<id>`, and step 92 + step 99 make
 * both params seed the scaffold and stamp `basedOnPreset`. The accent half is
 * `null` until the gallery's swatch row is touched (feature 93 · step 101).
 */
export function StylePresetCard({
  preset,
  accent,
}: {
  preset: StylePreset;
  // The RESOLVED accent, not an id — the gallery already looked it up, and passing
  // the id would make all five cards repeat the lookup. `null` is "Theme".
  accent: AccentPreset | null;
}) {
  // 🔴 Resolved through `seedStylingFromPreset` — THE SAME FUNCTION THE LOADER USES
  // (`resolveGalleryParams`). This is the gallery's zero-drift promise in one line:
  // the card exists to show what the template will look like, and if the card
  // merged bundle-and-accent its own way while the loader merged them another, the
  // two could disagree and NOTHING WOULD FAIL — no test compares a rendered preview
  // against a seeded template. One function makes the disagreement
  // unrepresentable. Same argument step 92 made for deriving both of its outputs
  // from one lookup.
  //
  // ⚠️ It replaced `stylePresetValues(preset)`, which is provably the same value at
  // `accent = null` (both reduce to `parseStylingValues(preset.bundle)`) — pinned by
  // a test, so the switch is not a silent restyle of today's gallery.
  //
  // Memoized so the document is built once per (pattern, accent) rather than on
  // every parent render — five `srcDoc` strings are this page's whole rendering
  // cost, and recomputing them reloads all five frames.
  //
  // 🔴 `accent` MUST be in the dependency array. Without it the swatches would
  // highlight correctly and the cards would never change — the exact symptom this
  // feature exists to prevent, and invisible to every guard that does not name the
  // deps. Referentially stable by construction: `ACCENT_PRESETS` holds frozen
  // module-level objects, so `findAccent` returns the same reference for the same
  // id and the memo does not thrash.
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
      // 🔴 DERIVED from the bundle, never a stored sentence — and the field this
      // replaced is the argument. `StylePreset.description` was hand-written
      // copy, so it could disagree with the bundle beside it and did: Classic's
      // read "a line between every row" through the whole period its bundle
      // shipped `STRIPES`, which paints no row lines at all. Nothing failed,
      // because nothing compares prose to values. This line cannot drift,
      // because it IS the values.
      //
      // ⚠️ Deliberately NOT memoised alongside `document` below. It resolves six
      // frozen fields into a short array; the memo exists for the ~36 KB `srcDoc`
      // string beside it, and a second one here would cost more in
      // dependency-array surface than the work it skips.
      description={highlightLine(presetHighlights(preset))}
      action="Use this style"
      visual={
        // ⚠️ The preview is DECORATIVE and hidden from assistive tech. The
        // merchant is choosing a look; a screen-reader user must hear
        // "Minimal — no bands and no rules, spacing does the work", not the
        // fake sample's nine rows read out five times over. `tabIndex={-1}`
        // goes with it: an iframe is focusable by default, so hiding it from
        // AT without also taking it out of the tab order would leave a
        // keyboard user stopping on a frame that announces nothing.
        //
        // `title` is present because the whole document would otherwise be an
        // unnamed frame if `aria-hidden` were ever removed (and jsx-a11y's
        // `iframe-has-title` requires it). `aria-hidden` wins today.
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
 * ⚠️ Blank is NOT a `StylePreset` and must never be faked into one. Its output
 * is byte-identical to Modern's — `DEFAULT_STYLING_VALUES` already IS the banded
 * pattern (see the `banded` bundle's note in `stylePresets.ts`) — so it is
 * modelled as the ABSENCE of a preset: no bundle, no `?style=` param, and
 * `basedOnPreset` left null. With the gallery unskippable, that null is now
 * precise rather than ambiguous: it means "chose Blank".
 *
 * It renders no preview for exactly that reason. Two pixel-identical thumbnails
 * in one grid read as a bug, and the card is not offering a sixth LOOK — it is
 * offering a different KIND of choice, which is what the plain dashed plate
 * says.
 *
 * 🔴 **It takes no `accent` prop, and its href is a LITERAL rather than a
 * `galleryHref` call. That is the only place doc 93 §D4 is enforced.** The Blank
 * card's copy is "start with your theme's own styles — nothing added", and an
 * accent would add five colours and make that sentence false — where the merchant
 * could not see it coming, because this is the one card that renders no preview.
 * Step 99 deliberately left `resolveGalleryParams` TOTAL (it honours a hand-typed
 * `?accent=` with no `?style=`), so the decision lives here in the href and
 * nowhere else. `galleryHref({ preset: null, accent: null })` returns exactly this
 * string; the literal is kept so no accent can be threaded in by a later edit to one
 * call site.
 */
export function BlankStyleCard() {
  return (
    <CardFrame
      to="/app/templates/new"
      label="Blank"
      // 🔴 The one card whose line is still a written SENTENCE, and the only one
      // that may be. Blank has no bundle, so there is nothing to derive from —
      // and deriving from `DEFAULT_STYLING_VALUES` instead would print Modern's
      // exact line on the card whose whole meaning is "no pattern was chosen",
      // the same trap the missing preview avoids, in words instead of pixels.
      // 📌 It is also the reason `CardFrame` takes a string rather than the
      // highlight array: this card is not a special case, it just fills the slot
      // from somewhere else.
      description="Start with your theme's own styles — nothing added."
      // ⚠️ NOT "Use this style". Blank is the absence of a preset, so there is
      // no style to use; the line has to name what actually happens.
      action="Start blank"
      visual={
        <span className={styles.blankPlate} aria-hidden="true">
          +
        </span>
      }
    />
  );
}
