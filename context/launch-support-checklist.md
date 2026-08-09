# Launch Infrastructure & Support Checklist

Working checklist for turning `hiappx.com` into the app's production identity and
standing up merchant support. Work top to bottom — **the phases are ordered by
dependency**, not by importance.

> **Scope note.** Phases 0–3 also clear **App Store blocker #1** (`application_url` is
> still `https://example.com`). **Blocker #2 (billing) is NOT in this checklist** — it is
> tracked separately in `progress-tracker.md` § Current Goal. Clearing this checklist
> does not by itself make the app submittable.

**Status legend:** `[ ]` todo · `[x]` done · `[~]` in progress · `[-]` skipped (say why)

> **Two tracks.** Phases 0–7 are the **infrastructure track** (sequential). The **Demo
> store track (D1–D11)** below runs in **parallel** and should start now — but 🔴 **D5 is a
> hard gate**: the spec tables themselves cannot be built until the production database
> exists, or the work is silently thrown away. Read D5 before starting D1.

---

## Phase 0 — Domain & email hardening

You have the domain and the mailbox. What's left is making sure mail from
`support@hiappx.com` actually lands in merchant inboxes instead of spam. This is
invisible when it breaks, which is why it goes first.

> **Status 2026-08-08:** MX ✅ · SPF ✅ · DKIM ✅ (selector `zmail`, verified).
> Remaining: **DMARC (0.7)**, the **deliverability smoke test (0.8)**, and the
> **subdomain map (0.3)**.

- [x] **0.1 — Domain purchased** — `hiappx.com`
- [x] **0.2 — Support mailbox** — `support@hiappx.com` on Zoho Mail (free tier)
- [ ] **0.3 — Decide the subdomain map** and write it down here.

  Recommended split:

  | Host | Purpose | Why |
  | --- | --- | --- |
  | `hiappx.com` | Marketing / landing page | Public face; also where the App Store listing's "Website" points |
  | `hiappx.com/privacy`, `/terms` | Legal pages | Required listing links; must stay up even if the app is down |
  | `hiappx.com/docs` **or** `docs.hiappx.com` | Help documentation | See 4.4 |
  | `app.hiappx.com` | The Shopify app server | `application_url` — this is the only host that runs Node |

  🔴 **Keep docs + legal OFF `app.hiappx.com`.** The app host restarts on every deploy
  and can go down; your privacy policy and docs must not. Shopify's reviewer *will*
  click those links, and a merchant reading troubleshooting docs is often doing so
  precisely because the app is misbehaving.

  **Done when:** the table above is filled in with your final choices.

- [x] **0.4 — Zoho MX records** — ✅ 2026-08-08. Console (Email Configuration → MX):
      *"Your domain's MX Records are pointed to Zoho."* Domain ownership **Verified**
      (by `ibnul@hiappx.com`, added 2026-08-07); `hiappx.com` is the primary domain.

- [x] **0.5 — SPF record** — ✅ 2026-08-08. Console (→ SPF): *"Your domain's SPF Records
      have been pointed successfully."*

  ⚠️ **Standing constraint, still live:** only **one** SPF record per domain is legal.
  When a transactional sender is added later (see 0.9), merge its `include:` into this
  record — never publish a second TXT. Two SPF records is a hard fail, not a warning.

- [x] **0.6 — DKIM** — ✅ 2026-08-08. Selector **`zmail`**, TXT published at
      `zmail._domainkey.hiappx.com`, console status **Verified**, DKIM toggle on.

- [ ] **0.7 — Publish a DMARC record.** ⬅️ **NEXT — the only unfinished piece of the
      authentication triad.**

  Zoho has a **DMARC** tab right below DKIM under Email Configuration; use it to generate
  the record, or publish the TXT directly at `_dmarc.hiappx.com`:

  `v=DMARC1; p=none; rua=mailto:support@hiappx.com`

  Leave it at `p=none` for a few weeks, read the aggregate reports, then tighten to
  `p=quarantine`. Going straight to `p=reject` on a fresh domain risks losing real mail.

  ⚠️ Without DMARC, SPF and DKIM still pass individually but no policy ties them to the
  `From:` domain — some receivers treat that as a weaker signal, and you get no reports
  telling you who is sending as `hiappx.com`.

  **Done when:** the record resolves and Zoho's DMARC tab shows it.

