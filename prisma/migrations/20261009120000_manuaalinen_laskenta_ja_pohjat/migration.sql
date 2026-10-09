-- DropForeignKey
ALTER TABLE "building_parts" DROP CONSTRAINT "building_parts_structureTypeId_fkey";

-- AlterTable
ALTER TABLE "building_parts" ADD COLUMN     "costType" "CostType",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "litteraId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "unitPriceCents" DOUBLE PRECISION,
ALTER COLUMN "structureTypeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "katePct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "laskentapohjat" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "katePct" DOUBLE PRECISION,
    "laskentaSyote" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laskentapohjat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laskentapohja_rivit" (
    "id" TEXT NOT NULL,
    "pohjaId" TEXT NOT NULL,
    "structureTypeId" TEXT,
    "productId" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "unitPriceCents" DOUBLE PRECISION,
    "litteraId" TEXT,
    "costType" "CostType",
    "quantity" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "laskentapohja_rivit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "laskentapohjat_name_key" ON "laskentapohjat"("name");

-- CreateIndex
CREATE INDEX "laskentapohja_rivit_pohjaId_idx" ON "laskentapohja_rivit"("pohjaId");

-- AddForeignKey
ALTER TABLE "laskentapohja_rivit" ADD CONSTRAINT "laskentapohja_rivit_pohjaId_fkey" FOREIGN KEY ("pohjaId") REFERENCES "laskentapohjat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laskentapohja_rivit" ADD CONSTRAINT "laskentapohja_rivit_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laskentapohja_rivit" ADD CONSTRAINT "laskentapohja_rivit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laskentapohja_rivit" ADD CONSTRAINT "laskentapohja_rivit_litteraId_fkey" FOREIGN KEY ("litteraId") REFERENCES "litterat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_litteraId_fkey" FOREIGN KEY ("litteraId") REFERENCES "litterat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

