import { useId, useMemo } from "react";
import { Link } from "react-router";
import type { StylePreset } from "../../utils/stylePresets";
import { stylePresetValues } from "../../utils/stylePresets";
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
  visual,
}: {
  to: string;
  label: string;
  description: string;
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
    </Link>
  );
}

/**
 * One of the five built-in patterns, previewed live.
 *
 * Targets `/app/templates/new?style=<id>`; step 92 makes that param seed the
 * scaffold and stamp `basedOnPreset`. Until then the param is inert and the card
 * creates an ordinary blank template — a deliberately harmless intermediate
 * state, not a broken one.
 */
export function StylePresetCard({ preset }: { preset: StylePreset }) {
  // A pure function of the preset, so the document is built once per card rather
  // than on every parent render. Five `srcDoc` strings is the page's whole
  // rendering cost; recomputing them would also reload all five frames.
  const document = useMemo(
    () =>
      renderSpecTablePreviewDocument(
        STYLE_PREVIEW_SAMPLE_ROWS,
        stylePresetValues(preset),
      ),
    [preset],
  );

  return (
    <CardFrame
      to={`/app/templates/new?style=${encodeURIComponent(preset.id)}`}
      label={preset.label}
      description={preset.description}
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
 * is byte-identical to Banded's — `DEFAULT_STYLING_VALUES` already IS the banded
 * pattern (see the `banded` bundle's note in `stylePresets.ts`) — so it is
 * modelled as the ABSENCE of a preset: no bundle, no `?style=` param, and
 * `basedOnPreset` left null. With the gallery unskippable, that null is now
 * precise rather than ambiguous: it means "chose Blank".
 *
 * It renders no preview for exactly that reason. Two pixel-identical thumbnails
 * in one grid read as a bug, and the card is not offering a sixth LOOK — it is
 * offering a different KIND of choice, which is what the plain dashed plate
 * says.
 */
export function BlankStyleCard() {
  return (
    <CardFrame
      to="/app/templates/new"
      label="Blank"
      description="Start with your theme's own styles — nothing added."
      visual={
        <span className={styles.blankPlate} aria-hidden="true">
          +
        </span>
      }
    />
  );
}
