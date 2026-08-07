// Admin deep links for in-app navigation targets.
//
// An embedded app's own `/app/...` href only works on a plain left click, where
// App Bridge intercepts it and routes in place. The browser's "Open link in new
// tab" (a context-menu action App Bridge cannot intercept) resolves the href
// against the APP's own origin — the tunnel / app server — and loads it
// standalone with no Shopify session, which is the broken page merchants hit.
//
// Linking through the admin instead (`admin.shopify.com/store/<store>/apps/
// <client-id>/app/...`) makes such a tab land in the admin, which re-embeds the
// app with a real session. The CLIENT ID (not the derived app handle) keeps the
// URL environment-independent — the admin resolves it to whatever handle the
// app is installed under.
//
// Pure + client-safe: both loaders build the base string from `session.shop` +
// `SHOPIFY_API_KEY` and hand it to `AdminAppLink`, which owns the click
// semantics (see `app/components/AdminAppLink.tsx`).

/**
 * Build the admin deep-link base for this shop + app, e.g.
 * `https://admin.shopify.com/store/acme/apps/<client-id>`.
 *
 * `shopDomain` is the session shop (`acme.myshopify.com`); the `.myshopify.com`
 * suffix is stripped because the admin URL takes the bare store handle.
 * Append an app-relative path (`/app/templates/<id>`) to get a full deep link.
 */
export function buildAdminAppBase(shopDomain: string, apiKey: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}`;
}
