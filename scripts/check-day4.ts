// Full Day 4 integration check. Leaves clearly labeled rows and deletes nothing.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createPrismaClient, safeDatabaseError } from "../prisma/client";

const origin = "http://127.0.0.1:3130";
const prisma = createPrismaClient();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3130"],
  { stdio: ["ignore", "ignore", "pipe"] },
);
child.stderr.on("data", (chunk) => {
  const line = String(chunk);
  if (line.includes("Sewing") || line.includes("Verification")) {
    console.error(line.trim());
  }
});

let cookie = "";
let stage = "startup";

async function request(path: string, method: "GET" | "POST" | "PATCH", body?: unknown) {
  return fetch(origin + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: origin,
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function switchRole(role: string) {
  const response = await request("/api/demo-session", "POST", { role });
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie")!.split(";")[0];
  return (await response.json()).user as { id: number; role: string };
}

async function createOrder(recipeId: number, actualFabricYards: string, label: string) {
  const response = await request("/api/cutting-orders", "POST", {
    recipeId: String(recipeId),
    targetQty: "5",
    fabricRollId: `DAY4-${label}-${randomUUID()}`,
    actualFabricYards,
  });
  assert.equal(response.status, 201);
  return (await response.json()).order as { id: number; orderNo: string };
}

async function getItems(orderId: number) {
  return prisma.verificationItem.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
    select: { id: true, expectedQty: true },
  });
}

async function saveCounts(
  items: Array<{ id: number; expectedQty: number }>,
  mode: "GREEN" | "RED",
) {
  for (const [index, item] of items.entries()) {
    const actualQty = mode === "RED" && index === 0
      ? item.expectedQty - 1
      : item.expectedQty;
    const response = await request(`/api/verification-items/${item.id}`, "PATCH", {
      actualQty,
    });
    assert.equal(response.status, 200);
  }
}

