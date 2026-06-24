-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('HEADER', 'FOOTER', 'PAGE');

-- CreateTable
CREATE TABLE "PageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TemplateType" NOT NULL,
    "builderData" JSONB,
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageTemplate_type_idx" ON "PageTemplate"("type");

-- CreateIndex
CREATE INDEX "PageTemplate_status_idx" ON "PageTemplate"("status");

-- AddForeignKey
ALTER TABLE "PageTemplate" ADD CONSTRAINT "PageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "SiteConfig" ADD COLUMN "headerTemplateId" TEXT,
                          ADD COLUMN "footerTemplateId" TEXT;

-- AlterTable
ALTER TABLE "InfoPage" ADD COLUMN "templateId" TEXT;
