import { sameOriginJson } from "@/lib/demo-session";
import { getDb } from "@/lib/db";
import { requireSewingSupervisor } from "@/lib/sewing-auth";

export const runtime = "nodejs";

function parseId(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!sameOriginJson(request)) {
    return Response.json(
      { error: "Same-origin JSON request required." },
      { status: 403 },
    );
  }

  const auth = await requireSewingSupervisor();

  if ("error" in auth) {
    return auth.error;
  }

  const orderId = parseId((await context.params).id);

  if (orderId === null) {
    return Response.json({ error: "Invalid cutting order." }, { status: 400 });
  }

  try {
    const result = await getDb().$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
          select: { id: true, orderNo: true, status: true },
        });

        if (!order) {
          return { kind: "missing" } as const;
        }

        if (order.status !== "VERIFIED") {
          return { kind: "invalid-state", status: order.status } as const;
        }

        const update = await tx.cuttingOrder.updateMany({
          where: { id: order.id, status: "VERIFIED" },
          data: { status: "SEWING_STARTED" },
        });

        if (update.count !== 1) {
          return { kind: "invalid-state", status: order.status } as const;
        }

        return {
          kind: "started",
          order: {
            id: order.id,
            orderNo: order.orderNo,
            status: "SEWING_STARTED" as const,
          },
        } as const;
      },
      { isolationLevel: "Serializable", timeout: 15000 },
    );

    if (result.kind === "missing") {
      return Response.json({ error: "Cutting order not found." }, { status: 404 });
    }

    if (result.kind === "invalid-state") {
      return Response.json(
        { error: "Only a VERIFIED order can start sewing assembly." },
        { status: 409 },
      );
    }

    return Response.json({ order: result.order });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;

    if (code === "P2034") {
      return Response.json(
        { error: "This order changed while sewing was being started. Refresh and retry." },
        { status: 409 },
      );
    }

    console.error("Start sewing failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
    });
    return Response.json(
      { error: "Sewing assembly could not be started." },
      { status: 503 },
    );
  }
}
