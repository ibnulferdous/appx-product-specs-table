import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  fetchProductMetafieldDefinitions,
  type MetafieldDefinitionSummary,
} from "../shopify/metafieldDefinitions.server";

// Resource route (loader only) at `/app/metafield-definitions`. Under `/app` so `authenticate.admin`
// resolves the embedded session, which shop-scopes the Admin client (the fetch can only return THIS
// shop's definitions — priority #1). The editor loads it lazily via `useFetcher` on the first
// Insert-field modal open (Step 8.3), NOT eagerly: the definitions are only needed inside the modal
// (which a merchant may never open). A fetcher also makes the fetch observably async, which the
// modal's loading / empty / error states are built on.

// The standard `{ ok: true, ... }` / `{ ok: false, error }` shape, so a failure degrades the picker
// rather than crashing the editor route.
export type MetafieldDefinitionsLoaderData =
  | { ok: true; definitions: MetafieldDefinitionSummary[] }
  | { ok: false; error: string };

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<MetafieldDefinitionsLoaderData> => {
  const { admin } = await authenticate.admin(request);

  try {
    const definitions = await fetchProductMetafieldDefinitions(admin);
    return { ok: true, definitions };
  } catch (error) {
    // Do not rethrow: a failed fetch must not blow up the editor. The modal surfaces this as an error
    // state with Retry (Step 8.3).
    console.error("[metafield-definitions] fetch failed", error);
    return {
      ok: false,
      error: "Could not load metafields. Please try again.",
    };
  }
};
