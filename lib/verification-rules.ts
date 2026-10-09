import { MAX_INT } from "@/lib/order-validation";

export type CountStatus = "GREEN" | "YELLOW" | "RED";

export type CountValidationResult =
  | { valid: true; value: number; error: null }
  | { valid: false; value: null; error: string };

export function validateActualCount(input: unknown): CountValidationResult {
  if (typeof input !== "string" && typeof input !== "number") {
    return { valid: false, value: null, error: "Actual quantity is required." };
  }

  const raw = String(input).trim();

  if (!raw) {
    return { valid: false, value: null, error: "Actual quantity is required." };
  }

  if (!/^\d+$/.test(raw)) {
    return { valid: false, value: null, error: "Actual quantity must be a whole number of zero or more." };
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value > MAX_INT) {
    return { valid: false, value: null, error: `Actual quantity must be no more than ${MAX_INT}.` };
  }

  return { valid: true, value, error: null };
}

export function getCountStatus(
  expectedQty: number,
  actualQty: number,
): CountStatus {
  if (actualQty === expectedQty) {
    return "GREEN";
  }

  return actualQty > expectedQty ? "YELLOW" : "RED";
}

export function getApprovalBlockReason(
  items: Array<{ actualQty: number | null; status: CountStatus | null }>,
): string | null {
  if (items.some((item) => item.actualQty === null || item.status === null)) {
    return "Count every component before approving this order.";
  }

  if (items.some((item) => item.status === "RED")) {
    return "Resolve all RED shortages before approving this order.";
  }

  return null;
}
