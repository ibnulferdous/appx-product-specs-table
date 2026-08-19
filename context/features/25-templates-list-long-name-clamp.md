# Templates list — long-name 2-line clamp (suggestions §2)

## Goal in one sentence

Long template names in the Templates list stay **tidy without losing data** — a CSS
2-line clamp on a light-DOM wrapper inside the name `<s-link>`, with the full name
kept in the DOM and shown on hover via `title` — instead of hard-cutting the string
or letting a very long name balloon the row height.

## Why this is now

First, smallest item in the templates-list table suggestions (§2 + the sequencing
list; that planning doc has since been removed): immediate polish, no server change,
no new dependency. It also
clears the visual ground before the per-row actions menu lands (file 26), so a long
name can't crowd the trailing actions cell.

**Why a CSS clamp, not the tutorial's `truncate()` helper** (verbatim from §2):

- `<s-table variant="auto">` already wraps long names natively (same as the admin
  Products table) — we are only taming the height, not introducing wrapping.
- `truncate(str, {length: 25})` hard-cuts in the data layer: it discards
  information, ignores column width / viewport, isn't responsive, and removes the
  full name from the DOM (worse for accessibility, copy/paste, and in-page search).
- There is no fixed column-width prop on `<s-table-header>`; the component manages
  sizing, so "fixed-width column that wraps" is already the default — we only add
  the line-clamp on top.

## What changes (architecture)

**One file, markup-only.** A slotted light-DOM `<span>` wrapper inside the existing
name `<s-link>` in [app.templates.tsx](../app/routes/app.templates.tsx)
(`TemplateTableRow`). No reducer, no server, no new dependency, no schema, no new
CSS module — the clamp is inline style on a light-DOM node (per the Polaris
gotchas, shadow-DOM styling is unreliable, but a *slotted* light-DOM wrapper styles
cleanly; see `[[polaris-web-component-gotchas]]`).

Cell only (the rest of `TemplateTableRow` is unchanged):

```tsx
<s-table-cell>
  <s-link href={`/app/templates/${template.id}`}>
    <span
      title={template.name}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {template.name}
    </span>
  </s-link>
</s-table-cell>
```

The existing `NAME_MAX_LENGTH = 100` cap (`app/utils/templateName.ts`) already
prevents absurdly long names at the data layer, so this clamp is purely row-height
polish — the full (≤100-char) name remains in the DOM and on `title` hover.

## Locked decisions

- **Native wrap + 2-line clamp, full name retained.** No data-layer truncation; the
  complete name stays in the DOM for a11y, copy/paste, and in-page find. (§2.)
- **`title` attribute for the untruncated name on hover** — the only affordance
  needed since the full string is already present.
- **Light-DOM wrapper, inline style** — no shadow-DOM dependency; survives the
  documented web-component styling quirks.

## What this step does *not* own (boundary)

- **Per-row actions menu** (Rename / Duplicate / Delete) — file 26.
- **Search / sort / pagination / bulk select** — later Phase-2 steps in the
  suggestions doc; untouched here.
- **The name link target / route** — unchanged; still navigates to the editor.

## File placement (per `code-standards.md`)

- Wrapper span + `title` + clamp style → **`app/routes/app.templates.tsx`**
  (`TemplateTableRow`) only. No other file changes.

## Testing

No unit test: this is pure presentational markup with no extractable logic (the
testing strategy keeps DOM/web-component rendering to browser verification — jsdom
can't render Polaris web components; `[[testing-strategy]]`). The suite count is
unchanged.

**Browser verification (embedded app, per `[[browser-verify-embedded-app]]`):**

- A name long enough to wrap shows **at most two lines** then ellipsis; the row
  height stops growing.
- Hovering the name shows the **full** name via the native `title` tooltip.
- A short name renders unchanged (no clipping, no layout shift).
- **Confirm the `-webkit-box` clamp actually applies inside `<s-table-cell>`.**
  Fallback if it does not paint: a single-line `text-overflow: ellipsis` wrapper
  (`whiteSpace: "nowrap"; overflow: "hidden"; textOverflow: "ellipsis"`). Record
  which variant shipped in the progress tracker.

## Done when

1. Long names clamp to two lines with the full name retained in the DOM and on
   `title` hover; short names are unaffected.
2. `npm run build`, `typecheck`, `lint`, `format:check`, and `test:run` pass
   (suite count unchanged — no new tests).
3. No server/reducer/schema/dependency change; only `app.templates.tsx` touched.
4. `context/progress-tracker.md` updated; browser-verified in the embedded app,
   noting whether the 2-line clamp or the single-line ellipsis fallback shipped.
