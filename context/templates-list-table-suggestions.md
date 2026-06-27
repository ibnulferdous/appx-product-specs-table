# Templates List Table — Analysis & Suggestions

Status: proposal · Scope: the Templates list page ([app/routes/app.templates.tsx](../app/routes/app.templates.tsx))

## 1. Are we using Polaris web components? Yes.

The table is already built entirely from Polaris **web components** (`<s-table>`, `<s-table-row>`,
`<s-table-cell>`, `<s-badge>`, `<s-link>`), per `code-standards.md` ("Use Polaris App Home web
components; do not use legacy `@shopify/polaris` React components").

The admin **Products** and **Customers** tables in the screenshots are Shopify's own first-party
internal tables — app developers don't get those exact components. The developer-facing equivalent,
designed to look and feel native, is `<s-table>` plus the **"Index table" composition**
(search + sort + filter + bulk actions + pagination). So we are already on the right foundation; the
work is to opt into more of what `<s-table>` already offers.

## 2. Long template names — recommendation: native wrap + 2-line clamp

**Do not use the tutorial's JS `truncate()` helper for this table.** Reasons:

- `<s-table variant="auto">` already wraps long names natively — the same behavior as the admin
  Products table (long product titles flow to a second line). The screenshot shows this already
  working for the Lenovo Legion row.
- `truncate(str, {length: 25})` hard-cuts the string in the data layer: it discards information
  visually, ignores column width / viewport (chops at 25 chars even on a wide screen), isn't
  responsive, and removes the full name from the DOM (worse for accessibility, copy/paste, and
  in-page search).
- There is no fixed column-width prop on `<s-table-header>`; the component manages sizing. So the
  "fixed-width column that wraps to a second line" Products-table behavior is what `<s-table>`
  *already does by default* — we get it for free.

**Recommendation:** keep native wrapping, and add a CSS line-clamp (~2 lines) on a light-DOM wrapper
around the name so very long names stay tidy without losing data. The full name remains in the DOM;
add a `title` attribute so the untruncated name shows on hover.

Illustrative (cell only — wrapper is slotted light DOM, so the clamp applies cleanly):

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

The existing `NAME_MAX_LENGTH = 100` cap (`app/utils/templateName.ts`) already prevents absurdly long
names at the data layer, so the clamp is purely a row-height polish.

> Note: verify the `-webkit-box` clamp renders inside `<s-table-cell>` against the live embedded app
> (per the "Polaris web component gotchas" notes, some styling doesn't reach shadow DOM — but this
> wrapper is slotted light-DOM content, so it should apply). Fallback: a single-line
> `text-overflow: ellipsis` wrapper.

## 3. Feature options for the table

Everything below is supported by `<s-table>` web components today. Mapped against the existing
roadmap so we build in the right order.

| Feature | `<s-table>` support | Current state | Recommendation | Roadmap fit |
|---|---|---|---|---|
| **Per-row actions** (Rename / Duplicate / Delete / Archive) | `<s-button commandFor>` + `<s-menu>` per row | Only on the **detail** page | **Build first** — reuse existing `duplicate`/`delete` action intents + `validateTemplateName`/`copyName` | MVP (already in `admin-screen-plan.md` Screen 2) |
| **Status filter** | `slot="filters"` region | Done (inline badges/links) | Keep; optionally move into the `slot="filters"` region for a more native look | MVP (done) |
| **Search by name** | `<s-search-field slot="filters">` + loader `?q=` | None | Add when list grows; server-side `where: { name: { contains } }`, shop-scoped | Phase 2 (`feature-roadmap.md`) |
| **Sort** (name / rows / updated) | `<s-button icon="sort">` + `<s-popover>`/`<s-choice-list>` in `slot="filters"`; loader `?sort=` | Fixed `updatedAt desc` | Add alongside search | Phase 2 |
| **Multi-select + bulk actions** (bulk delete / archive) | `selected` + `<s-checkbox>` + `clickDelegate` + bulk bar in `slot="filters"` | None | Add after row actions; bulk **Delete** and **Archive** are the high-value ones | New (not yet in docs) |
| **Pagination** | `paginate hasPreviousPage hasNextPage` | None (loads all) | Add before search/sort once any shop is likely to exceed ~50 templates | Phase 2 |
| **Loading state** | `loading` attribute | N/A (full nav) | Add if/when filters/search become client-driven fetches | Phase 2 |

### Notes & caveats
- **"Assigned Products" is currently always `0`** (`template.server.ts` hardcodes it pending the
  post-MVP assignment models). Don't build sort/filter on that column until assignment counts are real.
- Row actions on the list will need an `action` on the list route (or submit to the detail route)
  that reuses the existing `duplicate` / `delete` intents — the server logic already exists.
- Bulk delete should reuse the existing single-delete path per id (which also cleans up the
  storefront metaobject) rather than a new bulk DB path, to keep metaobject cleanup correct.

## 4. Suggested sequencing

1. **Long-name clamp** (section 2) — tiny, immediate polish.
2. **Per-row overflow `<s-menu>`** with Rename / Duplicate / Delete (+ Archive) — MVP-aligned, reuses
   existing server actions and name helpers; biggest UX win.
3. **Pagination** — once template counts grow.
4. **Search + sort** in `slot="filters"` — Phase 2.
5. **Multi-select + bulk Delete/Archive** — after row actions are proven.
