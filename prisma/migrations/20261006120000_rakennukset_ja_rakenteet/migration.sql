-- CreateEnum
CREATE TYPE "StructureCategory" AS ENUM ('ULKOSEINA', 'VALISEINA', 'ALAPOHJA', 'VALIPOHJA', 'YLAPOHJA', 'KATTO', 'TILAELEMENTTI', 'IKKUNA', 'OVI', 'TEKNIIKKA', 'MUU');

-- CreateEnum
CREATE TYPE "BuildingStatus" AS ENUM ('SUUNNITTELU', 'VALMISTUKSESSA', 'TOIMITETTU', 'VALMIS');

-- CreateEnum
CREATE TYPE "QuantitySource" AS ENUM ('KASIN', 'BIM');

-- CreateEnum
CREATE TYPE "ElementStatus" AS ENUM ('SUUNNITTEILLA', 'VALMISTUKSESSA', 'VALMIS', 'TOIMITETTU', 'ASENNETTU');

-- AlterTable
ALTER TABLE "complaints" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "elementId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "drawings" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "elementId" TEXT;

-- AlterTable
ALTER TABLE "price_lists" ADD COLUMN     "laborHourCents" INTEGER;

-- AlterTable
ALTER TABLE "procurement_items" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "production_schedule_items" ADD COLUMN     "buildingId" TEXT;

-- AlterTable
ALTER TABLE "qa_checklists" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "elementId" TEXT,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "qa_documents" ADD COLUMN     "buildingId" TEXT;

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "elementId" TEXT;

-- CreateTable
CREATE TABLE "structure_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StructureCategory" NOT NULL DEFAULT 'MUU',
    "unit" TEXT NOT NULL DEFAULT 'm2',
    "description" TEXT,
    "laborHoursPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bimTypeName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structure_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_materials" (
    "id" TEXT NOT NULL,
    "structureTypeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerUnit" DOUBLE PRECISION NOT NULL,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "structure_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "offerId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "buildingType" TEXT,
    "grossAreaM2" DOUBLE PRECISION,
    "address" TEXT,
    "status" "BuildingStatus" NOT NULL DEFAULT 'SUUNNITTELU',
    "plannedDelivery" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "bimModelUrl" TEXT,
    "bimGuid" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_parts" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "structureTypeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "location" TEXT,
    "source" "QuantitySource" NOT NULL DEFAULT 'KASIN',
    "bimGuid" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "building_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_elements" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "structureTypeId" TEXT,
    "description" TEXT,
    "quantity" DOUBLE PRECISION,
    "status" "ElementStatus" NOT NULL DEFAULT 'SUUNNITTEILLA',
    "plannedDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "bimGuid" TEXT,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_elements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "structure_types_code_key" ON "structure_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "structure_types_bimTypeName_key" ON "structure_types"("bimTypeName");

-- CreateIndex
CREATE UNIQUE INDEX "structure_materials_structureTypeId_productId_key" ON "structure_materials"("structureTypeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_projectId_code_key" ON "buildings"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_offerId_code_key" ON "buildings"("offerId", "code");

-- CreateIndex
CREATE INDEX "building_parts_buildingId_idx" ON "building_parts"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "building_parts_buildingId_bimGuid_key" ON "building_parts"("buildingId", "bimGuid");

-- CreateIndex
CREATE UNIQUE INDEX "production_elements_buildingId_code_key" ON "production_elements"("buildingId", "code");

-- CreateIndex
CREATE INDEX "complaints_projectId_idx" ON "complaints"("projectId");

-- CreateIndex
CREATE INDEX "complaints_buildingId_idx" ON "complaints"("buildingId");

-- CreateIndex
CREATE INDEX "procurement_items_productId_idx" ON "procurement_items"("productId");

-- CreateIndex
CREATE INDEX "qa_checklists_buildingId_idx" ON "qa_checklists"("buildingId");

-- AddForeignKey
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "production_elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_checklists" ADD CONSTRAINT "qa_checklists_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_checklists" ADD CONSTRAINT "qa_checklists_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "production_elements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qa_documents" ADD CONSTRAINT "qa_documents_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedule_items" ADD CONSTRAINT "production_schedule_items_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "production_elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "production_elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_materials" ADD CONSTRAINT "structure_materials_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structure_materials" ADD CONSTRAINT "structure_materials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "building_parts" ADD CONSTRAINT "building_parts_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_elements" ADD CONSTRAINT "production_elements_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_elements" ADD CONSTRAINT "production_elements_structureTypeId_fkey" FOREIGN KEY ("structureTypeId") REFERENCES "structure_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

