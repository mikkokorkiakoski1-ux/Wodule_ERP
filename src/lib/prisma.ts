import { PrismaClient } from "@prisma/client";

// Next.js dev-tilassa moduulit ladataan uudelleen jokaisella tallennuksella -
// ilman tätä varastointia jokainen uudelleenlataus avaisi uuden yhteyspoolin.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
