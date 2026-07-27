import { STYLE_PRESETS } from "../../utils/stylePresets";
import { BlankStyleCard, StylePresetCard } from "./StylePresetCard";
import styles from "./route.module.css";

// `/app/templates/choose-style` — the style-preset gallery (feature 88 · step 91).
// Binding spec: `context/features/91-style-preset-gallery-route.md`; the design
// it implements is `context/features/88-style-preset-gallery.md`.
//
// The first merchant-visible piece of feature 88. Steps 89 and 90 built the
// persistence path and the card; this file is layout, a heading, and a way out.
//
// --- No loader, and that is the point (D2) -----------------------------------
//
// This page reads NO shop data. The bundles are frozen constants, the sample is
// a fixture, and the five preview documents are built in the browser from both.
// A loader here would buy an Admin auth round trip and a shop upsert to render a
// page of constants. Session-token auth and the shop upsert belong to the parent
// `app.tsx` loader — `app.additional.tsx` is the precedent for a loaderless
// child, and the rule the codebase actually follows is that a child exports
// `headers` + `ErrorBoundary` when it has a loader or action that can THROW.
//
// ✅ Doc 88 promised the gallery writes nothing. Loaderless, it also reads
// nothing: there is no shop-scoped query on this route to get isolation wrong
// in, and no DB footprint from visiting it.
//
// --- The route file name -----------------------------------------------------
//
// ⚠️ The `app.templates_` underscore is load-bearing. `app.templates.tsx` renders
// its own `<s-page>` and has NO `<Outlet/>`, so a nested
// `app.templates.choose-style` would match this URL and render nothing at all.
// The editor route escapes the same parent the same way. Adding this one file to
// the directory step 90 created is what turns it from a folder of components
// into a route.
//
// --- `?style=` is inert here (D9) --------------------------------------------
//
// The cards link to `/app/templates/new?style=<id>`, and the editor's `new`
// sentinel ignores unknown search params, so today every card lands on an
// ordinary blank scaffold. Step 92 makes the param seed the styling and stamp
// `basedOnPreset`, and repoints the two Create buttons at this route. Until then
// this page is reachable by typed URL only — deliberately, so the half of the
// feature that can persist a wrong stamp lands on its own.

export default function ChooseStylePage() {
  return (
    // `inlineSize="base"` is not cosmetic: the card's whole scale geometry is
    // arithmetic against a MEASURED base content width of 966px (two 466px
    // cards + a 16px gap = 948px). Widening this page to `large` would not
    // break anything visibly — it would quietly leave a third card's worth of
    // dead space beside a two-column grid. Pinned by a test for that reason.
    <s-page heading="Choose a style" inlineSize="base">
      {/* The way out. "No skip" means the merchant cannot PROCEED without
          choosing (doc 88) — it must never mean they are trapped. The editor
          route uses this same breadcrumb idiom; a "Cancel" button would be
          wrong, since nothing has been started here that could be discarded.

          ⚠️ Nothing goes in `slot="primary-action"`: feature 93's accent swatch
          row is specced into the page header's right side, and the six cards are
          this page's actions. */}
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <div className={styles.gallery}>
        {/* The gallery is UNSKIPPABLE, which is exactly why this line is here.
            A merchant who likes none of the six needs to know BEFORE choosing
            that nothing is being locked in, or a forced choice reads as a
            commitment. It is also literally true: a pattern sets 5 of the 34
            styling values, and all 34 stay editable in the Style rail forever. */}
        <s-paragraph>
          Pick a starting point for how your spec table looks. You can change
          every detail later in the template&rsquo;s Style settings.
        </s-paragraph>
        <div className={styles.grid}>
          {/* ⚠️ Mapped, never hand-listed. Card order is merchant-facing — Modern
              leads because it is both the commonest reference shape and the
              app's own default, and the two structural departures come last —
              and that order is recorded in `STYLE_PRESETS`' literal order.
              Enumerating five cards here would copy the decision into a second
              place nothing keeps in agreement. */}
          {STYLE_PRESETS.map((preset) => (
            <StylePresetCard key={preset.id} preset={preset} />
          ))}
          {/* Appended, not mapped: Blank is the ABSENCE of a preset, not a sixth
              member of the array (doc 88). Last is its position and its meaning
              — the fallback for a merchant who wants none of the five. */}
          <BlankStyleCard />
        </div>
      </div>
    </s-page>
  );
}
