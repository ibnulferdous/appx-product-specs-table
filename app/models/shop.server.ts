import { Prisma } from "@prisma/client";
import type { Session } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export async function upsertShop(session: Session) {
  const existing = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  // Already present and marked installed — nothing to persist this request.
  if (existing && existing.isInstalled && existing.uninstalledAt === null) {
    return existing;
  }

  // First install or re-install after an uninstall: create or flip to installed.
  try {
    return await prisma.shop.upsert({
      where: { myshopifyDomain: session.shop },
      update: { isInstalled: true, uninstalledAt: null },
      create: { myshopifyDomain: session.shop },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return prisma.shop.update({
        where: { myshopifyDomain: session.shop },
        data: { isInstalled: true, uninstalledAt: null },
      });
    }
    throw err;
  }
}

/**
 * Persist the app-owned `appx_spec_table` metaobject definition GID on the shop
 * (Editor Step 9.5). The definition is created once per shop; this records its
 * GID so later saves skip the create + lookup. Scoped to the shop's own row by
 * primary key. Uses `update`, not `updateMany`: `shopId` comes from a row this
 * request just loaded, so a no-op would mean the shop vanished mid-request — a
 * real bug that must surface as P2025, not be swallowed. The caller
 * (`syncTemplateToMetaobject`) catches the throw and reports it as a warning.
 */
export async function setShopMetaobjectDefinitionGid(
  shopId: string,
  gid: string,
) {
  return prisma.shop.update({
    where: { id: shopId },
    data: { metaobjectDefinitionGid: gid },
  });
}

// Mark a shop as uninstalled. Called from the app/uninstalled webhook.
export async function markShopUninstalled(shopDomain: string) {
  return prisma.shop.updateMany({
    where: { myshopifyDomain: shopDomain, isInstalled: true },
    data: { isInstalled: false, uninstalledAt: new Date() },
  });
}
