## Application Building Context

**App:** Appx — Product Specs Table
**Stack:** Shopify App Template (Remix / React Router, TypeScript) · PostgreSQL via Neon · Prisma · Custom React spec-table editor (@dnd-kit drag-and-drop) · Theme App Extension (Liquid + plain JS)

---

## Role & Priorities

You are building a production-quality Shopify app intended for the public App Store — used by real merchants on live storefronts. Write clean, maintainable code, but never at the expense of correctness, security, or Shopify App Store compliance.

When resolving trade-offs, prioritize in this order:

1. **Merchant data safety** — enforce shop isolation on every read/write; never leak or cross-query data between shops.
2. **Storefront correctness & accessibility** — the spec table renders for end shoppers; broken or inaccessible output is a shipped bug.
3. **App Store review compliance** — follow Shopify's policies, billing, and webhook requirements; a rejected app ships nothing.
4. **Maintainability** — clear, single-purpose modules a reviewer can read, without premature abstraction.

Think like a senior Shopify app engineer: respect the platform's constraints (rate limits, webhook retries, metaobject delivery model) rather than working around them.

---

Read the following files in order before implementing or making any architectural decision:

1. `context/prd.md` — product requirements: problem
   statement, core user flow, MVP features, data
   sources, storefront display rules, styling,
   pricing strategy, technical stack, success
   criteria, and in/out-of-scope boundaries

2. `context/data-model.md` — technical source of
   truth: Prisma schema, row JSON structures,
   assignment logic, Shopify metaobject strategy,
   and architecture invariants

3. `context/code-standards.md` — coding conventions,
   file organization rules, stack-specific standards
   (Remix, Polaris, Prisma, custom spec-table editor)

4. `context/ai-workflow-rules.md` — spec-driven
   approach, when to split work, protected files,
   and which context file to update for each type
   of change

5. `context/progress-tracker.md` — current phase,
   current goal, completed work, in-progress items,
   next up, open questions, and session notes

Read `context/feature-roadmap.md` only when a
decision could block a post-MVP feature — e.g.,
schema design or feature boundary choices.

---

### Standing Rules

- Update `context/progress-tracker.md` after every
  meaningful implementation change.

- If implementation changes the architecture, scope,
  or standards documented in the context files, update
  the relevant file **before** continuing.

- Do not invent behavior not defined in the context
  files. If a requirement is ambiguous or missing, add
  it as an open question in `progress-tracker.md`
  first.

- Work one feature unit at a time. Prefer small,
  verifiable increments. Do not combine unrelated
  system boundaries in a single step.

- Before moving to the next unit, confirm:
  1. The current unit works end to end within its scope
  2. No invariant in `context/data-model.md` was violated
  3. `progress-tracker.md` reflects the completed work
  4. `npm run build` passes
