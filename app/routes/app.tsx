import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { upsertShop } from "../models/shop.server";
import { getBillingState, planSelectionUrl } from "../shopify/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, redirect } = await authenticate.admin(request);

  // Billing gate (Shopify App Pricing, blocker #2). A shop with no active subscription is
  // redirected to Shopify's hosted plan-selection page. `target: "_top"` escapes the embedded
  // iframe (the URL is outside app scope). Redirect ONLY on a determined absence — a transient
  // Admin failure (`determined: false`) must never eject a paying merchant (see billing.server).
  const billing = await getBillingState(admin);
  if (billing.determined && !billing.hasActiveSubscription) {
    // eslint-disable-next-line no-undef
    const appHandle = process.env.SHOPIFY_APP_HANDLE;
    if (appHandle) {
      return redirect(planSelectionUrl(session.shop, appHandle), {
        target: "_top",
      });
    }
    // Misconfiguration: without the app handle the plan page URL can't be built. Fail OPEN
    // (render the app) rather than crash every merchant, and log loudly so it's caught in ops.
    console.error(
      "[billing] SHOPIFY_APP_HANDLE is not set — cannot redirect to the plan-selection page; billing gate is OPEN. Set it to the app handle from shopify.app.toml / the Partner Dashboard.",
    );
  }

  await upsertShop(session);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/templates">Templates</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch thrown responses so their headers propagate.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
