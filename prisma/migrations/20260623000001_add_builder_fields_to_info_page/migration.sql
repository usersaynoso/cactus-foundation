-- CreateEnum
CREATE TYPE "BodyFormat" AS ENUM ('markdown', 'builder');

-- AlterTable
ALTER TABLE "InfoPage" ADD COLUMN "bodyFormat" "BodyFormat" NOT NULL DEFAULT 'markdown',
ADD COLUMN "builderData" JSONB;
