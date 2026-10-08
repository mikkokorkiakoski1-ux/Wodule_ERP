-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('MATERIAALI', 'TEHDASTYO', 'ALIURAKKA');

-- AlterEnum
ALTER TYPE "QuantitySource" ADD VALUE 'LASKURI';

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "laskentaSyote" JSONB;

-- AlterTable
ALTER TABLE "procurement_items" ADD COLUMN     "structureTypeId" TEXT;

-- AlterTable
ALTER TABLE "structure_types" ADD COLUMN     "costType" "CostType" NOT NULL DEFAULT 'MATERIAALI',
ADD COLUMN     "laskuriAvain" TEXT,
ADD COLUMN     "litteraId" TEXT,
ADD COLUMN     "unitPriceCents" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "litterat" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "litterat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "litterat_code_key" ON "litterat"("code");

-- CreateIndex
CREATE UNIQUE INDEX "structure_types_laskuriAvain_key" ON "structure_types"("laskuriAvain");

-- CreateIndex
CREATE INDEX "structure_types_litteraId_idx" ON "structure_types"("litteraId");

-- AddForeignKey
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_types" ADD CONSTRAINT "structure_types_litteraId_fkey" FOREIGN KEY ("litteraId") REFERENCES "litterat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

