-- CreateEnum
CREATE TYPE "AssignmentScope" AS ENUM ('ALL_PRODUCTS', 'PRODUCT', 'PRODUCT_TYPE', 'VENDOR', 'COLLECTION');

-- CreateEnum
CREATE TYPE "AssignmentMode" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "AssignmentIndexStatus" AS ENUM ('APPLIED', 'CONFLICT', 'STALE');

-- CreateTable
CREATE TABLE "ProductAssignment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "scope" "AssignmentScope" NOT NULL,
    "mode" "AssignmentMode" NOT NULL DEFAULT 'INCLUDE',
    "scopeValue" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAssignmentIndex" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "templateId" TEXT,
    "sourceAssignmentId" TEXT,
    "shopifyProductGid" TEXT NOT NULL,
    "scope" "AssignmentScope",
    "scopeValue" TEXT,
    "status" "AssignmentIndexStatus" NOT NULL DEFAULT 'APPLIED',
    "conflictReason" TEXT,
    "appliedTemplateHandle" TEXT,
    "syncedToShopifyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAssignmentIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAssignment_shopId_scope_idx" ON "ProductAssignment"("shopId", "scope");

-- CreateIndex
CREATE INDEX "ProductAssignment_shopId_scope_scopeValue_idx" ON "ProductAssignment"("shopId", "scope", "scopeValue");

-- CreateIndex
CREATE INDEX "ProductAssignment_shopId_templateId_idx" ON "ProductAssignment"("shopId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAssignment_shopId_templateId_scope_scopeValue_mode_key" ON "ProductAssignment"("shopId", "templateId", "scope", "scopeValue", "mode");

-- CreateIndex
CREATE INDEX "ProductAssignmentIndex_shopId_templateId_idx" ON "ProductAssignmentIndex"("shopId", "templateId");

-- CreateIndex
CREATE INDEX "ProductAssignmentIndex_shopId_status_idx" ON "ProductAssignmentIndex"("shopId", "status");

-- CreateIndex
CREATE INDEX "ProductAssignmentIndex_sourceAssignmentId_idx" ON "ProductAssignmentIndex"("sourceAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAssignmentIndex_shopId_shopifyProductGid_key" ON "ProductAssignmentIndex"("shopId", "shopifyProductGid");

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignment" ADD CONSTRAINT "ProductAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignmentIndex" ADD CONSTRAINT "ProductAssignmentIndex_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignmentIndex" ADD CONSTRAINT "ProductAssignmentIndex_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAssignmentIndex" ADD CONSTRAINT "ProductAssignmentIndex_sourceAssignmentId_fkey" FOREIGN KEY ("sourceAssignmentId") REFERENCES "ProductAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