- [-] **0.7b — BIMI** — skipped deliberately. The BIMI tab sits under Email Configuration
      and looks like part of the set, but it requires a **Verified Mark Certificate** tied
      to a registered trademark (~$1k+/yr). It only paints a logo next to your name; it does
      nothing for deliverability. Revisit only if the brand is trademarked later.

- [ ] **0.8 — Deliverability smoke test.** ⬅️ **The step that actually proves it works.**

  🔴 **Zoho's three green checkmarks confirm the records are *published* — not that your
  mail reaches inboxes.** They are a config check, not a delivery check. Only a real send
  tells you the truth.

  Send from `support@hiappx.com` to a Gmail address, an Outlook/Hotmail address, and
  (ideally) a Yahoo address. Check **Inbox vs Spam** in each, then in Gmail use
  *Show original* and confirm three lines: `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.

  ⚠️ Do this **after** 0.7 — DMARC won't report PASS until the record exists.

  **Done when:** all three land in Inbox with three PASSes.

- [ ] **0.9 — Note the Zoho free-tier limits** so you don't design around capabilities
      you don't have.

  - 5 users, 5 GB/user, one custom domain.
  - **Web and mobile app access only — no IMAP/SMTP** on the free plan. You cannot wire
    this mailbox into Outlook/Thunderbird, and **you cannot send app-generated
    transactional email through it.**
  - The Forever Free plan is region-restricted.

  🔴 **Consequence:** the day the app needs to *send* email (it currently doesn't —
  billing is handled by Shopify), you need a separate transactional sender (ZeptoMail,
  Resend, Postmark). When you add one, its `include:` must be **merged into the existing
  SPF record**, not added as a second one.

  **Done when:** you've confirmed the limits on your own account and accepted them.

---

## Parallel track — Demo store & listing media (D1–D11)

The demo store is not one listing field. It is the **single asset that five deliverables
are built from**: the listing's demo link, the 3–6 listing screenshots, the promo video,
the tutorial videos, and your own dogfooding pass. It also turns out to be the best
end-to-end test of the production stack you will get before a real merchant runs one.

**Start D1–D4 now, in parallel with Phase 0–2.** They have no dependency on hosting.

### Three facts that shape this track

1. 🟢 **A free development store is the right vehicle — Shopify says so explicitly.**
   The listing best-practices doc says: *provide a link to a development store that
   showcases your app.* You do **not** need a paid plan.

2. 🟡 **The dev-store password page is bypassed for visitors arriving from the listing.**
   This is clearly documented for Theme Store listings and is reported to work the same
   for app listings, but no Shopify staff member has confirmed it for apps in writing.
   **Treat it as probable, not certain** — D11 verifies it, and there is a fallback.

3. 🟢 **The demo storefront keeps working when the app server is down.** The spec table is
   rendered by the Theme App Extension reading Shopify-hosted data (`$app:appx_spec_table`
   metaobjects, the `$app:routing` shop metafield, the routing shards) — it never calls
   `app.hiappx.com`. So deploys, restarts, and outages do not break the demo. ⚠️ The app
   must stay **installed**, though: uninstalling removes the extension.

---

- [ ] **D1 — Choose the niche and invent a brand.**

  Spec tables sell hardest where products carry many comparable attributes: consumer
  electronics, power tools, bicycles, appliances, auto parts, industrial components.

  🔴 **Use a fictional brand and imagery you have the rights to.** `appx-dev` currently
  uses real DJI products and photos — fine for a private dev store, **not fine for a
  publicly-linked demo store**. A public storefront using a real manufacturer's
  trademarks and product photography is a genuine legal exposure, and it is linked from
  your App Store listing under your company name. Invent the brand; generate or license
  the imagery.

  **Done when:** niche + brand name chosen and written here.

- [ ] **D2 — Create a dedicated development store.**

  🔴 **A new store, not `appx-dev`.** The dev store is full of test artifacts, half-built
  templates, two app installs during the Phase 1 transition, and the real DJI data. The
  demo store must stay clean and presentable.

  **Done when:** store created in the Partner Dashboard, named for the fictional brand.

- [ ] **D3 — Pick and configure the theme.**

  Use a current free Shopify theme. ⚠️ Note from [[dev-store-theme-horizon-no-dark-scheme]]:
  the default Horizon theme ships nine schemes that are all white/black, which makes the
  Style tab's colour work look less impressive than it is. Either pick a theme with more
  colour range, or customise a scheme so the accent themes actually read on screen.

  **Done when:** theme installed, branded, homepage presentable.

- [ ] **D4 — Build the catalog and the metafields.** ⏳ **The long pole — start here.**

  This is the time sink and it is entirely app-independent. You need:

  - **8–15 products**, enough to fill a plausible storefront
  - **At least 2–3 product types** — required to demo TYPE-scope assignment
  - **At least one collection** — required to demo COLLECTION-scope assignment
  - **Metafield definitions with real values**, covering the types that matter:
    - a plain `single_line_text_field`
    - a **measurement** type (`dimension` / `weight`) — the duck-typed `.unit` branch is
      still **unexercised by any test**; the demo store is where it finally gets proven
    - a `list.*` type (e.g. `list.number_integer`)
    - a **metaobject-backed taxonomy** field (`shopify.*`) — the known blank-cell trap
  - 🔴 **Storefront API access enabled on every definition** — this is the #1 silent
    blank-cell cause and the demo store is where you will feel it as a merchant does

  **Done when:** catalog complete, all metafields populated, storefront browsable.

- [ ] **D5 — ⛔ GATE: do not build spec tables until the production database exists.**

  🔴 **A spec table lives in two places at once:** the template row in **your Postgres**
  (source of truth) and the **Shopify metaobject** (delivery). The metaobject is owned by
  the app's `client_id` and survives anything; the Postgres row does not.

  So if you build the demo store's templates now against the **dev** database and later
  stand up a **separate production database** (Phase 2.2), the app comes up empty while
  the storefront keeps rendering tables it can no longer edit — orphaned delivery data and
  a source of truth that has vanished. Every template has to be rebuilt by hand.

  **Two ways through, pick one and record it:**

  - **(a) Wait** — finish Phase 2 (prod host + prod DB), then build tables against
    production. Cleanest. D1–D4 keep you busy meanwhile.
  - **(b) Build now on the dev stack and accept a rebuild** — only worth it if the
    dogfooding feedback is more valuable to you right now than the rebuild costs. It is a
    real option; just choose it knowingly rather than discovering it.

  ⚠️ Related, same root cause: install the **app that will become production** (the
  existing `11731a3d…` client_id, per Phase 1.2) on the demo store. Installing a *new* dev
  app instead would write the metaobjects under a different `$app:` namespace, and they
  would not carry over.

  **Done when:** (a) or (b) chosen and written here.

- [ ] **D6 — Install the production app and build the demo templates.**

  Build 3–4 templates that between them show:

  - all three data-source types — manual TEXT, `SHOPIFY_FIELD` pills, `METAFIELD` pills
  - section headers and a table long enough to look real (~15–25 rows)
  - **different presets and accent themes per template**, so the Style tab's range is
    visible on the storefront rather than only in the editor

  🟢 **This is also your dogfooding pass.** Use the app the way a merchant would — no
  shortcuts, no database pokes. Log every friction point and bug as you hit them; that
  list is more valuable than the templates.

  **Done when:** templates live and rendering on the demo storefront.

- [ ] **D7 — Make the demo store a routing showcase.**

  Assign across **all four tiers** — a PRODUCT-scoped assignment, a TYPE-scoped one, a
  COLLECTION-scoped one, plus **one exclude carve-out**. This demonstrates the assignment
  engine to merchants *and* exercises the routing shards, the exclude gate, and the
  co-location rule against the production stack.

  **Done when:** each tier verifiably drives a different product page.

- [ ] **D8 — Add contextual instructions to the storefront.**

  Shopify's guidance: *link directly to the page that best demonstrates your app's
  functionality and add contextual instructions.* Put a short line above or below each
  table ("The specification table below is generated automatically by Appx"), and point
  the listing's demo link at a **specific product page**, not the homepage.

  **Done when:** the demo link URL is chosen and written here.

- [ ] **D9 — Listing screenshots.** Specs are fixed — build to them:

  - **1600 × 900 px (16:9)**, **3–6 desktop screenshots**
  - at least one showing the **app's admin UI**
  - **crop out all browser chrome** 🟢 *(which is why screenshots do not depend on the
    production URL — the address bar never appears)*
  - no PII, no pricing, no review quotes, no outcome guarantees
  - **alt text on every image**
  - add mobile/responsive shots if you have them

  **Done when:** 3–6 exported at exact dimensions with alt text drafted.

- [ ] **D10 — Videos.**

  - **Listing promo video: 2–3 minutes, promotional not instructional** — 🔴 screencast
    footage is capped at **25% of total runtime**. This is the constraint people miss;
    a 3-minute screen recording will be rejected as a feature video.
  - **Onboarding screencast (§4.5.3)** — separate deliverable, this one *is*
    instructional, step-by-step, English or English subtitles. Feeds checklist 5.6.
  - Tutorial videos for the docs site can follow after launch.

  **Done when:** promo video + onboarding screencast recorded.

- [ ] **D11 — Verify the password bypass from the live listing.**

  Once the listing draft has the demo URL, open it from the listing in a **logged-out
  private window** and confirm no password prompt.

  **Fallback if it does prompt:** put the storefront password in the listing's contextual
  instructions (Shopify's own guidance for theme demos is to share it), or upgrade the demo
  store to the cheapest paid plan. **Do not use third-party password-removal services** on
  a store linked from your listing.

  **Done when:** confirmed, or the fallback is applied.

---

## Phase 1 — Split the dev and production app configs

**Do this before the production deploy.** It's a 30-minute decision that is painful to
retrofit.

- [ ] **1.1 — Understand the problem.**

  `shopify.app.toml` currently has `automatically_update_urls_on_dev = true`. That is why
  every `shopify app dev` run rewrites `application_url` to the ngrok tunnel — and it is
  exactly what will clobber your production URL the next time you develop.

- [ ] **1.2 — Decide: one app or two?**

  **Recommended — two apps, two config files** (this is Shopify's documented practice):

  | File | App | `automatically_update_urls_on_dev` | Used for |
  | --- | --- | --- | --- |
  | `shopify.app.dev.toml` | a **new** dev app | `true` | daily `shopify app dev` |
  | `shopify.app.toml` | the existing app (`11731a3d…`) → becomes **production** | `false` | `shopify app deploy` |

  Switch with `shopify app config use <name>` (already scripted as `npm run config:use`).

  **Why keep the existing client_id as production:** it has never been public, but it
  already anchors your app-owned metaobject definitions (`appx_spec_table`,
  `appx_routing_shard`) and has 11 deployed versions. Making it production costs nothing;
  making it the *dev* app would mean re-anchoring definitions on a fresh prod app.

  ⚠️ **Cost of this split:** the new dev app needs its own `shopify app deploy` to anchor
  the metaobject definitions on your dev store, and installing it is a fresh install. Budget
  an hour and expect the `appx-dev` store to hold two installs during the transition.

  **Alternative — one app:** simpler today, but every dev session overwrites the
  production URL and you must remember to re-deploy. Only choose this if you accept that
  risk knowingly.

  **Done when:** decision recorded here, with a one-line reason.

- [ ] **1.3 — Create the dev config** (if you chose two apps).

  `shopify app config link` to generate the second file, or `npm run dev -- --reset` and
  choose *Create new app*. Then copy `[access_scopes]`, `[webhooks]`, and the metaobject
  definition blocks across so the two apps stay behaviourally identical.

  🔴 **The two TOMLs must not drift.** A scope or metaobject definition present in one and
  not the other produces bugs that only reproduce in one environment.

  **Done when:** `shopify app config use` switches cleanly both ways and `shopify app config validate` passes on both.

---

## Phase 2 — Stand up the production host

Target (already decided, 2026-08-03): **one long-running Node server**, not serverless.
A `Dockerfile` and a `docker-start` script (`prisma generate && prisma migrate deploy && react-router-serve`) already exist.

- [ ] **2.1 — Pick a host.**

  **Recommended: Render.** Docker-native, persistent process, free managed TLS, custom
  domains, deploy-on-push. Closest thing to zero-ops for a solo developer on Windows.

  **Alternative: Fly.io** — cheaper and faster, more ops surface (`flyctl`, volumes,
  regions). **Avoid Vercel/Netlify** — serverless, which contradicts the hosting decision
  and the Prisma pooling assumptions.

  **Done when:** account created, payment method on file, region chosen **close to your
  Neon region** (cross-region DB latency will show up directly in Save times).

- [ ] **2.2 — Create the production Neon database.**

  Do **not** ship on the dev branch/database. Create a production project or branch.

  **Done when:** you have a production `DATABASE_URL` and have run `prisma migrate deploy`
  against it successfully.

- [ ] **2.3 — Set production environment variables** on the host:

  - `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` (from the **production** app)
  - `SCOPES` = `write_metaobject_definitions,write_metaobjects,write_products`
  - `SHOPIFY_APP_URL` = `https://app.hiappx.com`
  - `DATABASE_URL` — 🔴 **include `connect_timeout=30`.** Prisma's 5 s default is shorter
    than a Neon cold-start wake and produces P1001 errors that look like outages.
  - `NODE_ENV=production`

  **Done when:** all set, and none of them are committed to git.

