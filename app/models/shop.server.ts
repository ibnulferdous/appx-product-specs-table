import { Prisma } from "@prisma/client";
import type { Session } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export async function upsertShop(session: Session) {
  const existing = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });

  // Already present and installed — nothing to persist this request.
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

// Mark a shop as uninstalled. Called from the app/uninstalled webhook. Deliberately RETAINS the
// shop's templates, styling and assignments — that retention lets a merchant reinstall and find
// their work intact (upsertShop's reinstall branch depends on the row still being here). Erasure
// happens later, at `shop/redact` (see `eraseShopData`).
export async function markShopUninstalled(shopDomain: string) {
  return prisma.shop.updateMany({
    where: { myshopifyDomain: shopDomain, isInstalled: true },
    data: { isInstalled: false, uninstalledAt: new Date() },
  });
}

/**
 * What `eraseShopData` did, in a shape the caller can log without re-querying. Three outcomes rather
 * than a boolean, because the `shop/redact` handler must say which happened, and re-querying would
 * give back the atomicity the single guarded delete exists to buy.
 */
export type ShopEraseResult =
  | { erased: true; sessionsDeleted: number }
  | { erased: false; reason: "not-found" | "still-installed" };

/**
 * Erase everything this app holds for one shop. Called from the `shop/redact` compliance webhook,
 * which Shopify sends 48 hours after an uninstall (step 105).
 *
 * 🔬 ONE DELETE TAKES FIVE TABLES, not visible from this file: `Template` (and through it
 * `TableStyling`), `ProductAssignment`, `ProductAssignmentIndex` and `ShopStorefrontRouting` all
 * reference `Shop` with `ON DELETE CASCADE` in the emitted migration SQL, so Postgres removes the
 * whole tree itself.
 *
 * ⚠️ `Session` IS THE EXCEPTION — no foreign key, keyed by a plain `shop` string, so no cascade
 * reaches it. That is the only reason the second delete below exists; it is not redundant.
 *
 * 🔴 THE `isInstalled: false` CONDITION IS A DATA-SAFETY GUARD, NOT A FILTER. Shopify sends
 * `shop/redact` 48h after uninstall and never cancels it on reinstall — so a merchant who
 * uninstalls Friday and reinstalls Monday would otherwise have every template deleted by a webhook
 * arriving on schedule. The app stores no customer personal data, so declining to erase a
 * reinstalled shop concedes no compliance ground (merchant decision D1, 2026-08-02). Keeping the
 * guard inside the `where` rather than a preceding read is what makes it airtight — a read-then-
 * delete leaves a window for the reinstall to land between the two statements.
 *
 * Idempotent: `deleteMany` on an already-gone row returns `{ count: 0 }` where `delete` would throw
 * P2025, and Shopify retries any non-200 forever.
 *
 * 🔒 ATOMIC. The shop delete and the session sweep run inside ONE interactive transaction. `Session`
 * has no FK to `Shop`, so the cascade never reaches it — the sweep is a SEPARATE statement, and if it
 * failed after the shop delete had already committed, the retry would find the shop gone
 * (`count === 0`), classify it `not-found`, and skip the sweep forever, leaving orphaned access
 * tokens behind. Wrapping both in a transaction means a sweep failure rolls the shop delete back too,
 * so Shopify's retry re-runs the whole erase.
 */
export async function eraseShopData(
  shopDomain: string,
): Promise<ShopEraseResult> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.shop.deleteMany({
      where: { myshopifyDomain: shopDomain, isInstalled: false },
    });

    if (count === 0) {
      // Ambiguous alone: the shop is absent, or installed and the guard declined. The distinction
      // only matters to the log line, so it costs one query in the zero case and none on the happy
      // path. ⚠️ Deliberately NOT filtered by `isInstalled` — this read exists to tell "installed, so
      // declined" apart from "absent"; the guard here would report a still-installed shop as
      // not-found.
      const existing = await tx.shop.findUnique({
        where: { myshopifyDomain: shopDomain },
        select: { id: true },
      });
      return {
        erased: false as const,
        reason: existing
          ? ("still-installed" as const)
          : ("not-found" as const),
      };
    }

    // Only once the shop is actually gone. Deleting sessions first — or unconditionally — would log a
    // live, reinstalled merchant out of an app we just decided NOT to erase.
    //
    // By construction this should find nothing (the uninstall path already deletes sessions). It
    // stays as the sweep for a missed/failed uninstall delivery — the case where an orphaned access
    // token would otherwise outlive the shop record. A throw here rolls back the shop delete above.
    const { count: sessionsDeleted } = await tx.session.deleteMany({
      where: { shop: shopDomain },
    });

    return { erased: true as const, sessionsDeleted };
  });
}
