-- CreateEnum
CREATE TYPE "StructureKind" AS ENUM ('RAKENNE', 'OSTONIMIKE');

-- AlterEnum
ALTER TYPE "StructureCategory" ADD VALUE 'KALUSTE';

-- AlterTable
ALTER TABLE "structure_types" ADD COLUMN     "kind" "StructureKind" NOT NULL DEFAULT 'RAKENNE';

