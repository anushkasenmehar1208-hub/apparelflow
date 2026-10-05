import assert from "node:assert/strict";
import { createPrismaClient, safeDatabaseError } from "./client";
import { requiredRecipes } from "./recipes";

const prisma = createPrismaClient();
async function main() {
  for (const expected of requiredRecipes) {
    const actual = await prisma.recipe.findUniqueOrThrow({
      where: { recipeCode: expected.recipeCode }, include: { components: true },
    });
    assert.equal(actual.name, expected.name);
    assert.equal(actual.category, expected.category);
    assert.equal(actual.stdFabricYards.toFixed(2), expected.stdFabricYards);
    assert.equal(actual.wastageCap.toFixed(2), expected.wastageCap);
    assert.equal(actual.components.length, expected.components.length);
    for (const component of expected.components) {
      const matches = actual.components.filter((row) => row.componentName === component.componentName);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].piecesPerGarment, component.piecesPerGarment);
    }
    console.log(`${actual.recipeCode}: ${actual.name}, ${actual.stdFabricYards} yd, ${actual.wastageCap}% cap; ${actual.components.length} components verified`);
  }
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  console.log("Tables:", tables.map((row) => row.tablename).join(", "));
  console.log("Counts:", JSON.stringify({
    users: await prisma.user.count(), recipes: await prisma.recipe.count(),
    components: await prisma.recipeComponent.count(), orders: await prisma.cuttingOrder.count(),
    verificationItems: await prisma.verificationItem.count(), verificationLogs: await prisma.verificationLog.count(),
  }));
}
main().catch((error: unknown) => {
  console.error("Database verification failed: connectivity or required data did not pass checks.");
  console.error(safeDatabaseError(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
