-- CreateEnum
CREATE TYPE "ProcurementKind" AS ENUM ('TYOSUORITE', 'MATERIAALI');

-- CreateEnum
CREATE TYPE "ProcurementPhase" AS ENUM ('AINEISTO', 'PYYNTO', 'TARJOUS', 'VERTAILU', 'SOPIMUS', 'TOIMITUS', 'VALMIS', 'EI_TARVITA');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('AVOIN', 'KESKEN', 'VALMIS');

-- CreateEnum
CREATE TYPE "TodoArea" AS ENUM ('LUVITUS', 'SUUNNITTELU', 'HANKINTA', 'MUU');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'SUUNNITTELU';
ALTER TYPE "UserRole" ADD VALUE 'HANKINTA';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
-- Käsin muokattu: updatedAt saa oletusarvon olemassa oleville riveille, ja
-- vanha ordered-tieto siirretään vaiheeksi ennen sarakkeen poistoa.
ALTER TABLE "procurement_items" ADD COLUMN     "agreedDelivery" TIMESTAMP(3),
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "comparisonDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "costCents" INTEGER,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deliveryDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "kind" "ProcurementKind" NOT NULL DEFAULT 'MATERIAALI',
ADD COLUMN     "littera" TEXT,
ADD COLUMN     "materialDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "negotiationDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentInfo" TEXT,
ADD COLUMN     "phase" "ProcurementPhase" NOT NULL DEFAULT 'AINEISTO',
ADD COLUMN     "requestDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "scheduleTaskCode" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "procurement_items" SET "phase" = 'TOIMITUS' WHERE "ordered" = true;

ALTER TABLE "procurement_items" DROP COLUMN "ordered";
ALTER TABLE "procurement_items" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "schedule_tasks" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "contractor" TEXT,
    "mainGroup" INTEGER,
    "predecessorCode" TEXT,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "crew" INTEGER,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "fixedStart" TIMESTAMP(3),
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_todos" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "area" "TodoArea" NOT NULL DEFAULT 'SUUNNITTELU',
    "status" "TodoStatus" NOT NULL DEFAULT 'AVOIN',
    "dueDate" TIMESTAMP(3),
    "scheduleTaskCode" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_tasks_projectId_code_key" ON "schedule_tasks"("projectId", "code");

-- CreateIndex
CREATE INDEX "project_todos_assigneeId_idx" ON "project_todos"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_role_key" ON "project_members"("projectId", "userId", "role");

-- CreateIndex
CREATE INDEX "procurement_items_assigneeId_idx" ON "procurement_items"("assigneeId");

-- AddForeignKey
ALTER TABLE "procurement_items" ADD CONSTRAINT "procurement_items_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_tasks" ADD CONSTRAINT "schedule_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_todos" ADD CONSTRAINT "project_todos_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_todos" ADD CONSTRAINT "project_todos_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

