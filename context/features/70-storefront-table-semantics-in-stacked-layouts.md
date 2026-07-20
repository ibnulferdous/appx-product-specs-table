# Feature 70 — Storefront: preserve table semantics in stacked layouts

> **Status: SPEC — not yet implemented.**
> Carried out of feature 57 Phase B1 (see `69-…` §4 and the red item in
> `progress-tracker.md` → Open Questions). **Not** a Style-tab step: it ships no
> knob and no admin UI, so it is independent of B2 (Steps 13–14) and can run
> before, after, or alongside it.

## Goal in one sentence

Stop the stacked layout from silently destroying the spec table's label→value
relationships for screen-reader shoppers — **without changing a single pixel** of
how the table looks.

## The problem, precisely

`display: block` does not merely move boxes. It removes an element from the CSS
table model, and with it the **implicit ARIA semantics** the browser derives from
`<table>`/`<tr>`/`<th>`/`<td>`. A screen reader stops announcing "Battery Info,
4000mAh Rechargeable Battery" as a header/cell pair and reads a flat run of text.
On a spec table that pairing *is* the content — a shopper hears every word and
learns nothing.

Two rules do this, both in
`extensions/product-specs-table/assets/spec-table.css`:

| Lines | Selector | Trigger |
| --- | --- | --- |
| 237–248 | `.appx-spec-table--layout-stacked …` | the merchant picks Stacked |
| 275–286 | `.appx-spec-table--mobile-stacked …` inside `@media (max-width: 749px)` | **any shopper on a narrow screen** |

The stylesheet's own comment at :237–240 already records this as "a known
trade-off recorded for Step 12's a11y pass." Step 12 did not pay it (it was an
admin-side pass); this doc is that payment.

## Premise check — the markup is NOT the problem

