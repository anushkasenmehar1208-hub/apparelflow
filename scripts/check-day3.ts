// Integration check against the configured database; leaves clearly labeled Day 3 test rows.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createPrismaClient, safeDatabaseError } from "../prisma/client";

const origin = "http://127.0.0.1:3128";
const prisma = createPrismaClient();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3128"],
  { stdio: ["ignore", "ignore", "pipe"] },
);
child.stderr.on("data", (chunk) => {
  const line = String(chunk);
  if (line.includes("Verification")) console.error(line.trim());
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
  return (await response.json()).user;
}

async function createOrder(recipeId: number, actualFabricYards: string, label: string) {
  const response = await request("/api/cutting-orders", "POST", {
    recipeId: String(recipeId),
    targetQty: "4",
    fabricRollId: `DAY3-${label}-${randomUUID()}`,
    actualFabricYards,
  });
  assert.equal(response.status, 201);
  return (await response.json()).order as { id: number; orderNo: string };
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

  stage = "missing-session authorization";
  assert.equal((await request("/api/verification-orders", "GET")).status, 401);
  assert.equal((await request("/api/verification-items/1", "PATCH", { actualQty: 1 })).status, 401);
  assert.equal((await request("/api/verification-orders/1/decision", "POST", { decision: "APPROVED" })).status, 401);

  stage = "non-verifier authorization";
  await switchRole("CUTTING_SUPERVISOR");
  assert.equal((await request("/api/verification-orders", "GET")).status, 403);
  assert.equal((await request("/api/verification-items/1", "PATCH", { actualQty: 1 })).status, 403);
  assert.equal((await request("/api/verification-orders/1/decision", "POST", { decision: "APPROVED" })).status, 403);

  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { recipeCode: "REC-BL01" },
    include: { components: true },
  });
  const expectedFabric = recipe.stdFabricYards.times(4);
  const actualFabric = expectedFabric.plus(1).toFixed(2);

  stage = "create labeled test orders";
  const approvedOrder = await createOrder(recipe.id, actualFabric, "APPROVE");
  const redOrder = await createOrder(recipe.id, actualFabric, "RED");
  const rejectedOrder = await createOrder(recipe.id, actualFabric, "REJECT");

  const verifier = await switchRole("CUTTING_VERIFIER");
  stage = "queue load";
  const queueResponse = await request("/api/verification-orders", "GET");
  assert.equal(queueResponse.status, 200);
  const queue = (await queueResponse.json()).orders as Array<{
    id: number;
    verificationItems: Array<{ id: number; expectedQty: number }>;
  }>;
  const approvedQueueOrder = queue.find((order) => order.id === approvedOrder.id)!;
  const redQueueOrder = queue.find((order) => order.id === redOrder.id)!;
  assert(approvedQueueOrder);
  assert(redQueueOrder);

  stage = "invalid counts";
  for (const value of ["", "-1", "1.5", "abc", "2147483648"]) {
    const response = await request(
      `/api/verification-items/${approvedQueueOrder.verificationItems[0].id}`,
      "PATCH",
      { actualQty: value },
    );
    assert.equal(response.status, 400, `Expected invalid count ${JSON.stringify(value)} to return 400`);
  }

  stage = "uncounted approval hard stop";
  assert.equal(
    (await request(`/api/verification-orders/${approvedOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    422,
  );

  stage = "green and yellow count persistence";
  for (const [index, item] of approvedQueueOrder.verificationItems.entries()) {
    const actualQty = index === 0 ? item.expectedQty + 1 : item.expectedQty;
    const response = await request(`/api/verification-items/${item.id}`, "PATCH", { actualQty });
    assert.equal(response.status, 200);
    const saved = (await response.json()).item;
    assert.equal(saved.status, index === 0 ? "YELLOW" : "GREEN");
  }

  stage = "yellow approval and duplicate prevention";
  const approvalResponse = await request(
    `/api/verification-orders/${approvedOrder.id}/decision`,
    "POST",
    { decision: "APPROVED", rejectionNote: "must be ignored" },
  );
  assert.equal(approvalResponse.status, 200);
  assert.equal(
    (await request(`/api/verification-orders/${approvedOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    409,
  );

  stage = "red approval hard stop";
  for (const [index, item] of redQueueOrder.verificationItems.entries()) {
    const actualQty = index === 0 ? item.expectedQty - 1 : item.expectedQty;
    assert.equal(
      (await request(`/api/verification-items/${item.id}`, "PATCH", { actualQty })).status,
      200,
    );
  }
  assert.equal(
    (await request(`/api/verification-orders/${redOrder.id}/decision`, "POST", { decision: "APPROVED" })).status,
    422,
  );

  stage = "rejection note validation and rejection";
  assert.equal(
    (await request(`/api/verification-orders/${rejectedOrder.id}/decision`, "POST", { decision: "REJECTED", rejectionNote: "  " })).status,
    400,
  );
  const rejectionResponse = await request(
    `/api/verification-orders/${rejectedOrder.id}/decision`,
    "POST",
    { decision: "REJECTED", rejectionNote: "Day 3 integration rejection" },
  );
  assert.equal(rejectionResponse.status, 200);
  assert.equal(
    (await request(`/api/verification-orders/${redOrder.id}/decision`, "POST", { decision: "REJECTED", rejectionNote: "RED hard-stop test complete" })).status,
    200,
  );

  stage = "database audit verification";
  const approved = await prisma.cuttingOrder.findUniqueOrThrow({
    where: { id: approvedOrder.id },
    include: { verificationItems: true, verificationLogs: true },
  });
  assert.equal(approved.status, "VERIFIED");
  assert(approved.verificationItems.some((item) => item.status === "YELLOW"));
  assert(approved.verificationItems.every((item) => item.actualQty !== null));
  assert.equal(approved.verificationLogs.length, 1);
  assert.equal(approved.verificationLogs[0].decision, "APPROVED");
  assert.equal(approved.verificationLogs[0].rejectionNote, null);
  assert.equal(approved.verificationLogs[0].verifierId, verifier.id);
  const expectedWastage = new DecimalCalculation(actualFabric, expectedFabric.toFixed(2));
  assert.equal(approved.verificationLogs[0].wastagePct.toFixed(2), expectedWastage.percent);

  const rejected = await prisma.cuttingOrder.findUniqueOrThrow({
    where: { id: rejectedOrder.id },
    include: { verificationLogs: true },
  });
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.verificationLogs.length, 1);
  assert.equal(rejected.verificationLogs[0].decision, "REJECTED");
  assert.equal(rejected.verificationLogs[0].rejectionNote, "Day 3 integration rejection");
  const red = await prisma.cuttingOrder.findUniqueOrThrow({
    where: { id: redOrder.id },
    include: { verificationLogs: true },
  });
  assert.equal(red.status, "REJECTED");
  assert.equal(red.verificationLogs.length, 1);
  assert.equal(red.verificationLogs[0].decision, "REJECTED");

  const after = {
    orders: await prisma.cuttingOrder.count(),
    items: await prisma.verificationItem.count(),
    logs: await prisma.verificationLog.count(),
  };
  const report = {
    before,
    after,
    verifierId: verifier.id,
    testOrders: [
      { id: approvedOrder.id, orderNo: approvedOrder.orderNo, finalStatus: approved.status },
      { id: redOrder.id, orderNo: redOrder.orderNo, finalStatus: red.status },
      { id: rejectedOrder.id, orderNo: rejectedOrder.orderNo, finalStatus: rejected.status },
    ],
    checks: {
      missingSession401: true,
      nonVerifier403: true,
      invalidCounts400: true,
      uncountedApproval422: true,
      redApproval422: true,
      yellowApproval: true,
      duplicateDecision409: true,
      rejectionNoteRequired: true,
      databaseAuditVerified: true,
    },
  };
  writeFileSync("docs/DAY3-VERIFICATION.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log("PASS: Day 3 authorization, count rules, approval hard stops, decisions, and database audit persistence verified.");
  console.log(JSON.stringify(report, null, 2));
}

class DecimalCalculation {
  readonly percent: string;

  constructor(actual: string, expected: string) {
    this.percent = (((Number(actual) - Number(expected)) / Number(expected)) * 100).toFixed(2);
  }
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
