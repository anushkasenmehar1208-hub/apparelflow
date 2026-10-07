import test from "node:test";
import assert from "node:assert/strict";
import { validateOrder } from "./order-validation";
const valid = { recipeId: "1", targetQty: "50", fabricRollId: "FAB-882", actualFabricYards: "92.50" };

test("accepts valid inputs and trims identifiers", () => {
  const result = validateOrder({ ...valid, fabricRollId: " FAB-882 " });
  assert.equal(result.valid, true);
  assert.equal(result.fields.fabricRollId, "FAB-882");
});
for (const value of ["", " ", "0", "-1", "1.5", "50.0", "abc", "NaN", "Infinity", "1e3", "2147483648", 50.5, null]) {
  test(`rejects invalid target quantity ${JSON.stringify(value)}`, () => assert(validateOrder({ ...valid, targetQty: value }).errors.targetQty));
}
for (const value of ["", " ", "0", "-1", "abc", "NaN", "Infinity", "1e3", "0.001", "100000000", 0.001, null]) {
  test(`rejects invalid fabric ${JSON.stringify(value)}`, () => assert(validateOrder({ ...valid, actualFabricYards: value }).errors.actualFabricYards));
}
test("rejects missing recipe and roll ID, including malformed payloads", () => {
  assert(validateOrder({ ...valid, recipeId: "", fabricRollId: " " }).errors.recipeId);
  assert(validateOrder({ ...valid, fabricRollId: " " }).errors.fabricRollId);
  assert.equal(Object.keys(validateOrder(null).errors).length, 4);
});
test("matches numeric database boundaries", () => {
  assert.equal(validateOrder({ ...valid, targetQty: "2147483647", actualFabricYards: "99999999.99" }).valid, true);
  assert(validateOrder({ ...valid, fabricRollId: "x".repeat(101) }).errors.fabricRollId);
});

test("accepts numeric JSON inputs without allowing booleans", () => {
  assert.equal(validateOrder({ ...valid, recipeId: 1, targetQty: 50, actualFabricYards: 92.5 }).valid, true);
  assert.equal(validateOrder({ ...valid, targetQty: true }).valid, false);
});
