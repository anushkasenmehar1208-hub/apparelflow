import { randomUUID } from "node:crypto";
import { currentDemoUser, sameOriginJson } from "@/lib/demo-session";
import { getDb } from "@/lib/db";
import { MAX_INT, validateOrder } from "@/lib/order-validation";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginJson(request)) return Response.json({ error: "Same-origin JSON request required." }, { status: 403 });
  try {
    const user = await currentDemoUser();
    if (!user) return Response.json({ error: "Select a demo role before creating an order." }, { status: 401 });
    if (user.role !== "CUTTING_SUPERVISOR") return Response.json({ error: "Only the Cutting Supervisor can create cutting orders." }, { status: 403 });
    const body = await request.json().catch(() => null);
    const { fields, errors, valid } = validateOrder(body);
    if (!valid) return Response.json({ error: "Please correct the highlighted fields.", errors }, { status: 400 });
    const result = await getDb().$transaction(async tx => {
      const recipe = await tx.recipe.findUnique({ where: { id: Number(fields.recipeId) }, include: { components: true } });
      if (!recipe) return { errors: { recipeId: "This recipe no longer exists. Select another recipe." } };
      const targetQty = Number(fields.targetQty);
      if (!recipe.components.length || recipe.components.some(c => !Number.isInteger(c.piecesPerGarment) || c.piecesPerGarment <= 0))
        return { errors: { recipeId: "This recipe has no valid components. Contact the administrator." } };
      if (recipe.components.some(c => c.piecesPerGarment * targetQty > MAX_INT))
        return { errors: { targetQty: "Component quantity exceeds the supported range. Reduce the batch size." } };
      const order = await tx.cuttingOrder.create({ data: {
        orderNo: `CUT-${randomUUID()}`, recipeId: recipe.id, targetQty,
        fabricRollId: fields.fabricRollId, actualFabricYds: fields.actualFabricYards,
        createdBy: user.id, status: "PENDING_VERIFICATION",
        verificationItems: { create: recipe.components.map(c => ({ componentId: c.id, expectedQty: c.piecesPerGarment * targetQty })) },
      }, select: { id: true, orderNo: true, status: true } });
      return { order };
    }, { timeout: 15000 });
    if (result.errors) return Response.json({ error: "Please correct the highlighted fields.", errors: result.errors }, { status: 400 });
    return Response.json({ order: result.order }, { status: 201 });
  } catch (error) {
    // Log only the error class/code; database error messages can contain secrets.
    console.error("Cutting order failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined,
    });
    return Response.json({ error: "Order could not be saved. Check the connection before retrying." }, { status: 503 });
  }
}
