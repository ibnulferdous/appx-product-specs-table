import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { markShopUninstalled } from "../models/shop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Idempotent: no-ops if already marked uninstalled.
  await markShopUninstalled(shop);

  // Session may already be gone from a prior delivery.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
