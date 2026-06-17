import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  fetchProductMetafieldDefinitions,
  type MetafieldDefinitionSummary,
} from "../shopify/metafieldDefinitions.server";

// Resource route (loader only, no default export) at `/app/metafield-definitions`.
// It is under `/app` so `authenticate.admin` resolves the embedded session, which
// shop-scopes the Admin GraphQL client (the fetch can only return THIS shop's
// product metafield definitions — priority #1, enforced by the session token).
//
// The editor loads it lazily via `useFetcher` on the first Insert-field modal
// open (Step 8.3), NOT eagerly in the editor's own loader: the definitions are
// only ever needed inside the modal, which a merchant may never open, so an eager
// fetch would make every editor page-load wait on a Shopify round-trip for often
// unused data. A fetcher also makes the fetch observably async, which is what the
// modal's explicit loading / empty / error states are built on.

// The standard project response shape: `{ ok: true, ... }` on success,
// `{ ok: false, error }` on a thrown GraphQL/network error (so a failure degrades
// the picker rather than crashing the editor route).
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
    // Do not rethrow: a failed metafield fetch must not blow up the editor. The
    // modal surfaces this as an error state with a Retry affordance (Step 8.3).
    console.error("[metafield-definitions] fetch failed", error);
    return {
      ok: false,
      error: "Could not load metafields. Please try again.",
    };
  }
};