- [ ] **2.4 — First deploy and boot.**

  **Done when:** the host reports a healthy running process and the logs show the server
  listening. Hitting the root URL in a browser will *not* render the app (it needs a
  Shopify session) — a Shopify auth redirect or a 4xx is the expected, correct response.

- [ ] **2.5 — Point `app.hiappx.com` at the host and issue TLS.**

  Add the CNAME your host specifies; wait for certificate issuance.

  **Done when:** `https://app.hiappx.com` serves over valid TLS with no certificate
  warning, and does **not** redirect to the raw host domain.

- [ ] **2.6 — Revisit the Neon connection mode.**

  Open follow-up from the hosting decision: the pooled Neon endpoint runs in
  **transaction** mode with plain Prisma-over-TCP, which can collide on prepared
  statements. Evaluate `pgbouncer=true` or the `@prisma/adapter-neon` driver adapter
  **before** real traffic.

  **Done when:** decided and recorded (either applied, or explicitly deferred with a reason).

---

## Phase 3 — Wire Shopify to the domain (clears blocker #1)

- [ ] **3.1 — Update the production TOML.**

  ```toml
  application_url = "https://app.hiappx.com"

  [build]
  automatically_update_urls_on_dev = false

  [auth]
  redirect_urls = [ "https://app.hiappx.com/api/auth" ]
  ```

  **Done when:** `shopify app config validate` returns `valid: true`.

