import { useState } from "react";
import { STYLE_PRESETS, findAccent } from "../../utils/stylePresets";
import { AccentSwatchRow } from "./AccentSwatchRow";
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
// --- The accent state (feature 93 · step 101) --------------------------------
//
// The ONE seam feature 88 did not pre-cut: until now this page held no client
// state at all, being a pure function of frozen constants. It holds exactly one
// thing — the selected accent id — and stays LOADERLESS, so the "no shop data
// here" property above is untouched.
//
// 🚫 The accent is deliberately NOT kept in this page's own `?accent=` via
// `useSearchParams`. That would survive refresh and the back button, at the cost of
// a navigation on EVERY swatch click — on a page that already reloads five iframes
// per click — plus either seven history entries or a `replace: true` that makes the
// back button behave differently here than on every other link.
//
// ⚠️ The accepted cost: a merchant who picks Blue, clicks Classic, then presses
// BACK returns to a gallery showing Theme, with the cards neutral again. Small (the
// accent is create-time-only by design, doc 93 §D1) but real; the fix, if merchants
// hit it, is the `useSearchParams` version above.

export default function ChooseStylePage() {
  const [accentId, setAccentId] = useState<string | null>(null);
  // Resolved once for all five cards rather than per card. Cheap (six frozen
  // entries) and referentially stable, which is what keeps each card's `useMemo`
  // from thrashing: `findAccent` returns the same object for the same id.
  const accent = findAccent(accentId);

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

          🔴 `slot="primary-action"` is EMPTY and stays empty. Feature 88 reserved
          it for feature 93's swatch row (seam 5, "so the swatch row drops in
          without reflowing the page") and step 101 tried exactly that first:
          `<div slot="primary-action">` around the row. **`<s-page>` silently
          dropped it** — not clipped, not hidden, absent from the DOM and from the
          accessibility tree entirely. Observed live 2026-07-30 on the dev store.
          Same family of surprise as `<s-button-group>` rendering no slot
          ([[polaris-web-component-gotchas]]): these elements accept specific
          children in their named slots and discard the rest without warning.
          The row therefore lives in the gallery body below. */}
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <div className={styles.gallery}>
        {/* The colour half of the choice. Feature 93 · step 101 — see doc 93 for
            the palette and the seven merchant decisions.

            📌 It sits ABOVE the paragraph, which is the placement doc 101 §D5
            pre-decided as the fallback when the header slot did not cooperate. It
            reads in the order the merchant works: pick a colour, then pick a
            pattern.

            🔴 No `aria-live` announces the restyle, and the silence is correct
            rather than an omission: the previews are `aria-hidden` (step 90 — a
            screen-reader user must hear "Minimal — no bands and no rules", not a
            fake sample's nine rows read five times), so no accessible content
            changes. The `role="radio"` announces "Blue, selected", which is the
            complete information a non-visual user needs — the accent's EFFECT is
            something they were never being shown. A live region would announce a
            change to deliberately hidden content. */}
        <AccentSwatchRow value={accentId} onChange={setAccentId} />
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
            <StylePresetCard key={preset.id} preset={preset} accent={accent} />
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
