// Integration check against your configured database; leaves two labeled test orders.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createPrismaClient, safeDatabaseError } from "../prisma/client";

const origin = "http://127.0.0.1:3127";
const prisma = createPrismaClient();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3127"], { stdio: ["ignore", "ignore", "pipe"] });
child.stderr.on("data", chunk => {
  const line = String(chunk);
  if (line.startsWith("Cutting order failed")) console.error(line.trim());
});
let cookie = "";
let stage = "startup";
async function post(path: string, body: unknown, options: { cookie?: string; origin?: string } = {}) {
  return fetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: options.origin ?? origin, Cookie: options.cookie ?? cookie }, body: JSON.stringify(body) });
}
async function switchRole(role: string) {
  const response = await post("/api/demo-session", { role });
  assert.equal(response.status, 200);
  const header = response.headers.get("set-cookie")!;
  assert(header.includes("HttpOnly")); assert(header.includes("SameSite=strict"));
  cookie = header.split(";")[0];
  return (await response.json()).user;
}
async function main() {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch(origin); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, "Production server did not start");
  stage = "database baseline";
  const before = { users: await prisma.user.count(), orders: await prisma.cuttingOrder.count(), items: await prisma.verificationItem.count() };
  stage = "recipe API";
  const response = await fetch(origin + "/api/recipes");
  assert.equal(response.status, 200);
  const recipes = (await response.json()).recipes;
  assert(recipes.some((r: { recipeCode: string }) => r.recipeCode === "REC-BL01"));
  assert(recipes.some((r: { recipeCode: string }) => r.recipeCode === "REC-CT02"));
  const blouse = recipes.find((r: { recipeCode: string }) => r.recipeCode === "REC-BL01");
  const payload = { recipeId: String(blouse.id), targetQty: "50", fabricRollId: "DAY2-TEST-" + randomUUID(), actualFabricYards: "92.50" };
  stage = "authorization checks";
  assert.equal((await post("/api/cutting-orders", { ...payload, role: "CUTTING_SUPERVISOR" })).status, 401);
  assert.equal((await post("/api/cutting-orders", payload, { cookie: "apparelflow-demo-session=forged" })).status, 401);
  assert.equal((await post("/api/demo-session", { role: "ADMIN" })).status, 400);
  for (const role of ["CUTTING_VERIFIER", "SEWING_SUPERVISOR"]) {
    await switchRole(role);
    stage = "authorization checks";
    assert.equal((await post("/api/cutting-orders", { ...payload, role: "CUTTING_SUPERVISOR", createdBy: 1 })).status, 403);
  }
  const supervisor = await switchRole("CUTTING_SUPERVISOR");
  assert.equal((await post("/api/cutting-orders", payload, { origin: "https://other.example" })).status, 403);
  stage = "invalid input checks";
  let invalidChecks = 0;
  for (const [field, values] of Object.entries({
    recipeId: ["", "abc", "2147483647"],
    targetQty: ["", "0", "-1", "1.5", "abc", "Infinity", "1e3", "2147483647", 50.5],
    fabricRollId: ["", " ", "x".repeat(101)],
    actualFabricYards: ["", "0", "-1", "abc", "Infinity", "0.001", "100000000"],
  })) {
    for (const value of values) {
      stage = `invalid input: ${field}=${JSON.stringify(value)}`;
      const r = await post("/api/cutting-orders", { ...payload, [field]: value });
      assert.equal(r.status, 400, `Expected 400 for ${field}`);
      assert((await r.json()).errors[field]); invalidChecks++;
    }
  }
  assert.equal(await prisma.cuttingOrder.count(), before.orders);
  assert.equal(await prisma.verificationItem.count(), before.items);
  stage = "order persistence checks";
  const created = [];
  for (const code of ["REC-BL01", "REC-CT02"]) {
    const recipe = recipes.find((r: { recipeCode: string }) => r.recipeCode === code);
    const r = await post("/api/cutting-orders", { ...payload, recipeId: String(recipe.id), role: "SEWING_SUPERVISOR", createdBy: -1, expectedQty: -1 });
    assert.equal(r.status, 201);
    const { order } = await r.json();
    const saved = await prisma.cuttingOrder.findUniqueOrThrow({ where: { id: order.id }, include: { verificationItems: { include: { component: true } } } });
    assert.equal(saved.createdBy, supervisor.id);
    assert.equal(saved.status, "PENDING_VERIFICATION");
    assert.equal(saved.recipeId, recipe.id);
    assert.equal(saved.targetQty, 50);
    assert.equal(saved.actualFabricYds.toFixed(2), "92.50");
    assert.equal(saved.fabricRollId, payload.fabricRollId);
    assert.equal(saved.verificationItems.length, recipe.components.length);
    for (const item of saved.verificationItems) {
      assert.equal(item.expectedQty, item.component.piecesPerGarment * 50);
      assert.equal(item.actualQty, null); assert.equal(item.status, null);
    }
    created.push({ id: saved.id, orderNo: saved.orderNo, recipeCode: code, items: saved.verificationItems.length });
  }
  assert.notEqual(created[0].orderNo, created[1].orderNo);
  assert.equal(await prisma.cuttingOrder.count(), before.orders + 2);
  assert.equal(await prisma.verificationItem.count(), before.items + 10);
  const report = { before, after: { users: await prisma.user.count(), orders: await prisma.cuttingOrder.count(), items: await prisma.verificationItem.count() }, invalidChecks, created, fabricRollId: payload.fabricRollId };
  writeFileSync("docs/DAY2-VERIFICATION.json", JSON.stringify(report, null, 2) + "\n");
  console.log("PASS: database recipes, session cookies, two non-supervisor rejections, role/body forgery rejection, origin rejection, " + invalidChecks + " invalid inputs, and two persisted orders with ten exact component rows.");
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error("Integration stage:", stage); console.error(safeDatabaseError(new Error(String(error)))); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); child.kill("SIGTERM"); if (child.exitCode === null) await new Promise(resolve => child.once("close", resolve)); });
