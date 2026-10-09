import assert from "node:assert/strict";
import test from "node:test";

import {
  getApprovalBlockReason,
  getCountStatus,
  validateActualCount,
} from "./verification-rules";

test("count status follows the GREEN, YELLOW, and RED rules", () => {
  assert.equal(getCountStatus(100, 100), "GREEN");
  assert.equal(getCountStatus(100, 101), "YELLOW");
  assert.equal(getCountStatus(100, 99), "RED");
});

test("actual counts accept zero and positive whole numbers", () => {
  assert.deepEqual(validateActualCount("0"), { valid: true, value: 0, error: null });
  assert.deepEqual(validateActualCount(42), { valid: true, value: 42, error: null });
});

test("actual counts reject empty, decimal, negative, and non-numeric values", () => {
  assert.match(validateActualCount("").error ?? "", /required/i);
  assert.match(validateActualCount("1.5").error ?? "", /whole number/i);
  assert.match(validateActualCount("-1").error ?? "", /whole number/i);
  assert.match(validateActualCount("abc").error ?? "", /whole number/i);
});

test("approval allows counted GREEN and YELLOW items", () => {
  assert.equal(
    getApprovalBlockReason([
      { actualQty: 10, status: "GREEN" },
      { actualQty: 12, status: "YELLOW" },
    ]),
    null,
  );
});

test("approval blocks uncounted and RED items", () => {
  assert.match(
    getApprovalBlockReason([{ actualQty: null, status: null }]) ?? "",
    /count every/i,
  );
  assert.match(
    getApprovalBlockReason([{ actualQty: 9, status: "RED" }]) ?? "",
    /red/i,
  );
});
