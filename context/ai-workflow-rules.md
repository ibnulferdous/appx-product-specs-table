# AI Workflow Rules

The standing rules in `CLAUDE.md` (one feature unit at a time, update `progress-tracker.md`, checklist before moving on) apply to every session. This file covers the additional workflow detail that is not already in `CLAUDE.md`.

---

## Spec-Driven Approach

Always implement against the context files — do not infer or invent behavior from scratch. Read the relevant files in the order defined in `CLAUDE.md` before writing any code. If a requirement is ambiguous or missing, add it as an open question in `progress-tracker.md` and stop — do not guess and implement.

---

## When to Split Work

Split an implementation step if it combines:

- Admin UI changes (Polaris / React) **and** Storefront changes (Liquid / Theme Extension)
- Database schema changes (`schema.prisma`) **and** complex UI logic in the same step
- Behavior that is not clearly defined in `prd.md` or `data-model.md`

If a change cannot be verified end to end quickly, the scope is too broad — split it.

---

## Protected Files

Do not modify these unless explicitly instructed:

- `shopify.app.toml` and related Shopify CLI config files
- `prisma/migrations/*` — never edit migration history manually
- `package-lock.json`

---

## Running the App Locally

When a change needs to be verified in a real browser (anything beyond `npm run build`), launch the embedded app through the Shopify CLI:

1. Run `shopify app dev` in the terminal at the project root. The CLI spins up the React Router dev server, opens a Cloudflare tunnel, and connects the app to the configured development store.
2. Wait for the CLI to print the preview URL.
3. Press `p` in the same terminal to open that URL in the default browser — this loads the app embedded inside the Shopify Admin on the dev store.
4. Leave the process running while iterating; file changes hot-reload. Stop with `Ctrl+C` when verification is finished.

Notes:

- Run `shopify app dev` in the foreground in an interactive terminal — it is long-running, prints an interactive menu (`p`, `q`, etc.), and must not be invoked through a non-interactive shell tool.
- If `shopify app dev` is already running in another terminal, do not start a second instance; reuse the existing tunnel URL.
- Database migrations (`npx prisma migrate dev`) and `npm run build` are separate, non-interactive commands and should be run independently — not while the dev server is using the database connection.

---

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries → `data-model.md`
- Storage model decisions → `data-model.md`
- Code conventions or standards → `code-standards.md`
- Feature scope additions or removals → `prd.md`
- Progress, decisions, open questions → `progress-tracker.md`
