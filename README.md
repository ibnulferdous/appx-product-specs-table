# Appx — Product Specs Table

A Shopify app that lets merchants build **product specification tables** in the
admin and render them on their storefront product pages.

A merchant authors a table once — rows of label/value pairs, grouped into
sections — styles it, and assigns it to the products that should show it. Values
can be static text or dynamic parts that resolve per product (a native Shopify
field, or a product metafield), so one template covers a whole range of products
without being re-authored for each.

## How it works

```
Admin (embedded app)          Postgres            Shopify              Storefront
┌────────────────────┐      ┌──────────┐      ┌────────────┐      ┌──────────────┐
│ Spec-table editor  │─────▶│ Template │─────▶│ Metaobject │─────▶│ Theme app    │
│ Content · Style ·  │      │ Styling  │      │ + routing  │      │ block renders│
│ Settings           │      │ Assignmt │      │ metafield  │      │ the table    │
└────────────────────┘      └──────────┘      └────────────┘      └──────────────┘
```

- **Editor** — a custom React two-column editor (not a data grid): drag-and-drop
  row reorder via `@dnd-kit`, a token-based value cell for dynamic parts, paste
  from a spreadsheet, and read-only Desktop/Mobile storefront previews.
- **Persistence** — Prisma against PostgreSQL (Neon). Every read and write is
  scoped by `shopId`.
- **Delivery** — on Save, the server writes a storefront-ready copy into an
  app-owned metaobject (`$app:appx_spec_table`), including precomputed styling
  CSS. A shop-level `$app:routing` JSON metafield maps product attributes to
  template handles.
- **Storefront** — a Theme App Extension (Liquid + plain JS) resolves the right
  template for the product and prints it. The Liquid contains no styling logic;
  the server precomputes, Liquid only prints.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Shopify App Template — React Router (TypeScript) |
| Admin UI | Polaris web components + App Bridge |
| Database | PostgreSQL (Neon) via Prisma |
| Storefront | Theme App Extension (Liquid + plain JS) |
| Tests | Vitest |

## Getting started

### Prerequisites

- Node.js `>=20.19 <22 || >=22.12` (the `engines` field in `package.json`)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
- A Shopify Partner account and a development store
- A PostgreSQL database (this app uses [Neon](https://neon.tech/))

### Setup

```bash
npm install
```

Create a `.env` with at least a `DATABASE_URL`. ⚠️ Neon computes suspend when
idle, and Prisma's default 5s connect timeout is shorter than a cold start —
append `connect_timeout=30` to the connection string:

```
DATABASE_URL="postgresql://…/dbname?sslmode=require&connect_timeout=30"
```

Apply the schema:

```bash
npm run setup
```

### Local development

```bash
shopify app dev
```

Press `P` to open the app URL, then install it on your development store.

⚠️ **The default Cloudflare tunnel fails regularly on this project.** The
supported path is a static ngrok domain, in two terminals:

```bash
npm run tunnel
```

```bash
npm run dev:tunnel
```

On ngrok's free tier the first browser request gets a "You are about to visit…"
interstitial. The app renders in an admin iframe, so an unclicked interstitial
makes the app look **broken rather than warned** — open the ngrok URL in a plain
tab and click **Visit Site** once; the cookie lasts 7 days per browser profile.

⚠️ **After running a Prisma migration, restart `shopify app dev`.** A stale dev
server keeps the old client and Saves fail *silently* — no error surfaces in the
admin.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | `shopify app dev` (default Cloudflare tunnel) |
| `npm run tunnel` | ngrok on the project's static domain |
| `npm run dev:tunnel` | `shopify app dev` against that ngrok domain |
| `npm run build` | Production build |
| `npm test` | Vitest |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier check |
| `npm run setup` | `prisma generate` + migrate |

The CI gate (`.github/workflows/ci.yml`) runs typecheck → lint → format:check →
test → build, and is the same gate expected to pass locally before any unit of
work is considered done.

## Project layout

```
app/
  routes/
    _index/                     public splash + shop-domain login (no `shop` param)
    app.tsx                     embedded shell: auth, shop upsert, app nav
    app._index.tsx              home
    app.templates.tsx           templates list
    app.templates_.$id/         the editor (Content · Style · Settings)
    app.templates_.choose-style/ the style-preset gallery
    webhooks.*                  app lifecycle + mandatory compliance webhooks
  models/                       shop-scoped Prisma access
  shopify/                      Admin API calls (metaobjects, routing, counts)
  utils/                        pure domain logic (rows, styling, assignment)
extensions/
  product-specs-table/          Theme App Extension (Liquid + JS + CSS)
prisma/                         schema + migrations
context/                        the project's source of truth — see below
```

## Documentation

`context/` is the source of truth for this project, not this README:

- `context/progress-tracker.md` — current phase, what is done, what is next,
  binding rules and open questions. **Start here.**
- `context/prd.md` — product requirements and scope boundaries.
- `context/data-model.md` — Prisma schema, row JSON, assignment logic,
  metaobject strategy, architecture invariants.
- `context/code-standards.md` — coding conventions and file organization.
- `context/ai-workflow-rules.md` — how work is sequenced and which files are
  protected.
- `context/features/NN-*.md` — one binding spec per unit of work.

## Troubleshooting

### Navigating/redirecting breaks the embedded app

Embedded apps must maintain the session inside an iframe:

1. Use `Link` from `react-router`, not a bare `<a>`.
2. Use the `redirect` returned from `authenticate.admin`, not the one from
   `react-router`.
3. Use `useSubmit` from `react-router`.

### Webhook subscriptions are not updating

App-specific webhooks are declared in `shopify.app.toml` and sync on
`shopify app deploy`. If you are registering them in `afterAuth` instead, they
only update on install or token expiry.

### `Unable to require(query_engine-windows.dll.node)`

On Windows ARM64 the Prisma engines may not load. Set:

```bash
PRISMA_CLIENT_ENGINE_TYPE=binary
```

### Metaobject data disappears on the dev store

`shopify app dev clean` wipes app-owned metaobject data that has never been
deployed. Run `shopify app deploy` once to anchor the definitions.

## Resources

- [Shopify App React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Polaris web components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- [App Bridge](https://shopify.dev/docs/api/app-bridge-library)
- [Theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
- [Metafields and metaobjects](https://shopify.dev/docs/apps/build/custom-data)
