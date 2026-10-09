import { sameOriginJson } from "@/lib/demo-session";
import { getDb } from "@/lib/db";
import { getApprovalBlockReason } from "@/lib/verification-rules";
import { requireVerifier } from "@/lib/verifier-auth";
import { Prisma } from "@/src/generated/prisma/client";

export const runtime = "nodejs";

class DecisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function parseId(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

function getWastagePct(
  actualFabricYds: Prisma.Decimal,
  stdFabricYards: Prisma.Decimal,
  targetQty: number,
) {
  const expectedFabric = stdFabricYards.times(targetQty);

  if (expectedFabric.lessThanOrEqualTo(0)) {
    throw new DecisionError("The recipe has an invalid fabric standard.", 422);
  }

  const wastagePct = actualFabricYds
    .minus(expectedFabric)
    .dividedBy(expectedFabric)
    .times(100)
    .toDecimalPlaces(2);

  if (
    wastagePct.lessThan(new Prisma.Decimal("-9999.99")) ||
    wastagePct.greaterThan(new Prisma.Decimal("9999.99"))
  ) {
    throw new DecisionError(
      "The calculated wastage is outside the supported audit range.",
      422,
    );
  }

  return wastagePct;
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

  const auth = await requireVerifier();

  if ("error" in auth) {
    return auth.error;
  }

  const orderId = parseId((await context.params).id);

  if (orderId === null) {
    return Response.json({ error: "Invalid cutting order." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const decision =
    body && typeof body === "object" && "decision" in body
      ? body.decision
      : undefined;
  const rawNote =
    body && typeof body === "object" && "rejectionNote" in body
      ? body.rejectionNote
      : undefined;

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return Response.json(
      { error: "Choose either APPROVED or REJECTED." },
      { status: 400 },
    );
  }

  const rejectionNote = typeof rawNote === "string" ? rawNote.trim() : "";

  if (decision === "REJECTED" && !rejectionNote) {
    return Response.json(
      {
        error: "A rejection note is required.",
        errors: { rejectionNote: "Explain why this order is rejected." },
      },
      { status: 400 },
    );
  }

  try {
    const result = await getDb().$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            status: true,
            targetQty: true,
            actualFabricYds: true,
            recipe: { select: { stdFabricYards: true } },
            verificationItems: {
              select: { actualQty: true, status: true },
            },
          },
        });

        if (!order) {
          throw new DecisionError("Cutting order not found.", 404);
        }

        if (order.status !== "PENDING_VERIFICATION") {
          throw new DecisionError("This order has already been finalized.", 409);
        }

        if (decision === "APPROVED") {
          const blockReason = getApprovalBlockReason(order.verificationItems);

          if (blockReason) {
            throw new DecisionError(blockReason, 422);
          }
        }

        const wastagePct = getWastagePct(
          order.actualFabricYds,
          order.recipe.stdFabricYards,
          order.targetQty,
        );
        const update = await tx.cuttingOrder.updateMany({
          where: { id: order.id, status: "PENDING_VERIFICATION" },
          data: {
            status: decision === "APPROVED" ? "VERIFIED" : "REJECTED",
          },
        });

        if (update.count !== 1) {
          throw new DecisionError("This order has already been finalized.", 409);
        }

        const log = await tx.verificationLog.create({
          data: {
            orderId: order.id,
            verifierId: auth.user.id,
            decision,
            rejectionNote: decision === "REJECTED" ? rejectionNote : null,
            wastagePct,
          },
          select: {
            id: true,
            decision: true,
            rejectionNote: true,
            wastagePct: true,
            timestamp: true,
          },
        });

        return {
          order: {
            id: order.id,
            status: decision === "APPROVED" ? "VERIFIED" : "REJECTED",
          },
          log: { ...log, wastagePct: log.wastagePct.toFixed(2) },
        };
      },
      { isolationLevel: "Serializable", timeout: 15000 },
    );

    return Response.json(result);
  } catch (error) {
    if (error instanceof DecisionError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined;

    if (code === "P2034") {
      return Response.json(
        { error: "This order changed while it was being finalized. Refresh and retry." },
        { status: 409 },
      );
    }

    console.error("Verification decision failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code,
    });
    return Response.json(
      { error: "The verification decision could not be saved." },
      { status: 503 },
    );
  }
}