Verified before designing, because the obvious assumption ("the storefront markup
must be sloppy") is **false** and would send the fix in the wrong direction.
`extensions/product-specs-table/blocks/spec_table.liquid` already emits correct
semantic HTML:

- `:179` — `<th class="appx-spec-table__label" scope="row">` on every label. This
  is exactly right and is what makes the pairing work in two-column mode.
- `:180` — `<td class="appx-spec-table__value">` for the value.
- `:167` — `<th class="appx-spec-table__section" colspan="2" scope="colgroup">`
  for a section header row.
- `:159` — in collapsible mode each per-section `<table>` carries an `aria-label`
  with the section title, deliberately compensating for the `scope="colgroup"`
  heading the split costs it.

**Nothing here needs correcting.** The fix adds a CSS-proof restatement of
semantics that are already expressed correctly — it does not repair bad markup.
Do not "improve" the existing `scope` attributes while in the file.

## Why the two intuitive fixes are wrong

**1. "Use a different layout technique instead of `display: block`."**
Rejected: `display: grid` and `display: flex` strip table semantics in exactly
the same way. Any value outside the `display: table-*` family does. Changing the
layout mechanism buys nothing and risks the visual result.

**2. "Only emit the fix when the merchant picks Stacked."**
Rejected, and this is the important one. **The mobile rule is a media query.**
Liquid renders on the server and cannot know the shopper's viewport width, so a
markup fix keyed to `rowLayout == STACKED` would fix the desktop stacked case and
leave **every narrow-screen shopper of every two-column template** exactly as
broken — the larger audience, and the one nobody would think to test.

That single fact forces the design: the roles must be **static and
unconditional**, present in every render regardless of knob values.

## What changes

### 1. Explicit ARIA roles, unconditionally

Add the **complete role chain** to the existing elements. In two-column mode the
roles are redundant restatements of what the tags already mean (harmless, no
behaviour change); in stacked mode and on mobile they are the only thing left
carrying the relationships.

```liquid
<table class="appx-spec-table__table" role="table">
  <tbody role="rowgroup">
    <tr class="appx-spec-table__row" role="row">
      <th class="appx-spec-table__label" scope="row" role="rowheader">…</th>
      <td class="appx-spec-table__value" role="cell">…</td>
    </tr>
```

Section header row (non-collapsible path only):

```liquid
<tr class="appx-spec-table__section-row" role="row">
  <th class="appx-spec-table__section" colspan="2" scope="colgroup"
      role="columnheader" aria-colspan="2">…</th>
</tr>
```

**`aria-colspan` is belt-and-braces, and needs verifying rather than assuming.**
Native `colspan` on a real `<th>` is generally still honoured once explicit roles
are present, but the two are separate mechanisms and this is precisely the kind of
detail that differs between screen readers. Confirm it in the §4 pass; drop it if
it proves redundant, keep it if it does not.

**The collapsible path needs nothing extra.** Its section title is a
`<summary>`, not a `<th>` — `<details>`/`<summary>` are unaffected by these CSS
rules and announce their own expanded state. The per-section `aria-label` at
`:159` already names each table.

> ⚠️ **ALL OR NOTHING.** A partial chain is *worse than no change*: a
> `role="row"` whose ancestor carries no table/rowgroup role can be dropped
> outright by assistive tech, taking its children with it. If this ships
> half-applied it converts a degraded experience into a missing one. Every level
> — table → rowgroup → row → rowheader/cell — lands together or none does.

### 2. BOTH markup sites, in lockstep

**This is the scope fact most likely to be missed.** The same markup is generated
in two places that share no code:

| Site | What it feeds |
| --- | --- |
| `extensions/product-specs-table/blocks/spec_table.liquid` `:159, 166-167, 175-180` | the real storefront |
| `app/routes/app.templates_.$id/specTablePreviewHtml.ts` `:141, 151, 156, 207, 217` | the admin device previews |

They are **hand-mirrored, not machine-checked** — `specTablePreviewHtml.ts:5,30,42`
and `specTablePreviewHtml.test.ts:45` all say so in as many words ("Liquid and TS
can't share code, this hand-mirrors …"). If only the Liquid is updated, the
previews and the storefront diverge, which is the exact class of bug the preview
exists to prevent.

Update both. The preview's own 57 tests will need their expected-HTML strings
updated in step.

### 3. A guard test that pins the invariant

Add to `specTableCssContract.test.ts` (or a sibling in the same shape — it already
reads the real extension file off disk via `fileURLToPath`, `:27-34`):

> **For every class named in a `display: block` rule in `spec-table.css`, the
> element carrying that class in `spec_table.liquid` must also carry an explicit
> ARIA role.**

This pins the *rule* rather than today's instance: if a future step adds a third
stacked variant — a new breakpoint, a new layout knob — the test fails instead of
silently reintroducing the bug. That is the difference between a fix and a
regression guard.

Worth doing in the same test: assert the **role sets in the Liquid and in
`specTablePreviewHtml.ts` match**, converting one strand of the hand-mirror into a
machine check.

### 4. Screen-reader verification — the part that cannot be reasoned

Everything above is a claim about how assistive tech behaves. Claims about
assistive tech get **tested on assistive tech**, not derived from specs.

Run on the **live storefront** (per [[browser-verify-embedded-app]]; note the
storefront password gate lives in `_shopify_essential` —
[[shopify-storefront-password-cookie]]), on a template exercising
`TWO_COLUMN` + sections, with NVDA or VoiceOver:

1. **Desktop, two-column** — the control. Confirms the roles did not *degrade*
   the already-working case.
2. **Desktop, stacked** — the primary fix. Pairs must announce as
   header + cell.
3. **Narrow viewport (≤749px), two-column template** — the case the conditional
   fix would have missed entirely.
4. **Collapsible sections** — `<details>` still announces expanded/collapsed, and
   each section table still announces its `aria-label`.
5. **Table navigation commands** still work (NVDA `Ctrl+Alt+arrows`).

> 🛑 **The falsifier, stated up front.** There is a real possibility that explicit
> ARIA roles *suppress* some native table affordances in certain screen readers
> rather than restoring them. Check (1) and (5) **before** and **after** the
> change and compare. **If the control case regresses, this approach is wrong and
> must be reverted, not patched** — record what was observed and reopen the
> design. Do not ship a fix for the stacked case that quietly degrades the
> two-column case that 100% of desktop shoppers see today.

## Locked decisions

- **Roles are static and unconditional.** No Liquid branch on `rowLayout`, no
  duplicate markup path. Driven by the media-query argument above, which is not
  negotiable — a conditional fix cannot reach the mobile case.
- **Zero visual change.** ARIA roles do not affect rendering. If any pixel moves,
  something else was changed by mistake.
- **No CSS change.** `display: block` stays. The stacked layout is a legitimate,
  merchant-requested presentation; the bug is that semantics were not preserved
  alongside it, not that the layout is wrong.
- **`<dl>`/`<dt>`/`<dd>` is REJECTED for this fix.** A description list is
  arguably the better primitive for label→value pairs and survives stacking with
  no ARIA at all — if this were greenfield it would be the pick. It is rejected
  here because it is a rewrite of shipped storefront markup that every merchant's
  live table depends on, to solve a problem the roles solve at a fraction of the
  blast radius. **Revisit only if the §4 falsifier fires.**

## What this step does NOT own

- **Any styling knob, control, or admin UI.** No `TableStyling` field changes, no
  rail work, no migration.
- **The wider pre-submission accessibility sweep.** Step 12's rail work was
  verified behaviourally only (the admin runs in a cross-origin iframe, so its
  accessibility tree cannot be read from outside — see the Step 12 tracker entry).
  A full screen-reader pass over the **admin** is separate work; this doc covers
  the **storefront** only.
- **Colour contrast.** Decided permanently in `69-…` §3: the app ships none, by
  decision rather than deferral. Nothing here reopens it.

## Testing

- **Unit** — the guard test above, plus updated expected-HTML in
  `specTablePreviewHtml.test.ts` (57 cases reference the markup).
- **Theme Check** — must stay green on the extension.
- **Gate** — `npm run typecheck && npm run lint && npm run format:check &&
  npm run test:run && npm run build`, all five green; record the final count.
- **Browser** — the §4 matrix, including the before/after control comparison.

## Done when

1. The full role chain ships in **both** markup sites, and the two are consistent.
2. The guard test fails if a `display: block` class loses its role.
3. Theme Check green; full gate green.
4. §4 screen-reader verification passes on the live storefront at desktop **and**
   ≤749px width — including the control case, proving no regression to
   two-column.
5. Visual output is unchanged (compare storefront screenshots before/after in all
   three layouts).
6. `progress-tracker.md`'s red Open Question is closed with what was observed —
   or, if the falsifier fired, reopened with the evidence and the `<dl>` option
   back on the table.

## Pointers

- The deferral that created this → `context/features/69-…` §4 + tracker Open Questions
- Stacked-layout CSS → `extensions/product-specs-table/assets/spec-table.css:237-248, 275-286`
- Storefront markup → `extensions/product-specs-table/blocks/spec_table.liquid:159, 166-167, 175-180`
- Mirrored preview markup → `app/routes/app.templates_.$id/specTablePreviewHtml.ts:141, 151, 156, 207, 217`
- Existing contract-test shape to copy → `app/routes/app.templates_.$id/specTableCssContract.test.ts`