async function main() {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "Production server did not start");

  const before = {
    orders: await prisma.cuttingOrder.count(),
    items: await prisma.verificationItem.count(),
    logs: await prisma.verificationLog.count(),
  };

  stage = "missing-session sewing authorization";
  assert.equal((await request("/api/sewing-orders", "GET")).status, 401);
  assert.equal((await request("/api/sewing-orders/1/start", "POST", {})).status, 401);

  stage = "wrong-role sewing authorization";
  const supervisor = await switchRole("CUTTING_SUPERVISOR");
  assert.equal((await request("/api/sewing-orders", "GET")).status, 403);
  assert.equal((await request("/api/sewing-orders/1/start", "POST", {})).status, 403);

  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { recipeCode: "REC-BL01" },
  });
  const actualFabric = recipe.stdFabricYards.times(5).plus(0.5).toFixed(2);

  stage = "create Day 4 state-machine fixtures";
  const greenOrder = await createOrder(recipe.id, actualFabric, "GREEN");
  const redOrder = await createOrder(recipe.id, actualFabric, "RED");
  const rejectedOrder = await createOrder(recipe.id, actualFabric, "REJECTED");
  const cuttingOrder = await prisma.cuttingOrder.create({
    data: {
      orderNo: `DAY4-CUTTING-${randomUUID()}`,
      recipeId: recipe.id,
      targetQty: 5,
      fabricRollId: `DAY4-CUTTING-${randomUUID()}`,
      actualFabricYds: actualFabric,
      createdBy: supervisor.id,
      status: "CUTTING_IN_PROGRESS",
    },
    select: { id: true, orderNo: true },
  });

  stage = "mandatory non-verifier approval test";
  assert.equal(
    (await request(`/api/verification-orders/${greenOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    403,
  );

  const verifier = await switchRole("CUTTING_VERIFIER");
  const greenItems = await getItems(greenOrder.id);
  const redItems = await getItems(redOrder.id);

  stage = "mandatory all-GREEN approval test";
  await saveCounts(greenItems, "GREEN");
  assert.equal(
    (await request(`/api/verification-orders/${greenOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    200,
  );

  stage = "mandatory RED approval hard-stop test";
  await saveCounts(redItems, "RED");
  assert.equal(
    (await request(`/api/verification-orders/${redOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    422,
  );

  stage = "mandatory blank rejection-note test";
  assert.equal(
    (await request(`/api/verification-orders/${rejectedOrder.id}/decision`, "POST", { decision: "REJECTED", rejectionNote: " " })).status,
    400,
  );
  assert.equal(
    (await request(`/api/verification-orders/${rejectedOrder.id}/decision`, "POST", { decision: "REJECTED", rejectionNote: "Day 4 rejected fixture" })).status,
    200,
  );

  stage = "missing and wrong-role start after verification";
  const verifierCookie = cookie;
  cookie = "";
  assert.equal((await request(`/api/sewing-orders/${greenOrder.id}/start`, "POST", {})).status, 401);
  cookie = verifierCookie;
  assert.equal((await request(`/api/sewing-orders/${greenOrder.id}/start`, "POST", {})).status, 403);

  await switchRole("SEWING_SUPERVISOR");
  stage = "VERIFIED-only database queue isolation";
  const queueResponse = await request("/api/sewing-orders", "GET");
  assert.equal(queueResponse.status, 200);
  const queue = (await queueResponse.json()).orders as Array<{
    id: number;
    status: string;
    verificationItems: Array<{ actualQty: number | null; status: string | null }>;
    verification: { verifier: { fullName: string }; wastagePct: string; timestamp: string } | null;
  }>;
  assert(queue.every((order) => order.status === "VERIFIED"));
  const queuedGreen = queue.find((order) => order.id === greenOrder.id);
  assert(queuedGreen, "The verified Day 4 order must appear in the sewing queue");
  assert(!queue.some((order) => order.id === redOrder.id));
  assert(!queue.some((order) => order.id === rejectedOrder.id));
  assert(!queue.some((order) => order.id === cuttingOrder.id));
  assert(queuedGreen.verification);
  assert(queuedGreen.verification.verifier.fullName);
  assert(queuedGreen.verification.timestamp);
  assert(queuedGreen.verificationItems.every((item) => item.status === "GREEN"));

  stage = "illegal sewing transitions";
  assert.equal((await request(`/api/sewing-orders/${redOrder.id}/start`, "POST", {})).status, 409);
  assert.equal((await request(`/api/sewing-orders/${rejectedOrder.id}/start`, "POST", {})).status, 409);
  assert.equal((await request(`/api/sewing-orders/${cuttingOrder.id}/start`, "POST", {})).status, 409);

  const auditBefore = await prisma.verificationLog.findMany({
    where: { orderId: greenOrder.id },
    orderBy: { id: "asc" },
  });
  const countsBefore = await prisma.verificationItem.findMany({
    where: { orderId: greenOrder.id },
    orderBy: { id: "asc" },
  });

  stage = "VERIFIED to SEWING_STARTED persistence";
  assert.equal(
    (await request(`/api/sewing-orders/${greenOrder.id}/start`, "POST", { role: "CUTTING_SUPERVISOR", status: "PENDING_VERIFICATION" })).status,
    200,
  );
  assert.equal((await request(`/api/sewing-orders/${greenOrder.id}/start`, "POST", {})).status, 409);
  const saved = await prisma.cuttingOrder.findUniqueOrThrow({
    where: { id: greenOrder.id },
    select: { status: true },
  });
  assert.equal(saved.status, "SEWING_STARTED");

  const queueAfterResponse = await request("/api/sewing-orders", "GET");
  assert.equal(queueAfterResponse.status, 200);
  const queueAfter = (await queueAfterResponse.json()).orders as Array<{ id: number; status: string }>;
  assert(!queueAfter.some((order) => order.id === greenOrder.id));
  assert(queueAfter.every((order) => order.status === "VERIFIED"));

  const auditAfter = await prisma.verificationLog.findMany({
    where: { orderId: greenOrder.id },
    orderBy: { id: "asc" },
  });
  const countsAfter = await prisma.verificationItem.findMany({
    where: { orderId: greenOrder.id },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(auditAfter, auditBefore);
  assert.deepEqual(countsAfter, countsBefore);

  const after = {
    orders: await prisma.cuttingOrder.count(),
    items: await prisma.verificationItem.count(),
    logs: await prisma.verificationLog.count(),
  };
  const report = {
    before,
    after,
    verifierId: verifier.id,
    testOrders: {
      greenStarted: { id: greenOrder.id, orderNo: greenOrder.orderNo, finalStatus: "SEWING_STARTED" },
      redPending: { id: redOrder.id, orderNo: redOrder.orderNo, finalStatus: "PENDING_VERIFICATION" },
      rejected: { id: rejectedOrder.id, orderNo: rejectedOrder.orderNo, finalStatus: "REJECTED" },
      cuttingInProgress: { id: cuttingOrder.id, orderNo: cuttingOrder.orderNo, finalStatus: "CUTTING_IN_PROGRESS" },
    },
    mandatoryTests: {
      allGreenApproval: true,
      redBlocksApproval: true,
      rejectionRequiresNote: true,
      nonVerifierApproval403: true,
      unapprovedExcludedFromSewingQueue: true,
    },
    sewingTests: {
      verifiedAppears: true,
      pendingRejectedAndCuttingExcluded: true,
      missingSession401: true,
      wrongRole403: true,
      onlyVerifiedTransition: true,
      duplicateStart409: true,
      persistenceVerified: true,
      auditAndCountsUnchanged: true,
    },
  };
  writeFileSync("docs/DAY4-VERIFICATION.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log("PASS: all five mandatory tests and the complete Day 4 sewing state machine passed.");
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("Integration stage:", stage);
    console.error(safeDatabaseError(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    child.kill("SIGTERM");
    if (child.exitCode === null) {
      await new Promise((resolve) => child.once("close", resolve));
    }
  });
