import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

// `/app` — the app's home. Step 107 (Unit A) replaced the Shopify template's
// demo page with this shell. Binding spec:
// `context/features/107-boilerplate-removal-and-app-home-shell.md`.
//
// --- What was removed, and why it mattered (§"Why this is not just tidying") --
//
// 🔴 The template shipped an `action` here that ran `productCreate` against the
// merchant's LIVE catalog — a `{Red|Orange|Yellow|Green} Snowboard` priced at
// 100.00 with an `$app:demo_info` metafield, plus a `demo-entry` metaobject —
// fired by the FIRST button a merchant sees. That is merchant data pollution
// (`CLAUDE.md` priority #1), not cosmetic clutter. The action, its three
// mutations, the fetcher/App Bridge/toast wiring and the JSON `<pre>` dumps are
// all gone. 🚫 There is no `action` export on this route, and
// `boilerplateRemovalContract.test.ts` asserts that no file under `app/`
// mentions the product mutations at all — a whole-tree absence, not a per-file
// pattern, so a reintroduction anywhere fails loudly.
//
// --- Why this is a shell and not the dashboard (D2) --------------------------
//
// `admin-screen-plan.md` §Screen 1 specs a real Dashboard here: three states, a
// four-step onboarding checklist, stat cards. That is Unit B. Building it now
// would mean designing home twice, and — the load-bearing reason — checklist
// step 3's completion signal keys off `ProductAssignmentIndex`, a model OQ-103-D
// proposes deleting outright. Unit A must not settle that by accident; it is
// raised as OQ-107-B instead.
//
// 🚫 No mention of the theme app block. It is the most important thing home will
// eventually say (the extension is an app BLOCK, so a perfectly authored ACTIVE
// template renders NOTHING until the merchant adds it in the theme editor), but
// saying it without the deep link that makes it actionable would be worse than
// silence. It arrives whole, in Unit B.

// 📌 Deliberately unchanged from the template, byte for byte. `data-model.md`
// §13 R5b catalogues this route as "O(1), no data read"; a loader that started
// counting templates would move a catalogued read pattern inside a step whose
// whole claim is that it only removes things. Counts arrive with Unit B, which
// is where R5b gets revised.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="Product specs table">
      {/* 🔴 D7 — this points at the gallery, NOT `/app/templates/new`. Feature 88
          step 92 made the style gallery unskippable by repointing every Create
          affordance at it; a third one that jumped straight to the scaffold
          would silently reopen the skip path that feature was built to close,
          and would leave templates stamped `basedOnPreset: null` — which now
          means "the merchant chose Blank" and would be a lie.

          📌 A `<s-button>` in `slot="primary-action"` is fine. Step 101's
          finding was that a `<div>` in that slot is silently discarded
          ([[polaris-web-component-gotchas]]). */}
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/templates/choose-style"
      >
        Create template
      </s-button>

      <s-section heading="Build spec tables for your products">
        <s-paragraph>
          Create a spec table once, style it, and assign it to the products that
          should show it. The table renders on your storefront product pages and
          can pull values straight from each product, so one template covers a
          whole range.
        </s-paragraph>
        {/* The secondary path. Create lives once, in `slot="primary-action"`
            above — `app.templates.tsx` carries two Create buttons only because
            one of them is inside an empty state that vanishes as soon as a
            template exists. This page has no empty state, so a second identical
            button would be redundancy, not coverage. */}
        <s-button href="/app/templates" variant="secondary">
          View templates
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
