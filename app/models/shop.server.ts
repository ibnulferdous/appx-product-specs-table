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

// Mark a shop as uninstalled. Called from the app/uninstalled webhook.
export async function markShopUninstalled(shopDomain: string) {
  return prisma.shop.updateMany({
    where: { myshopifyDomain: shopDomain, isInstalled: true },
    data: { isInstalled: false, uninstalledAt: new Date() },
  });
}
