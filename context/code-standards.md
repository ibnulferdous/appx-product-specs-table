# Code Standards

## General

- Keep modules small and single-purpose — one file should do one clear job
- Fix root causes, do not layer workarounds on top of broken behavior
- Do not mix unrelated concerns in one component or route handler
- Prefer explicit over clever — code should be readable by someone unfamiliar with the file
- If you find nearby code that is clearly worse and the fix is small, refactor it — but do not let the refactor expand scope beyond the current feature boundary

## TypeScript

- TypeScript throughout the admin app (`app/`) — author `.ts` / `.tsx` files; do not add plain `.js` / `.jsx` modules here. (The storefront Theme App Extension is the exception — see Storefront below.)
- Prefer precise types over `any`; type model function signatures and loader/action return values explicitly
- Validate and sanitize all external input (Shopify webhook payloads, form submissions, API responses) at the entry point — narrow `unknown` into a typed shape before passing data into app logic
- Use named exports over default exports for all non-route modules — makes imports searchable and refactoring safer
- Avoid deeply nested callbacks — flatten with `async/await`

## Remix / React Router

- Return consistent response shapes from all actions: `{ ok: true, data }` on success, `{ ok: false, error }` on failure
- Use Remix `json()` and `redirect()` helpers — do not construct raw `Response` objects unless necessary
- Do not perform long-running or background work inside loaders or actions — offload to webhooks or background jobs
- Co-locate route-specific components with the route file — only promote to `app/components/` when shared across two or more routes

## React

- Keep components focused: if a component is doing layout AND data transformation AND side effects, split it
- Do not fetch data inside components — data comes from Remix loaders via `useLoaderData`
- Lift state only as far as it needs to go — do not put local UI state in a top-level context
- AG Grid state (unsaved row edits) lives in local React state only — nothing persists until the merchant clicks Save

## Admin UI — Polaris

- Use Polaris App Home web components (`<s-...>` tags) as the default for all admin UI. Do not use legacy `@shopify/polaris` React components.
- Polaris web components do not need to be imported; they are globally registered custom HTML elements.
- Do not override Polaris component internals or styles with custom CSS unless Polaris provides no reasonable alternative.
- When custom CSS is needed, scope it tightly to the component file and add a comment explaining why Polaris alone was insufficient.
- Do not hardcode hex color values — use Polaris design tokens or CSS custom properties.
- Accessibility is non-negotiable: all interactive Polaris components must be keyboard navigable and screen-reader labelled.

## AG Grid (Admin)

- Centralize column definitions and grid options outside of the React render cycle, or inside `useMemo`, to prevent unnecessary re-renders
- Use plain CSS or standard AG Grid themes for table styling — do not fight the grid's own rendering with custom overrides

## Storefront (Theme App Extension)

- Storefront code is Shopify Liquid + plain JavaScript only — no React, no build tools, no npm packages
- Keep Liquid logic minimal — resolve data in the metaobject payload before rendering, not inside Liquid templates
- Plain JavaScript on the storefront must work without a bundler — write vanilla ES6 that browsers support natively
- Scope all storefront CSS under a unique namespace wrapper (`.appx-spec-table`) to avoid clashing with the merchant's active theme
- Do not read Appx Postgres data from the storefront — all storefront data must come from Shopify metaobjects and product metafields

## Data and Storage

- Postgres via Neon is the source of truth for all saved app data — do not treat Shopify metaobjects as the primary record
- Shopify metaobjects are the storefront delivery layer only — they are written by the app after saving to Postgres, not before
- Enforce shop ownership on every database read and write — always include `shopId` in `where` clauses; never query across shops

## File Organization

- `app/routes/` — Remix route files; one file per route; loaders and actions defined here
- `app/components/` — Shared React/Polaris components used across two or more routes
- `app/models/` — Data access functions (Prisma queries); no business logic in route files directly
- `app/shopify/` — All Shopify API calls (Admin API, metaobject writes, metafield writes, webhook handling)
- `app/utils/` — Pure utility functions with no side effects (formatters, validators, row helpers)
- `extensions/` — Theme App Extension files only; Liquid and plain JS; no app logic here
- `prisma/` — Database schema (`schema.prisma`) and migrations history
- `context/` — Project context files: roadmap, requirements, data model, progress tracker, and this file

## Scope Discipline

- Work on one feature unit at a time
- Refactoring nearby code is acceptable if the improvement is clear and the diff stays small — do not let a refactor grow into a separate feature
- If a requirement is unclear, add it as an open question in `progress-tracker.md` — do not guess and implement
- Before moving to the next unit: the current unit works end to end, `progress-tracker.md` is updated, and the app builds without errors
