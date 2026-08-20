import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { planSelectionUrl } from "../shopify/billing.server";
import { ManagePlanLink } from "../components/ManagePlanLink";

// `/app` — the app's home. Step 107 (Unit A) replaced the Shopify template's demo page with this shell
// (binding spec features/107).
//
// 🔴 What was removed: the template shipped an `action` here that ran `productCreate` against the
// merchant's LIVE catalog (a Snowboard product + `$app:demo_info` metafield + `demo-entry` metaobject),
// fired by the FIRST button a merchant sees — merchant data pollution (priority #1). 🚫 There is no
// `action` export, and `boilerplateRemovalContract.test.ts` asserts NO file under `app/` mentions the
// product mutations at all — a whole-tree absence, so a reintroduction fails loudly.
//
// A shell, not the dashboard (D2): `admin-screen-plan.md` §Screen 1 specs a real Dashboard here (three
// states, an onboarding checklist, stat cards) — that's Unit B. Building it now would mean designing
// home twice, and checklist step 3's signal keys off `ProductAssignmentIndex`, which OQ-103-D proposes
// deleting; Unit A must not settle that by accident (raised as OQ-107-B).
//
// 🚫 No mention of the theme app block — the most important thing home will eventually say (the
// extension is an app BLOCK, so a perfect ACTIVE template renders NOTHING until added in the theme
// editor), but saying it without the deep link that makes it actionable is worse than silence. It
// arrives whole in Unit B.

// 📌 R5b stays "O(1), no data read": the loader adds only the plan-selection URL, a PURE
// construction from `session.shop` + the `SHOPIFY_APP_HANDLE` env var (no DB/Admin read). It powers
// the in-app "Manage plan" link (App Store req 1.2.3). `null` when the handle is unset — the link is
// then hidden rather than pointing at a broken URL (the billing gate already logs that misconfig).
// Template-count reads still arrive with Unit B, where R5b gets revised.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  const planUrl = appHandle ? planSelectionUrl(session.shop, appHandle) : null;

  return { planUrl };
};

export default function Index() {
  const { planUrl } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Product specs table">
      {/* 🔴 D7 — points at the gallery, NOT `/app/templates/new`. Feature 88 step 92 made the gallery
          unskippable by repointing every Create affordance at it; a third one jumping to the scaffold
          would reopen the skip path and stamp templates `basedOnPreset: null` ("chose Blank" — a lie).
          📌 A `<s-button>` in `slot="primary-action"` is fine; a `<div>` there is silently discarded
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
        {/* The secondary path. Create lives once, in `slot="primary-action"` above — this page has no
            empty state, so a second identical button would be redundancy, not coverage. */}
        <s-button href="/app/templates" variant="secondary">
          View templates
        </s-button>
      </s-section>

      {/* App Store req 1.2.3 — a merchant can change plan in-app without contacting support. Hidden
          when SHOPIFY_APP_HANDLE is unset (the plan URL can't be built; the billing gate logs it). */}
      {planUrl ? (
        <s-section heading="Plan">
          <s-paragraph>
            Upgrade, downgrade, or review your subscription on Shopify&rsquo;s
            plan page.
          </s-paragraph>
          <ManagePlanLink url={planUrl}>Manage plan</ManagePlanLink>
        </s-section>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
