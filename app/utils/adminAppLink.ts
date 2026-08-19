// Admin deep links for in-app navigation targets.
//
// An embedded app's own `/app/...` href only works on a plain left click. The
// browser's "Open link in new tab" resolves it against the APP's origin and
// loads it with no Shopify session — the broken page merchants hit. Linking
// through the admin instead makes such a tab re-embed the app with a real
// session. Click semantics live in `app/components/AdminAppLink.tsx`.

/**
 * Build the admin deep-link base, e.g.
 * `https://admin.shopify.com/store/acme/apps/<client-id>`.
 *
 * Uses the client id, not the derived app handle, so the URL is
 * environment-independent. Append an app-relative path for a full deep link.
 */
export function buildAdminAppBase(shopDomain: string, apiKey: string): string {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/apps/${apiKey}`;
}