- [ ] **3.2 — Audit what else is staged in the TOML before deploying.**

  ⚠️ Several TOML edits were made and deliberately left undeployed, and the tracker entries
  predate the **version 11** deploy — so some may already be live. **Verify against the
  Partner Dashboard rather than trusting the notes.** Check specifically:

  - the two removed demo metafield definitions (step 107 Unit A)
  - the removed per-product `[product.metafields.app.spec_table]` definition (2026-08-04)
  - the `appx_routing_shard` metaobject definition (feature 108 — believed anchored by v11)

  **Done when:** you know, for each, whether it is already live or will ship with this deploy.

- [ ] **3.3 — Deploy.**

  ```bash
  npm run deploy
  ```

  **Done when:** a new app version is created without errors.

- [ ] **3.4 — Verify the compliance webhook URIs re-anchored.** 🔴 **This is the whole point of blocker #1.**

  In the Partner Dashboard, confirm all three now resolve against `app.hiappx.com`:
  `/webhooks/customers/data_request`, `/webhooks/customers/redact`, `/webhooks/shop/redact`.

  **Done when:** none of the three contains `example.com`.

- [ ] **3.5 — Install on a clean dev store with NO `shopify app dev` running.**

  🔴 **This is the test that has never actually been run.** Every check so far passed
  because the CLI was rewriting URLs live. Compliance webhooks are the one class Shopify
  delivers with no dev session active — `shop/redact` arrives ~48 h after uninstall.

  **Done when:** OAuth completes, the embedded app loads inside the admin iframe, and you
  can create and save a template — all with the dev server stopped.

