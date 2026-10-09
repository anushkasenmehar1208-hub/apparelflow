import { getDb } from "@/lib/db";
import { requireSewingSupervisor } from "@/lib/sewing-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSewingSupervisor();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const orders = await getDb().cuttingOrder.findMany({
      // This database predicate is the queue's security boundary. The client
      // cannot request or filter in any other order state.
      where: { status: "VERIFIED" },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        orderNo: true,
        targetQty: true,
        fabricRollId: true,
        actualFabricYds: true,
        status: true,
        recipe: { select: { recipeCode: true, name: true } },
        verificationItems: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            expectedQty: true,
            actualQty: true,
            status: true,
            component: { select: { componentName: true } },
          },
        },
        verificationLogs: {
          where: { decision: "APPROVED" },
          orderBy: { timestamp: "desc" },
          take: 1,
          select: {
            decision: true,
            rejectionNote: true,
            wastagePct: true,
            timestamp: true,
            verifier: { select: { fullName: true } },
          },
        },
      },
    });

    return Response.json({
      orders: orders.map(({ verificationLogs, ...order }) => ({
        ...order,
        actualFabricYds: order.actualFabricYds.toFixed(2),
        verification: verificationLogs[0]
          ? {
              ...verificationLogs[0],
              wastagePct: verificationLogs[0].wastagePct.toFixed(2),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Sewing queue failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : undefined,
    });
    return Response.json(
      { error: "The sewing queue could not be loaded." },
      { status: 503 },
    );
  }
}
