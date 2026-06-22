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
- Spec-table editor state (unsaved row edits) lives in local React state only — nothing persists until the merchant clicks Save

## Admin UI — Polaris

- Use Polaris App Home web components (`<s-...>` tags) as the default for all admin UI. Do not use legacy `@shopify/polaris` React components.
- Polaris web components do not need to be imported; they are globally registered custom HTML elements.
- Do not override Polaris component internals or styles with custom CSS unless Polaris provides no reasonable alternative.
- When custom CSS is needed, scope it tightly to the component file and add a comment explaining why Polaris alone was insufficient.
- Do not hardcode hex color literals in components — pull color from Polaris design tokens or shared CSS custom properties (see **Color & Theming**). This is not an anti-color rule: the app uses color, it just keeps every color in one source of truth.
- Accessibility is non-negotiable: all interactive Polaris components must be keyboard navigable and screen-reader labelled.

## Color & Theming

The app uses color deliberately — this is **not** a colorless, grayscale, or "neutral-only" app. The rule has always been _organization, not abstinence_: every color comes from a single source of truth so the whole palette — admin dashboard **and** storefront — can be retuned from one place. When an older note says "no hex," read it as "no scattered hex literals," never "no color."

- **One source of truth.** Define colors as CSS custom properties (variables) in one place and reference them everywhere via `var(--…)`. The thing to avoid is a raw `#rrggbb` baked into a component, not color itself — changing a brand color should mean editing one declaration, not hunting through files.
- **Admin = Polaris-faithful.** The admin dashboard must look and feel like Shopify's own admin so merchants feel they are _inside_ Shopify, not in a third-party app. Drive admin color from **Polaris design tokens** (`--p-color-*` / `--s-color-*`); do not invent an off-brand palette. (Polaris `s-*` tokens are not exposed to light-DOM CSS in the web-components build — capture the value from a Polaris component once and republish it as an app CSS variable; see [[polaris-web-component-gotchas]] and the editor's `--appx-token-color` pattern.)
- **Storefront = theme-inherit by default, merchant-overridable.** Storefront colors inherit the merchant's active theme with zero configuration, and the **Style tab** (`TableStyling`) lets the merchant override each surface (header / label / value backgrounds, border, label / value text). Overrides are emitted as the same kind of CSS variables on the table's scope wrapper, so a saved color and a default color flow through one mechanism.
- **Built to extend.** The palette and the Style-tab controls are expected to grow (more themeable surfaces, presets / saved themes, dark-mode-aware tokens). Keep colors centralized so adding a new themeable surface is a new variable, not a new hardcoded literal.

## Spec Table Editor (Admin)

- The editor is a custom React component — no AG Grid or other heavy data-grid library. The value cell is a token editor (manual text + dynamic-field pills), which a generic grid cannot model cleanly.
- Keep the rows array in a single source of truth (a reducer over `rows`); array index is display order. Reordering, insert, delete, and duplicate are array operations on that one source.
- Use `@dnd-kit` for drag-and-drop row reordering. Keep reordering keyboard-accessible (`@dnd-kit` supports this) — do not ship mouse-only drag.
- Render rows with semantic HTML and centralized color — Polaris design tokens / shared CSS variables, never hardcoded hex literals (see **Color & Theming**). Scope any custom editor CSS tightly to the component file.
- Memoize derived data and stable callbacks so a single cell edit does not re-render every row.
- Enforce the 200-row cap in the UI (warn near the limit, block at 200); the server re-validates row count on save. UI and server must both read the same exported constant — the cap is an MVP value that may increase post-MVP, so never hardcode the literal value.

## Storefront (Theme App Extension)

- Storefront code is Shopify Liquid + plain JavaScript only — no React, no build tools, no npm packages
- Keep Liquid logic minimal — resolve data in the metaobject payload before rendering, not inside Liquid templates
- Plain JavaScript on the storefront must work without a bundler — write vanilla ES6 that browsers support natively
- Scope all storefront CSS under a unique namespace wrapper (`.appx-spec-table`) to avoid clashing with the merchant's active theme. Drive table colors through CSS custom properties set on that wrapper — defaults inherit the theme, `TableStyling` overrides set the same variables — so the storefront palette stays a single source of truth (see **Color & Theming**)
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

## Testing

- Test runner is **Vitest**. `npm test` (watch) while developing, `npm run test:run` once (CI), `npm run test:coverage` for a coverage report.
- Co-locate unit tests next to the module they cover, named `*.test.ts` (e.g. `app/utils/rows.test.ts` tests `app/utils/rows.ts`).
- Import test functions explicitly from `vitest` (`import { describe, it, expect } from "vitest"`) — no global test types are configured.
- `vitest.config.ts` is standalone and must not load the React Router Vite plugin (`reactRouter()`); it expects the framework build context and breaks under Vitest.
- Prioritize testing **pure logic and security boundaries** over UI markup: the spec-table reducer (`app/utils/rows.ts`), shop isolation in `app/models/*.server.ts`, save/assignment validation, and billing/entitlement math. Do not chase 100% coverage — test what hurts if it breaks.
- Keep reducers and helpers **pure** so they stay testable: mint non-deterministic values (ids, timestamps) outside the function and pass them in (see `newRowId`).
- Polaris web components (`<s-…>`) do not render in jsdom, so component tests have limited value here — cover real editor UI behavior with end-to-end tests (Playwright), not brittle jsdom component tests.

## Scope Discipline

- Work on one feature unit at a time
- Refactoring nearby code is acceptable if the improvement is clear and the diff stays small — do not let a refactor grow into a separate feature
- If a requirement is unclear, add it as an open question in `progress-tracker.md` — do not guess and implement
- Before moving to the next unit: the current unit works end to end, `progress-tracker.md` is updated, and the app builds without errors