- [ ] **3.6 — Fire signed test webhooks at production.**

  Reuse the local webhook-testing approach against `https://app.hiappx.com`.
  ⚠️ `X-Shopify-Webhook-Id` is required — without it you get a 400 that looks like a
  signature failure but isn't.

  **Done when:** all three compliance endpoints return 200 for a valid signature and 401
  for an invalid one.

- [ ] **3.7 — Full uninstall → 48 h wait → confirm `shop/redact` landed.**

  **Done when:** production logs show the delivery and the six-table erase ran.

---

## Phase 4 — Public pages

These are listing requirements and support deflection, on the marketing host (not `app.`).

- [ ] **4.1 — Landing page at `hiappx.com`.** Can be one static page: what the app does,
      screenshots, link to the App Store listing, link to docs, `support@hiappx.com`.
      **Done when:** live over HTTPS.

- [ ] **4.2 — Privacy policy at `hiappx.com/privacy`.** 🔴 **Required — the only mandatory listing link.**

  It must describe **what you actually store**. Reconcile it against the real schema
  before publishing: the `shop/redact` path covers six tables, and you now also write
  app-owned metaobjects (`appx_spec_table`, `appx_routing_shard`) and a shop-level routing
  metafield. Name the app, the company, and a contact for data requests.

  **Done when:** live, and cross-checked line by line against `data-model.md` §15.

