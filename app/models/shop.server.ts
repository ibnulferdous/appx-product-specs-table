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
//
// NOTE this deliberately RETAINS the shop's templates, styling and assignments —
// that retention is what lets a merchant reinstall and find their work intact,
// and `upsertShop`'s reinstall branch above depends on the row still being here.
// Erasure happens later, at `shop/redact` (see `eraseShopData`).
export async function markShopUninstalled(shopDomain: string) {
  return prisma.shop.updateMany({
    where: { myshopifyDomain: shopDomain, isInstalled: true },
    data: { isInstalled: false, uninstalledAt: new Date() },
  });
}

/**
 * What `eraseShopData` did, in a shape the caller can log without asking again.
 *
 * Three outcomes rather than a boolean: the `shop/redact` handler has to be able
 * to say which of them happened, and re-querying to find out would give back the
 * atomicity the single guarded delete below exists to buy.
 */
export type ShopEraseResult =
  | { erased: true; sessionsDeleted: number }
  | { erased: false; reason: "not-found" | "still-installed" };

/**
 * Erase everything this app holds for one shop. Called from the `shop/redact`
 * compliance webhook, which Shopify sends 48 hours after an uninstall.
 * Step 105 — `context/features/105-privacy-webhook-domain-and-erase.md`.
 *
 * 🔬 ONE DELETE TAKES FIVE TABLES, and that is not visible from this file.
 * `Template` (and through it `TableStyling`), `ProductAssignment`,
 * `ProductAssignmentIndex` and `ShopStorefrontRouting` all reference `Shop` with
 * `ON DELETE CASCADE` in the emitted migration SQL — not merely in
 * `schema.prisma` — so Postgres removes the whole tree itself.
 *
 * ⚠️ `Session` IS THE EXCEPTION. It has no foreign key at all; it is keyed by a
 * plain `shop` string. No cascade reaches it, which is the only reason the
 * second delete below exists. It is not redundant with the first and must not be
 * tidied away.
 *
 * 🔴 THE `isInstalled: false` CONDITION IS A DATA-SAFETY GUARD, NOT A FILTER.
 * Shopify sends `shop/redact` 48 hours after uninstall and never cancels it on
 * reinstall — so a merchant who uninstalls on Friday and reinstalls on Monday
 * would otherwise have every template deleted out from under them by a webhook
 * arriving exactly on schedule. An installed shop is an active relationship with
 * its own basis for retention, and the app stores no customer personal data
 * whatsoever, so declining to erase a reinstalled shop concedes no compliance
 * ground (merchant decision D1, 2026-08-02).
 *
 * Keeping that guard inside the `where` rather than in a preceding read is what
 * makes it airtight: a read-then-delete leaves a window for the reinstall to
 * land between the two statements, which is the exact failure it exists to
 * prevent, reintroduced by the shape of the code.
 *
 * Idempotent by construction. `deleteMany` on a row that is already gone returns
 * `{ count: 0 }` where `delete` would throw `P2025`; Shopify retries on any
 * non-200, so a handler that throws on the second delivery is a handler that
 * gets retried forever.
 */
export async function eraseShopData(
  shopDomain: string,
): Promise<ShopEraseResult> {
  const { count } = await prisma.shop.deleteMany({
    where: { myshopifyDomain: shopDomain, isInstalled: false },
  });

  if (count === 0) {
    // Ambiguous on its own: the shop is absent, or it is installed and the guard
    // declined. The distinction only matters to the log line, so it costs one
    // query in the zero case and none on the happy path.
    // ⚠️ Deliberately NOT filtered by `isInstalled` — this read exists to tell
    // "installed, so declined" apart from "absent". Adding the guard here would
    // make a still-installed shop invisible and report it as `not-found`, i.e.
    // it would log the opposite of what happened.
    const existing = await prisma.shop.findUnique({
      where: { myshopifyDomain: shopDomain },
      select: { id: true },
    });
    return {
      erased: false,
      reason: existing ? "still-installed" : "not-found",
    };
  }

  // Only once the shop is actually gone. Deleting sessions first — or
  // unconditionally — would log a live, reinstalled merchant out of an app we
  // just decided NOT to erase: a guard that protects the data and breaks the
  // person using it.
  //
  // By construction this should find nothing, since `markShopUninstalled`'s
  // caller already deletes sessions on uninstall. It stays as the sweep for a
  // missed or failed uninstall delivery — precisely the case where an orphaned
  // access token would otherwise outlive the shop record.
  const { count: sessionsDeleted } = await prisma.session.deleteMany({
    where: { shop: shopDomain },
  });

  return { erased: true, sessionsDeleted };
}
