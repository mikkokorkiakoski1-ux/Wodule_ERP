-- DropForeignKey
ALTER TABLE "building_parts" DROP CONSTRAINT "building_parts_productId_fkey";

-- DropForeignKey
ALTER TABLE "building_parts" DROP CONSTRAINT "building_parts_structureTypeId_fkey";

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