- [ ] **4.3 — Terms of service at `hiappx.com/terms`.** Optional but expected on a paid app.

- [ ] **4.4 — Help documentation.**

  **Recommended:** a static site (Astro/Docusaurus) in this repo, deployed to
  `hiappx.com/docs`. Docs then live next to the code that changes them — which matches how
  `context/` is already maintained. Avoid Notion-as-docs on a paid listing.

  Minimum page set for launch:

  1. Install & add the app block to your theme ← 🔴 **required by App Store §5.1.3**
  2. Create your first spec table
  3. Assign templates to products (scopes, and exclude carve-outs)
  4. Using metafields — 🔴 **must cover enabling Storefront API access on the definition**;
     this is a known silent-blank-cell cause
  5. Styling: presets, accents, and the Style rail
  6. Troubleshooting: "my table isn't showing on the product page"
  7. Billing & plans
  8. Uninstalling & what happens to your data

  **Done when:** all 8 pages live and linked from the app.

---

## Phase 5 — App Store listing support fields

- [ ] **5.1 — Support email:** `support@hiappx.com`
- [ ] **5.2 — Privacy policy URL:** `https://hiappx.com/privacy`
- [ ] **5.3 — FAQ / docs / changelog URLs** (optional fields, but every competitor fills them)
- [ ] **5.4 — Demo store link** — competitors all offer one; it converts browsers into installs.
      Built in the **Demo store track (D1–D11)**; link to the specific product page chosen in
      **D8**, not the homepage.
- [ ] **5.4b — Listing screenshots + feature video** — produced in **D9/D10**
      (1600×900, 3–6 shots; promo video 2–3 min with screencast ≤ 25%)
- [ ] **5.5 — Emergency developer contact** in the Partner Dashboard (§4.5.6) — a channel you
      actually monitor, and **deliberately not the support inbox**. `ibnul@hiappx.com` (the
      domain-verification account, already on the Zoho plan) is the natural fit: critical
      Shopify notices must not queue behind merchant tickets.
- [ ] **5.6 — Onboarding screencast** (§4.5.3) — step-by-step through setup of the core
      feature, English or English subtitles. Recorded on the demo store in **D10**.
      ⚠️ **Not the same asset as the listing promo video** — that one is capped at 25%
      screencast; this one is entirely screencast.
