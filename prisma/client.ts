import { config } from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

// CLI scripts run outside Next.js, so load their environment explicitly.
config({ path: ".env.local", quiet: true });

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const adapter = new PrismaNeon({ connectionString, connectionTimeoutMillis: 15000 });
  return new PrismaClient({ adapter, log: [] });
}

export function safeDatabaseError(error: unknown) {
  let message = error instanceof Error ? error.message : "Unknown database error";
  const raw = process.env.DATABASE_URL;
  if (raw) {
    const url = new URL(raw);
    for (const secret of [raw, url.hostname, url.password, decodeURIComponent(url.password), url.username, decodeURIComponent(url.username)].filter(Boolean)) {
      message = message.replaceAll(secret, "[REDACTED]");
    }
  }
  return message;
}
