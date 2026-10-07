import { getDb } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const recipes = await getDb().recipe.findMany({ orderBy: { recipeCode: "asc" }, select: {
      id: true, recipeCode: true, name: true, components: { orderBy: { id: "asc" }, select: { id: true, componentName: true, piecesPerGarment: true } },
    } });
    return Response.json({ recipes }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Recipes could not be loaded. Please retry." }, { status: 503 }); }
}
