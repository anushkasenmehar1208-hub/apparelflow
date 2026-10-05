import { createPrismaClient } from "@/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let prisma: ReturnType<typeof createPrismaClient> | undefined;

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.DATABASE_URL) {
    return Response.json({ status: "unavailable", database: "not_configured" }, { status: 503, headers });
  }
  try {
    prisma ??= createPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" }, { headers });
  } catch {
    // Health responses/logs must never expose driver errors or credentials.
    return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503, headers });
  }
}
