import { sameOriginJson } from "@/lib/demo-session";
import { getDb } from "@/lib/db";
import { getCountStatus, validateActualCount } from "@/lib/verification-rules";
import { requireVerifier } from "@/lib/verifier-auth";

export const runtime = "nodejs";

function parseId(value: string) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

export async function PATCH(
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

  const itemId = parseId((await context.params).id);

  if (itemId === null) {
    return Response.json({ error: "Invalid verification item." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const validation = validateActualCount(
    body && typeof body === "object" && "actualQty" in body
      ? body.actualQty
      : undefined,
  );

  if (!validation.valid) {
    return Response.json(
      { error: validation.error, errors: { actualQty: validation.error } },
      { status: 400 },
    );
  }

  try {
    const item = await getDb().$transaction(
      async (tx) => {
        const existing = await tx.verificationItem.findUnique({
          where: { id: itemId },
          select: {
            id: true,
            expectedQty: true,
            order: { select: { status: true } },
          },
        });

        if (!existing) {
          return { kind: "missing" } as const;
        }

        if (existing.order.status !== "PENDING_VERIFICATION") {
          return { kind: "finalized" } as const;
        }

        const updated = await tx.verificationItem.update({
          where: { id: existing.id },
          data: {
            actualQty: validation.value,
            status: getCountStatus(existing.expectedQty, validation.value),
          },
          select: {
            id: true,
            expectedQty: true,
            actualQty: true,
            status: true,
          },
        });

        return { kind: "updated", item: updated } as const;
      },
      { isolationLevel: "Serializable", timeout: 15000 },
    );

    if (item.kind === "missing") {
      return Response.json({ error: "Verification item not found." }, { status: 404 });
    }

    if (item.kind === "finalized") {
      return Response.json(
        { error: "This order has already been finalized." },
        { status: 409 },
      );
    }

    return Response.json({ item: item.item });
  } catch (error) {
    console.error("Verification count failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : undefined,
    });
    return Response.json(
      { error: "The component count could not be saved. Please retry." },
      { status: 503 },
    );
  }
}
