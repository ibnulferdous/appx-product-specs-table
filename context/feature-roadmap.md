# Feature Roadmap

Phase 1 (MVP) features are fully defined in `prd.md`. This file covers post-MVP phases, strategic priorities, and schema design guidance.

---

## Roadmap Summary

| Phase | Timeframe | Focus |
| --- | --- | --- |
| MVP | Now | Core template → product → storefront pipeline |
| Near-Future | 3–6 months | Bulk tools, more data sources, display styles |
| Growth | 6–12 months | Localization, AI, import/export, analytics |
| Mature | 12+ months | Integrations, API, collaboration, advanced UX |

---

## Phase 2 — Near-Future (3–6 Months)

### Template Management

- Template search and filtering
- Template categories / tags for organization
- Template usage stats (how many products assigned)
- Reorder sections via drag-and-drop
- Tooltip on row labels (explain what a spec means to shoppers)
- Billing features: free plan limitations, billing records, trial periods, gifts and coupons
- Track metadata: `created_at`, `updated_at`, `archived_at`, `created_by`, `updated_by`

### Data Sources

- Advanced variant-level metafield mapping beyond MVP's simple variant strategy
- Collection metafield mapping

### Product Assignment

- Assign by collection
- Assign by product tag
- Bulk assign (select 50+ products at once)
- Advanced assignment conflict resolution (priority rules when a product matches multiple rules)
- Override template values per product (base template + product-specific overrides)

### Storefront Display

- Multiple display styles: default table, card grid, accordion/collapsible
- Tab layout (specs inside a tab alongside description and reviews)
- Show/hide table based on product tag or type
- Comparison mode — see "Product Comparison Feature Definition" below; Phase 2 delivers the static product-page comparison table

### Product Comparison Feature Definition

Based on App Store competitor research (2026-06-12: Bear Specs & Compare, Equate, Compareder, Comparable, CompareXpert). Comparison is the premium-tier feature: competitors price specs at the entry tier and gate comparison behind a higher tier ($5–10/month market band). Architecturally, a comparison table is **one spec template resolved against N products instead of 1** — it reuses the existing template engine, `valueParts` resolution, and row `key` alignment. No changes to existing models; additive migrations only (`ComparisonSet`, comparison display settings).

**Stage 1 — merchant-curated static comparison (Phase 2):**

- Merchant picks comparison products per product (curated `ComparisonSet`); table renders on the product page comparing the current product against them
- Columns show product image, title, price, and add-to-cart button; rows come from the shared template
- Highlight differences / hide similarities toggle
- Row show/hide per comparison context; reuse existing drag-and-drop ordering and styling
- Mobile: sticky first column with horizontal scroll

**Stage 2 — shopper-driven dynamic comparison (Phase 3/4):**

- Compare buttons/checkboxes on collection and product pages; selection persisted client-side (e.g., localStorage)
- Comparison drawer or dedicated page for 2–4+ products side by side
- Requires storefront JS + Storefront API or section rendering to resolve other products' metafield values (Liquid alone cannot) — the main effort is the Theme App Extension, not the database

**Premium differentiators (later):** variant-level comparison, AI comparison verdicts, comparison analytics.

### Styling Upgrades

These extend the MVP Style tab. They build on the **single source of truth** — every color is a CSS variable, admin and storefront alike (see `code-standards.md` → Color & Theming) — so each item below is a new themeable surface / variable, not a new hardcoded value.

- Header row styling (separate from body rows)
- Alternating row colors (zebra striping)
- Rounded corners toggle
- Custom CSS input for advanced users
- Per-section styling overrides
- Style presets / saved themes (save a palette once, reuse across templates; room for dark-mode-aware token sets)

### Onboarding Upgrades

- Interactive walkthrough (step-by-step guided setup)
- Sample templates for common categories (Electronics, Furniture, Clothing, etc.)
- Embedded video tutorials

---

## Phase 3 — Growth (6–12 Months)

### Localization & RTL Support

- Multi-language support (translate row labels and values per locale)
- RTL layout support (Arabic, Hebrew, Urdu, Persian)
- Shopify Markets integration (different values per market)
- Locale-based field visibility

### Import & Export

- Import specs from CSV (bulk create rows and values)
- Export all specs to CSV (backup or editing in Excel/Sheets)
- PDF import/export
- Copy specs from one product to another
- Bulk edit values across multiple products

### AI-Assisted Features

- Auto-fill specs from product title/description using AI
- AI-suggested row labels for a given product category
- Generate specs from URL
- Auto-detect product type and suggest a relevant template

*High-value differentiator. Relatively low effort using AI API. Strong App Store marketing angle.*

### Analytics & Insights

- Time visitors spent on spec table vs. overall product page
- Which templates are most viewed on the storefront
- Which spec rows get the most attention
- Products with incomplete specs (missing values report)
- Conversion correlation — do products with complete specs convert better?

### Advanced Assignment

- Priority rules (template A takes priority over template B for a product)
- Page builder compatibility check
- Scheduled assignment (auto-apply a template on a specific date)
- Variant-specific templates (different spec table per variant)

---

## Phase 4 — Mature App (12+ Months)

### Collaboration & Workflow

- Role-based access (editor vs viewer for Shopify staff accounts)
- Change history / audit log (who changed what, when)
- Approval workflow (editor submits, admin approves before going live)

### Integrations

- Shopify Flow integration (trigger automations when a spec is updated)
- PIM system integration (Akeneo, inRiver, Plytix)
- Google Merchant Center — export structured data for Shopping listings
- Translation apps (Langify, Weglot, Translate & Adapt)

### Developer & Advanced Merchant Tools

- Public REST API (let merchants sync specs programmatically)
- Webhooks (notify external systems when specs change)
- Liquid snippet fallback (for themes that do not support app blocks)
- Custom field types: number, boolean, date, URL, image, file
- JSON-LD structured data output (for Google rich results and SEO)

*JSON-LD output is free SEO value for merchants. Strong differentiator and a common App Store search term.*

### Storefront UX Upgrades

- Search within specs (filter a large table by keyword)
- Collapsible sections
- Spec comparison across multiple products (like GSMArena) — Stage 2 of the "Product Comparison Feature Definition" in Phase 2 above
- Print-friendly layout
- Share specs as a direct link

### Monetization & Business

- Usage-based pricing tier (based on number of products with specs)
- White-label option for Shopify agencies
- Partner API for agencies managing multiple client stores
- Affiliate program for reviewers and content creators

---

## Top Strategic Priorities After MVP

Based on common merchant pain points with competing apps, these four features will have the highest impact immediately after MVP launch:

**1. Bulk Assignment + CSV Import**
Merchants with large catalogs (100+ products) will demand this almost immediately. Without it, the app is effectively unusable at scale. This is the #1 churn reason in competing apps.

**2. AI Auto-Fill**
A strong differentiator no competing app currently has. Low engineering effort, high perceived value, strong App Store marketing angle.

**3. JSON-LD Structured Data Output**
Gives merchants free SEO value with zero extra work. Product specs appear in Google Shopping results. Frequently cited in reviews of similar apps.

**4. Product Comparison Table**
A high-traffic conversion feature. Strong purchase driver in electronics and furniture. Also opens a premium pricing tier.

---

## Immediate Schema Priorities

Design the MVP schema so it can safely expand into:

1. Multilingual support
2. Variant-level specs
3. Flexible assignment rules
4. Styling flexibility
5. Import/export
6. AI extraction

**Final Rule:** Build the MVP schema for today. Make sure future features can be added without rewriting the entire database architecture.
