import { Prisma, TemplateStatus } from "@prisma/client";
import prisma from "../db.server";

export const TEMPLATE_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"];

const TEMPLATE_STATUS_SET = new Set(TEMPLATE_STATUSES);
const NAME_MAX_LENGTH = 100;

function getRowCount(rows: unknown): number {
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listTemplatesForShop(
  shopId: string,
  { status }: { status?: string | null } = {},
) {
  const where: Prisma.TemplateWhereInput = { shopId };
  if (status && TEMPLATE_STATUS_SET.has(status)) {
    where.status = status as TemplateStatus;
  }

  const templates = await prisma.template.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return templates.map((template) => ({
    ...template,
    rowCount: getRowCount(template.rows),
    assignedProductCount: 0,
  }));
}

export async function countTemplatesForShop(shopId: string) {
  return prisma.template.count({
    where: { shopId },
  });
}

export async function createTemplateForShop(
  shopId: string,
  { name, status }: { name?: unknown; status?: unknown },
) {
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (trimmedName.length === 0) {
    return { ok: false as const, error: "Name is required" };
  }

  if (trimmedName.length > NAME_MAX_LENGTH) {
    return {
      ok: false as const,
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    };
  }

  const resolvedStatus =
    typeof status === "string" && TEMPLATE_STATUS_SET.has(status)
      ? (status as TemplateStatus)
      : TemplateStatus.DRAFT;

  try {
    const template = await prisma.template.create({
      data: {
        shopId,
        name: trimmedName,
        status: resolvedStatus,
        rows: [],
      },
    });

    return { ok: true as const, data: template };
  } catch {
    return { ok: false as const, error: "Could not create template" };
  }
}

export async function getTemplateByIdForShop(shopId: string, id?: string) {
  if (!id) {
    return null;
  }

  return prisma.template.findFirst({
    where: { id, shopId },
  });
}
