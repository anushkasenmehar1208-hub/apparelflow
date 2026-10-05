import { createPrismaClient, safeDatabaseError } from "./client";
import { requiredRecipes } from "./recipes";

const prisma = createPrismaClient();

async function main() {
  // Serialize repeated seeds without adding a uniqueness constraint to the schema.
  // Preserve component IDs and any future verification references; delete nothing.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(710005)`;
    for (const { components, ...data } of requiredRecipes) {
      const recipe = await tx.recipe.upsert({
        where: { recipeCode: data.recipeCode }, update: data, create: data,
      });
      for (const component of components) {
        const existing = await tx.recipeComponent.findMany({
          where: { recipeId: recipe.id, componentName: component.componentName },
        });
        if (existing.length > 1) throw new Error("Duplicate seed component; inspect existing data before proceeding.");
        if (existing.length === 1) {
          await tx.recipeComponent.update({ where: { id: existing[0].id }, data: component });
        } else {
          await tx.recipeComponent.create({ data: { ...component, recipeId: recipe.id } });
        }
      }
    }
  }, { timeout: 60000 });
  console.log("Seed complete: two required recipes and ten required components ensured.");
}

main().catch((error: unknown) => {
  // Driver errors can contain connection details; never dump raw error objects.
  console.error("Seed failed. Check connectivity and inspect existing data; no partial seed transaction was committed.");
  console.error(safeDatabaseError(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
