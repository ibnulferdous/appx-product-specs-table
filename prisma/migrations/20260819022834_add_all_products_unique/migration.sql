-- Block duplicate ALL_PRODUCTS rules.
--
-- The composite unique index
-- "ProductAssignment_shopId_templateId_scope_scopeValue_mode_key" does not catch
-- these: ALL_PRODUCTS rules always store scopeValue = NULL, and Postgres treats
-- NULLs as distinct in a unique index, so identical ALL_PRODUCTS rules for the
-- same (shopId, templateId, scope, mode) can be inserted repeatedly.
--
-- A partial unique index over the NULL-scopeValue rows closes that gap. Prisma's
-- schema DSL cannot express a partial (WHERE) index, so this is applied as raw
-- SQL; see the companion note on @@unique in prisma/schema.prisma.
CREATE UNIQUE INDEX "ProductAssignment_shopId_templateId_scope_mode_null_key"
  ON "ProductAssignment" ("shopId", "templateId", "scope", "mode")
  WHERE "scopeValue" IS NULL;
