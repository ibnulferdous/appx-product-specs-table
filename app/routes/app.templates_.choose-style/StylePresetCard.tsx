import { useId, useMemo } from "react";
import { Link } from "react-router";
import type { AccentPreset, StylePreset } from "../../utils/stylePresets";
import { galleryHref, seedStylingFromPreset } from "../../utils/stylePresets";
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
      aria-describedby={descriptionId}
    >
      {visual}
      <span className={styles.body}>
        <span className={styles.title} id={titleId}>
          {label}
        </span>
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
      description={preset.description}
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
