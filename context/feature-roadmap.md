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
- Comparison mode (compare two products side by side)

### Styling Upgrades

- Header row styling (separate from body rows)
- Alternating row colors (zebra striping)
- Rounded corners toggle
- Custom CSS input for advanced users
- Per-section styling overrides
- Style presets (save a style and reuse across templates)

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
- Spec comparison across multiple products (like GSMArena)
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
