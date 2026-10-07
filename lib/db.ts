import { createPrismaClient } from "@/prisma/client";
const globalDb = globalThis as typeof globalThis & { apparelflowDb?: ReturnType<typeof createPrismaClient> };
export function getDb() {
  return globalDb.apparelflowDb ??= createPrismaClient();
}
