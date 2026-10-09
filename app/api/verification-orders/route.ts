import { getDb } from "@/lib/db";
import { requireVerifier } from "@/lib/verifier-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireVerifier();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const orders = await getDb().cuttingOrder.findMany({
      where: { status: "PENDING_VERIFICATION" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderNo: true,
        targetQty: true,
        fabricRollId: true,
        actualFabricYds: true,
        status: true,
        createdAt: true,
        recipe: {
          select: {
            recipeCode: true,
            name: true,
            stdFabricYards: true,
          },
        },
        creator: { select: { fullName: true } },
        verificationItems: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            expectedQty: true,
            actualQty: true,
            status: true,
            component: {
              select: { componentName: true, piecesPerGarment: true },
            },
          },
        },
      },
    });

    return Response.json({
      orders: orders.map((order) => ({
        ...order,
        actualFabricYds: order.actualFabricYds.toFixed(2),
        recipe: {
          ...order.recipe,
          stdFabricYards: order.recipe.stdFabricYards.toFixed(2),
        },
      })),
    });
  } catch (error) {
    console.error("Verification queue failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : undefined,
    });
    return Response.json(
      { error: "The verification queue could not be loaded." },
      { status: 503 },
    );
  }
}
