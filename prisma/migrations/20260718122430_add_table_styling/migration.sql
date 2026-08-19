-- CreateTable
CREATE TABLE "TableStyling" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "rowLayout" TEXT,
    "mobileLayout" TEXT,
    "sectionHeaderStyle" TEXT,
    "sectionsCollapsible" BOOLEAN NOT NULL DEFAULT false,
    "sectionsInitialState" TEXT,
    "rowDividerStyle" TEXT,
    "density" TEXT,
    "headerBgColor" TEXT,
    "labelBgColor" TEXT,
    "valueBgColor" TEXT,
    "stripeBgColor" TEXT,
    "borderColor" TEXT,
    "labelTextColor" TEXT,
    "valueTextColor" TEXT,
    "fontSize" TEXT,
    "fontWeight" TEXT,
    "fontStyle" TEXT,
    "lineHeight" TEXT,
    "labelCase" TEXT,
    "labelWidthPct" INTEGER,
    "basedOnPreset" TEXT,
    "extraStyles" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "TableStyling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TableStyling_templateId_key" ON "TableStyling"("templateId");

-- AddForeignKey
ALTER TABLE "TableStyling" ADD CONSTRAINT "TableStyling_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
