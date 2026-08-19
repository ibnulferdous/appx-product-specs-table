-- CreateTable
CREATE TABLE "ShopStorefrontRouting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "defaultTemplateHandle" TEXT,
    "byType" JSONB NOT NULL DEFAULT '{}',
    "byVendor" JSONB NOT NULL DEFAULT '{}',
    "byCollection" JSONB NOT NULL DEFAULT '{}',
    "byTag" JSONB NOT NULL DEFAULT '{}',
    "byProduct" JSONB NOT NULL DEFAULT '{}',
    "excludedProductGids" JSONB NOT NULL DEFAULT '[]',
    "shopMetafieldGid" TEXT,
    "syncedToShopifyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopStorefrontRouting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopStorefrontRouting_shopId_key" ON "ShopStorefrontRouting"("shopId");

-- AddForeignKey
ALTER TABLE "ShopStorefrontRouting" ADD CONSTRAINT "ShopStorefrontRouting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
