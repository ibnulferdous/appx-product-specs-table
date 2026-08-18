import { useState } from "react";
import { STYLE_PRESETS, findAccent } from "../../utils/stylePresets";
import { AccentSwatchRow } from "./AccentSwatchRow";
import { BlankStyleCard, StylePresetCard } from "./StylePresetCard";
import styles from "./route.module.css";

// `/app/templates/choose-style` — the style-preset gallery (feature 88 · step 91; binding spec in
// features/91, design in 88). Layout, a heading, and a way out.
//
// No loader, and that is the point (D2): this page reads NO shop data — the bundles are frozen
// constants, the sample is a fixture, and the five preview documents are built in the browser. A
// loader would buy an Admin auth round trip + shop upsert to render a page of constants. Session-token
// auth and the shop upsert belong to the parent `app.tsx` loader; the codebase's rule is that a child
// exports `headers` + `ErrorBoundary` only when it has a loader/action that can THROW. ✅ Loaderless,
// the gallery reads nothing and writes nothing — no shop-scoped query to get isolation wrong in.
//
// ⚠️ The `app.templates_` underscore is load-bearing. `app.templates.tsx` renders its own `<s-page>`
// with NO `<Outlet/>`, so a nested `app.templates.choose-style` would match this URL and render
// nothing. The editor route escapes the same parent the same way.
//
// Accent state (feature 93 · step 101): the one seam feature 88 didn't pre-cut. This page holds
// exactly one thing — the selected accent id — and stays LOADERLESS. 🚫 Deliberately NOT kept in
// `?accent=` via `useSearchParams`: that would survive refresh/back but cost a navigation on EVERY
// swatch click (on a page already reloading five iframes per click), plus seven history entries or a
// `replace: true` that makes Back behave differently here. ⚠️ Accepted cost: picking Blue → Classic →
// BACK returns to a Theme gallery with neutral cards. Small (accent is create-time-only, doc 93 §D1).

export default function ChooseStylePage() {
  const [accentId, setAccentId] = useState<string | null>(null);
  // Resolved once for all five cards. Cheap (six frozen entries) and referentially stable, which keeps
  // each card's `useMemo` from thrashing: `findAccent` returns the same object for the same id.
  const accent = findAccent(accentId);

  return (
    // `inlineSize="base"` is not cosmetic: the card's scale geometry is arithmetic against a MEASURED
    // base content width of 966px (two 466px cards + a 16px gap = 948px). Widening to `large` would
    // quietly leave a third card's worth of dead space beside a two-column grid. Pinned by a test.
    <s-page heading="Choose a style" inlineSize="base">
      {/* The way out. "No skip" means the merchant can't PROCEED without choosing (doc 88), never that
          they're trapped. A "Cancel" button would be wrong — nothing has been started here.
          🔴 `slot="primary-action"` is EMPTY and stays empty. Feature 88 reserved it for the swatch
          row (seam 5), and step 101 tried it: `<s-page>` SILENTLY DROPPED the `<div slot=…>` — absent
          from the DOM and the accessibility tree (observed live 2026-07-30). Same surprise family as
          `<s-button-group>` ([[polaris-web-component-gotchas]]). The row lives in the gallery body below. */}
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <div className={styles.gallery}>
        {/* The colour half of the choice (feature 93 · step 101 — see doc 93). 📌 ABOVE the paragraph
            (doc 101 §D5's fallback placement), reading in work order: pick a colour, then a pattern.
            🔴 No `aria-live` announces the restyle, and the silence is correct: the previews are
            `aria-hidden`, so no accessible content changes, and `role="radio"` already announces
            "Blue, selected" (the accent's EFFECT was never being shown to a non-visual user). */}
        <AccentSwatchRow value={accentId} onChange={setAccentId} />
        {/* The gallery is UNSKIPPABLE, which is why this line is here: a merchant who likes none of the
            six needs to know BEFORE choosing that nothing is locked in. Literally true — a pattern
            sets 5 of the 34 styling values, and all 34 stay editable in the Style rail forever. */}
        <s-paragraph>
          Pick a starting point for how your spec table looks. You can change
          every detail later in the template&rsquo;s Style settings.
        </s-paragraph>
        <div className={styles.grid}>
          {/* ⚠️ Mapped, never hand-listed. Card order is merchant-facing (Modern leads as the
              commonest reference shape + the app's default; the two structural departures come last)
              and recorded in `STYLE_PRESETS`' literal order. */}
          {STYLE_PRESETS.map((preset) => (
            <StylePresetCard key={preset.id} preset={preset} accent={accent} />
          ))}
          {/* Appended, not mapped: Blank is the ABSENCE of a preset, not a sixth array member (doc 88).
              Last is its position and its meaning — the fallback for a merchant who wants none. */}
          <BlankStyleCard />
        </div>
      </div>
    </s-page>
  );
}
