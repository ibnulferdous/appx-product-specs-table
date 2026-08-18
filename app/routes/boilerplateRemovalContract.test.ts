// Step 107 · Unit A — the boilerplate-removal contract.
//
// Binding spec: `context/features/107-boilerplate-removal-and-app-home-shell.md`.
//
// The Shopify React Router template shipped four demo surfaces that were never
// removed. This file guards their absence. 🔴 One of them was not clutter:
// `app/routes/app._index.tsx` carried an `action` that ran `productCreate`
// against the merchant's LIVE catalog from the first button a merchant sees
// (`{Red|Orange|Yellow|Green} Snowboard`, priced 100.00, plus a `demo-entry`
// metaobject). That is `CLAUDE.md` priority #1 — merchant data safety — and
// guards 1 and 2 exist for it alone.
//
// ⚠️ **Everything here is a source-text guard, and that is a real limitation.**
// `vitest.config.ts` is `environment: "node"` with no jsdom, so a route
// component cannot be rendered (§Key Decisions "Testing strategy"). The house
// pattern for exactly this is the contract test — `createFlowContract.test.ts`,
// `galleryRouteContract.test.ts`, `StylePresetCardContract.test.ts`. These
// guards prove the strings are gone from the tree; they cannot prove the page
// renders. That is what live verification is for.
//
// ⚠️ This file deliberately sits at the top of `app/routes/`, spanning several
// route files and belonging to none (step 106 D7's reasoning). 📌 Safe there
// since feature 88 step 92: `app/routes.ts` passes
// `ignoredRouteFiles: ["**/*.test.{ts,tsx}"]`, without which a `.test.ts` beside
// a route is bundled AS A ROUTE and kills `npm run build` while the suite stays
// green.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL("../", import.meta.url));
const REPO_FILE = (name: string) =>
  fileURLToPath(new URL(`../../${name}`, import.meta.url));

// Comments MUST be stripped before any guard reads a file. Every one of these
// route files now NARRATES the strings being guarded — this one included — and
// a guard that matches its own documentation reports a violation that does not
// exist, or (in the negative direction) passes vacuously. Same helper shape as
// `createFlowContract.test.ts`; only whole-line `//` comments are removed, so a
// `https://` inside a string is never mangled.
const strip = (source: string) =>
  source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const read = (file: string) => strip(readFileSync(REPO_FILE(file), "utf8"));

const homeRoute = read("app/routes/app._index.tsx");
const splashRoute = read("app/routes/_index/route.tsx");
const appToml = readFileSync(REPO_FILE("shopify.app.toml"), "utf8");

// 🔴 The catalog guard is a WHOLE-TREE absence, not a per-file pattern. Step
// 100's lesson: a pattern guard enumerates the spellings someone thought of; a
// sweep covers the ones they did not. Deleting the mutation out of
// `app._index.tsx` and pasting it into a new `app/models/demo.server.ts` must
// fail this file, and it does.
//
// 🚫 Test files are excluded from the sweep — a `.test.ts` cannot mutate a
// merchant's catalog, and without the exclusion this very file (which must name
// the mutations to search for them) would be its own violation.
const appSources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(APP_DIR);
  return out;
};

const filesMentioning = (needle: string) =>
  appSources()
    .filter((file) => strip(readFileSync(file, "utf8")).includes(needle))
    .map((file) => file.slice(APP_DIR.length).replace(/\\/g, "/"));

describe("no product write survives anywhere under app/", () => {
  it("🔴 guard 1 — no file under app/ contains `productCreate`", () => {
    // The merchant-data-safety guard, and the one that must never come back
    // silently. `.toEqual([])` rather than a boolean so a failure names the
    // file that reintroduced it.
    expect(filesMentioning("productCreate")).toEqual([]);
  });

  it("🔴 guard 2 — no file under app/ contains `productVariantsBulkUpdate`", () => {
    expect(filesMentioning("productVariantsBulkUpdate")).toEqual([]);
  });

  it("guard 4 — `app._index.tsx` exports no action", () => {
    // The narrower, structural half of guards 1–2: home may not POST to itself
    // at all, whatever a future action would call. `/app` is specced as a read
    // surface (`data-model.md` §13 R5b, "O(1), no data read").
    expect(homeRoute).not.toMatch(
      /export\s+(?:const|async\s+function|function)\s+action\b/,
    );
  });
});

describe("the template's demo surfaces are gone", () => {
  it("guard 3 — `app/routes/app.additional.tsx` does not exist", () => {
    // Never in `<s-app-nav>`; reachable only from the demo page's link and by
    // typed URL. The link went with the page it lived on.
    expect(existsSync(REPO_FILE("app/routes/app.additional.tsx"))).toBe(false);
  });

  it("guard 5 — `shopify.app.toml` declares neither demo definition", () => {
    // ⚠️ Staged, NOT deployed (D5): `shopify app deploy` from this step would
    // re-anchor step 106's three compliance webhook uris onto `example.com` or
    // a dead tunnel, because a uri beginning with `/` resolves against
    // `application_url` AT DEPLOY TIME. So both definitions are still live on
    // the dev store until the production-host deploy. This asserts the config,
    // which is the only thing this step changes.
    expect(appToml).not.toContain("metaobjects.app.example");
    expect(appToml).not.toContain("demo_info");
  });

  it("guard 7 — the public splash carries no placeholder copy", () => {
    // `/` is what renders WITHOUT a `shop` param. 🚫 The page was not deleted
    // (D6) — its `showForm` branch is the shop-domain login path — so the guard
    // has to be on the prose, not on the file's existence.
    expect(splashRoute).not.toContain("[your app]");
    expect(splashRoute).not.toContain("A short heading");
    expect(splashRoute).not.toContain("Some detail about your feature");
  });
});

describe("the shell's one path forward", () => {
  it("guard 6 — 🔴 the real definitions and scopes are still declared", () => {
    // The INVERSE guard, and the reason it exists: guard 5 deletes from a
    // protected file, and an over-broad deletion is otherwise invisible until
    // deploy — at which point removing `[metaobjects.app.appx_spec_table]`
    // would poison every existing entry handle with `UNDEFINED_OBJECT_TYPE`
    // ([[shopify-metaobject-deploy-clean-lifecycle]]). That is not recoverable
    // by re-adding the block. Fail here instead.
    expect(appToml).toContain("[metaobjects.app.appx_spec_table]");
    expect(appToml).toContain("[access_scopes]");
    expect(appToml).toContain("[shop.metafields.app.routing]");
    // ⚠️ The ASSIGNMENT, not the word. The block above these keys explains in
    // prose why they are `compliance_topics` and not `topics`, so a bare
    // substring count reads 4 and the guard fails on its own documentation —
    // it did, on first run. The same trap the `strip()` helper exists for.
    expect(appToml.match(/^\s*compliance_topics\s*=/gm) ?? []).toHaveLength(3);
  });

  it("guard 8 — 🔴 home's Create goes to the gallery, never to /new", () => {
    // D7. Feature 88 step 92 made the style gallery UNSKIPPABLE by repointing
    // every Create affordance at it. "Unskippable" is not a property of the
    // gallery — it is the property that NOTHING links past it, so a third
    // Create button on home pointing at `/new` would silently reopen the skip
    // path and stamp its templates `basedOnPreset: null`, which now means "the
    // merchant chose Blank" and would be a lie.
    expect(homeRoute).toContain('href="/app/templates/choose-style"');
    expect(homeRoute).not.toContain("/app/templates/new");
  });
});