- [ ] **5.7 — Testing instructions + working test credentials** (§4.5.4/4.5.5), including how
      to add the theme app block
- [ ] **5.8 — State your response-time commitment** (e.g. "within 1 business day") and honor it.
      Support responsiveness is the loudest differentiator in this niche's review corpus.

---

## Phase 6 — In-app support

Build order matters: 6.1 is small and unblocks the rest.

- [ ] **6.1 — `/app/help` route** — docs links, contact, app version.
      Also closes finding **L1** (unmatched URLs render a bare 404 outside the `ErrorBoundary`).
- [ ] **6.2 — Support link extension + App Bridge handler** so Shopify's "Get support" button
      routes into the app.
      🔴 **Without the extension the handler is silently ignored.** Target appears to be
      `admin.app.support.link` with `url = "app://help"` — **verify against live docs when building**,
      since the general `admin_link` docs show relative paths instead.
- [ ] **6.3 — Diagnostics panel** — the highest-leverage item, and the one no competitor has:
  - Is the app block installed in the published theme? (kills the #1 ticket)
  - Which template resolves for product X, and **why** — matched tier, or "excluded by carve-out"
  - Metafield health — flag definitions used in templates that lack Storefront API access
  - **Copy diagnostics** → shop domain, app version, template id, `ROUTING_WIRE_VERSION`,
    shard bucket, theme name, timestamp — pre-filled into the support handler
- [ ] **6.4 — Theme-editor deep link** with the app block pre-added (`addAppBlockId`), from
      onboarding and from diagnostics. Explicitly recommended by §5.1.3 and the single
      highest-ROI support artifact available.
- [ ] **6.5 — Error and empty states link to the matching docs page** rather than saying
      "something went wrong".

---

## Phase 7 — Support process

- [ ] **7.1 — Canned responses** for the top 10 tickets, kept in this repo.
- [ ] **7.2 — Reply to every App Store review**, positive and negative. It's public and it converts.
- [ ] **7.3 — Inbox routine** — a defined time each day you clear `support@hiappx.com`.
- [ ] **7.4 — Decide on Built for Shopify.** The badge requires a **30-minute first response
      for critical requests** (multi-merchant outages and security reports only — not routine
      questions), plus p95 < 500 ms over 1000+ requests/28 days. Needs a paging path, not just
      an inbox. **Not a launch blocker — defer the decision, but make it consciously.**

---

## Open questions this checklist resolves or raises

- ✅ **OQ-109-A** (support domain/inbox) — **RESOLVED**: `hiappx.com`, `support@hiappx.com`
  on Zoho free; domain verified 2026-08-07, MX/SPF/DKIM all green 2026-08-08 (DKIM selector
  `zmail`). Subdomain map still pending in 0.3.
- **OQ-109-B** (docs hosting) — proposed in 4.4: static site in-repo at `hiappx.com/docs`.
  Confirm.
- **OQ-109-C** (Built for Shopify) — deferred to 7.4.
- **OQ-109-D** (early-bird support volume) — the free-3-months window generates support load
  at zero revenue. Phase 6 is the mitigation. Revisit if install rate outpaces reply capacity.
- 🆕 **OQ-109-E** (dev/prod app split) — Phase 1.2. Blocks Phase 3. ⚠️ **Also blocks D6** —
  the demo store must have the app that will become production installed, or its metaobjects
  land in the wrong `$app:` namespace.
- 🆕 **OQ-109-F — demo store: wait for the production DB, or build now and rebuild?**
  (D5.) The template source of truth is Postgres; the metaobject is only delivery. Building
  demo templates against the dev database before Phase 2.2 means rebuilding them by hand
  later. Trade-off is dogfooding-feedback-now vs. rework.
- 🆕 **OQ-109-G — demo store niche and brand.** (D1.) 🔴 Must be a **fictional** brand with
  imagery you hold rights to — `appx-dev`'s real DJI products and photos cannot be reused on
  a publicly-linked storefront.
