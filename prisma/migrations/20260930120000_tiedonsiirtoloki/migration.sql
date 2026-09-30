-- CreateEnum
CREATE TYPE "DataTransferDirection" AS ENUM ('TUONTI', 'VIENTI');

-- CreateTable
CREATE TABLE "data_transfer_logs" (
    "id" TEXT NOT NULL,
    "direction" "DataTransferDirection" NOT NULL,
    "target" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_transfer_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_transfer_logs_createdAt_idx" ON "data_transfer_logs"("createdAt");

