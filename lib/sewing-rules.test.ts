import assert from "node:assert/strict";
import test from "node:test";

import { canStartSewing, SewingOrderStatus } from "./sewing-rules";

test("only VERIFIED orders may start sewing", () => {
  const statuses: SewingOrderStatus[] = [
    "CUTTING_IN_PROGRESS",
    "PENDING_VERIFICATION",
    "REJECTED",
    "VERIFIED",
    "SEWING_STARTED",
  ];

  for (const status of statuses) {
    assert.equal(canStartSewing(status), status === "VERIFIED", status);
  }
});
